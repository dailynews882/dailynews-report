"use strict";
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const db = require("../db");
const { accountDecision } = require("../utils/accountState");
const { authenticateAdmin, RIGHTS } = require("../middleware/adminIdentity");
const router = express.Router();
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
router.post("/login", async (req, res) => {
    const username = String(req.body?.username || "").trim(), password = String(req.body?.password || "");
    if (!username || !password) return res.status(400).json({ success: false, message: "请输入管理员账号和密码" });
    if (!process.env.ADMIN_JWT_SECRET) return res.status(503).json({ success: false, message: "管理员认证未配置" });
    try {
        let payload, admin;
        if (username === process.env.ADMIN_USERNAME) {
            if (!process.env.ADMIN_PASSWORD_HASH || !await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH)) return res.status(401).json({ success: false, message: "管理员账号或密码错误" });
            payload = { username, principal: "environment" }; admin = { username, adminRole: "superadmin" };
        } else {
            const user = await new Promise((resolve, reject) => db.get(`SELECT u.*,r.role AS admin_role FROM users u JOIN admin_user_roles r ON r.user_id=u.id WHERE u.username=?`, [username], (e, row) => e ? reject(e) : resolve(row)));
            if (!user || !["editor", "admin"].includes(user.admin_role) || !await bcrypt.compare(password, user.password_hash)) return res.status(401).json({ success: false, message: "管理员账号或密码错误" });
            const denied = accountDecision(user);
            if (denied) return res.status(denied.status).json({ success: false, message: denied.message });
            payload = { id: user.id, username: user.username, principal: "user", auth_version: user.auth_version };
            admin = { id: user.id, username: user.username, adminRole: user.admin_role };
        }
        const token = jwt.sign({ ...payload, role: "admin", type: "admin_access" }, process.env.ADMIN_JWT_SECRET, { algorithm: "HS256", expiresIn: "8h" });
        return res.json({ success: true, message: "管理员登录成功", token, admin: { ...admin, role: "admin", permissions: RIGHTS[admin.adminRole] } });
    } catch (_) { return res.status(503).json({ success: false, message: "管理员登录暂不可用，请确认账户权限数据库迁移" }); }
});
router.get("/verify", authenticateAdmin, (req, res) => res.json({ success: true, admin: { ...req.admin, role: "admin", permissions: RIGHTS[req.admin.adminRole] } }));
module.exports = router;
