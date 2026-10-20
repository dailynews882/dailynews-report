const express = require("express");
const jwt = require("jsonwebtoken");
const db = require("../db");
const router = express.Router();

router.use((req, res, next) => {
    const header = req.headers.authorization || "";
    const secret = process.env.ADMIN_JWT_SECRET;
    if (!secret || !header.startsWith("Bearer ")) {
        return res.status(401).json({ success: false, message: "管理员未登录" });
    }
    try {
        const decoded = jwt.verify(header.slice(7).trim(), secret);
        if (decoded.role !== "admin" || decoded.type !== "admin_access") {
            return res.status(403).json({ success: false, message: "无管理员权限" });
        }
        next();
    } catch (_) {
        return res.status(401).json({ success: false, message: "管理员登录已过期" });
    }
});

router.get("/", (req, res) => {
    const page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1));
    const limit = 20;
    const search = String(req.query.search || "").trim().slice(0, 100);
    const status = String(req.query.status || "all");
    if (!["all", "vip", "normal"].includes(status)) {
        return res.status(400).json({ success: false, message: "筛选参数无效" });
    }
    const clauses = [];
    const params = [];
    if (search) {
        clauses.push("(u.username LIKE ? OR u.email LIKE ?)");
        params.push(`%${search}%`, `%${search}%`);
    }
    if (status === "vip") clauses.push("LOWER(COALESCE(u.member_level, 'free')) NOT IN ('free', '')");
    if (status === "normal") clauses.push("LOWER(COALESCE(u.member_level, 'free')) IN ('free', '')");
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    db.get(`SELECT COUNT(*) AS total FROM users u ${where}`, params, (countErr, countRow) => {
        if (countErr) return res.status(500).json({ success: false, message: "用户统计失败" });
        db.all(`SELECT u.id, u.username, u.email, u.member_level, u.subscription_status,
      u.created_at, (SELECT w.balance FROM wallets w WHERE w.user_id = u.id LIMIT 1) AS balance
      FROM users u ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`,
            [...params, limit, (page - 1) * limit], (err, rows) => {
                if (err) {
                    console.error("Admin users read error:", err.message);
                    return res.status(500).json({ success: false, message: "读取用户失败" });
                }
                return res.json({ success: true, users: rows, total: countRow.total, page, limit });
            });
    });
});
module.exports = router;
