/* =========================================================
   People Intelligence Admin Console - Full Edition
   File: admin/people-intelligence-admin.js
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    initAdminNavigation();
    initTopbarActions();
    initPersonManagement();
    initPersonCreateModal();
    initPaginationControls();
    initWikidataPipeline();

    await loadPeopleFromApi();
    hidePersonEditor();
});

const PEOPLE_INTELLIGENCE_API = "/api/admin/people-intelligence";

function getAdminToken() {
    return localStorage.getItem("adminToken") || "";
}

function escapeHtml(val) {
    return String(val || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

/* =========================================================
   1. 侧边栏与导航
========================================================= */

function initAdminNavigation() {
    const navItems = document.querySelectorAll("[data-admin-page]");
    const panels = document.querySelectorAll("[data-admin-panel]");
    if (!navItems.length || !panels.length) return;

    navItems.forEach((item) => {
        item.addEventListener("click", () => {
            const target = item.dataset.adminPage;
            navItems.forEach((nav) => nav.classList.remove("active"));
            panels.forEach((panel) => {
                panel.classList.remove("active");
                panel.hidden = true;
            });

            item.classList.add("active");
            const targetPanel = document.querySelector(`[data-admin-panel="${target}"]`);
            if (!targetPanel) return;

            targetPanel.hidden = false;
            targetPanel.classList.add("active");

            if (target === "people") hidePersonEditor();
            if (target === "organizations") ensureOrganizationDataLoaded();
            if (target === "relationships") ensureRelationshipDataLoaded();

            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });
}

function initTopbarActions() {
    document.querySelectorAll(".pia-topbar-actions button").forEach((button) => {
        if (button.textContent.trim() === "查看前台") {
            button.addEventListener("click", () => {
                const q = document.getElementById("piaPersonNameZh")?.value || "";
                window.open(`/people-intelligence.html?q=${encodeURIComponent(q)}`, "_blank");
            });
        }
    });
}

function openPrototypeNotice(title, message) {
    const oldModal = document.getElementById("piaPrototypeModal");
    if (oldModal) oldModal.remove();

    const modal = document.createElement("div");
    modal.id = "piaPrototypeModal";
    modal.className = "pia-prototype-modal";
    modal.innerHTML = `
        <div class="pia-prototype-dialog">
            <div class="pia-prototype-header">
                <h3>${escapeHtml(title)}</h3>
                <button type="button" id="piaPrototypeClose">×</button>
            </div>
            <div class="pia-prototype-body">
                <p style="white-space: pre-line;">${escapeHtml(message)}</p>
            </div>
            <div class="pia-prototype-footer">
                <button type="button" class="pia-primary-btn" id="piaPrototypeConfirm">知道了</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    document.getElementById("piaPrototypeClose")?.addEventListener("click", () => modal.remove());
    document.getElementById("piaPrototypeConfirm")?.addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (e) => { if (e.target === modal) modal.remove(); });
}

/* =========================================================
   2. 人物管理 + 自由分页控制器
========================================================= */

let allPeopleCache = [];
let filteredPeople = [];
let currentPage = 1;
let pageSize = 20; // 默认每页 20 条
let currentEditingPersonId = null;

function initPersonManagement() {
    document.querySelectorAll("[data-person-action]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const action = btn.dataset.personAction;
            if (action === "frontend") {
                const q = document.getElementById("piaPersonNameZh")?.value || "";
                window.open(`/people-intelligence.html?q=${encodeURIComponent(q)}`, "_blank");
                return;
            }
            if (action === "cancel") { hidePersonEditor(); return; }
            if (action === "draft") { await savePersonDraft(); return; }
            if (action === "submit") { await submitPersonForReview(); return; }
            if (action === "approve") { await approvePerson(); return; }
            if (action === "publish") { await togglePersonPublication(); return; }
            if (action === "trash") { await moveCurrentPersonToTrash(); return; }
        });
    });

    document.getElementById("piaPersonSearch")?.addEventListener("input", applyPersonFilters);
    document.getElementById("piaPersonStatusFilter")?.addEventListener("change", applyPersonFilters);
}

function initPaginationControls() {
    document.getElementById("piaPageSizeSelect")?.addEventListener("change", (e) => {
        pageSize = parseInt(e.target.value, 10) || 20;
        currentPage = 1;
        renderPeopleTablePage();
    });

    document.getElementById("piaPrevPageBtn")?.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderPeopleTablePage();
        }
    });

    document.getElementById("piaNextPageBtn")?.addEventListener("click", () => {
        const totalPages = Math.ceil(filteredPeople.length / pageSize) || 1;
        if (currentPage < totalPages) {
            currentPage++;
            renderPeopleTablePage();
        }
    });

    document.getElementById("piaJumpPageBtn")?.addEventListener("click", () => {
        const inputVal = parseInt(document.getElementById("piaJumpPageInput")?.value, 10);
        const totalPages = Math.ceil(filteredPeople.length / pageSize) || 1;
        if (inputVal >= 1 && inputVal <= totalPages) {
            currentPage = inputVal;
            renderPeopleTablePage();
        } else {
            alert(`请输入有效页码 (1 ~ ${totalPages})`);
        }
    });
}

async function loadPeopleFromApi() {
    const token = getAdminToken();
    if (!token) return;

    try {
        const response = await fetch(`${PEOPLE_INTELLIGENCE_API}/people`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();
        if (data.success && Array.isArray(data.people)) {
            allPeopleCache = data.people.map(p => ({
                id: String(p.id),
                nameZh: p.name_zh || "",
                nameEn: p.name_en || "",
                aliases: p.aliases || "",
                birthDate: p.birth_date || "",
                country: p.country_region || "",
                role: p.primary_role || "",
                verificationStatus: p.verification_status || "draft",
                isPublic: Number(p.is_public) === 1,
                evidenceCount: 0,
                updatedAt: p.updated_at ? String(p.updated_at).slice(0, 10) : "",
                biography: p.biography || "",
                tags: p.tags || "",
                confidence: p.confidence_level || "medium"
            }));
            applyPersonFilters();
        }
    } catch (e) {
        console.error("Load people error:", e);
    }
}

function applyPersonFilters() {
    const q = (document.getElementById("piaPersonSearch")?.value || "").trim().toLowerCase();
    const st = document.getElementById("piaPersonStatusFilter")?.value || "all";

    filteredPeople = allPeopleCache.filter(p => {
        const matchesQ = !q || [p.nameZh, p.nameEn, p.role, p.country].join(" ").toLowerCase().includes(q);
        const matchesSt = st === "all" || p.verificationStatus === st;
        return matchesQ && matchesSt;
    });

    currentPage = 1;
    renderPeopleTablePage();
}

function renderPeopleTablePage() {
    const tbody = document.getElementById("piaPeopleTableBody");
    if (!tbody) return;

    const total = filteredPeople.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);
    const pageItems = filteredPeople.slice(startIndex, endIndex);

    document.getElementById("piaPeopleTotalCount").textContent = `共 ${total} 条数据`;
    document.getElementById("piaPaginationInfo").textContent = total > 0
        ? `显示第 ${startIndex + 1} 到 ${endIndex} 条，共 ${total} 条`
        : "暂无数据";

    document.getElementById("piaPrevPageBtn").disabled = currentPage <= 1;
    document.getElementById("piaNextPageBtn").disabled = currentPage >= totalPages;

    // 渲染页码按钮
    const pageBtnsBox = document.getElementById("piaPageNumberBtns");
    if (pageBtnsBox) {
        pageBtnsBox.innerHTML = "";
        for (let i = 1; i <= Math.min(totalPages, 7); i++) {
            const btn = document.createElement("button");
            btn.className = `pia-page-btn ${i === currentPage ? "active" : ""}`;
            btn.textContent = i;
            btn.onclick = () => { currentPage = i; renderPeopleTablePage(); };
            pageBtnsBox.appendChild(btn);
        }
    }

    if (!pageItems.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:30px;color:#94a3b8;">暂无符合条件的人物数据</td></tr>`;
        return;
    }

    tbody.innerHTML = pageItems.map(p => `
        <tr class="pia-person-row ${currentEditingPersonId === p.id ? "active" : ""}">
            <td>
                <div style="display:flex;align-items:center;gap:10px;">
                    <div class="pia-person-avatar" style="width:34px;height:34px;font-size:12px;">${escapeHtml(p.nameEn.slice(0, 2).toUpperCase() || "PT")}</div>
                    <div>
                        <strong>${escapeHtml(p.nameZh || p.nameEn)}</strong>
                        <div style="font-size:11px;color:#64748b;">${escapeHtml(p.nameEn)}</div>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(p.role || "-")}</td>
            <td>${escapeHtml(p.country || "-")}</td>
            <td><span class="pia-status ${p.verificationStatus}">${p.verificationStatus === "verified" ? "已核验" : (p.verificationStatus === "pending" ? "待审核" : "草稿")}</span></td>
            <td><span class="pia-publication-status ${p.isPublic ? "published" : "unpublished"}">${p.isPublic ? "已发布" : "未发布"}</span></td>
            <td>${p.evidenceCount}</td>
            <td>${escapeHtml(p.updatedAt || "-")}</td>
            <td>
                <button type="button" class="pia-primary-btn" style="min-height:30px;padding:0 12px;font-size:12px;" onclick="enterPersonEditMode('${escapeHtml(p.id)}')">编辑</button>
            </td>
        </tr>
    `).join("");
}

/* =========================================================
   3. 人物编辑表单逻辑（仅在点击“编辑”时从顶部展开）
========================================================= */

window.enterPersonEditMode = function (personId) {
    const person = allPeopleCache.find(p => p.id === personId);
    if (!person) return;

    currentEditingPersonId = personId;
    const editor = document.querySelector(".pia-person-editor");
    if (editor) editor.hidden = false;

    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val || "";
    };

    setValue("piaPersonNameZh", person.nameZh);
    setValue("piaPersonNameEn", person.nameEn);
    setValue("piaPersonAliases", person.aliases);
    setValue("piaPersonBirthDate", person.birthDate);
    setValue("piaPersonCountry", person.country);
    setValue("piaPersonRole", person.role);
    setValue("piaPersonVerificationStatus", person.verificationStatus);
    setValue("piaPersonConfidence", person.confidence);
    setValue("piaPersonUpdatedAt", person.updatedAt);
    setValue("piaPersonBiography", person.biography);
    setValue("piaPersonTags", person.tags);

    document.getElementById("piaEditorDisplayName").textContent = person.nameZh || person.nameEn;
    document.getElementById("piaEditorDisplayEnglishName").textContent = person.nameEn;

    updateWorkflowButtonStates(person);
    editor.scrollIntoView({ behavior: "smooth", block: "start" });
};

function hidePersonEditor() {
    const editor = document.querySelector(".pia-person-editor");
    if (editor) editor.hidden = true;
    currentEditingPersonId = null;
}

function updateWorkflowButtonStates(person) {
    const submitBtn = document.querySelector('[data-person-action="submit"]');
    const approveBtn = document.querySelector('[data-person-action="approve"]');
    const publishBtn = document.querySelector('[data-person-action="publish"]');

    if (!person) return;
    const status = person.verificationStatus || "draft";
    const isPublic = person.isPublic;

    if (submitBtn) submitBtn.disabled = status !== "draft";
    if (approveBtn) approveBtn.disabled = status !== "pending";
    if (publishBtn) {
        publishBtn.textContent = isPublic ? "取消发布" : "发布";
        publishBtn.disabled = !isPublic && status !== "verified";
    }
}

async function savePersonDraft() {
    if (!currentEditingPersonId) return;
    const token = getAdminToken();

    const payload = {
        name_zh: document.getElementById("piaPersonNameZh")?.value.trim(),
        name_en: document.getElementById("piaPersonNameEn")?.value.trim(),
        primary_role: document.getElementById("piaPersonRole")?.value.trim(),
        country_region: document.getElementById("piaPersonCountry")?.value.trim(),
        biography: document.getElementById("piaPersonBiography")?.value.trim(),
        verification_status: "draft",
        is_public: false
    };

    try {
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (result.success) {
            await loadPeopleFromApi();
            const updated = allPeopleCache.find(p => p.id === currentEditingPersonId);
            if (updated) updateWorkflowButtonStates(updated);
            openPrototypeNotice("保存成功", "修改已保存至数据库！现在您可以点击【提交审核】推进流程。");
        }
    } catch (e) {
        openPrototypeNotice("保存失败", e.message);
    }
}

async function submitPersonForReview() {
    if (!currentEditingPersonId) return;
    const token = getAdminToken();
    try {
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ verification_status: "pending" })
        });
        const d = await res.json();
        if (d.success) {
            await loadPeopleFromApi();
            const updated = allPeopleCache.find(p => p.id === currentEditingPersonId);
            if (updated) updateWorkflowButtonStates(updated);
            openPrototypeNotice("已提交审核", "状态已变为【待审核】。请点击【审核通过】。");
        }
    } catch (e) { }
}

async function approvePerson() {
    if (!currentEditingPersonId) return;
    const token = getAdminToken();
    try {
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ verification_status: "verified" })
        });
        const d = await res.json();
        if (d.success) {
            await loadPeopleFromApi();
            const updated = allPeopleCache.find(p => p.id === currentEditingPersonId);
            if (updated) updateWorkflowButtonStates(updated);
            openPrototypeNotice("审核通过", "状态已更新为【已核验】！您可以直接点击【发布】。");
        }
    } catch (e) { }
}

async function togglePersonPublication() {
    if (!currentEditingPersonId) return;
    const person = allPeopleCache.find(p => p.id === currentEditingPersonId);
    const shouldPublish = !person?.isPublic;
    const token = getAdminToken();

    try {
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}/publication`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ is_public: shouldPublish })
        });
        const d = await res.json();
        if (d.success) {
            await loadPeopleFromApi();
            const updated = allPeopleCache.find(p => p.id === currentEditingPersonId);
            if (updated) updateWorkflowButtonStates(updated);
            openPrototypeNotice(shouldPublish ? "发布成功 🎉" : "已取消发布", shouldPublish ? "前台可直接搜索浏览。" : "已转为非公开。");
        }
    } catch (e) { }
}

async function moveCurrentPersonToTrash() {
    if (!currentEditingPersonId) return;
    if (!confirm("确定移入垃圾箱吗？")) return;
    const token = getAdminToken();
    try {
        await fetch(`${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}/record-status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ record_status: "trashed" })
        });
        hidePersonEditor();
        await loadPeopleFromApi();
        openPrototypeNotice("已移入垃圾箱", "数据已归档。");
    } catch (e) { }
}

/* =========================================================
   4. 【核心改进】新增人物独立模态弹窗逻辑
========================================================= */

function initPersonCreateModal() {
    const modal = document.getElementById("piaCreatePersonModal");
    const openBtn = document.getElementById("piaOpenCreatePersonModalBtn");
    const closeBtn = document.getElementById("piaCloseCreatePersonBtn");
    const cancelBtn = document.getElementById("piaCancelCreatePersonBtn");
    const backdrop = document.getElementById("piaCloseCreatePersonBackdrop");
    const form = document.getElementById("piaCreatePersonModalForm");

    const closeModal = () => {
        if (modal) modal.hidden = true;
        form?.reset();
    };

    openBtn?.addEventListener("click", () => {
        if (modal) {
            modal.hidden = false;
            document.getElementById("modalPersonNameZh")?.focus();
        }
    });

    closeBtn?.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);
    backdrop?.addEventListener("click", closeModal);

    form?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const zh = document.getElementById("modalPersonNameZh")?.value.trim();
        const en = document.getElementById("modalPersonNameEn")?.value.trim();
        const role = document.getElementById("modalPersonRole")?.value.trim();
        const country = document.getElementById("modalPersonCountry")?.value.trim();
        const bio = document.getElementById("modalPersonBiography")?.value.trim();

        const token = getAdminToken();
        const saveBtn = document.getElementById("piaSaveCreatePersonBtn");
        if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "创建中..."; }

        try {
            const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/people`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    name_zh: zh,
                    name_en: en,
                    primary_role: role,
                    country_region: country,
                    biography: bio,
                    verification_status: "draft",
                    is_public: false
                })
            });
            const d = await res.json();
            if (d.success) {
                closeModal();
                await loadPeopleFromApi();
                openPrototypeNotice("创建成功 🎉", `人物【${zh || en}】已作为草稿创建入库！`);
            } else {
                alert(d.message || "创建失败");
            }
        } catch (err) {
            alert("请求错误: " + err.message);
        } finally {
            if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = "保存入库"; }
        }
    });
}

/* =========================================================
   5. 维基数据常驻卡片抓取
========================================================= */

function initWikidataPipeline() {
    const searchBtn = document.getElementById("piaWikiSearchBtn");
    const searchInput = document.getElementById("piaWikiSearchInput");

    searchBtn?.addEventListener("click", async () => {
        const query = searchInput?.value.trim();
        if (!query) return;

        const listContainer = document.getElementById("piaWikiResultList");
        const statusBox = document.getElementById("piaWikiLoadingStatus");
        if (listContainer) listContainer.innerHTML = "";
        if (statusBox) {
            statusBox.style.display = "block";
            statusBox.textContent = `⏳ 正在连接维基百科数据库，检索【${query}】候选条目...`;
        }

        try {
            const token = getAdminToken();
            const res = await fetch(`/api/admin/people-intelligence/sources/wikidata/search?q=${encodeURIComponent(query)}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (statusBox) statusBox.style.display = "none";

            if (!data.success || !data.items?.length) {
                listContainer.innerHTML = `<div style="color: #ef4444; font-size: 13px; padding: 10px 0;">未在维基百科检索到相关人物条目。</div>`;
                return;
            }

            listContainer.innerHTML = data.items.map(item => `
                <div style="border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; background: #f8fafc;">
                    <div style="max-width: 75%;">
                        <div style="font-weight: 700; font-size: 14px; color: #1e293b;">
                            ${escapeHtml(item.label)} 
                            <span style="color: #64748b; font-weight: normal; font-size: 12px;">(${escapeHtml(item.qid)})</span>
                        </div>
                        <div style="font-size: 12px; color: #64748b; margin-top: 3px; line-height: 1.5;">${escapeHtml(item.description)}</div>
                    </div>
                    <button type="button" class="pia-primary-btn" style="min-height: 36px; padding: 0 16px; font-size: 13px; background: #10b981; border-color: #10b981;" onclick="executeWikidataIngest('${escapeHtml(item.qid)}')">
                        一键抓取并建档入库
                    </button>
                </div>
            `).join("");
        } catch (e) {
            if (statusBox) statusBox.style.display = "none";
            listContainer.innerHTML = `<div style="color: #ef4444; font-size: 13px; padding: 10px 0;">检索请求失败: ${escapeHtml(e.message)}</div>`;
        }
    });

    searchInput?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") searchBtn?.click();
    });
}

window.executeWikidataIngest = async function (qid) {
    const statusBox = document.getElementById("piaWikiLoadingStatus");
    if (statusBox) {
        statusBox.style.display = "block";
        statusBox.textContent = `⏳ 正在深度解析维基关系链 (${qid})，正在自动创建人物主档案、配偶、子嗣以及旗下关联机构...`;
    }

    try {
        const token = getAdminToken();
        const res = await fetch("/api/admin/people-intelligence/sources/wikidata/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ qid })
        });
        const result = await res.json();
        if (statusBox) statusBox.style.display = "none";

        if (!result.success) {
            openPrototypeNotice("抓取失败", result.message || "未知错误");
            return;
        }

        document.getElementById("piaWikiResultList").innerHTML = "";
        document.getElementById("piaWikiSearchInput").value = "";
        await loadPeopleFromApi();
        openPrototypeNotice("智能抓取成功 🎉", `${result.message}\n\n已成功自动提取并关联：\n${result.details.join("\n")}`);
    } catch (e) {
        if (statusBox) statusBox.style.display = "none";
        openPrototypeNotice("执行抓取错误", e.message);
    }
};

/* =========================================================
   6. 机构与关系数据只读展示
========================================================= */

async function ensureOrganizationDataLoaded() {
    try {
        const token = getAdminToken();
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/organizations`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.organizations)) {
            const tbody = document.getElementById("piaOrganizationTableBody");
            if (!tbody) return;
            tbody.innerHTML = data.organizations.map(org => `
                <tr>
                    <td><strong>${escapeHtml(org.name_zh || org.name_en)}</strong></td>
                    <td>${escapeHtml(org.organization_type || "公司")}</td>
                    <td>${escapeHtml(org.country_region || "-")}</td>
                    <td>${escapeHtml(org.industry_primary || org.industry || "-")}</td>
                    <td>${escapeHtml(org.ticker_symbol || "-")}</td>
                    <td><span class="pia-status ${org.verification_status}">${org.verification_status}</span></td>
                    <td>${Number(org.is_public) === 1 ? "已发布" : "未发布"}</td>
                    <td>${escapeHtml(String(org.updated_at || "").slice(0, 10))}</td>
                    <td><button type="button" class="pia-primary-btn" style="min-height:28px;padding:0 10px;font-size:11px;">查看</button></td>
                </tr>
            `).join("");
        }
    } catch (e) { }
}

async function ensureRelationshipDataLoaded() {
    try {
        const token = getAdminToken();
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/relationships`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.relationships)) {
            const tbody = document.getElementById("piaRelationshipTableBody");
            if (!tbody) return;
            tbody.innerHTML = data.relationships.map(rel => `
                <tr>
                    <td><strong>${escapeHtml(rel.source_entity_name || `ID ${rel.source_entity_id}`)}</strong></td>
                    <td>${escapeHtml(rel.relationship_name_zh || rel.relationship_type)}</td>
                    <td><strong>${escapeHtml(rel.target_entity_name || `ID ${rel.target_entity_id}`)}</strong></td>
                    <td>${escapeHtml(rel.role_title || "-")}</td>
                    <td><span class="pia-status ${rel.verification_status}">${rel.verification_status}</span></td>
                    <td>${Number(rel.verified_evidence_count || 0)} / ${Number(rel.evidence_count || 0)}</td>
                    <td>${Number(rel.is_public) === 1 ? "已公开" : "未公开"}</td>
                    <td>${escapeHtml(String(rel.updated_at || "").slice(0, 10))}</td>
                    <td><button type="button" class="pia-primary-btn" style="min-height:28px;padding:0 10px;font-size:11px;">查看</button></td>
                </tr>
            `).join("");
        }
    } catch (e) { }
}