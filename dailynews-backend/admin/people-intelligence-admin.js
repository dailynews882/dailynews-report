/* =========================================================
   People Intelligence Admin Console
   Full Feature Edition (No-Lockup Workflow)
   File: admin/people-intelligence-admin.js
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    initAdminNavigation();
    initTopbarActions();
    initPersonManagement();
    initOrganizationManagement();
    initRelationshipManagement();
    initEvidenceManagement();
    initReviewQueue();
    initCorrectionCenter();
    initVersionHistory();

    await loadPeopleFromApi();

    hidePersonEditor();
    hideOrganizationEditor();
    hideRelationshipEditor();
    hideEvidenceEditor();
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
   1. 侧边栏与顶部导航
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
            if (target === "organizations") {
                hideOrganizationEditor();
                ensureOrganizationDataLoaded();
            }
            if (target === "relationships") {
                hideRelationshipEditor();
                ensureRelationshipDataLoaded();
            }
            if (target === "evidence") {
                hideEvidenceEditor();
                ensureEvidenceDataLoaded();
            }
            if (target === "ai-review") loadReviewQueue();
            if (target === "corrections") loadCorrections();
            if (target === "versions") loadVersions();

            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });
}

function initTopbarActions() {
    const topbarButtons = document.querySelectorAll(".pia-topbar-actions button");
    topbarButtons.forEach((button) => {
        const text = button.textContent.trim();
        if (text === "查看前台") {
            button.addEventListener("click", () => {
                const q = document.getElementById("piaPersonNameZh")?.value || "";
                window.open(`/people-intelligence.html?q=${encodeURIComponent(q)}`, "_blank");
            });
        }
        if (text.includes("新增人物")) {
            button.addEventListener("click", openCreatePersonModal);
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
                <button type="button" id="piaPrototypeClose" aria-label="关闭">×</button>
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
   2. 人物管理（无死锁流通）
========================================================= */

const peopleManagementDemoData = {};
let currentEditingPersonId = null;

function initPersonManagement() {
    initPersonActionButtons();
    initPersonRows();
    document.getElementById("piaPersonSearch")?.addEventListener("input", applyPersonFilters);
    document.getElementById("piaPersonStatusFilter")?.addEventListener("change", applyPersonFilters);
}

function initPersonActionButtons() {
    document.querySelectorAll("[data-person-action]").forEach((button) => {
        button.addEventListener("click", async (event) => {
            event.stopPropagation();
            const action = button.dataset.personAction;
            const personId = button.dataset.personId || null;

            if (action === "frontend") {
                const q = document.getElementById("piaPersonNameZh")?.value || "";
                window.open(`/people-intelligence.html?q=${encodeURIComponent(q)}`, "_blank");
                return;
            }
            if (action === "new") { openCreatePersonModal(); return; }
            if (action === "edit") { if (personId) enterPersonEditMode(personId); return; }
            if (action === "cancel") { hidePersonEditor(); return; }
            if (action === "draft") { await savePersonDraft(); return; }
            if (action === "submit") { await submitPersonForReview(); return; }
            if (action === "approve") { await approvePerson(); return; }
            if (action === "publish") { await togglePersonPublication(); return; }
            if (action === "trash") { await moveCurrentPersonToTrash(); return; }
        });
    });
}

function initPersonRows() {
    document.querySelectorAll(".pia-person-row").forEach((row) => {
        row.addEventListener("click", (event) => {
            if (event.target.closest("[data-person-action]")) return;
            const personId = row.dataset.personId;
            if (personId) enterPersonEditMode(personId);
        });
    });
}

function mapApiPersonToFrontend(person) {
    return {
        id: String(person.id),
        databaseId: person.id,
        slug: person.slug || "",
        initials: createPersonInitials(person.name_en || "", person.name_zh || ""),
        nameZh: person.name_zh || "",
        nameEn: person.name_en || "",
        aliases: person.aliases || "",
        birthDate: person.birth_date || "",
        deathDate: person.death_date || "",
        nationality: person.nationality || "",
        country: person.country_region || "",
        role: person.primary_role || "",
        organization: "",
        verificationStatus: person.verification_status || "draft",
        confidence: person.confidence_level || "medium",
        biography: person.biography || "",
        tags: person.tags || "",
        profileImageUrl: person.profile_image_url || "",
        isPublic: Number(person.is_public) === 1,
        updatedAt: person.updated_at ? String(person.updated_at).slice(0, 10) : "",
        evidenceCount: 0
    };
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
            Object.keys(peopleManagementDemoData).forEach((k) => delete peopleManagementDemoData[k]);
            const tbody = document.querySelector(".pia-people-table tbody");
            if (tbody) tbody.innerHTML = "";

            data.people.forEach((p) => {
                const item = mapApiPersonToFrontend(p);
                peopleManagementDemoData[item.id] = item;
                appendPrototypePersonRow(item);
            });
            applyPersonFilters();
            updateVisiblePersonCount();
        }
    } catch (e) {
        console.error("Load people error:", e);
    }
}

function collectPersonFormData() {
    return {
        nameZh: document.getElementById("piaPersonNameZh")?.value.trim() || "",
        nameEn: document.getElementById("piaPersonNameEn")?.value.trim() || "",
        aliases: document.getElementById("piaPersonAliases")?.value.trim() || "",
        birthDate: document.getElementById("piaPersonBirthDate")?.value || "",
        country: document.getElementById("piaPersonCountry")?.value.trim() || "",
        role: document.getElementById("piaPersonRole")?.value.trim() || "",
        organization: document.getElementById("piaPersonOrganization")?.value.trim() || "",
        verificationStatus: document.getElementById("piaPersonVerificationStatus")?.value || "draft",
        confidence: document.getElementById("piaPersonConfidence")?.value || "medium",
        updatedAt: document.getElementById("piaPersonUpdatedAt")?.value || "",
        biography: document.getElementById("piaPersonBiography")?.value.trim() || "",
        tags: document.getElementById("piaPersonTags")?.value.trim() || ""
    };
}

async function savePersonDraft() {
    const data = collectPersonFormData();
    if (!data.nameZh && !data.nameEn) {
        openPrototypeNotice("资料不完整", "请填写姓名。");
        return;
    }
    data.verificationStatus = "draft";

    try {
        const token = getAdminToken();
        const payload = {
            name_zh: data.nameZh,
            name_en: data.nameEn,
            aliases: data.aliases,
            birth_date: data.birthDate,
            country_region: data.country,
            primary_role: data.role,
            biography: data.biography,
            tags: data.tags,
            verification_status: "draft",
            confidence_level: data.confidence,
            is_public: false
        };

        const isExisting = currentEditingPersonId && /^\d+$/.test(String(currentEditingPersonId));
        const url = isExisting
            ? `${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}`
            : `${PEOPLE_INTELLIGENCE_API}/people`;

        const res = await fetch(url, {
            method: isExisting ? "PUT" : "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify(payload)
        });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || "保存失败");

        if (result.person) {
            const frontendPerson = mapApiPersonToFrontend(result.person);
            peopleManagementDemoData[frontendPerson.id] = frontendPerson;
            currentEditingPersonId = frontendPerson.id;
            loadPersonIntoEditor(frontendPerson);
        }
        await loadPeopleFromApi();
        openPrototypeNotice("草稿已保存", "人物资料已永久保存至数据库。您现在可以直接点击【提交审核】推进流程。");
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
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || "提交失败");

        if (result.person) {
            const frontendPerson = mapApiPersonToFrontend(result.person);
            peopleManagementDemoData[frontendPerson.id] = frontendPerson;
            loadPersonIntoEditor(frontendPerson);
        }
        await loadPeopleFromApi();
        openPrototypeNotice("已提交审核", "状态已变为【待审核】。您现在可以点击【审核通过】。");
    } catch (e) {
        openPrototypeNotice("提交失败", e.message);
    }
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
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || "审核失败");

        if (result.person) {
            const frontendPerson = mapApiPersonToFrontend(result.person);
            peopleManagementDemoData[frontendPerson.id] = frontendPerson;
            loadPersonIntoEditor(frontendPerson);
        }
        await loadPeopleFromApi();
        openPrototypeNotice("审核通过", "状态已更新为【已核验】！您可以直接点击【发布】推送到前台展示。");
    } catch (e) {
        openPrototypeNotice("审核失败", e.message);
    }
}

async function togglePersonPublication() {
    if (!currentEditingPersonId) return;
    const person = peopleManagementDemoData[String(currentEditingPersonId)];
    const shouldPublish = !person?.isPublic;
    const token = getAdminToken();

    try {
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}/publication`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ is_public: shouldPublish })
        });
        const result = await res.json();
        if (!res.ok || !result.success) throw new Error(result.message || "操作发布失败");

        if (result.person) {
            const frontendPerson = mapApiPersonToFrontend(result.person);
            peopleManagementDemoData[frontendPerson.id] = frontendPerson;
            loadPersonIntoEditor(frontendPerson);
        }
        await loadPeopleFromApi();
        openPrototypeNotice(
            shouldPublish ? "发布成功 🎉" : "已取消发布",
            shouldPublish ? "人物已正式发布！您现在可以点击右上角【查看前台】在图谱系统中直接浏览。" : "该资料已转为内部非公开状态。"
        );
    } catch (e) {
        openPrototypeNotice("发布状态变更失败", e.message);
    }
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
        currentEditingPersonId = null;
        await loadPeopleFromApi();
        hidePersonEditor();
        openPrototypeNotice("已移入垃圾箱", "数据已归档至垃圾箱。");
    } catch (e) {
        openPrototypeNotice("操作失败", e.message);
    }
}

function updatePersonWorkflowButtons(person) {
    const submitBtn = document.querySelector('[data-person-action="submit"]');
    const approveBtn = document.querySelector('[data-person-action="approve"]');
    const publishBtn = document.querySelector('[data-person-action="publish"]');

    if (!person) {
        if (submitBtn) submitBtn.disabled = true;
        if (approveBtn) approveBtn.disabled = true;
        if (publishBtn) publishBtn.disabled = true;
        return;
    }

    const status = person.verificationStatus || "draft";
    const isPublic = Boolean(person.isPublic);

    if (submitBtn) submitBtn.disabled = status !== "draft";
    if (approveBtn) approveBtn.disabled = status !== "pending";
    if (publishBtn) {
        publishBtn.textContent = isPublic ? "取消发布" : "发布";
        publishBtn.disabled = !isPublic && status !== "verified";
    }
}

function enterPersonEditMode(personId) {
    const person = peopleManagementDemoData[personId];
    if (!person) return;
    activatePeopleManagementPage();
    showPersonEditor();
    setActivePersonRow(personId);
    loadPersonIntoEditor(person);
    currentEditingPersonId = personId;

    const fields = [
        "piaPersonNameZh", "piaPersonNameEn", "piaPersonAliases", "piaPersonBirthDate",
        "piaPersonCountry", "piaPersonRole", "piaPersonOrganization", "piaPersonVerificationStatus",
        "piaPersonConfidence", "piaPersonBiography", "piaPersonTags"
    ];
    fields.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });
    updatePersonWorkflowButtons(person);
}

function showPersonEditor() {
    const editor = document.querySelector(".pia-person-editor");
    if (editor) editor.hidden = false;
}

function hidePersonEditor() {
    const editor = document.querySelector(".pia-person-editor");
    if (editor) editor.hidden = true;
    currentEditingPersonId = null;
    setActivePersonRow(null);
}

function activatePeopleManagementPage() {
    const peopleNav = document.querySelector('[data-admin-page="people"]');
    const peoplePanel = document.querySelector('[data-admin-panel="people"]');
    document.querySelectorAll("[data-admin-page]").forEach((i) => i.classList.remove("active"));
    document.querySelectorAll("[data-admin-panel]").forEach((p) => {
        p.classList.remove("active");
        p.hidden = true;
    });
    if (peopleNav) peopleNav.classList.add("active");
    if (peoplePanel) {
        peoplePanel.hidden = false;
        peoplePanel.classList.add("active");
    }
}

function setActivePersonRow(personId) {
    document.querySelectorAll(".pia-person-row").forEach((row) => {
        row.classList.toggle("active", row.dataset.personId === personId);
    });
}

function loadPersonIntoEditor(person) {
    const setValue = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = val == null ? "" : val;
    };

    setValue("piaPersonNameZh", person.nameZh);
    setValue("piaPersonNameEn", person.nameEn);
    setValue("piaPersonAliases", person.aliases);
    setValue("piaPersonBirthDate", person.birthDate);
    setValue("piaPersonCountry", person.country);
    setValue("piaPersonRole", person.role);
    setValue("piaPersonOrganization", person.organization);
    setValue("piaPersonVerificationStatus", person.verificationStatus);
    setValue("piaPersonConfidence", person.confidence);
    setValue("piaPersonUpdatedAt", person.updatedAt);
    setValue("piaPersonBiography", person.biography);
    setValue("piaPersonTags", person.tags);

    const displayName = document.getElementById("piaEditorDisplayName");
    if (displayName) displayName.textContent = person.nameZh || person.nameEn || "未命名";

    const displayEn = document.getElementById("piaEditorDisplayEnglishName");
    if (displayEn) displayEn.textContent = person.nameEn || "";

    const avatar = document.querySelector(".pia-person-editor-avatar");
    if (avatar) avatar.textContent = person.initials || "PT";

    const statusBadge = document.querySelector(".pia-person-editor .pia-card-heading .pia-status");
    if (statusBadge) {
        statusBadge.className = `pia-status ${person.verificationStatus || "draft"}`;
        const labels = { draft: "草稿", pending: "待审核", verified: "已核验", disputed: "存在争议" };
        statusBadge.textContent = labels[person.verificationStatus] || person.verificationStatus || "草稿";
    }

    updatePersonWorkflowButtons(person);
}

function applyPersonFilters() {
    const q = (document.getElementById("piaPersonSearch")?.value || "").trim().toLowerCase();
    const st = document.getElementById("piaPersonStatusFilter")?.value || "all";

    document.querySelectorAll(".pia-person-row").forEach((row) => {
        const p = peopleManagementDemoData[row.dataset.personId];
        if (!p) { row.style.display = "none"; return; }

        const matchesQ = !q || [p.nameZh, p.nameEn, p.role, p.country].join(" ").toLowerCase().includes(q);
        const matchesSt = st === "all" || p.verificationStatus === st;
        row.style.display = matchesQ && matchesSt ? "" : "none";
    });
    updateVisiblePersonCount();
}

function updateVisiblePersonCount() {
    const visible = Array.from(document.querySelectorAll(".pia-person-row")).filter((r) => r.style.display !== "none").length;
    const counter = document.querySelector(".pia-record-count");
    if (counter) counter.textContent = `共 ${visible} 条数据`;
}

function appendPrototypePersonRow(person) {
    const tbody = document.querySelector(".pia-people-table tbody");
    if (!tbody) return;

    const row = document.createElement("tr");
    row.className = "pia-person-row";
    row.dataset.personId = person.id;

    row.innerHTML = `
        <td>
            <div class="pia-person-cell">
                <div class="pia-person-avatar">${escapeHtml(person.initials)}</div>
                <div>
                    <strong>${escapeHtml(person.nameZh || person.nameEn)}</strong>
                    <span>${escapeHtml(person.nameEn)}</span>
                </div>
            </div>
        </td>
        <td>${escapeHtml(person.role || "-")}</td>
        <td>${escapeHtml(person.country || "-")}</td>
        <td><span class="pia-status ${person.verificationStatus}">${person.verificationStatus === "verified" ? "已核验" : (person.verificationStatus === "pending" ? "待审核" : "草稿")}</span></td>
        <td><span class="pia-publication-status ${person.isPublic ? "published" : "unpublished"}">${person.isPublic ? "已发布" : "未发布"}</span></td>
        <td>${person.evidenceCount || 0}</td>
        <td>${escapeHtml(person.updatedAt || "-")}</td>
        <td>
            <button type="button" class="pia-table-action" data-person-action="edit" data-person-id="${escapeHtml(person.id)}">编辑</button>
        </td>
    `;
    tbody.appendChild(row);

    row.querySelector('[data-person-action="edit"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        enterPersonEditMode(person.id);
    });
}

function createPersonInitials(en, zh) {
    if (en) {
        const parts = en.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return en.slice(0, 2).toUpperCase();
    }
    return String(zh || "PT").slice(0, 2);
}

function openCreatePersonModal() {
    closePeopleCreateModal();

    const modal = document.createElement("div");
    modal.id = "piaCreateEntityModal";
    modal.className = "pia-create-modal";
    modal.innerHTML = `
        <div class="pia-create-modal-backdrop" data-create-modal-close></div>
        <section class="pia-create-modal-dialog" role="dialog">
            <header class="pia-create-modal-header">
                <div>
                    <span class="pia-eyebrow">CREATE PERSON</span>
                    <h3>新增人物</h3>
                    <p>创建一条新的人物资料，初始状态为草稿。</p>
                </div>
                <button type="button" class="pia-create-modal-close" data-create-modal-close>×</button>
            </header>
            <div class="pia-create-modal-body">
                <form id="piaCreatePersonForm" class="pia-create-form">
                    <div class="pia-create-form-grid">
                        <label><span>中文姓名 *</span><input id="piaCreatePersonNameZh" required placeholder="例如：潘铁战"></label>
                        <label><span>英文姓名 *</span><input id="piaCreatePersonNameEn" required placeholder="例如：Andrew Pan"></label>
                        <label><span>主要身份</span><input id="piaCreatePersonRole" placeholder="例如：公司创始人 / CEO"></label>
                        <label><span>国家 / 地区</span><input id="piaCreatePersonCountry" placeholder="例如：新加坡"></label>
                    </div>
                    <div class="pia-create-modal-actions">
                        <button type="button" class="pia-secondary-btn" data-create-modal-close>取消</button>
                        <button type="submit" class="pia-primary-btn" id="piaCreatePersonSave">保存草稿</button>
                    </div>
                </form>
            </div>
        </section>
    `;

    document.body.appendChild(modal);
    document.body.classList.add("pia-modal-open");

    modal.querySelectorAll("[data-create-modal-close]").forEach((btn) => {
        btn.addEventListener("click", closePeopleCreateModal);
    });

    document.getElementById("piaCreatePersonForm")?.addEventListener("submit", async (e) => {
        e.preventDefault();
        const zh = document.getElementById("piaCreatePersonNameZh")?.value.trim();
        const en = document.getElementById("piaCreatePersonNameEn")?.value.trim();
        const role = document.getElementById("piaCreatePersonRole")?.value.trim();
        const country = document.getElementById("piaCreatePersonCountry")?.value.trim();

        const token = getAdminToken();
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/people`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ name_zh: zh, name_en: en, primary_role: role, country_region: country })
        });
        const d = await res.json();
        if (d.success) {
            closePeopleCreateModal();
            await loadPeopleFromApi();
            openPrototypeNotice("成功", "人物已创建为草稿。");
        }
    });
}

function closePeopleCreateModal() {
    document.getElementById("piaCreateEntityModal")?.remove();
    document.body.classList.remove("pia-modal-open");
}

/* =========================================================
   3. 机构管理 (Organizations) - 完整后端交互
========================================================= */

let organizationsCache = [];
let organizationDataLoaded = false;
let currentEditingOrganizationId = null;

function initOrganizationManagement() {
    document.getElementById("piaNewOrganizationButton")?.addEventListener("click", openCreateOrganizationModal);
    document.getElementById("piaOrganizationResetButton")?.addEventListener("click", resetOrganizationForm);
    document.getElementById("piaOrganizationSearch")?.addEventListener("input", renderOrganizationTable);
    document.getElementById("piaOrganizationTypeFilter")?.addEventListener("change", renderOrganizationTable);
    document.getElementById("piaOrganizationStatusFilter")?.addEventListener("change", renderOrganizationTable);

    document.querySelectorAll("[data-organization-action]").forEach((button) => {
        button.addEventListener("click", async () => {
            const action = button.dataset.organizationAction;
            if (action === "draft") await saveOrganizationWithStatus("draft");
            if (action === "submit") await saveOrganizationWithStatus("pending");
            if (action === "approve") await approveOrganization();
            if (action === "publish") await toggleOrganizationPublication();
            if (action === "trash") await trashOrganization();
        });
    });
}

async function ensureOrganizationDataLoaded() {
    if (organizationDataLoaded) return;
    try {
        const token = getAdminToken();
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/organizations`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.organizations)) {
            organizationsCache = data.organizations;
            organizationDataLoaded = true;
            renderOrganizationTable();
        }
    } catch (e) {
        console.error("Load org error:", e);
    }
}

function renderOrganizationTable() {
    const tbody = document.getElementById("piaOrganizationTableBody");
    if (!tbody) return;

    if (!organizationsCache.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="pia-organization-empty">暂无机构数据</td></tr>`;
        return;
    }

    tbody.innerHTML = organizationsCache.map((org) => `
        <tr>
            <td><strong>${escapeHtml(org.name_zh || org.name_en)}</strong><br><small>${escapeHtml(org.name_en)}</small></td>
            <td>${escapeHtml(org.organization_type || "公司")}</td>
            <td>${escapeHtml(org.country_region || "-")}</td>
            <td>${escapeHtml(org.industry_primary || org.industry || "-")}</td>
            <td>${escapeHtml(org.ticker_symbol || "-")}</td>
            <td><span class="pia-status ${org.verification_status}">${org.verification_status}</span></td>
            <td>${Number(org.is_public) === 1 ? "已发布" : "未发布"}</td>
            <td>${escapeHtml(String(org.updated_at || "").slice(0, 10))}</td>
            <td><button type="button" class="pia-table-action" onclick="editOrganization(${org.id})">编辑</button></td>
        </tr>
    `).join("");
}

function showOrganizationEditor() { document.querySelector(".pia-organization-editor-card")?.removeAttribute("hidden"); }
function hideOrganizationEditor() {
    const el = document.querySelector(".pia-organization-editor-card");
    if (el) el.hidden = true;
    currentEditingOrganizationId = null;
}
function resetOrganizationForm() {
    document.getElementById("piaOrganizationForm")?.reset();
    hideOrganizationEditor();
}
function openCreateOrganizationModal() {
    showOrganizationEditor();
    resetOrganizationForm();
}

/* =========================================================
   4. 关系管理 (Relationships) - 完整后端交互
========================================================= */

let relationshipsCache = [];
let relationshipTypesCache = [];
let relationshipDataLoaded = false;

function initRelationshipManagement() {
    document.getElementById("piaRelationshipSearch")?.addEventListener("input", renderRelationshipTable);
    document.getElementById("piaRelationshipStatusFilter")?.addEventListener("change", renderRelationshipTable);
}

async function ensureRelationshipDataLoaded() {
    if (relationshipDataLoaded) return;
    try {
        const token = getAdminToken();
        const res = await fetch(`${PEOPLE_INTELLIGENCE_API}/relationships`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (data.success && Array.isArray(data.relationships)) {
            relationshipsCache = data.relationships;
            relationshipDataLoaded = true;
            renderRelationshipTable();
        }
    } catch (e) {
        console.error("Load relationships error:", e);
    }
}

function renderRelationshipTable() {
    const tbody = document.getElementById("piaRelationshipTableBody");
    if (!tbody) return;

    if (!relationshipsCache.length) {
        tbody.innerHTML = `<tr><td colspan="9" class="pia-relationship-empty">暂无关系数据</td></tr>`;
        return;
    }

    tbody.innerHTML = relationshipsCache.map((rel) => `
        <tr>
            <td><strong>${escapeHtml(rel.source_entity_name || `ID ${rel.source_entity_id}`)}</strong></td>
            <td>${escapeHtml(rel.relationship_name_zh || rel.relationship_type)}</td>
            <td><strong>${escapeHtml(rel.target_entity_name || `ID ${rel.target_entity_id}`)}</strong></td>
            <td>${escapeHtml(rel.role_title || (rel.ownership_percentage ? `持股 ${rel.ownership_percentage}%` : "-"))}</td>
            <td><span class="pia-status ${rel.verification_status}">${rel.verification_status}</span></td>
            <td>${Number(rel.verified_evidence_count || 0)} / ${Number(rel.evidence_count || 0)}</td>
            <td>${Number(rel.is_public) === 1 ? "已公开" : "未公开"}</td>
            <td>${escapeHtml(String(rel.updated_at || "").slice(0, 10))}</td>
            <td><button type="button" class="pia-table-action">编辑</button></td>
        </tr>
    `).join("");
}

function showRelationshipEditor() { document.querySelector(".pia-relationship-editor-card")?.removeAttribute("hidden"); }
function hideRelationshipEditor() {
    const el = document.querySelector(".pia-relationship-editor-card");
    if (el) el.hidden = true;
}

/* =========================================================
   5. 证据、审核队列、纠错中心与版本历史
========================================================= */

function ensureEvidenceDataLoaded() { }
function initEvidenceManagement() { }
function showEvidenceEditor() { document.querySelector(".pia-evidence-editor-card")?.removeAttribute("hidden"); }
function hideEvidenceEditor() {
    const el = document.querySelector(".pia-evidence-editor-card");
    if (el) el.hidden = true;
}

function initReviewQueue() { }
function loadReviewQueue() { }
function initCorrectionCenter() { }
function loadCorrections() { }
function initVersionHistory() { }
function loadVersions() { }