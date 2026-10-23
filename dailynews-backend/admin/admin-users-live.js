(() => {
    "use strict";
    const tbody = document.querySelector("#usersTable tbody");
    const info = document.getElementById("usersPageInfo");
    const prev = document.getElementById("usersPrevPage");
    const next = document.getElementById("usersNextPage");
    const search = document.getElementById("userSearchInput");
    const status = document.getElementById("userStatusFilter");
    let page = 1;
    let requestNumber = 0;
    let debounce;
    const cell = (tr, value) => {
        const td = document.createElement("td");
        td.textContent = value == null ? "—" : String(value);
        tr.appendChild(td);
        return td;
    };
    const money = value => value == null ? "—" : `$${Number(value).toFixed(2)}`;
    const isVip = level => !!level && !["free", ""].includes(String(level).toLowerCase());
    async function load() {
        const seq = ++requestNumber;
        const token = localStorage.getItem("adminToken");
        tbody.replaceChildren();
        const loading = document.createElement("tr");
        const loadingCell = cell(loading, "正在读取真实用户...");
        loadingCell.colSpan = 9;
        tbody.appendChild(loading);
        if (!token) {
            info.textContent = "管理员未登录";
            return;
        }
        const query = new URLSearchParams({ page: String(page), search: search.value.trim(), status: status.value });
        try {
            const response = await fetch(`/api/admin/users?${query}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store"
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || "读取失败");
            if (seq !== requestNumber) return;
            const permissions = new Set(result.admin?.permissions || []);
            const owner = result.admin?.adminRole === "superadmin";
            tbody.replaceChildren();
            for (const user of result.users) {
                const tr = document.createElement("tr");
                tr.dataset.status = isVip(user.member_level) ? "vip" : "normal";
                cell(tr, user.id);
                cell(tr, user.username);
                cell(tr, user.email);
                cell(tr, isVip(user.member_level) ? `VIP (${user.member_level})` : "普通用户");
                cell(tr, money(user.balance));
                cell(tr, user.created_at);
                const states = { active: "正常", temporary_ban: "临时封禁", permanent_ban: "永久封禁", deleted: "已软删除" };
                const roles = { member: "普通用户", editor: "编辑", admin: "管理员" };
                cell(tr, states[user.account_status] || user.account_status);
                cell(tr, roles[user.admin_role] || user.admin_role);
                const actions = cell(tr, "");
                const button = document.createElement("button");
                button.className = "table-btn";
                button.textContent = "查看";
                button.addEventListener("click", () => {
                    const modal = document.getElementById("userModal");
                    const content = document.getElementById("userModalContent");
                    content.replaceChildren();
                    const fields = [["用户ID", user.id], ["用户名", user.username], ["邮箱", user.email],
                    ["会员等级", user.member_level], ["订阅状态", user.subscription_status],
                    ["钱包余额", money(user.balance)], ["注册时间", user.created_at],
                    ["账号状态", states[user.account_status]], ["封禁截止", user.banned_until],
                    ["操作原因", user.ban_reason], ["管理角色", roles[user.admin_role]]];
                    fields.forEach(([label, value]) => {
                        const p = document.createElement("p");
                        const strong = document.createElement("strong");
                        strong.textContent = `${label}：`;
                        p.append(strong, document.createTextNode(value == null ? "—" : String(value)));
                        content.appendChild(p);
                    });
                    modal.style.display = "flex";
                });
                actions.appendChild(button);
                const allowedTarget = owner || (user.admin_role === "member" && user.id !== result.admin?.id);
                const addAction = (label, action, permission, extra = {}) => {
                    if (!allowedTarget || !permissions.has(permission)) return;
                    const control = document.createElement("button");
                    control.type = "button"; control.className = "table-btn"; control.textContent = label;
                    control.addEventListener("click", async () => {
                        let body = { ...extra };
                        if (action === "temporary-ban") {
                            const days = window.prompt("封禁天数：1、3、7 或 30", "7");
                            if (days === null) return; body.days = Number(days);
                        }
                        if (action === "role") {
                            const role = window.prompt("角色：member（普通用户）、editor（编辑）、admin（管理员）。超级管理员由现有配置控制。", user.admin_role);
                            if (role === null) return; body.role = role.trim();
                        }
                        const reason = window.prompt(`${label}：请输入5至500字原因`);
                        if (reason === null) return; body.reason = reason.trim();
                        if (body.reason.length < 5 || body.reason.length > 500) { window.alert("原因须为5至500字"); return; }
                        if (!window.confirm(`确认对用户 ${user.username} 执行“${label}”？已有登录会失效，财务记录保持。`)) return;
                        control.disabled = true;
                        try {
                            const response = await fetch(`/api/admin/users/${user.id}/${action}`, {
                                method: "POST", headers: { Authorization: `Bearer ${localStorage.getItem("adminToken") || ""}`, "Content-Type": "application/json" }, body: JSON.stringify(body)
                            });
                            const result = await response.json();
                            if (!response.ok || !result.success) throw new Error(result.message || "操作失败");
                            await load();
                        } catch (e) { window.alert(e.message || "操作未完成，请刷新确认状态"); }
                        finally { control.disabled = false; }
                    });
                    actions.appendChild(control);
                };
                if (user.account_status === "deleted") addAction("恢复", "restore", "users.control");
                else {
                    if (user.account_status !== "permanent_ban") {
                        addAction("临时封禁", "temporary-ban", "users.moderate");
                        addAction("永久封禁", "permanent-ban", "users.control");
                    }
                    if (user.account_status === "temporary_ban" || (owner && user.account_status === "permanent_ban")) addAction("解封", "unban", "users.moderate");
                    addAction("软删除", "soft-delete", "users.control");
                    if (user.account_status === "active") addAction("设置角色", "role", "roles.manage");
                }
                tbody.appendChild(tr);
            }
            if (!result.users.length) {
                const tr = document.createElement("tr");
                const td = cell(tr, "没有符合条件的用户");
                td.colSpan = 9;
                tbody.appendChild(tr);
            }
            const pages = Math.max(1, Math.ceil(result.total / result.limit));
            info.textContent = `真实用户共 ${result.total} 人 · 第 ${result.page} / ${pages} 页`;
            prev.disabled = page <= 1;
            next.disabled = page >= pages;
        } catch (error) {
            if (seq !== requestNumber) return;
            tbody.replaceChildren();
            const tr = document.createElement("tr");
            const td = cell(tr, `读取失败：${error.message}`);
            td.colSpan = 9;
            tbody.appendChild(tr);
            info.textContent = "请检查管理员登录状态和服务器接口";
            prev.disabled = true;
            next.disabled = true;
        }
    }
    search.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { page = 1; load(); }, 250);
    });
    status.addEventListener("change", () => { page = 1; load(); });
    prev.addEventListener("click", () => { if (page > 1) { page--; load(); } });
    next.addEventListener("click", () => { page++; load(); });
    load();
})();
