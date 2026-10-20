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
        loadingCell.colSpan = 7;
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
                    ["钱包余额", money(user.balance)], ["注册时间", user.created_at]];
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
                tbody.appendChild(tr);
            }
            if (!result.users.length) {
                const tr = document.createElement("tr");
                const td = cell(tr, "没有符合条件的用户");
                td.colSpan = 7;
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
            td.colSpan = 7;
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
