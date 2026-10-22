"use strict";
const jwt = require("jsonwebtoken");
const db = require("../db");
function accountDecision(user) {
    if (!user) return { status: 401, code: "ACCOUNT_NOT_FOUND", message: "账户不存在或已失效" };
    if (user.account_status === "deleted") return { status: 403, code: "ACCOUNT_DELETED", message: "账户已停用" };
    if (user.account_status === "permanent_ban") return { status: 403, code: "ACCOUNT_BANNED", message: "账户已被永久封禁" };
    if (user.account_status === "temporary_ban") {
        const expiry = Date.parse(user.banned_until || "");
        if (!Number.isFinite(expiry) || expiry > Date.now()) return { status: 403, code: "ACCOUNT_TEMP_BANNED", message: "账户暂时被封禁" };
        // Expired bans are treated as active; no automatic database write on reads.
    }
    return null;
}
function checkUserToken(req, callback) {
    const header = String(req.headers.authorization || "");
    const match = /^Bearer\s+(\S+)$/i.exec(header);
    if (!match) return callback({ status: 401, code: "LOGIN_REQUIRED", message: "请先登录" });
    if (!process.env.JWT_SECRET) return callback({ status: 503, code: "AUTH_NOT_CONFIGURED", message: "认证服务未配置" });
    let decoded;
    try { decoded = jwt.verify(match[1], process.env.JWT_SECRET, { algorithms: ["HS256"] }); }
    catch (_) { return callback({ status: 401, code: "INVALID_TOKEN", message: "登录已过期，请重新登录" }); }
    if (!Number.isSafeInteger(Number(decoded.id)) || Number(decoded.id) <= 0 || !Number.isInteger(decoded.auth_version)) {
        return callback({ status: 401, code: "TOKEN_RENEWAL_REQUIRED", message: "请重新登录" });
    }
    db.get("SELECT id, username, account_status, banned_until, auth_version FROM users WHERE id=?", [Number(decoded.id)], (err, user) => {
        if (err) return callback({ status: 503, code: "AUTH_DB_ERROR", message: "账户验证暂时不可用" });
        const decision = accountDecision(user);
        if (decision) return callback(decision);
        if (Number(user.auth_version) !== decoded.auth_version) return callback({ status: 401, code: "TOKEN_REVOKED", message: "登录状态已失效，请重新登录" });
        return callback(null, decoded, user);
    });
}
function verifyUserToken(req, res, next) {
    checkUserToken(req, (error, decoded, user) => {
        if (error) return res.status(error.status).json({ success: false, code: error.code, message: error.message });
        req.user = decoded; req.accountUser = user; next();
    });
}
module.exports = { verifyUserToken, checkUserToken, accountDecision };
