"use strict";
const jwt = require("jsonwebtoken");
const { accountDecision } = require("../utils/accountState");
const RIGHTS = Object.freeze({
    editor: ["news.manage"],
    admin: ["news.manage", "site.manage", "users.read", "users.moderate"],
    superadmin: ["news.manage", "site.manage", "users.read", "users.moderate", "users.control", "roles.manage"]
});
const permits = (admin, permission) => Boolean(admin && RIGHTS[admin.adminRole]?.includes(permission));
function createAdminIdentity(database = () => require("../db")) {
    const source = () => typeof database === "function" ? database() : database;
    function resolveAdmin(req, callback) {
        const match = /^Bearer\s+(\S+)$/i.exec(String(req.headers.authorization || ""));
        if (!process.env.ADMIN_JWT_SECRET) return callback({ status: 503, message: "管理员认证未配置" });
        if (!match) return callback({ status: 401, message: "管理员未登录" });
        let claims;
        try { claims = jwt.verify(match[1], process.env.ADMIN_JWT_SECRET, { algorithms: ["HS256"] }); }
        catch (_) { return callback({ status: 401, message: "管理员登录已失效" }); }
        if (claims.role !== "admin" || claims.type !== "admin_access") return callback({ status: 403, message: "没有管理员权限" });
        if (claims.principal !== "user" && process.env.ADMIN_USERNAME && claims.username === process.env.ADMIN_USERNAME) {
            return callback(null, { username: claims.username, role: "admin", type: "admin_access", principal: "environment", adminRole: "superadmin" });
        }
        if (claims.principal !== "user" || !Number.isSafeInteger(claims.id) || !Number.isInteger(claims.auth_version)) return callback({ status: 401, message: "请重新登录管理员账户" });
        source().get(`SELECT u.id,u.username,u.account_status,u.banned_until,u.auth_version,r.role
            FROM users u JOIN admin_user_roles r ON r.user_id=u.id WHERE u.id=?`, [claims.id], (error, user) => {
            if (error) return callback({ status: 503, message: "管理员权限读取失败，请确认数据库迁移" });
            const denied = accountDecision(user);
            if (denied) return callback(denied);
            if (!["editor", "admin"].includes(user.role) || user.auth_version !== claims.auth_version) return callback({ status: 401, message: "管理员权限已变更，请重新登录" });
            callback(null, { id: user.id, username: user.username, role: "admin", type: "admin_access", principal: "user", adminRole: user.role, auth_version: user.auth_version });
        });
    }
    function authenticateAdmin(req, res, next) {
        resolveAdmin(req, (error, admin) => {
            if (error) return res.status(error.status).json({ success: false, message: error.message });
            req.admin = admin; next();
        });
    }
    function verifyAdminToken(req, res, next) {
        authenticateAdmin(req, res, () => {
            const news = /^\/api\/(?:news(?:\/|$)|news-metadata(?:\/|$)|admin\/news-(?:import|upload)(?:\/|$)|admin\/comments(?:\/|$))/.test(req.baseUrl || "");
            if (!permits(req.admin, news ? "news.manage" : "site.manage")) return res.status(403).json({ success: false, message: "当前角色无此操作权限" });
            next();
        });
    }
    return { resolveAdmin, authenticateAdmin, verifyAdminToken };
}
function requirePermission(permission) {
    return (req, res, next) => permits(req.admin, permission) ? next() : res.status(403).json({ success: false, message: "当前角色无此操作权限" });
}
module.exports = { ...createAdminIdentity(), createAdminIdentity, requirePermission, permits, RIGHTS };
