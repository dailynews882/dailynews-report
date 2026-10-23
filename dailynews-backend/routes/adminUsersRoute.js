"use strict";
const express = require("express");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();
const db = require("../db");
const router = express.Router();

router.use((req, res, next) => {
    return require("../middleware/adminIdentity").authenticateAdmin(req, res, next);
    // Retained legacy V11.5 verifier; current requests use shared identity checks above.
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
        req.admin = decoded;
        next();
    } catch (_) {
        return res.status(401).json({ success: false, message: "管理员登录已过期" });
    }
});

// Preserve the existing isolated V11.5 handlers. Production uses the complete account routes.
const productionAccounts = require("./accountAdminRoute");
router.use((req, res, next) => {
    if (isolatedTestEnvironment()) {
        if (!require("../middleware/adminIdentity").permits(req.admin, "users.control")) return res.status(403).json({ success: false, message: "隔离账号操作仅限超级管理员" });
        return next();
    }
    return productionAccounts(req, res, next);
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

const ALLOWED_DAYS = new Set([1, 3, 7, 30]);
function isolatedTestEnvironment() {
    const filename = "dailynews-v115-TEST.db";
    const root = path.resolve(__dirname, "..");
    const expected = path.resolve(root, filename);
    const actual = path.resolve(root, process.env.V115_TEST_DB || "");
    return process.env.NODE_ENV !== "production" &&
        process.env.V115_TEST_DB === filename && actual === expected &&
        expected !== path.resolve(root, "dailynews.db") &&
        fs.existsSync(expected) && fs.statSync(expected).isFile();
}
function updateAccount(req, res, action) {
    if (!isolatedTestEnvironment()) {
        return res.status(503).json({ success: false, message: "V11.5 account actions are TEST-only" });
    }
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ success: false, message: "用户ID无效" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) return res.status(400).json({ success: false, message: "原因长度须为5至500字符" });
    const days = Number(req.body?.days);
    if (action === "temporary_ban" && !ALLOWED_DAYS.has(days)) return res.status(400).json({ success: false, message: "只能封禁1、3、7或30天" });
    const actor = String(req.admin?.username || req.admin?.account || req.admin?.id || "").trim();
    if (!actor) return res.status(403).json({ success: false, message: "管理员身份信息缺失" });
    db.serialize(() => {
        db.run("BEGIN IMMEDIATE", (beginErr) => {
            if (beginErr) return res.status(503).json({ success: false, message: "账户操作暂时不可用" });
            let finished = false;
            const fail = (err, status = 500) => {
                if (finished) return;
                finished = true;
                db.run("ROLLBACK", () => res.status(status).json({ success: false, message: err }));
            };
            db.get("SELECT id, account_status FROM users WHERE id=?", [id], (getErr, user) => {
                if (getErr) return fail("用户状态读取失败");
                if (!user) return fail("用户不存在", 404);
                if (user.account_status === "deleted") return fail("已删除账号不可封禁或解封", 409);
                if (user.account_status === "permanent_ban") return fail("账号已被永久封禁，不允许重复封禁或通过普通接口解除封禁", 409);
                if (action === "unban" && user.account_status === "active") return fail("账号当前未封禁", 409);
                const status = action === "unban" ? "active" : action;
                const until = action === "temporary_ban" ? new Date(Date.now() + days * 86400000).toISOString() : null;
                db.run("UPDATE users SET account_status=?, banned_until=?, ban_reason=?, auth_version=auth_version+1 WHERE id=?", [status, until, action === "unban" ? null : reason, id], function (updateErr) {
                    if (updateErr || this.changes !== 1) return fail("用户状态更新失败");
                    db.run("INSERT INTO account_action_audit(user_id,admin_actor,action,reason) VALUES (?,?,?,?)", [id, actor, action, reason], (auditErr) => {
                        if (auditErr) return fail("审计记录写入失败");
                        db.run("COMMIT", (commitErr) => {
                            if (commitErr) return fail("事务提交失败");
                            finished = true;
                            return res.json({ success: true, userId: id, account_status: status, banned_until: until });
                        });
                    });
                });
            });
        });
    });
}
router.post("/:id/temporary-ban", (req, res) => updateAccount(req, res, "temporary_ban"));
router.post("/:id/permanent-ban", (req, res) => updateAccount(req, res, "permanent_ban"));
router.post("/:id/unban", (req, res) => updateAccount(req, res, "unban"));

// V11.5 isolated, single-account soft-delete test. Not a production feature.
router.post("/:id/soft-delete", async (req, res) => {
    if (!isolatedTestEnvironment()) {
        return res.status(503).json({ success: false, message: "软删除仅限隔离测试环境" });
    }
    const id = Number(req.params.id);
    if (id !== 6 || !Number.isSafeInteger(id)) {
        return res.status(403).json({ success: false, message: "当前阶段仅允许测试账号 ID 6" });
    }
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 500) {
        return res.status(400).json({ success: false, message: "原因长度须为5至500字符" });
    }
    const actor = String(req.admin?.username || req.admin?.account || req.admin?.id || "").trim();
    if (!actor) return res.status(403).json({ success: false, message: "管理员身份信息缺失" });

    const expected = path.resolve(__dirname, "..", "dailynews-v115-TEST.db");
    const production = path.resolve(__dirname, "..", "dailynews.db");
    let conn;
    let transactionOpen = false;
    const open = () => new Promise((resolve, reject) => {
        const c = new sqlite3.Database(expected, sqlite3.OPEN_READWRITE, err => {
            if (err) return reject(err);
            resolve(c);
        });
    });
    const get = (sql, args = []) => new Promise((resolve, reject) =>
        conn.get(sql, args, (err, row) => err ? reject(err) : resolve(row)));
    const all = (sql, args = []) => new Promise((resolve, reject) =>
        conn.all(sql, args, (err, rows) => err ? reject(err) : resolve(rows)));
    const run = (sql, args = []) => new Promise((resolve, reject) =>
        conn.run(sql, args, function (err) { err ? reject(err) : resolve(this.changes); }));
    const close = () => new Promise(resolve => {
        if (!conn) return resolve();
        conn.close(err => {
            if (err) console.error("V11.5 test connection close failed:", err.message);
            resolve();
        });
    });

    try {
        // Verify the real file, not merely the environment variable or filename.
        if (fs.realpathSync(expected) !== expected || (fs.existsSync(production) && fs.realpathSync(expected) === fs.realpathSync(production))) {
            return res.status(503).json({ success: false, message: "测试数据库文件验证失败" });
        }
        conn = await open();
        const files = await all("PRAGMA database_list");
        const main = files.find(row => row.name === "main");
        if (!main || path.resolve(main.file) !== expected || fs.realpathSync(main.file) !== expected) {
            return res.status(503).json({ success: false, message: "实际数据库连接不匹配" });
        }
        await run("PRAGMA foreign_keys = ON");
        await run("PRAGMA busy_timeout = 5000");
        await run("BEGIN IMMEDIATE");
        transactionOpen = true;

        const user = await get(
            "SELECT id, username, account, email, account_status FROM users WHERE id=?", [id]);
        if (!user || user.account_status !== "active" ||
            user.username !== "V115_SOFT_DELETE_TEST" ||
            user.account !== "v115_soft_delete_test@example.com" ||
            user.email !== "v115_soft_delete_test@example.com") {
            return res.status(409).json({ success: false, message: "测试账号身份或状态不符合要求" });
        }
        const wallet = await get(`SELECT COUNT(*) AS n,
            COALESCE(SUM(balance),0) AS balance,
            COALESCE(SUM(reward_balance),0) AS reward,
            COALESCE(SUM(withdrawable_balance),0) AS withdrawable
            FROM wallets WHERE user_id=?`, [id]);
        if (wallet.n > 1 || wallet.balance !== 0 || wallet.reward !== 0 || wallet.withdrawable !== 0) {
            return res.status(409).json({ success: false, message: "钱包存在余额或异常记录" });
        }
        // Fail closed: all transaction/payment/subscription history blocks this first test.
        for (const table of ["wallet_transactions", "payment_orders", "subscription_orders", "user_subscriptions"]) {
            const row = await get(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id=?`, [id]);
            if (row.n !== 0) {
                return res.status(409).json({ success: false, message: "存在交易、支付或订阅记录，暂不允许软删除" });
            }
        }
        const username = `__v115_deleted_user_${id}__`;
        const account = `__v115_deleted_account_${id}__`;
        const conflict = await get(
            "SELECT id FROM users WHERE id<>? AND (username=? OR account=? OR email=? OR phone=?) LIMIT 1",
            [id, username, account, username, account]);
        if (conflict) return res.status(409).json({ success: false, message: "内部占位标识冲突" });

        const changed = await run(`UPDATE users SET username=?, account=?, email=NULL, phone=NULL,
            email_verified=0, phone_verified=0, account_status='deleted',
            deleted_at=CURRENT_TIMESTAMP, banned_until=NULL, ban_reason=NULL,
            auth_version=auth_version+1 WHERE id=? AND account_status='active'`,
            [username, account, id]);
        if (changed !== 1) throw new Error("user update affected unexpected rows");
        const audited = await run(
            "INSERT INTO account_action_audit(user_id,admin_actor,action,reason) VALUES (?,?,?,?)",
            [id, actor, "delete", reason]);
        if (audited !== 1) throw new Error("audit insert affected unexpected rows");
        await run("COMMIT");
        transactionOpen = false;
        return res.json({ success: true, userId: id, account_status: "deleted" });
    } catch (err) {
        console.error("V11.5 soft delete test failed:", err.message);
        return res.status(500).json({ success: false, message: "软删除失败，未确认提交；请先检查测试数据库" });
    } finally {
        if (transactionOpen) {
            try { await run("ROLLBACK"); } catch (err) {
                console.error("V11.5 rollback failed:", err.message);
            }
        }
        await close();
    }
});

module.exports = router;
