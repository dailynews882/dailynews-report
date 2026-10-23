"use strict";
const express = require("express");
const db = require("../db");
const { withAuthTransaction } = require("../utils/authTransaction");
const { accountDecision } = require("../utils/accountState");
const { authenticateAdmin, permits, RIGHTS, ROLE_LABELS, assignableRoles, accountActions } = require("../middleware/adminIdentity");
const router = express.Router();
router.use(authenticateAdmin);
router.use((req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
const error = (status, message) => Object.assign(new Error(message), { status });
async function actorInTransaction(tx, actor, permission) {
    if (actor.principal === "environment" && actor.username === process.env.ADMIN_USERNAME && permits(actor, permission)) return;
    const user = await tx.get(`SELECT u.id,u.account_status,u.banned_until,u.auth_version,r.role FROM users u JOIN admin_user_roles r ON r.user_id=u.id WHERE u.id=?`, [actor.id]);
    if (accountDecision(user) || user.auth_version !== actor.auth_version || !permits({ adminRole: user.role }, permission)) throw error(403, "管理员权限已失效");
}
router.get("/", (req, res) => {
    if (!permits(req.admin, "users.read")) return res.status(403).json({ success: false, message: "当前角色不可管理用户" });
    let page = Math.max(1, Math.min(100000, parseInt(req.query.page, 10) || 1)); const limit = 20;
    const search = String(req.query.search || "").trim().slice(0, 100), status = String(req.query.status || "all");
    if (!["all", "vip", "normal", "active", "temporary_ban", "permanent_ban", "deleted"].includes(status)) return res.status(400).json({ success: false, message: "筛选参数无效" });
    const roleFilter = req.query.role || "all";
    if (typeof roleFilter !== "string" || !["all", "member", "editor", "admin", "hr"].includes(roleFilter)) return res.status(400).json({ success: false, message: "角色筛选无效" });
    const conditions = [], values = [];
    if (roleFilter !== "all") { conditions.push("COALESCE((SELECT role FROM admin_user_roles WHERE user_id=u.id),'member')=?"); values.push(roleFilter); }
    if (search) { conditions.push("(u.username LIKE ? OR u.email LIKE ?)"); values.push('%' + search + '%', '%' + search + '%'); }
    if (status === "vip") conditions.push("LOWER(COALESCE(u.member_level,'free')) NOT IN ('free','')");
    else if (status === "normal") conditions.push("LOWER(COALESCE(u.member_level,'free')) IN ('free','')");
    else if (status === "active") conditions.push("(u.account_status='active' OR (u.account_status='temporary_ban' AND julianday(u.banned_until)<=julianday('now')))");
    else if (status === "temporary_ban") conditions.push("(u.account_status='temporary_ban' AND (julianday(u.banned_until) IS NULL OR julianday(u.banned_until)>julianday('now')))");
    else if (status !== "all") { conditions.push("u.account_status=?"); values.push(status); }
    const where = conditions.length ? ' WHERE ' + conditions.join(' AND ') : '';
    db.get(`SELECT COUNT(*) AS total FROM users u ${where}`, values, (e, count) => {
        if (e) return res.status(503).json({ success: false, message: "读取失败，请确认账户管理迁移" });
        page = Math.min(page, Math.max(1, Math.ceil(count.total / limit)));
        db.all(`SELECT u.id,u.username,u.email,u.member_level,u.subscription_status,u.created_at,
            u.account_status,u.banned_until,u.ban_reason,u.deleted_at,COALESCE(r.role,'member') AS admin_role,
            (EXISTS(SELECT 1 FROM admin_account_deletions d WHERE d.user_id=u.id)
             AND u.account IS NOT NULL AND u.account<>'' AND u.username NOT GLOB '__v115_*' AND u.account NOT GLOB '__v115_*') AS restorable,
            (SELECT w.balance FROM wallets w WHERE w.user_id=u.id LIMIT 1) AS balance
            FROM users u LEFT JOIN admin_user_roles r ON r.user_id=u.id ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`, [...values, limit, (page-1)*limit], (err, users) => {
            if (err) return res.status(503).json({ success: false, message: "账户管理结构尚未就绪" });
            for (const user of users) {
                user.allowed_actions = accountActions(req.admin, user);
                user.assignable_roles = assignableRoles(req.admin, user);
                user.effective_status = user.account_status === "temporary_ban" && !accountDecision(user) ? "active" : user.account_status;
            }
            res.json({ success: true, users, total: count.total, page, limit,
                role_labels: ROLE_LABELS, role_approval_available: false,
                owner_identity: { username: process.env.ADMIN_USERNAME || null, principal: "environment", protected: true },
                admin: { ...req.admin, permissions: RIGHTS[req.admin.adminRole] } });
        });
    });
});
router.post("/:id/:action", async (req, res) => {
    const id = Number(req.params.id), action = req.params.action;
    if (!["temporary-ban", "permanent-ban", "unban", "soft-delete", "restore", "role"].includes(action)) return res.status(404).json({ success: false, message: "未知账户操作" });
    const permission = action === "role" ? "roles.manage" : ["permanent-ban", "soft-delete", "restore"].includes(action) ? "users.control" : "users.moderate";
    if (!permits(req.admin, permission) && !(action === "role" && permits(req.admin, "roles.standard"))) return res.status(403).json({ success: false, message: "当前角色无此权限" });
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!Number.isSafeInteger(id) || id < 1 || reason.length < 5 || reason.length > 500) return res.status(400).json({ success: false, message: "用户ID或操作原因无效（原因5至500字）" });
    const days = Number(req.body?.days), role = req.body?.role;
    if (action === "temporary-ban" && ![1,3,7,30].includes(days)) return res.status(400).json({ success: false, message: "只能封禁1、3、7或30天" });
    if (action === "role" && ["admin", "hr", "superadmin"].includes(role)) return res.status(403).json({ success: false, code: "INDEPENDENT_APPROVAL_REQUIRED", message: "高权限角色缺少独立审批流程，禁止直接授予；超级管理员仅由可信配置身份认证" });
    if (action === "role" && !["member", "editor"].includes(role)) return res.status(400).json({ success: false, message: "只能分配授权的标准角色" });
    try {
        const result = await withAuthTransaction(db, async tx => {
            await actorInTransaction(tx, req.admin, action === "role" && !permits(req.admin, permission) ? "roles.standard" : permission);
            const user = await tx.get("SELECT id,username,account,email,account_status,banned_until,ban_reason FROM users WHERE id=?", [id]);
            if (!user) throw error(404, "用户不存在");
            const targetRole = await tx.get("SELECT role FROM admin_user_roles WHERE user_id=?", [id]);
            user.admin_role = targetRole?.role || "member";
            const saved = user.account_status === "deleted" ? await tx.get("SELECT * FROM admin_account_deletions WHERE user_id=?", [id]) : null;
            user.restorable = Boolean(saved && user.account && !/^__v115_/.test(user.username || "") && !/^__v115_/.test(user.account));
            if (action === "restore" && !user.restorable && req.admin.adminRole === "superadmin" && user.admin_role !== "superadmin" && req.admin.id !== id) throw error(409, "历史账号身份已匿名化或缺少删除前状态，须使用既有审核恢复流程");
            if (!accountActions(req.admin, user).includes(action)) throw error(403, "当前身份、目标角色或账号状态不允许此操作");
            if (action === "role") {
                if (!assignableRoles(req.admin, user).includes(role)) throw error(403, "不能分配该角色");
                if (role === user.admin_role) throw error(409, "角色未发生变化");
                if (role !== "member" && user.username === process.env.ADMIN_USERNAME) throw error(409, "该会员与配置管理员重名，请使用其他会员账号授予后台角色");
                if (accountDecision(user)) throw error(409, "封禁或删除账号不可授予角色，请先处理账号状态");
                if (role === "member") await tx.run("DELETE FROM admin_user_roles WHERE user_id=?", [id]);
                else await tx.run("INSERT INTO admin_user_roles(user_id,role) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,updated_at=CURRENT_TIMESTAMP", [id, role]);
                await tx.run("UPDATE users SET auth_version=auth_version+1 WHERE id=?", [id]);
            } else if (action === "restore") {
                if (user.account_status !== "deleted") throw error(409, "账号不是软删除状态");
                if (!user.restorable) throw error(409, "历史账号身份已匿名化或缺少删除前状态，须使用既有审核恢复流程");
                await tx.run("UPDATE users SET account_status=?,banned_until=?,ban_reason=?,deleted_at=NULL,auth_version=auth_version+1 WHERE id=?", [saved.prior_status, saved.prior_banned_until, saved.prior_ban_reason, id]);
                await tx.run("DELETE FROM admin_account_deletions WHERE user_id=?", [id]);
            } else {
                if (user.account_status === "deleted") throw error(409, "请先恢复软删除账号");
                if (action === "soft-delete") {
                    await tx.run("INSERT INTO admin_account_deletions(user_id,prior_status,prior_banned_until,prior_ban_reason,deleted_at) VALUES (?,?,?,?,?)", [id, user.account_status, user.banned_until, user.ban_reason, new Date().toISOString()]);
                    // Keep identities and every wallet/payment/subscription record. Soft deletion never releases identifiers.
                    await tx.run("UPDATE users SET account_status='deleted',deleted_at=?,auth_version=auth_version+1 WHERE id=?", [new Date().toISOString(), id]);
                } else {
                    if (user.account_status === "permanent_ban" && (action !== "unban" || req.admin.adminRole !== "superadmin")) throw error(403, "永久封禁仅可由超级管理员明确解除");
                    if (action === "unban" && user.account_status === "active") throw error(409, "账号当前未封禁");
                    const state = action === "unban" ? "active" : action === "temporary-ban" ? "temporary_ban" : "permanent_ban";
                    const until = action === "temporary-ban" ? new Date(Date.now()+days*86400000).toISOString() : null;
                    await tx.run("UPDATE users SET account_status=?,banned_until=?,ban_reason=?,auth_version=auth_version+1 WHERE id=?", [state, until, action === "unban" ? null : reason, id]);
                }
            }
            await tx.run("INSERT INTO admin_account_audit(user_id,admin_actor,action,reason) VALUES (?,?,?,?)", [id, req.admin.principal === "environment" ? 'owner:' + req.admin.username : 'user:' + req.admin.id, action === 'role' ? 'role:' + role : action, action === 'role' ? reason + ' [from:' + user.admin_role + ' to:' + role + ']' : reason]);
            const current = await tx.get("SELECT id,account_status,banned_until,auth_version FROM users WHERE id=?", [id]);
            return { success: true, user: current };
        });
        res.json(result);
    } catch (e) { res.status(e.status || 503).json({ success: false, message: e.status ? e.message : "操作未完成，请确认数据库迁移和审计表；事务已尝试回滚" }); }
});
module.exports = router;
