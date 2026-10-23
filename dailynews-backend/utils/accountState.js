"use strict";
function accountDecision(user) {
    if (!user) return { status: 401, code: "ACCOUNT_NOT_FOUND", message: "账户不存在或已失效" };
    if (user.account_status === "deleted") return { status: 403, code: "ACCOUNT_DELETED", message: "账户已停用" };
    if (user.account_status === "permanent_ban") return { status: 403, code: "ACCOUNT_BANNED", message: "账户已被永久封禁" };
    if (user.account_status === "temporary_ban") {
        const expiry = Date.parse(user.banned_until || "");
        if (!Number.isFinite(expiry) || expiry > Date.now()) return { status: 403, code: "ACCOUNT_TEMP_BANNED", message: "账户暂时被封禁" };
    }
    return null;
}
module.exports = { accountDecision };
