(() => {
    "use strict";
    const tbody = document.querySelector("#usersTable tbody");
    const info = document.getElementById("usersPageInfo");
    const prev = document.getElementById("usersPrevPage");
    const next = document.getElementById("usersNextPage");
    const search = document.getElementById("userSearchInput");
    const status = document.getElementById("userStatusFilter");
    const roleFilter = document.getElementById("userRoleFilter");
    const roleDialog = document.getElementById("userRoleDialog");
    const roleForm = document.getElementById("userRoleForm");
    let roleTarget = null;
    function updateRoleSubmit() {
        const role = document.getElementById("userRoleSelect").value;
        document.getElementById("userRoleSubmit").disabled = !roleTarget ||
            !(roleTarget.assignable_roles || []).includes(role) || role === roleTarget.admin_role;
    }
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
        const query = new URLSearchParams({ page: String(page), search: search.value.trim(), status: status.value, role: roleFilter.value });
        try {
            const response = await fetch(`/api/admin/users?${query}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store"
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || "读取失败");
            if (seq !== requestNumber) return;
            const roleLabels = result.role_labels || {};
            document.getElementById("usersPermissionInfo").textContent =
                "当前角色：" + (roleLabels[result.admin?.adminRole] || result.admin?.adminRole || "未知") +
                "。管理角色与公司职务分离；HR仅分配普通用户、新闻编辑。高权限授予需独立审批，当前不开放直接授予。";
            const ownerInfo = result.owner_identity;
            document.getElementById("usersOwnerInfo").textContent = ownerInfo?.username
                ? "最高控制身份：" + ownerInfo.username + "（可信后台配置身份，不属于普通用户角色，不接受用户ID封禁、删除或降权）" : "最高控制身份未配置，请联系系统负责人。";
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
                const roles = roleLabels;
                cell(tr, states[user.effective_status || user.account_status] || user.account_status);
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
                const addAction = (label, action, permission, extra = {}) => {
                    if (!Array.isArray(user.allowed_actions) || !user.allowed_actions.includes(action)) return;
                    const control = document.createElement("button");
                    control.type = "button"; control.className = "table-btn"; control.textContent = label;
                    control.addEventListener("click", async () => {
                        if (action === "role") {
                            roleTarget = user;
                            const select = document.getElementById("userRoleSelect");
                            select.replaceChildren();
                            for (const value of [...new Set(user.assignable_roles || [])]) {
                                const option = document.createElement("option"); option.value = value; option.textContent = roles[value] || value;
                                select.appendChild(option);
                            }
                            select.disabled = select.options.length === 0;
                            select.value = (user.assignable_roles || []).includes(user.admin_role) ? user.admin_role : select.options[0]?.value || "";
                            document.getElementById("userRoleActor").textContent = "当前操作者：" + (roles[result.admin?.adminRole] || result.admin?.adminRole || "未知身份");
                            const availability = document.getElementById("userRoleAvailability");
                            if (!select.options.length) availability.textContent = "后端未授权可分配角色，不能提交角色变更。";
                            else if (select.options.length === 1) availability.textContent = "权限限制：后端仅授权“" + select.options[0].textContent + "”；其他角色未获授权。";
                            else availability.textContent = "本次允许分配：" + [...select.options].map(option => option.textContent).join("、") + "。请选择与当前角色不同的一项。";
                            document.getElementById("userRoleCurrent").textContent = (roles[user.admin_role] || user.admin_role) + " · " + user.username;
                            document.getElementById("userRoleReason").value = "";
                            updateRoleSubmit();
                            roleDialog.showModal();
                            if (!select.disabled) select.focus();
                            return;
                        }
                        let body = { ...extra };
                        if (action === "temporary-ban") {
                            const days = window.prompt("封禁天数：1、3、7 或 30", "7");
                            if (days === null) return; body.days = Number(days);
                            if (![1, 3, 7, 30].includes(body.days)) { window.alert("请选择1、3、7或30天"); return; }
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
                    if (["temporary_ban", "permanent_ban"].includes(user.account_status)) addAction("解封", "unban", "users.moderate");
                    addAction("软删除", "soft-delete", "users.control");
                    addAction("设置角色", "role", "roles.manage");
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
            page = result.page;
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
    roleForm.addEventListener("submit", async event => {
        event.preventDefault();
        const target = roleTarget;
        const role = document.getElementById("userRoleSelect").value;
        const reason = document.getElementById("userRoleReason").value.trim();
        const submit = document.getElementById("userRoleSubmit");
        if (!target || submit.disabled) return;
        if (!(target.assignable_roles || []).includes(role) || reason.length < 5 || reason.length > 500) { window.alert("请选择允许的角色并填写5至500字原因"); return; }
        if (role === target.admin_role) { window.alert("请选择不同的角色"); return; }
        if (!window.confirm("确认调整该用户的管理角色？原有登录令牌将失效。")) return;
        submit.disabled = true;
        try {
            const response = await fetch('/api/admin/users/' + target.id + '/role', {
                method: "POST", headers: { Authorization: 'Bearer ' + (localStorage.getItem("adminToken") || ""), "Content-Type": "application/json" },
                body: JSON.stringify({ role, reason })
            });
            const result = await response.json();
            if (!response.ok || !result.success) throw new Error(result.message || "角色操作失败");
            roleDialog.close(); await load();
        } catch (error) { window.alert(error.message); }
        finally { submit.disabled = false; }
    });
    document.getElementById("userRoleCancel").addEventListener("click", () => roleDialog.close());
    document.getElementById("userRoleSelect").addEventListener("change", updateRoleSubmit);
    roleFilter.addEventListener("change", () => { page = 1; load(); });
    search.addEventListener("input", () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => { page = 1; load(); }, 250);
    });
    status.addEventListener("change", () => { page = 1; load(); });
    prev.addEventListener("click", () => { if (page > 1) { page--; load(); } });
    next.addEventListener("click", () => { page++; load(); });
    load();
})();
