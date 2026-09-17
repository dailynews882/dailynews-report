/* =========================================================
   People Intelligence Admin Console
   V1.2 Prototype
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

    await loadPeopleFromApi();
});


/* =========================================================
   Sidebar navigation
========================================================= */

function initAdminNavigation() {
    const navItems = document.querySelectorAll(
        "[data-admin-page]"
    );

    const panels = document.querySelectorAll(
        "[data-admin-panel]"
    );

    if (!navItems.length || !panels.length) {
        return;
    }

    navItems.forEach((item) => {
        item.addEventListener("click", () => {
            const target =
                item.dataset.adminPage;

            navItems.forEach((nav) => {
                nav.classList.remove("active");
            });

            panels.forEach((panel) => {
                panel.classList.remove("active");
                panel.hidden = true;
            });

            item.classList.add("active");

            const targetPanel =
                document.querySelector(
                    `[data-admin-panel="${target}"]`
                );

            if (!targetPanel) {
                return;
            }

            targetPanel.hidden = false;
            targetPanel.classList.add("active");

            if (target === "organizations") {
                ensureOrganizationDataLoaded();
            }

            if (target === "relationships") {
                ensureRelationshipDataLoaded();
            }

            if (target === "evidence") {
                ensureEvidenceDataLoaded();
            }

            if (target === "ai-review") {
                loadReviewQueue();
            }

            window.scrollTo({
                top: 0,
                behavior: "smooth"
            });
        });
    });
}


/* =========================================================
   Topbar buttons
========================================================= */

function initTopbarActions() {
    const topbarButtons =
        document.querySelectorAll(
            ".pia-topbar-actions button"
        );

    if (!topbarButtons.length) {
        return;
    }

    topbarButtons.forEach((button) => {
        const text =
            button.textContent.trim();

        if (text === "查看前台") {
            button.addEventListener(
                "click",
                () => {
                    window.open(
                        "/people-intelligence.html",
                        "_blank"
                    );
                }
            );
        }

        if (text.includes("新增人物")) {
            button.addEventListener(
                "click",
                () => {
                    openPrototypeNotice(
                        "新增人物",
                        "这里后续会打开人物编辑表单。当前为 V1 原型，暂未连接数据库。"
                    );
                }
            );
        }
    });
}


/* =========================================================
   Prototype notice
========================================================= */

function openPrototypeNotice(
    title,
    message
) {
    const oldModal =
        document.getElementById(
            "piaPrototypeModal"
        );

    if (oldModal) {
        oldModal.remove();
    }

    const modal =
        document.createElement("div");

    modal.id =
        "piaPrototypeModal";

    modal.className =
        "pia-prototype-modal";

    modal.innerHTML = `
        <div class="pia-prototype-dialog">
            <div class="pia-prototype-header">
                <h3>${escapeHtml(title)}</h3>

                <button
                    type="button"
                    id="piaPrototypeClose"
                    aria-label="关闭"
                >
                    ×
                </button>
            </div>

            <div class="pia-prototype-body">
                <p>
                    ${escapeHtml(message)}
                </p>
            </div>

            <div class="pia-prototype-footer">
                <button
                    type="button"
                    class="pia-primary-btn"
                    id="piaPrototypeConfirm"
                >
                    知道了
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const closeButton =
        document.getElementById(
            "piaPrototypeClose"
        );

    const confirmButton =
        document.getElementById(
            "piaPrototypeConfirm"
        );

    closeButton?.addEventListener(
        "click",
        () => {
            modal.remove();
        }
    );

    confirmButton?.addEventListener(
        "click",
        () => {
            modal.remove();
        }
    );

    modal.addEventListener(
        "click",
        (event) => {
            if (event.target === modal) {
                modal.remove();
            }
        }
    );
}

/* =========================================================
   People Management V1.1
   人物列表 + 编辑器联动
========================================================= */

const peopleManagementDemoData = {
    "donald-trump": {
        id: "donald-trump",
        initials: "DT",
        nameZh: "唐纳德·特朗普",
        nameEn: "Donald Trump",
        aliases: "",
        birthDate: "1946-06-14",
        country: "美国",
        role: "商人 / 政治人物",
        organization: "特朗普集团",
        verificationStatus: "verified",
        confidence: "high",
        updatedAt: "2026-09-10",
        biography:
            "唐纳德·特朗普是美国商人和政治人物。本字段目前仅用于测试人谱后台人物资料编辑流程。",
        tags: "政治, 房地产, 媒体, 家族企业",
        evidenceCount: 12
    },

    "ivanka-trump": {
        id: "ivanka-trump",
        initials: "IT",
        nameZh: "伊万卡·特朗普",
        nameEn: "Ivanka Trump",
        aliases: "",
        birthDate: "1981-10-30",
        country: "美国",
        role: "商业人物",
        organization: "特朗普家族",
        verificationStatus: "verified",
        confidence: "high",
        updatedAt: "2026-09-09",
        biography:
            "伊万卡·特朗普是美国商业人物。本字段目前作为人谱后台人物资料编辑演示数据。",
        tags: "商业, 家族, 房地产",
        evidenceCount: 8
    },

    "jared-kushner": {
        id: "jared-kushner",
        initials: "JK",
        nameZh: "贾里德·库什纳",
        nameEn: "Jared Kushner",
        aliases: "",
        birthDate: "1981-01-10",
        country: "美国",
        role: "商业人物 / 投资人",
        organization: "Kushner Companies",
        verificationStatus: "pending",
        confidence: "medium",
        updatedAt: "2026-09-08",
        biography:
            "贾里德·库什纳是美国商业人物和投资人。本字段目前作为人谱后台人物资料编辑演示数据。",
        tags: "投资, 房地产, 商业",
        evidenceCount: 4
    },

    "fred-trump": {
        id: "fred-trump",
        initials: "FT",
        nameZh: "弗雷德·特朗普",
        nameEn: "Fred Trump",
        aliases: "",
        birthDate: "1905-10-11",
        country: "美国",
        role: "房地产商人",
        organization: "Trump Management",
        verificationStatus: "disputed",
        confidence: "medium",
        updatedAt: "2026-09-06",
        biography:
            "弗雷德·特朗普是美国房地产商人。本字段目前作为人谱后台人物资料编辑演示数据。",
        tags: "房地产, 商业, 特朗普家族",
        evidenceCount: 6
    }
};


function initPersonManagement() {
    initPersonActionButtons();
    initPersonRows();
    initPersonSearch();
    initPersonStatusFilter();
    initPersonFormTracking();
}

function initPersonActionButtons() {
    const actionButtons =
        document.querySelectorAll(
            "[data-person-action]"
        );

    if (!actionButtons.length) {
        return;
    }

    actionButtons.forEach((button) => {
        button.addEventListener(
            "click",
            (event) => {
                event.stopPropagation();

                const action =
                    button.dataset.personAction;

                const personId =
                    button.dataset.personId || null;

                if (action === "frontend") {
                    window.open(
                        "/people-intelligence.html",
                        "_blank"
                    );
                    return;
                }

                if (action === "new") {
                    openNewPersonForm();
                    return;
                }

                if (action === "edit") {
                    if (personId) {
                        openPersonEditor(
                            personId
                        );
                    }

                    return;
                }

                if (action === "cancel") {
                    restoreCurrentPerson();
                    return;
                }

                if (action === "draft") {
                    savePersonDraft();
                    return;
                }

                if (action === "submit") {
                    submitPersonForReview();
                    return;
                }

                if (action === "approve") {
                    approvePerson();
                    return;
                }

                if (action === "publish") {
                    togglePersonPublication();
                    return;
                }

                if (action === "trash") {
                    moveCurrentPersonToTrash();
                    return;
                }

                if (action === "history") {
                    openPrototypeNotice(
                        "版本历史",
                        "后续这里会显示该人物的全部修改记录、修改人、修改原因、证据变化和前后版本差异。"
                    );
                }
            }
        );
    });
}


function initPersonRows() {
    const rows =
        document.querySelectorAll(
            ".pia-person-row"
        );

    if (!rows.length) {
        return;
    }

    rows.forEach((row) => {
        row.addEventListener(
            "click",
            (event) => {
                if (
                    event.target.closest(
                        "[data-person-action]"
                    )
                ) {
                    return;
                }

                const personId =
                    row.dataset.personId;

                if (!personId) {
                    return;
                }

                openPersonEditor(
                    personId
                );
            }
        );
    });
}

function initPersonSearch() {
    const searchInput =
        document.getElementById(
            "piaPersonSearch"
        );

    if (!searchInput) {
        return;
    }

    searchInput.addEventListener(
        "input",
        () => {
            applyPersonFilters();
        }
    );
}


function initPersonStatusFilter() {
    const statusFilter =
        document.getElementById(
            "piaPersonStatusFilter"
        );

    if (!statusFilter) {
        return;
    }

    statusFilter.addEventListener(
        "change",
        () => {
            applyPersonFilters();
        }
    );
}

let currentEditingPersonId = "donald-trump";
let personFormDirty = false;
let personFormSnapshot = null;

/* =========================================================
   People Intelligence API
   SQLite 人物数据 → 后台人物管理
========================================================= */

const PEOPLE_INTELLIGENCE_API =
    "/api/admin/people-intelligence";


function getAdminToken() {
    return localStorage.getItem("adminToken") || "";
}


function mapApiPersonToFrontend(person) {
    return {
        id: String(person.id),

        databaseId:
            person.id,

        slug:
            person.slug || "",

        initials:
            createPersonInitials(
                person.name_en || "",
                person.name_zh || ""
            ),

        nameZh:
            person.name_zh || "",

        nameEn:
            person.name_en || "",

        aliases:
            person.aliases || "",

        birthDate:
            person.birth_date || "",

        deathDate:
            person.death_date || "",

        nationality:
            person.nationality || "",

        country:
            person.country_region || "",

        role:
            person.primary_role || "",

        organization:
            "",

        verificationStatus:
            person.verification_status || "draft",

        confidence:
            person.confidence_level || "medium",

        biography:
            person.biography || "",

        tags:
            person.tags || "",

        profileImageUrl:
            person.profile_image_url || "",

        isPublic:
            Number(person.is_public) === 1,

        updatedAt:
            person.updated_at
                ? String(person.updated_at).slice(0, 10)
                : "",

        evidenceCount:
            0
    };
}


async function loadPeopleFromApi() {
    const token =
        getAdminToken();

    if (!token) {
        console.warn(
            "People Intelligence: adminToken 不存在"
        );

        return;
    }

    try {
        const response =
            await fetch(
                `${PEOPLE_INTELLIGENCE_API}/people`,
                {
                    method: "GET",

                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    }
                }
            );

        const data =
            await response.json();

        if (!response.ok || !data.success) {
            throw new Error(
                data.message ||
                "读取人物数据库失败"
            );
        }

        const people =
            Array.isArray(data.people)
                ? data.people
                : [];

        replacePrototypePeopleWithApiData(
            people
        );

        console.log(
            "People Intelligence API loaded:",
            people.length
        );

    } catch (error) {
        console.error(
            "People Intelligence API load error:",
            error
        );

        openPrototypeNotice(
            "人物数据读取失败",
            "无法从 SQLite 数据库读取人物资料。当前页面暂时保留演示数据。"
        );
    }
}


function replacePrototypePeopleWithApiData(
    apiPeople
) {
    if (!Array.isArray(apiPeople)) {
        return;
    }

    /*
     * 数据库为空时：
     * 清除演示人物，真实反映 SQLite 状态。
     */
    Object.keys(
        peopleManagementDemoData
    ).forEach((key) => {
        delete peopleManagementDemoData[key];
    });

    const tbody =
        document.querySelector(
            ".pia-people-table tbody"
        );

    if (tbody) {
        tbody.innerHTML = "";
    }

    apiPeople.forEach((apiPerson) => {
        const person =
            mapApiPersonToFrontend(
                apiPerson
            );

        peopleManagementDemoData[
            person.id
        ] = person;

        appendPrototypePersonRow(
            person
        );
    });

    currentEditingPersonId = null;

    personFormSnapshot = null;

    personFormDirty = false;

    applyPersonFilters();

    updateVisiblePersonCount();

    if (apiPeople.length > 0) {
        const firstPerson =
            mapApiPersonToFrontend(
                apiPeople[0]
            );

        openPersonEditor(
            firstPerson.id
        );
    } else {
        resetPersonEditorForNewRecord();

        updatePersonEditorStatus(
            "draft"
        );

        updateEvidenceCount(0);
    }
}

function initPersonFormTracking() {
    const form =
        document.getElementById(
            "piaPersonForm"
        );

    if (!form) {
        return;
    }

    const fields =
        form.querySelectorAll(
            "input, select, textarea"
        );

    fields.forEach((field) => {
        field.addEventListener(
            "input",
            () => {
                personFormDirty = true;
            }
        );

        field.addEventListener(
            "change",
            () => {
                personFormDirty = true;
            }
        );
    });
}


function collectPersonFormData() {
    return {
        nameZh:
            document.getElementById(
                "piaPersonNameZh"
            )?.value.trim() || "",

        nameEn:
            document.getElementById(
                "piaPersonNameEn"
            )?.value.trim() || "",

        aliases:
            document.getElementById(
                "piaPersonAliases"
            )?.value.trim() || "",

        birthDate:
            document.getElementById(
                "piaPersonBirthDate"
            )?.value || "",

        country:
            document.getElementById(
                "piaPersonCountry"
            )?.value.trim() || "",

        role:
            document.getElementById(
                "piaPersonRole"
            )?.value.trim() || "",

        organization:
            document.getElementById(
                "piaPersonOrganization"
            )?.value.trim() || "",

        verificationStatus:
            document.getElementById(
                "piaPersonVerificationStatus"
            )?.value || "pending",

        confidence:
            document.getElementById(
                "piaPersonConfidence"
            )?.value || "medium",

        updatedAt:
            document.getElementById(
                "piaPersonUpdatedAt"
            )?.value || "",

        biography:
            document.getElementById(
                "piaPersonBiography"
            )?.value.trim() || "",

        tags:
            document.getElementById(
                "piaPersonTags"
            )?.value.trim() || ""
    };
}


function validatePersonForm(data) {
    if (!data.nameZh) {
        openPrototypeNotice(
            "资料不完整",
            "请先填写中文姓名。"
        );

        return false;
    }

    if (!data.nameEn) {
        openPrototypeNotice(
            "资料不完整",
            "请先填写英文姓名。"
        );

        return false;
    }

    return true;
}


async function savePersonDraft() {
    const data =
        collectPersonFormData();

    if (!validatePersonForm(data)) {
        return;
    }

    data.verificationStatus =
        "draft";

    try {
        const person =
            await savePersonToApi(
                data
            );

        if (!person) {
            return;
        }

        const frontendPerson =
            mapApiPersonToFrontend(
                person
            );

        peopleManagementDemoData[
            frontendPerson.id
        ] = frontendPerson;

        currentEditingPersonId =
            frontendPerson.id;

        loadPersonIntoEditor(
            frontendPerson
        );

        personFormSnapshot =
            capturePersonFormSnapshot();

        personFormDirty = false;

        await loadPeopleFromApi();

        openPrototypeNotice(
            "草稿已保存",
            "人物资料已经永久保存到 SQLite 数据库。刷新浏览器后，该人物仍会保留。"
        );

    } catch (error) {
        console.error(
            "Save person draft error:",
            error
        );

        openPrototypeNotice(
            "保存失败",
            error.message ||
            "人物草稿保存失败。"
        );
    }
}

async function savePersonToApi(data) {
    const token =
        getAdminToken();

    if (!token) {
        throw new Error(
            "管理员登录已失效，请重新登录。"
        );
    }

    const payload = {
        name_zh:
            data.nameZh,

        name_en:
            data.nameEn,

        aliases:
            data.aliases || "",

        birth_date:
            data.birthDate || "",

        death_date:
            data.deathDate || "",

        nationality:
            data.nationality || "",

        country_region:
            data.country || "",

        primary_role:
            data.role || "",

        biography:
            data.biography || "",

        tags:
            data.tags || "",

        verification_status:
            data.verificationStatus ||
            "draft",

        confidence_level:
            data.confidence ||
            "medium",

        is_public:
            Boolean(
                currentEditingPersonId &&
                peopleManagementDemoData[
                    String(currentEditingPersonId)
                ]?.isPublic
            )
    };

    const isExistingPerson =
        currentEditingPersonId &&
        /^\d+$/.test(
            String(
                currentEditingPersonId
            )
        );

    const url =
        isExistingPerson
            ? `${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}`
            : `${PEOPLE_INTELLIGENCE_API}/people`;

    const method =
        isExistingPerson
            ? "PUT"
            : "POST";

    const response =
        await fetch(
            url,
            {
                method,

                headers: {
                    "Content-Type":
                        "application/json",

                    Authorization:
                        `Bearer ${token}`
                },

                body:
                    JSON.stringify(
                        payload
                    )
            }
        );

    const result =
        await response.json();

    if (
        !response.ok ||
        !result.success
    ) {
        throw new Error(
            result.message ||
            "保存人物资料失败"
        );
    }

    return (
        result.person ||
        null
    );
}

async function submitPersonForReview() {
    const data =
        collectPersonFormData();

    if (!validatePersonForm(data)) {
        return;
    }

    if (
        !currentEditingPersonId ||
        !/^\d+$/.test(
            String(currentEditingPersonId)
        )
    ) {
        openPrototypeNotice(
            "无法提交审核",
            "请先保存人物草稿，再提交审核。"
        );

        return;
    }

    const token =
        getAdminToken();

    if (!token) {
        openPrototypeNotice(
            "管理员登录已失效",
            "请重新登录后台后再提交审核。"
        );

        return;
    }

    try {
        const response =
            await fetch(
                `${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}/status`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${token}`
                    },

                    body:
                        JSON.stringify({
                            verification_status:
                                "pending"
                        })
                }
            );

        const result =
            await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "提交审核失败"
            );
        }

        if (result.person) {
            const frontendPerson =
                mapApiPersonToFrontend(
                    result.person
                );

            peopleManagementDemoData[
                frontendPerson.id
            ] = frontendPerson;

            currentEditingPersonId =
                frontendPerson.id;

            loadPersonIntoEditor(
                frontendPerson
            );

            personFormSnapshot =
                capturePersonFormSnapshot();

            personFormDirty = false;
        }

        await loadPeopleFromApi();

        openPrototypeNotice(
            "已提交审核",
            "人物资料已进入待审核状态，并已保存到 SQLite 数据库。"
        );

    } catch (error) {
        console.error(
            "Submit person review error:",
            error
        );

        openPrototypeNotice(
            "提交审核失败",
            error.message ||
            "人物资料提交审核失败。"
        );
    }
}

async function approvePerson() {
    if (
        !currentEditingPersonId ||
        !/^\d+$/.test(
            String(currentEditingPersonId)
        )
    ) {
        openPrototypeNotice(
            "无法审核",
            "请先选择已经保存到数据库的人物。"
        );

        return;
    }

    const token =
        getAdminToken();

    if (!token) {
        openPrototypeNotice(
            "管理员登录已失效",
            "请重新登录后台后再进行审核。"
        );

        return;
    }

    try {
        const response =
            await fetch(
                `${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}/status`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${token}`
                    },

                    body:
                        JSON.stringify({
                            verification_status:
                                "verified"
                        })
                }
            );

        const result =
            await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "审核通过失败"
            );
        }

        if (result.person) {
            const frontendPerson =
                mapApiPersonToFrontend(
                    result.person
                );

            peopleManagementDemoData[
                frontendPerson.id
            ] = frontendPerson;

            currentEditingPersonId =
                frontendPerson.id;

            loadPersonIntoEditor(
                frontendPerson
            );

            personFormSnapshot =
                capturePersonFormSnapshot();

            personFormDirty = false;
        }

        await loadPeopleFromApi();

        openPrototypeNotice(
            "审核通过",
            "人物资料已经审核通过，当前状态已更新为“已核验”。"
        );

    } catch (error) {
        console.error(
            "Approve person error:",
            error
        );

        openPrototypeNotice(
            "审核失败",
            error.message ||
            "人物资料审核失败。"
        );
    }
}

async function togglePersonPublication() {
    if (
        !currentEditingPersonId ||
        !/^\d+$/.test(
            String(currentEditingPersonId)
        )
    ) {
        openPrototypeNotice(
            "无法操作发布状态",
            "请先选择已经保存到数据库的人物。"
        );

        return;
    }

    const person =
        peopleManagementDemoData[
        String(currentEditingPersonId)
        ];

    if (!person) {
        openPrototypeNotice(
            "人物数据不存在",
            "当前人物资料尚未正确加载，请刷新页面后重试。"
        );

        return;
    }

    const shouldPublish =
        !person.isPublic;

    if (
        shouldPublish &&
        person.verificationStatus !==
        "verified"
    ) {
        openPrototypeNotice(
            "暂时不能发布",
            "只有已经审核通过的人物资料才能发布。"
        );

        return;
    }

    const token =
        getAdminToken();

    if (!token) {
        openPrototypeNotice(
            "管理员登录已失效",
            "请重新登录后台后再进行发布操作。"
        );

        return;
    }

    try {
        const response =
            await fetch(
                `${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}/publication`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${token}`
                    },

                    body:
                        JSON.stringify({
                            is_public:
                                shouldPublish
                        })
                }
            );

        const result =
            await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "发布状态更新失败"
            );
        }

        if (result.person) {
            const frontendPerson =
                mapApiPersonToFrontend(
                    result.person
                );

            peopleManagementDemoData[
                frontendPerson.id
            ] = frontendPerson;

            currentEditingPersonId =
                frontendPerson.id;

            loadPersonIntoEditor(
                frontendPerson
            );
        }

        await loadPeopleFromApi();

        openPrototypeNotice(
            shouldPublish
                ? "人物已发布"
                : "已取消发布",

            shouldPublish
                ? "人物资料已经发布。后续接入正式前台公开人物接口后，该人物可以在前台显示。"
                : "人物资料已经取消发布，目前不会作为公开人物资料显示。"
        );

    } catch (error) {
        console.error(
            "Toggle person publication error:",
            error
        );

        openPrototypeNotice(
            shouldPublish
                ? "发布失败"
                : "取消发布失败",

            error.message ||
            "人物发布状态更新失败。"
        );
    }
}

async function moveCurrentPersonToTrash() {
    if (
        !currentEditingPersonId ||
        !/^\d+$/.test(
            String(currentEditingPersonId)
        )
    ) {
        openPrototypeNotice(
            "无法移入垃圾箱",
            "请先选择已经保存到数据库的人物。"
        );

        return;
    }

    const person =
        peopleManagementDemoData[
        String(currentEditingPersonId)
        ];

    if (!person) {
        openPrototypeNotice(
            "人物数据不存在",
            "当前人物资料尚未正确加载，请刷新页面后重试。"
        );

        return;
    }

    const displayName =
        person.nameZh ||
        person.nameEn ||
        `ID ${currentEditingPersonId}`;

    const confirmed =
        window.confirm(
            `确定要将“${displayName}”移入垃圾箱吗？\n\n` +
            `移入垃圾箱后：\n` +
            `1. 将从正常人物列表隐藏；\n` +
            `2. 如果当前已经发布，将自动取消发布；\n` +
            `3. 数据不会永久删除，后续可以从垃圾箱恢复。`
        );

    if (!confirmed) {
        return;
    }

    const token =
        getAdminToken();

    if (!token) {
        openPrototypeNotice(
            "管理员登录已失效",
            "请重新登录后台后再进行操作。"
        );

        return;
    }

    try {
        const response =
            await fetch(
                `${PEOPLE_INTELLIGENCE_API}/people/${currentEditingPersonId}/record-status`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type":
                            "application/json",

                        Authorization:
                            `Bearer ${token}`
                    },

                    body:
                        JSON.stringify({
                            record_status:
                                "trashed"
                        })
                }
            );

        const result =
            await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "移入垃圾箱失败"
            );
        }

        const removedPersonName =
            displayName;

        currentEditingPersonId =
            null;

        personFormDirty =
            false;

        await loadPeopleFromApi();

        resetPersonEditorForNewRecord();

        openPrototypeNotice(
            "已移入垃圾箱",
            `“${removedPersonName}”已经移入垃圾箱。数据库记录仍然保留，并且后续可以恢复。`
        );

    } catch (error) {
        console.error(
            "Move person to trash error:",
            error
        );

        openPrototypeNotice(
            "操作失败",
            error.message ||
            "人物资料移入垃圾箱失败。"
        );
    }
}

function updatePersonPublicationButton(
    person
) {
    const button =
        document.getElementById(
            "personPublishButton"
        );

    if (!button) {
        return;
    }

    if (!person) {
        button.textContent =
            "发布";

        button.disabled =
            true;

        return;
    }

    if (person.isPublic) {
        button.textContent =
            "取消发布";

        button.disabled =
            false;

        return;
    }

    button.textContent =
        "发布";

    button.disabled =
        person.verificationStatus !==
        "verified";
}

function savePersonToPrototypeData(data) {
    let personId =
        currentEditingPersonId;

    const isNewPerson =
        !personId;

    if (isNewPerson) {
        personId =
            createPrototypePersonId(
                data.nameEn ||
                data.nameZh
            );
    }

    const existingPerson =
        peopleManagementDemoData[
        personId
        ] || {};

    const person = {
        ...existingPerson,

        id:
            personId,

        initials:
            existingPerson.initials ||
            createPersonInitials(
                data.nameEn,
                data.nameZh
            ),

        nameZh:
            data.nameZh,

        nameEn:
            data.nameEn,

        aliases:
            data.aliases,

        birthDate:
            data.birthDate,

        country:
            data.country,

        role:
            data.role,

        organization:
            data.organization,

        verificationStatus:
            data.verificationStatus,

        confidence:
            data.confidence,

        updatedAt:
            data.updatedAt ||
            getPrototypeToday(),

        biography:
            data.biography,

        tags:
            data.tags,

        evidenceCount:
            existingPerson.evidenceCount ||
            0
    };

    peopleManagementDemoData[
        personId
    ] = person;

    currentEditingPersonId =
        personId;

    if (isNewPerson) {
        appendPrototypePersonRow(
            person
        );
    }

    loadPersonIntoEditor(
        person
    );

    setActivePersonRow(
        personId
    );

    return person;
}


function createPrototypePersonId(name) {
    const base =
        String(name || "person")
            .trim()
            .toLowerCase()
            .replace(
                /[^a-z0-9\u4e00-\u9fa5]+/g,
                "-"
            )
            .replace(
                /^-+|-+$/g,
                ""
            ) || "person";

    return (
        base +
        "-" +
        Date.now()
    );
}


function createPersonInitials(
    englishName,
    chineseName
) {
    const english =
        String(
            englishName || ""
        ).trim();

    if (english) {
        const parts =
            english
                .split(/\s+/)
                .filter(Boolean);

        if (parts.length >= 2) {
            return (
                parts[0][0] +
                parts[
                parts.length - 1
                ][0]
            ).toUpperCase();
        }

        return english
            .slice(0, 2)
            .toUpperCase();
    }

    return String(
        chineseName || "新人物"
    ).slice(0, 2);
}

function getPrototypeToday() {
    const now =
        new Date();

    const year =
        now.getFullYear();

    const month =
        String(
            now.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            now.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function appendPrototypePersonRow(
    person
) {
    const tbody =
        document.querySelector(
            ".pia-people-table tbody"
        );

    if (!tbody) {
        return;
    }

    const row =
        document.createElement("tr");

    row.className =
        "pia-person-row";

    row.dataset.personId =
        person.id;

    row.dataset.personStatus =
        person.verificationStatus;

    row.innerHTML = `
        <td>
            <div class="pia-person-cell">

                <div class="pia-person-avatar">
                    ${escapeHtml(
        person.initials
    )}
                </div>

                <div>
                    <strong>
                        ${escapeHtml(
        person.nameZh
    )}
                    </strong>

                    <span>
                        ${escapeHtml(
        person.nameEn
    )}
                    </span>
                </div>

            </div>
        </td>

        <td>
            ${escapeHtml(
        person.role || "-"
    )}
        </td>

        <td>
            ${escapeHtml(
        person.country || "-"
    )}
        </td>

        <td>
    ${buildPersonStatusBadge(
        person.verificationStatus
    )}
</td>

<td>
    ${buildPersonPublicationBadge(
        person.isPublic
    )}
</td>

        <td>
            ${person.evidenceCount || 0}
        </td>

        <td>
            ${escapeHtml(
        person.updatedAt || "-"
    )}
        </td>

        <td>
            <button
                type="button"
                class="pia-table-action"
                data-person-action="edit"
                data-person-id="${escapeHtml(
        person.id
    )}"
            >
                编辑
            </button>
        </td>
    `;

    tbody.appendChild(row);

    bindPrototypePersonRow(
        row
    );

    updateVisiblePersonCount();
}


function bindPrototypePersonRow(row) {
    const editButton =
        row.querySelector(
            '[data-person-action="edit"]'
        );

    editButton?.addEventListener(
        "click",
        (event) => {
            event.stopPropagation();

            const personId =
                editButton.dataset.personId;

            openPersonEditor(
                personId
            );
        }
    );

    row.addEventListener(
        "click",
        () => {
            const personId =
                row.dataset.personId;

            openPersonEditor(
                personId
            );
        }
    );
}

function refreshPersonListRow(
    person
) {
    const row =
        document.querySelector(
            `.pia-person-row[data-person-id="${person.id}"]`
        );

    if (!row) {
        return;
    }

    row.dataset.personStatus =
        person.verificationStatus;

    const cells =
        row.querySelectorAll("td");

    if (cells.length < 8) {
        return;
    }

    const avatar =
        cells[0].querySelector(
            ".pia-person-avatar"
        );

    const nameZh =
        cells[0].querySelector(
            "strong"
        );

    const nameEn =
        cells[0].querySelector(
            "span"
        );

    if (avatar) {
        avatar.textContent =
            person.initials;
    }

    if (nameZh) {
        nameZh.textContent =
            person.nameZh;
    }

    if (nameEn) {
        nameEn.textContent =
            person.nameEn;
    }

    cells[1].textContent =
        person.role || "-";

    cells[2].textContent =
        person.country || "-";

    cells[3].innerHTML =
        buildPersonStatusBadge(
            person.verificationStatus
        );

    cells[4].innerHTML =
        buildPersonPublicationBadge(
            person.isPublic
        );

    cells[5].textContent =
        person.evidenceCount || 0;

    cells[6].textContent =
        person.updatedAt || "-";
}


function buildPersonStatusBadge(
    status
) {
    if (status === "verified") {
        return `
            <span class="pia-status verified">
                已核验
            </span>
        `;
    }

    if (status === "draft") {
        return `
            <span class="pia-status draft">
                草稿
            </span>
        `;
    }

    if (status === "pending") {
        return `
            <span class="pia-status pending">
                待审核
            </span>
        `;
    }

    if (status === "disputed") {
        return `
            <span class="pia-status review">
                存在争议
            </span>
        `;
    }

    return `
        <span class="pia-status">
            未确认
        </span>
    `;
}

function buildPersonPublicationBadge(
    isPublic
) {
    if (isPublic) {
        return `
            <span class="pia-publication-status published">
                已发布
            </span>
        `;
    }

    return `
        <span class="pia-publication-status unpublished">
            未发布
        </span>
    `;
}

function restoreCurrentPerson() {
    if (!personFormSnapshot) {
        if (
            currentEditingPersonId &&
            peopleManagementDemoData[
            currentEditingPersonId
            ]
        ) {
            loadPersonIntoEditor(
                peopleManagementDemoData[
                currentEditingPersonId
                ]
            );

            personFormDirty = false;
        }

        return;
    }

    restorePersonFormSnapshot(
        personFormSnapshot
    );

    personFormDirty = false;
}

function capturePersonFormSnapshot() {
    return {
        nameZh:
            document.getElementById(
                "piaPersonNameZh"
            )?.value || "",

        nameEn:
            document.getElementById(
                "piaPersonNameEn"
            )?.value || "",

        aliases:
            document.getElementById(
                "piaPersonAliases"
            )?.value || "",

        birthDate:
            document.getElementById(
                "piaPersonBirthDate"
            )?.value || "",

        country:
            document.getElementById(
                "piaPersonCountry"
            )?.value || "",

        role:
            document.getElementById(
                "piaPersonRole"
            )?.value || "",

        organization:
            document.getElementById(
                "piaPersonOrganization"
            )?.value || "",

        verificationStatus:
            document.getElementById(
                "piaPersonVerificationStatus"
            )?.value || "pending",

        confidence:
            document.getElementById(
                "piaPersonConfidence"
            )?.value || "medium",

        updatedAt:
            document.getElementById(
                "piaPersonUpdatedAt"
            )?.value || "",

        biography:
            document.getElementById(
                "piaPersonBiography"
            )?.value || "",

        tags:
            document.getElementById(
                "piaPersonTags"
            )?.value || ""
    };
}


function restorePersonFormSnapshot(snapshot) {
    if (!snapshot) {
        return;
    }

    const fieldMap = {
        piaPersonNameZh:
            snapshot.nameZh,

        piaPersonNameEn:
            snapshot.nameEn,

        piaPersonAliases:
            snapshot.aliases,

        piaPersonBirthDate:
            snapshot.birthDate,

        piaPersonCountry:
            snapshot.country,

        piaPersonRole:
            snapshot.role,

        piaPersonOrganization:
            snapshot.organization,

        piaPersonVerificationStatus:
            snapshot.verificationStatus,

        piaPersonConfidence:
            snapshot.confidence,

        piaPersonUpdatedAt:
            snapshot.updatedAt,

        piaPersonBiography:
            snapshot.biography,

        piaPersonTags:
            snapshot.tags
    };

    Object.entries(
        fieldMap
    ).forEach(
        ([fieldId, value]) => {
            const field =
                document.getElementById(
                    fieldId
                );

            if (field) {
                field.value =
                    value ?? "";
            }
        }
    );

    const displayName =
        document.getElementById(
            "piaEditorDisplayName"
        );

    const displayEnglishName =
        document.getElementById(
            "piaEditorDisplayEnglishName"
        );

    if (displayName) {
        displayName.textContent =
            snapshot.nameZh ||
            "新人物";
    }

    if (displayEnglishName) {
        displayEnglishName.textContent =
            snapshot.nameEn ||
            "New Person";
    }

    updatePersonEditorStatus(
        snapshot.verificationStatus
    );
}

function applyPersonFilters() {
    const searchInput =
        document.getElementById(
            "piaPersonSearch"
        );

    const statusFilter =
        document.getElementById(
            "piaPersonStatusFilter"
        );

    const rows =
        document.querySelectorAll(
            ".pia-person-row"
        );

    const keyword =
        searchInput
            ? searchInput.value
                .trim()
                .toLowerCase()
            : "";

    const status =
        statusFilter
            ? statusFilter.value
            : "all";

    rows.forEach((row) => {
        const personId =
            row.dataset.personId || "";

        const person =
            peopleManagementDemoData[
            personId
            ];

        if (!person) {
            row.style.display = "none";
            return;
        }

        const searchableText = [
            person.id,
            person.nameZh,
            person.nameEn,
            person.role,
            person.country,
            person.organization
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        const matchesKeyword =
            !keyword ||
            searchableText.includes(
                keyword
            );

        const matchesStatus =
            status === "all" ||
            person.verificationStatus ===
            status;

        row.style.display =
            matchesKeyword &&
                matchesStatus
                ? ""
                : "none";
    });

    updateVisiblePersonCount();
}

function updateVisiblePersonCount() {
    const rows =
        Array.from(
            document.querySelectorAll(
                ".pia-person-row"
            )
        );

    const visibleCount =
        rows.filter((row) => {
            return (
                row.style.display !==
                "none"
            );
        }).length;

    const counter =
        document.querySelector(
            ".pia-record-count"
        );

    if (counter) {
        counter.textContent =
            `当前显示 ${visibleCount} 条演示数据`;
    }
}

function openPersonEditor(personId) {
    const person =
        peopleManagementDemoData[
        personId
        ];

    if (!person) {
        openPrototypeNotice(
            "人物资料",
            "没有找到对应的人物演示数据。"
        );

        return;
    }

    activatePeopleManagementPage();

    setActivePersonRow(personId);

    loadPersonIntoEditor(person);

    currentEditingPersonId =
        personId;

    personFormSnapshot =
        capturePersonFormSnapshot();

    personFormDirty = false;
}


function activatePeopleManagementPage() {
    const peopleNav =
        document.querySelector(
            '[data-admin-page="people"]'
        );

    const peoplePanel =
        document.querySelector(
            '[data-admin-panel="people"]'
        );

    const navItems =
        document.querySelectorAll(
            "[data-admin-page]"
        );

    const panels =
        document.querySelectorAll(
            "[data-admin-panel]"
        );

    navItems.forEach((item) => {
        item.classList.remove("active");
    });

    panels.forEach((panel) => {
        panel.classList.remove("active");
        panel.hidden = true;
    });

    if (peopleNav) {
        peopleNav.classList.add("active");
    }

    if (peoplePanel) {
        peoplePanel.hidden = false;
        peoplePanel.classList.add("active");
    }
}


function setActivePersonRow(personId) {
    const rows =
        document.querySelectorAll(
            ".pia-person-row"
        );

    rows.forEach((row) => {
        row.classList.toggle(
            "active",
            row.dataset.personId ===
            personId
        );
    });
}


function loadPersonIntoEditor(person) {
    const editorTitle =
        document.getElementById(
            "piaPersonEditorTitle"
        );

    const displayName =
        document.getElementById(
            "piaEditorDisplayName"
        );

    const displayEnglishName =
        document.getElementById(
            "piaEditorDisplayEnglishName"
        );

    const editorAvatar =
        document.querySelector(
            ".pia-person-editor-avatar"
        );

    const nameZh =
        document.getElementById(
            "piaPersonNameZh"
        );

    const nameEn =
        document.getElementById(
            "piaPersonNameEn"
        );

    const aliases =
        document.getElementById(
            "piaPersonAliases"
        );

    const birthDate =
        document.getElementById(
            "piaPersonBirthDate"
        );

    const country =
        document.getElementById(
            "piaPersonCountry"
        );

    const role =
        document.getElementById(
            "piaPersonRole"
        );

    const organization =
        document.getElementById(
            "piaPersonOrganization"
        );

    const verificationStatus =
        document.getElementById(
            "piaPersonVerificationStatus"
        );

    const confidence =
        document.getElementById(
            "piaPersonConfidence"
        );

    const updatedAt =
        document.getElementById(
            "piaPersonUpdatedAt"
        );

    const biography =
        document.getElementById(
            "piaPersonBiography"
        );

    const tags =
        document.getElementById(
            "piaPersonTags"
        );

    if (editorTitle) {
        editorTitle.textContent =
            "编辑人物资料";
    }

    if (displayName) {
        displayName.textContent =
            person.nameZh;
    }

    if (displayEnglishName) {
        displayEnglishName.textContent =
            person.nameEn;
    }

    if (editorAvatar) {
        editorAvatar.textContent =
            person.initials;
    }

    if (nameZh) {
        nameZh.value =
            person.nameZh;
    }

    if (nameEn) {
        nameEn.value =
            person.nameEn;
    }

    if (aliases) {
        aliases.value =
            person.aliases || "";
    }

    if (birthDate) {
        birthDate.value =
            person.birthDate || "";
    }

    if (country) {
        country.value =
            person.country || "";
    }

    if (role) {
        role.value =
            person.role || "";
    }

    if (organization) {
        organization.value =
            person.organization || "";
    }

    if (verificationStatus) {
        verificationStatus.value =
            person.verificationStatus ||
            "pending";
    }

    if (confidence) {
        confidence.value =
            person.confidence ||
            "medium";
    }

    if (updatedAt) {
        updatedAt.value =
            person.updatedAt || "";
    }

    if (biography) {
        biography.value =
            person.biography || "";
    }

    if (tags) {
        tags.value =
            person.tags || "";
    }

    updatePersonEditorStatus(
        person.verificationStatus
    );

    updateEvidenceCount(
        person.evidenceCount
    );

    updatePersonPublicationButton(
        person
    );

    const trashButton =
        document.getElementById(
            "personTrashButton"
        );

    if (trashButton) {
        trashButton.disabled =
            false;
    }
}


function updatePersonEditorStatus(status) {
    const editor =
        document.querySelector(
            ".pia-person-editor"
        );

    if (!editor) {
        return;
    }

    const statusBadge =
        editor.querySelector(
            ".pia-card-heading .pia-status"
        );

    if (!statusBadge) {
        return;
    }

    statusBadge.className =
        "pia-status";

    if (status === "draft") {
        statusBadge.classList.add(
            "draft"
        );

        statusBadge.textContent =
            "草稿";

        return;
    }

    if (status === "verified") {
        statusBadge.classList.add(
            "verified"
        );

        statusBadge.textContent =
            "已核验";

        return;
    }

    if (status === "pending") {
        statusBadge.classList.add(
            "pending"
        );

        statusBadge.textContent =
            "待审核";

        return;
    }

    if (status === "disputed") {
        statusBadge.classList.add(
            "review"
        );

        statusBadge.textContent =
            "存在争议";

        return;
    }

    statusBadge.textContent =
        "未确认";
}


function updateEvidenceCount(count) {
    const editorSections =
        document.querySelectorAll(
            ".pia-editor-section"
        );

    if (!editorSections.length) {
        return;
    }

    const evidenceSection =
        editorSections[0];

    const description =
        evidenceSection.querySelector(
            ".pia-editor-section-title span"
        );

    if (description) {
        description.textContent =
            `当前人物资料关联 ${count || 0} 条证据`;
    }
}


function openNewPersonForm() {
    activatePeopleManagementPage();

    currentEditingPersonId = null;
    personFormDirty = false;

    setActivePersonRow(null);

    resetPersonEditorForNewRecord();

    updatePersonEditorStatus(
        "pending"
    );

    updateEvidenceCount(0);

    personFormSnapshot =
        capturePersonFormSnapshot();

    window.scrollTo({
        top: 0,
        behavior: "smooth"
    });
}

function resetPersonEditorForNewRecord() {
    const editorTitle =
        document.getElementById(
            "piaPersonEditorTitle"
        );

    const displayName =
        document.getElementById(
            "piaEditorDisplayName"
        );

    const displayEnglishName =
        document.getElementById(
            "piaEditorDisplayEnglishName"
        );

    const editorAvatar =
        document.querySelector(
            ".pia-person-editor-avatar"
        );

    const nameZh =
        document.getElementById(
            "piaPersonNameZh"
        );

    const nameEn =
        document.getElementById(
            "piaPersonNameEn"
        );

    const aliases =
        document.getElementById(
            "piaPersonAliases"
        );

    const birthDate =
        document.getElementById(
            "piaPersonBirthDate"
        );

    const country =
        document.getElementById(
            "piaPersonCountry"
        );

    const role =
        document.getElementById(
            "piaPersonRole"
        );

    const organization =
        document.getElementById(
            "piaPersonOrganization"
        );

    const verificationStatus =
        document.getElementById(
            "piaPersonVerificationStatus"
        );

    const confidence =
        document.getElementById(
            "piaPersonConfidence"
        );

    const updatedAt =
        document.getElementById(
            "piaPersonUpdatedAt"
        );

    const biography =
        document.getElementById(
            "piaPersonBiography"
        );

    const tags =
        document.getElementById(
            "piaPersonTags"
        );

    if (editorTitle) {
        editorTitle.textContent =
            "新增人物资料";
    }

    if (displayName) {
        displayName.textContent =
            "新人物";
    }

    if (displayEnglishName) {
        displayEnglishName.textContent =
            "New Person";
    }

    if (editorAvatar) {
        editorAvatar.textContent =
            "NP";
    }

    if (nameZh) {
        nameZh.value = "";
        nameZh.placeholder =
            "请输入中文姓名";
    }

    if (nameEn) {
        nameEn.value = "";
        nameEn.placeholder =
            "请输入英文姓名";
    }

    if (aliases) {
        aliases.value = "";
    }

    if (birthDate) {
        birthDate.value = "";
    }

    if (country) {
        country.value = "";
    }

    if (role) {
        role.value = "";
    }

    if (organization) {
        organization.value = "";
    }

    if (verificationStatus) {
        verificationStatus.value =
            "pending";
    }

    if (confidence) {
        confidence.value =
            "medium";
    }

    if (updatedAt) {
        updatedAt.value = "";
    }

    if (biography) {
        biography.value = "";
        biography.placeholder =
            "请输入人物简介";
    }

    if (tags) {
        tags.value = "";
        tags.placeholder =
            "例如：政治, 科技, 投资";
    }

    const editor =
        document.querySelector(
            ".pia-person-editor"
        );

    if (editor) {
        editor.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    updatePersonPublicationButton(
        null
    );

    const trashButton =
        document.getElementById(
            "personTrashButton"
        );

    if (trashButton) {
        trashButton.disabled =
            true;
    }
}




/* =========================================================
   Organization Management V1
   机构 / 企业 / 基金 / 信托 / Family Office
========================================================= */

let organizationsCache = [];
let organizationDataLoaded = false;
let organizationDataLoading = false;
let currentEditingOrganizationId = null;

function initOrganizationManagement() {
    document.getElementById("piaNewOrganizationButton")
        ?.addEventListener("click", resetOrganizationForm);

    document.getElementById("piaOrganizationResetButton")
        ?.addEventListener("click", resetOrganizationForm);

    document.getElementById("piaOrganizationSearch")
        ?.addEventListener("input", renderOrganizationTable);

    document.getElementById("piaOrganizationTypeFilter")
        ?.addEventListener("change", renderOrganizationTable);

    document.getElementById("piaOrganizationStatusFilter")
        ?.addEventListener("change", renderOrganizationTable);

    document.querySelectorAll(
        "[data-organization-action]"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            async () => {
                const action =
                    button.dataset.organizationAction;

                if (action === "draft") {
                    await saveOrganizationWithStatus("draft");
                    return;
                }

                if (action === "submit") {
                    await saveOrganizationWithStatus("pending");
                    return;
                }

                if (action === "approve") {
                    await approveOrganization();
                    return;
                }

                if (action === "publish") {
                    await toggleOrganizationPublication();
                    return;
                }

                if (action === "trash") {
                    await trashOrganization();
                }
            }
        );
    });
}

async function ensureOrganizationDataLoaded(force = false) {
    if (
        !force &&
        (organizationDataLoaded || organizationDataLoading)
    ) {
        return;
    }

    organizationDataLoading = true;

    try {
        await loadOrganizations();

        organizationDataLoaded = true;
        renderOrganizationTable();

        if (
            organizationsCache.length > 0 &&
            !currentEditingOrganizationId
        ) {
            loadOrganizationIntoForm(
                organizationsCache[0]
            );
        } else if (
            organizationsCache.length === 0
        ) {
            resetOrganizationForm();
        }
    } catch (error) {
        console.error(
            "Organization management load error:",
            error
        );

        openPrototypeNotice(
            "机构数据读取失败",
            error.message ||
            "无法从 SQLite 数据库读取机构资料。"
        );
    } finally {
        organizationDataLoading = false;
    }
}

async function organizationApiFetch(
    path,
    options = {}
) {
    const token = getAdminToken();

    if (!token) {
        throw new Error(
            "管理员登录状态已失效，请重新登录后台。"
        );
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
    };

    if (
        options.body &&
        !headers["Content-Type"]
    ) {
        headers["Content-Type"] =
            "application/json";
    }

    const response =
        await fetch(
            `${PEOPLE_INTELLIGENCE_API}${path}`,
            {
                ...options,
                headers
            }
        );

    let data = {};

    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (
        !response.ok ||
        data.success === false
    ) {
        throw new Error(
            data.message ||
            `机构 API 请求失败 (${response.status})`
        );
    }

    return data;
}

async function loadOrganizations() {
    const data =
        await organizationApiFetch(
            "/organizations"
        );

    organizationsCache =
        Array.isArray(data.organizations)
            ? data.organizations
            : [];
}

function collectOrganizationFormData() {
    return {
        name_zh:
            document.getElementById(
                "piaOrganizationNameZh"
            )?.value.trim() || "",

        name_en:
            document.getElementById(
                "piaOrganizationNameEn"
            )?.value.trim() || "",

        aliases:
            document.getElementById(
                "piaOrganizationAliases"
            )?.value.trim() || "",

        organization_type:
            document.getElementById(
                "piaOrganizationType"
            )?.value || "company",

        country_region:
            document.getElementById(
                "piaOrganizationCountry"
            )?.value.trim() || "",

        headquarters:
            document.getElementById(
                "piaOrganizationHeadquarters"
            )?.value.trim() || "",

        founded_date:
            document.getElementById(
                "piaOrganizationFoundedDate"
            )?.value || "",

        industry:
            document.getElementById(
                "piaOrganizationIndustry"
            )?.value.trim() || "",

        industry_primary:
            document.getElementById(
                "piaOrganizationIndustryPrimary"
            )?.value.trim() || "",

        industry_secondary:
            document.getElementById(
                "piaOrganizationIndustrySecondary"
            )?.value.trim() || "",

        description:
            document.getElementById(
                "piaOrganizationDescription"
            )?.value.trim() || "",

        website_url:
            document.getElementById(
                "piaOrganizationWebsite"
            )?.value.trim() || "",

        logo_url:
            document.getElementById(
                "piaOrganizationLogo"
            )?.value.trim() || "",

        listed_status:
            document.getElementById(
                "piaOrganizationListedStatus"
            )?.value || "",

        ticker_symbol:
            document.getElementById(
                "piaOrganizationTicker"
            )?.value.trim().toUpperCase() || "",

        exchange_name:
            document.getElementById(
                "piaOrganizationExchange"
            )?.value.trim() || "",

        isin:
            document.getElementById(
                "piaOrganizationIsin"
            )?.value.trim().toUpperCase() || "",

        lei:
            document.getElementById(
                "piaOrganizationLei"
            )?.value.trim().toUpperCase() || "",

        verification_status:
            document.getElementById(
                "piaOrganizationVerification"
            )?.value || "draft",

        confidence_level:
            document.getElementById(
                "piaOrganizationConfidence"
            )?.value || "medium",

        data_updated_at:
            document.getElementById(
                "piaOrganizationDataUpdatedAt"
            )?.value || ""
    };
}

function validateOrganizationForm(data) {
    if (!data.name_en) {
        openPrototypeNotice(
            "机构资料不完整",
            "请填写机构英文名称。"
        );

        return false;
    }

    return true;
}

async function saveOrganizationWithStatus(status) {
    const data =
        collectOrganizationFormData();

    data.verification_status = status;

    if (!validateOrganizationForm(data)) {
        return null;
    }

    try {
        let result;

        if (currentEditingOrganizationId) {
            result =
                await organizationApiFetch(
                    `/organizations/${currentEditingOrganizationId}`,
                    {
                        method: "PUT",
                        body: JSON.stringify(data)
                    }
                );
        } else {
            result =
                await organizationApiFetch(
                    "/organizations",
                    {
                        method: "POST",
                        body: JSON.stringify(data)
                    }
                );
        }

        const organization =
            result.organization || null;

        if (organization) {
            currentEditingOrganizationId =
                organization.id;

            loadOrganizationIntoForm(
                organization
            );
        }

        await loadOrganizations();
        renderOrganizationTable();

        openPrototypeNotice(
            status === "pending"
                ? "已提交审核"
                : "草稿已保存",
            status === "pending"
                ? "机构资料已经保存，并进入待审核状态。"
                : "机构资料已经永久保存到 SQLite 数据库。"
        );

        return organization;
    } catch (error) {
        console.error(
            "Save organization error:",
            error
        );

        openPrototypeNotice(
            "机构保存失败",
            error.message ||
            "无法保存机构资料。"
        );

        return null;
    }
}

async function approveOrganization() {
    if (!currentEditingOrganizationId) {
        const created =
            await saveOrganizationWithStatus(
                "pending"
            );

        if (!created) {
            return;
        }
    }

    try {
        const result =
            await organizationApiFetch(
                `/organizations/${currentEditingOrganizationId}/status`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        verification_status:
                            "verified"
                    })
                }
            );

        if (result.organization) {
            loadOrganizationIntoForm(
                result.organization
            );
        }

        await loadOrganizations();
        renderOrganizationTable();

        openPrototypeNotice(
            "审核通过",
            "机构资料已标记为已核验，现在可以发布。"
        );
    } catch (error) {
        openPrototypeNotice(
            "审核失败",
            error.message ||
            "机构审核状态更新失败。"
        );
    }
}

async function toggleOrganizationPublication() {
    if (!currentEditingOrganizationId) {
        openPrototypeNotice(
            "尚未保存",
            "请先保存并审核机构资料。"
        );
        return;
    }

    const organization =
        organizationsCache.find(
            (item) =>
                Number(item.id) ===
                Number(currentEditingOrganizationId)
        );

    const nextPublic =
        !(Number(organization?.is_public) === 1);

    try {
        const result =
            await organizationApiFetch(
                `/organizations/${currentEditingOrganizationId}/publication`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        is_public: nextPublic
                    })
                }
            );

        if (result.organization) {
            loadOrganizationIntoForm(
                result.organization
            );
        }

        await loadOrganizations();
        renderOrganizationTable();

        openPrototypeNotice(
            nextPublic
                ? "机构已发布"
                : "机构已取消发布",
            nextPublic
                ? "该机构现在可以供前台公开数据使用。"
                : "该机构已从公开状态撤回。"
        );
    } catch (error) {
        openPrototypeNotice(
            "发布状态更新失败",
            error.message ||
            "无法修改机构发布状态。"
        );
    }
}

async function trashOrganization() {
    if (!currentEditingOrganizationId) {
        return;
    }

    if (
        !window.confirm(
            "确定将当前机构移入垃圾箱吗？"
        )
    ) {
        return;
    }

    try {
        await organizationApiFetch(
            `/organizations/${currentEditingOrganizationId}/record-status`,
            {
                method: "PATCH",
                body: JSON.stringify({
                    record_status: "trashed"
                })
            }
        );

        currentEditingOrganizationId = null;

        await loadOrganizations();
        renderOrganizationTable();
        resetOrganizationForm();

        openPrototypeNotice(
            "机构已移入垃圾箱",
            "该机构已取消公开，并从当前机构列表隐藏。"
        );
    } catch (error) {
        openPrototypeNotice(
            "操作失败",
            error.message ||
            "无法移动机构记录。"
        );
    }
}

function loadOrganizationIntoForm(
    organization
) {
    currentEditingOrganizationId =
        organization.id;

    const setValue = (id, value) => {
        const element =
            document.getElementById(id);

        if (element) {
            element.value =
                value == null ? "" : value;
        }
    };

    setValue(
        "piaOrganizationId",
        organization.id
    );
    setValue(
        "piaOrganizationNameZh",
        organization.name_zh
    );
    setValue(
        "piaOrganizationNameEn",
        organization.name_en
    );
    setValue(
        "piaOrganizationAliases",
        organization.aliases
    );
    setValue(
        "piaOrganizationType",
        organization.organization_type ||
        "company"
    );
    setValue(
        "piaOrganizationCountry",
        organization.country_region
    );
    setValue(
        "piaOrganizationHeadquarters",
        organization.headquarters
    );
    setValue(
        "piaOrganizationFoundedDate",
        organization.founded_date
    );
    setValue(
        "piaOrganizationIndustry",
        organization.industry
    );
    setValue(
        "piaOrganizationIndustryPrimary",
        organization.industry_primary
    );
    setValue(
        "piaOrganizationIndustrySecondary",
        organization.industry_secondary
    );
    setValue(
        "piaOrganizationDescription",
        organization.description
    );
    setValue(
        "piaOrganizationWebsite",
        organization.website_url
    );
    setValue(
        "piaOrganizationLogo",
        organization.logo_url
    );
    setValue(
        "piaOrganizationListedStatus",
        organization.listed_status
    );
    setValue(
        "piaOrganizationTicker",
        organization.ticker_symbol
    );
    setValue(
        "piaOrganizationExchange",
        organization.exchange_name
    );
    setValue(
        "piaOrganizationIsin",
        organization.isin
    );
    setValue(
        "piaOrganizationLei",
        organization.lei
    );
    setValue(
        "piaOrganizationVerification",
        organization.verification_status ||
        "draft"
    );
    setValue(
        "piaOrganizationConfidence",
        organization.confidence_level ||
        "medium"
    );

    const dataUpdated =
        organization.data_updated_at
            ? String(
                organization.data_updated_at
            ).slice(0, 10)
            : "";

    setValue(
        "piaOrganizationDataUpdatedAt",
        dataUpdated
    );

    const title =
        document.getElementById(
            "piaOrganizationEditorTitle"
        );

    if (title) {
        const displayName =
            organization.name_zh ||
            organization.name_en ||
            `#${organization.id}`;

        title.textContent =
            `编辑机构：${displayName}`;
    }

    updateOrganizationEditorStatus(
        organization.verification_status
    );

    updateOrganizationPublicationButton(
        organization
    );

    const trashButton =
        document.getElementById(
            "piaOrganizationTrashButton"
        );

    if (trashButton) {
        trashButton.disabled = false;
    }
}

function resetOrganizationForm() {
    document.getElementById(
        "piaOrganizationForm"
    )?.reset();

    currentEditingOrganizationId = null;

    const hiddenId =
        document.getElementById(
            "piaOrganizationId"
        );

    if (hiddenId) {
        hiddenId.value = "";
    }

    const type =
        document.getElementById(
            "piaOrganizationType"
        );

    if (type) {
        type.value = "company";
    }

    const verification =
        document.getElementById(
            "piaOrganizationVerification"
        );

    if (verification) {
        verification.value = "draft";
    }

    const confidence =
        document.getElementById(
            "piaOrganizationConfidence"
        );

    if (confidence) {
        confidence.value = "medium";
    }

    const title =
        document.getElementById(
            "piaOrganizationEditorTitle"
        );

    if (title) {
        title.textContent = "新增机构";
    }

    updateOrganizationEditorStatus(
        "draft"
    );

    updateOrganizationPublicationButton(
        null
    );

    const trashButton =
        document.getElementById(
            "piaOrganizationTrashButton"
        );

    if (trashButton) {
        trashButton.disabled = true;
    }
}

function updateOrganizationEditorStatus(
    status
) {
    const badge =
        document.getElementById(
            "piaOrganizationEditorStatus"
        );

    if (!badge) {
        return;
    }

    const labels = {
        draft: "草稿",
        pending: "待审核",
        verified: "已核验",
        disputed: "存在争议",
        hidden: "已隐藏"
    };

    badge.className =
        `pia-status ${status || "draft"}`;

    badge.textContent =
        labels[status] || status || "草稿";
}

function updateOrganizationPublicationButton(
    organization
) {
    const button =
        document.getElementById(
            "piaOrganizationPublishButton"
        );

    if (!button) {
        return;
    }

    if (!organization) {
        button.textContent = "发布";
        button.disabled = true;
        return;
    }

    const isPublic =
        Number(organization.is_public) === 1;

    button.textContent =
        isPublic
            ? "取消发布"
            : "发布";

    button.disabled =
        !isPublic &&
        organization.verification_status !==
        "verified";
}

function renderOrganizationTable() {
    const tbody =
        document.getElementById(
            "piaOrganizationTableBody"
        );

    if (!tbody) {
        return;
    }

    const query =
        (
            document.getElementById(
                "piaOrganizationSearch"
            )?.value || ""
        ).trim().toLowerCase();

    const type =
        document.getElementById(
            "piaOrganizationTypeFilter"
        )?.value || "all";

    const status =
        document.getElementById(
            "piaOrganizationStatusFilter"
        )?.value || "all";

    const rows =
        organizationsCache.filter(
            (organization) => {
                if (
                    type !== "all" &&
                    organization.organization_type !==
                    type
                ) {
                    return false;
                }

                if (
                    status !== "all" &&
                    organization.verification_status !==
                    status
                ) {
                    return false;
                }

                if (!query) {
                    return true;
                }

                const haystack = [
                    organization.name_zh,
                    organization.name_en,
                    organization.aliases,
                    organization.country_region,
                    organization.headquarters,
                    organization.industry,
                    organization.industry_primary,
                    organization.industry_secondary,
                    organization.ticker_symbol,
                    organization.exchange_name
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(query);
            }
        );

    const count =
        document.getElementById(
            "piaOrganizationCount"
        );

    if (count) {
        count.textContent =
            `共 ${rows.length} 条`;
    }

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="pia-organization-empty">
                    暂无符合条件的机构数据
                </td>
            </tr>
        `;
        return;
    }

    const typeLabels = {
        company: "公司",
        listed_company: "上市公司",
        fund: "基金",
        trust: "信托",
        family_office: "家族办公室",
        government: "政府机构",
        nonprofit: "非营利组织",
        other: "其他"
    };

    const verificationLabels = {
        draft: "草稿",
        pending: "待审核",
        verified: "已核验",
        disputed: "存在争议",
        hidden: "已隐藏"
    };

    tbody.innerHTML =
        rows.map((organization) => {
            const displayName =
                organization.name_zh ||
                organization.name_en ||
                `机构 #${organization.id}`;

            const secondName =
                organization.name_zh &&
                    organization.name_en
                    ? organization.name_en
                    : "";

            const industry =
                [
                    organization.industry_primary,
                    organization.industry_secondary
                ]
                    .filter(Boolean)
                    .join(" / ") ||
                organization.industry ||
                "—";

            const market =
                [
                    organization.ticker_symbol,
                    organization.exchange_name
                ]
                    .filter(Boolean)
                    .join(" / ") || "—";

            const verification =
                organization.verification_status ||
                "draft";

            const updatedAt =
                organization.updated_at
                    ? String(
                        organization.updated_at
                    ).slice(0, 10)
                    : "—";

            return `
                <tr>
                    <td>
                        <div class="pia-organization-name">
                            <strong>${escapeHtml(displayName)}</strong>
                            ${secondName
                    ? `<span>${escapeHtml(secondName)}</span>`
                    : ""
                }
                            <span>ID ${escapeHtml(organization.id)}</span>
                        </div>
                    </td>
                    <td>
                        ${escapeHtml(
                    typeLabels[
                    organization.organization_type
                    ] ||
                    organization.organization_type ||
                    "—"
                )}
                    </td>
                    <td>${escapeHtml(organization.country_region || "—")}</td>
                    <td>${escapeHtml(industry)}</td>
                    <td>${escapeHtml(market)}</td>
                    <td>
                        <span class="pia-status ${escapeHtml(verification)}">
                            ${escapeHtml(
                    verificationLabels[verification] ||
                    verification
                )}
                        </span>
                    </td>
                    <td>
                        ${Number(organization.is_public) === 1
                    ? "已发布"
                    : "未发布"
                }
                    </td>
                    <td>${escapeHtml(updatedAt)}</td>
                    <td>
                        <button
                            type="button"
                            class="pia-organization-action"
                            data-organization-edit="${escapeHtml(organization.id)}"
                        >
                            编辑
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

    tbody.querySelectorAll(
        "[data-organization-edit]"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            () => {
                const id =
                    Number(
                        button.dataset.organizationEdit
                    );

                const organization =
                    organizationsCache.find(
                        (item) =>
                            Number(item.id) === id
                    );

                if (!organization) {
                    return;
                }

                loadOrganizationIntoForm(
                    organization
                );

                document.querySelector(
                    ".pia-organization-editor-card"
                )?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        );
    });
}


/* =========================================================
   Relationship Management V1
   通用实体关系管理
========================================================= */

let relationshipTypesCache = [];
let relationshipsCache = [];
let relationshipDataLoaded = false;
let relationshipDataLoading = false;

function initRelationshipManagement() {
    document.getElementById("piaNewRelationshipButton")
        ?.addEventListener("click", resetRelationshipForm);

    document.getElementById("piaRelationshipResetButton")
        ?.addEventListener("click", resetRelationshipForm);

    document.getElementById("piaRelationshipForm")
        ?.addEventListener("submit", saveRelationship);

    document.getElementById("piaRelationshipSourceType")
        ?.addEventListener("change", refreshRelationshipTypeOptions);

    document.getElementById("piaRelationshipTargetType")
        ?.addEventListener("change", refreshRelationshipTypeOptions);

    document.getElementById("piaRelationshipSearch")
        ?.addEventListener("input", renderRelationshipTable);

    document.getElementById("piaRelationshipStatusFilter")
        ?.addEventListener("change", renderRelationshipTable);

    document.getElementById("piaRelationshipStatus")
        ?.addEventListener("change", syncRelationshipCurrentCheckbox);
}

async function ensureRelationshipDataLoaded() {
    if (relationshipDataLoaded || relationshipDataLoading) {
        return;
    }

    relationshipDataLoading = true;

    try {
        await Promise.all([
            loadRelationshipTypes(),
            loadRelationships()
        ]);

        relationshipDataLoaded = true;
        refreshRelationshipTypeOptions();
        renderRelationshipTable();
    } catch (error) {
        console.error("Relationship management load error:", error);

        openPrototypeNotice(
            "关系数据读取失败",
            error.message || "无法读取关系模型数据。"
        );
    } finally {
        relationshipDataLoading = false;
    }
}

async function relationshipApiFetch(path, options = {}) {
    const token = getAdminToken();

    if (!token) {
        throw new Error("管理员登录状态已失效，请重新登录后台。");
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
    };

    if (options.body && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
    }

    const response = await fetch(
        `${PEOPLE_INTELLIGENCE_API}${path}`,
        {
            ...options,
            headers
        }
    );

    let data = {};

    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (!response.ok || data.success === false) {
        throw new Error(
            data.message ||
            `关系 API 请求失败 (${response.status})`
        );
    }

    return data;
}

async function loadRelationshipTypes() {
    const data = await relationshipApiFetch(
        "/relationship-types"
    );

    relationshipTypesCache =
        Array.isArray(data.relationship_types)
            ? data.relationship_types
            : [];
}

async function loadRelationships() {
    const data = await relationshipApiFetch(
        "/relationships"
    );

    relationshipsCache =
        Array.isArray(data.relationships)
            ? data.relationships
            : [];
}

function refreshRelationshipTypeOptions() {
    const select =
        document.getElementById("piaRelationshipType");

    if (!select) {
        return;
    }

    const sourceType =
        document.getElementById(
            "piaRelationshipSourceType"
        )?.value || "person";

    const targetType =
        document.getElementById(
            "piaRelationshipTargetType"
        )?.value || "organization";

    const currentValue = select.value;

    const available = relationshipTypesCache.filter(
        (item) =>
            item.source_entity_type === sourceType &&
            item.target_entity_type === targetType
    );

    select.innerHTML = "";

    const emptyOption =
        document.createElement("option");

    emptyOption.value = "";
    emptyOption.textContent =
        available.length
            ? "请选择关系类型"
            : "当前实体组合暂无关系类型";

    select.appendChild(emptyOption);

    available.forEach((item) => {
        const option =
            document.createElement("option");

        option.value = item.code;
        option.textContent =
            `${item.name_zh} / ${item.name_en}`;

        select.appendChild(option);
    });

    if (
        currentValue &&
        available.some(
            (item) => item.code === currentValue
        )
    ) {
        select.value = currentValue;
    }
}

function collectRelationshipFormData() {
    const numberOrNull = (id) => {
        const value =
            document.getElementById(id)?.value;

        return value === "" || value == null
            ? null
            : Number(value);
    };

    return {
        source_entity_type:
            document.getElementById(
                "piaRelationshipSourceType"
            )?.value || "",

        source_entity_id:
            numberOrNull("piaRelationshipSourceId"),

        target_entity_type:
            document.getElementById(
                "piaRelationshipTargetType"
            )?.value || "",

        target_entity_id:
            numberOrNull("piaRelationshipTargetId"),

        relationship_type:
            document.getElementById(
                "piaRelationshipType"
            )?.value || "",

        role_title:
            document.getElementById(
                "piaRelationshipRoleTitle"
            )?.value.trim() || "",

        ownership_percentage:
            numberOrNull("piaRelationshipOwnership"),

        voting_percentage:
            numberOrNull("piaRelationshipVoting"),

        investment_amount:
            numberOrNull(
                "piaRelationshipInvestmentAmount"
            ),

        currency:
            document.getElementById(
                "piaRelationshipCurrency"
            )?.value.trim().toUpperCase() || "",

        start_date:
            document.getElementById(
                "piaRelationshipStartDate"
            )?.value || "",

        end_date:
            document.getElementById(
                "piaRelationshipEndDate"
            )?.value || "",

        relationship_status:
            document.getElementById(
                "piaRelationshipStatus"
            )?.value || "current",

        verification_status:
            document.getElementById(
                "piaRelationshipVerification"
            )?.value || "draft",

        confidence_level:
            document.getElementById(
                "piaRelationshipConfidence"
            )?.value || "medium",

        is_current:
            document.getElementById(
                "piaRelationshipIsCurrent"
            )?.checked ? 1 : 0,

        is_public:
            document.getElementById(
                "piaRelationshipIsPublic"
            )?.checked ? 1 : 0,

        description:
            document.getElementById(
                "piaRelationshipDescription"
            )?.value.trim() || "",

        notes:
            document.getElementById(
                "piaRelationshipNotes"
            )?.value.trim() || ""
    };
}

function validateRelationshipForm(data) {
    if (
        !data.source_entity_type ||
        !Number.isInteger(data.source_entity_id) ||
        data.source_entity_id < 1
    ) {
        openPrototypeNotice(
            "关系资料不完整",
            "请填写有效的来源实体 ID。"
        );
        return false;
    }

    if (!data.relationship_type) {
        openPrototypeNotice(
            "关系资料不完整",
            "请选择关系类型。"
        );
        return false;
    }

    if (
        !data.target_entity_type ||
        !Number.isInteger(data.target_entity_id) ||
        data.target_entity_id < 1
    ) {
        openPrototypeNotice(
            "关系资料不完整",
            "请填写有效的目标实体 ID。"
        );
        return false;
    }

    if (
        data.source_entity_type ===
        data.target_entity_type &&
        data.source_entity_id ===
        data.target_entity_id
    ) {
        openPrototypeNotice(
            "关系资料有误",
            "来源实体和目标实体不能是同一个实体。"
        );
        return false;
    }

    return true;
}

async function saveRelationship(event) {
    event.preventDefault();

    const data = collectRelationshipFormData();

    if (!validateRelationshipForm(data)) {
        return;
    }

    const relationshipId =
        document.getElementById(
            "piaRelationshipId"
        )?.value || "";

    const saveButton =
        document.getElementById(
            "piaRelationshipSaveButton"
        );

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "保存中...";
    }

    try {
        const result =
            await relationshipApiFetch(
                relationshipId
                    ? `/relationships/${relationshipId}`
                    : "/relationships",
                {
                    method:
                        relationshipId ? "PUT" : "POST",
                    body: JSON.stringify(data)
                }
            );

        await loadRelationships();
        renderRelationshipTable();

        if (result.relationship) {
            loadRelationshipIntoForm(
                result.relationship
            );
        }

        openPrototypeNotice(
            "保存成功",
            relationshipId
                ? "关系资料已经更新到 SQLite 数据库。"
                : "新的实体关系已经写入 SQLite 数据库。"
        );
    } catch (error) {
        console.error("Save relationship error:", error);

        openPrototypeNotice(
            "保存关系失败",
            error.message || "关系保存失败。"
        );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = "保存关系";
        }
    }
}

function loadRelationshipIntoForm(relationship) {
    const setValue = (id, value) => {
        const element =
            document.getElementById(id);

        if (element) {
            element.value =
                value == null ? "" : value;
        }
    };

    setValue(
        "piaRelationshipId",
        relationship.id
    );
    setValue(
        "piaRelationshipSourceType",
        relationship.source_entity_type
    );
    setValue(
        "piaRelationshipSourceId",
        relationship.source_entity_id
    );
    setValue(
        "piaRelationshipTargetType",
        relationship.target_entity_type
    );
    setValue(
        "piaRelationshipTargetId",
        relationship.target_entity_id
    );

    refreshRelationshipTypeOptions();

    setValue(
        "piaRelationshipType",
        relationship.relationship_type
    );
    setValue(
        "piaRelationshipRoleTitle",
        relationship.role_title
    );
    setValue(
        "piaRelationshipOwnership",
        relationship.ownership_percentage
    );
    setValue(
        "piaRelationshipVoting",
        relationship.voting_percentage
    );
    setValue(
        "piaRelationshipInvestmentAmount",
        relationship.investment_amount
    );
    setValue(
        "piaRelationshipCurrency",
        relationship.currency
    );
    setValue(
        "piaRelationshipStartDate",
        relationship.start_date
    );
    setValue(
        "piaRelationshipEndDate",
        relationship.end_date
    );
    setValue(
        "piaRelationshipStatus",
        relationship.relationship_status ||
        "current"
    );
    setValue(
        "piaRelationshipVerification",
        relationship.verification_status ||
        "draft"
    );
    setValue(
        "piaRelationshipConfidence",
        relationship.confidence_level ||
        "medium"
    );
    setValue(
        "piaRelationshipDescription",
        relationship.description
    );
    setValue(
        "piaRelationshipNotes",
        relationship.notes
    );

    const isCurrent =
        document.getElementById(
            "piaRelationshipIsCurrent"
        );

    if (isCurrent) {
        isCurrent.checked =
            Number(relationship.is_current) === 1;
    }

    const isPublic =
        document.getElementById(
            "piaRelationshipIsPublic"
        );

    if (isPublic) {
        isPublic.checked =
            Number(relationship.is_public) === 1;
    }

    const title =
        document.getElementById(
            "piaRelationshipEditorTitle"
        );

    if (title) {
        title.textContent =
            `编辑关系 #${relationship.id}`;
    }

    updateRelationshipEditorStatus(
        relationship.verification_status
    );
}

function resetRelationshipForm() {
    const form =
        document.getElementById(
            "piaRelationshipForm"
        );

    form?.reset();

    const id =
        document.getElementById(
            "piaRelationshipId"
        );

    if (id) {
        id.value = "";
    }

    const sourceType =
        document.getElementById(
            "piaRelationshipSourceType"
        );

    const targetType =
        document.getElementById(
            "piaRelationshipTargetType"
        );

    if (sourceType) {
        sourceType.value = "person";
    }

    if (targetType) {
        targetType.value = "organization";
    }

    const isCurrent =
        document.getElementById(
            "piaRelationshipIsCurrent"
        );

    if (isCurrent) {
        isCurrent.checked = true;
    }

    refreshRelationshipTypeOptions();

    const title =
        document.getElementById(
            "piaRelationshipEditorTitle"
        );

    if (title) {
        title.textContent = "新增关系";
    }

    updateRelationshipEditorStatus("draft");
}

function syncRelationshipCurrentCheckbox() {
    const status =
        document.getElementById(
            "piaRelationshipStatus"
        )?.value;

    const checkbox =
        document.getElementById(
            "piaRelationshipIsCurrent"
        );

    if (checkbox) {
        checkbox.checked =
            status === "current";
    }
}

function updateRelationshipEditorStatus(status) {
    const badge =
        document.getElementById(
            "piaRelationshipEditorStatus"
        );

    if (!badge) {
        return;
    }

    const labels = {
        draft: "草稿",
        pending: "待审核",
        verified: "已核验",
        disputed: "存在争议",
        hidden: "已隐藏"
    };

    badge.className =
        `pia-status ${status || "draft"}`;

    badge.textContent =
        labels[status] || "草稿";
}

function renderRelationshipTable() {
    const tbody =
        document.getElementById(
            "piaRelationshipTableBody"
        );

    if (!tbody) {
        return;
    }

    const query =
        (
            document.getElementById(
                "piaRelationshipSearch"
            )?.value || ""
        ).trim().toLowerCase();

    const status =
        document.getElementById(
            "piaRelationshipStatusFilter"
        )?.value || "all";

    const rows =
        relationshipsCache.filter(
            (relationship) => {
                if (
                    status !== "all" &&
                    relationship.verification_status !==
                    status
                ) {
                    return false;
                }

                if (!query) {
                    return true;
                }

                const haystack = [
                    relationship.source_entity_name,
                    relationship.target_entity_name,
                    relationship.relationship_name_zh,
                    relationship.relationship_name_en,
                    relationship.relationship_type,
                    relationship.role_title
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(query);
            }
        );

    const count =
        document.getElementById(
            "piaRelationshipCount"
        );

    if (count) {
        count.textContent =
            `共 ${rows.length} 条`;
    }

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="9" class="pia-relationship-empty">
                    暂无符合条件的关系数据
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML =
        rows.map(
            (relationship) => {
                const sourceName =
                    relationship.source_entity_name ||
                    `ID ${relationship.source_entity_id}`;

                const targetName =
                    relationship.target_entity_name ||
                    `ID ${relationship.target_entity_id}`;

                const relationshipName =
                    relationship.relationship_name_zh ||
                    relationship.relationship_label ||
                    relationship.relationship_type;

                const ownership =
                    relationship.ownership_percentage == null
                        ? ""
                        : `${relationship.ownership_percentage}%`;

                const roleOwnership =
                    [
                        relationship.role_title,
                        ownership
                    ]
                        .filter(Boolean)
                        .join(" / ") || "—";

                const verification =
                    relationship.verification_status ||
                    "draft";

                const verificationLabels = {
                    draft: "草稿",
                    pending: "待审核",
                    verified: "已核验",
                    disputed: "存在争议",
                    hidden: "已隐藏"
                };

                const updatedAt =
                    relationship.updated_at
                        ? String(
                            relationship.updated_at
                        ).slice(0, 10)
                        : "—";

                return `
                    <tr>
                        <td>
                            <strong>${escapeHtml(sourceName)}</strong>
                            <span class="pia-relationship-entity-type">
                                ${escapeHtml(relationship.source_entity_type)}
                                · ID ${escapeHtml(relationship.source_entity_id)}
                            </span>
                        </td>
                        <td>${escapeHtml(relationshipName)}</td>
                        <td>
                            <strong>${escapeHtml(targetName)}</strong>
                            <span class="pia-relationship-entity-type">
                                ${escapeHtml(relationship.target_entity_type)}
                                · ID ${escapeHtml(relationship.target_entity_id)}
                            </span>
                        </td>
                        <td>${escapeHtml(roleOwnership)}</td>
                        <td>
                            <span class="pia-status ${escapeHtml(verification)}">
                                ${escapeHtml(verificationLabels[verification] || verification)}
                            </span>
                        </td>
                        <td>
                            <span class="pia-relationship-evidence-count">
                                ${Number(relationship.verified_evidence_count || 0)}
                                /
                                ${Number(relationship.evidence_count || 0)}
                                <button
                                    type="button"
                                    class="pia-relationship-evidence-btn"
                                    data-relationship-evidence="${escapeHtml(relationship.id)}"
                                >
                                    查看
                                </button>
                            </span>
                        </td>
                        <td>${Number(relationship.is_public) === 1 ? "已公开" : "未公开"}</td>
                        <td>${escapeHtml(updatedAt)}</td>
                        <td>
                            <button
                                type="button"
                                class="pia-relationship-action"
                                data-relationship-edit="${escapeHtml(relationship.id)}"
                            >
                                编辑
                            </button>
                        </td>
                    </tr>
                `;
            }
        ).join("");

    tbody.querySelectorAll(
        "[data-relationship-evidence]"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            () => {
                const relationshipId =
                    Number(
                        button.dataset.relationshipEvidence
                    );

                const evidenceNav =
                    document.querySelector(
                        '[data-admin-nav="evidence"]'
                    );

                evidenceNav?.click();

                setTimeout(() => {
                    const entityType =
                        document.getElementById(
                            "piaEvidenceEntityType"
                        );

                    const entityId =
                        document.getElementById(
                            "piaEvidenceEntityId"
                        );

                    if (entityType) {
                        entityType.value =
                            "relationship";
                    }

                    if (entityId) {
                        entityId.value =
                            String(relationshipId);
                    }

                    const search =
                        document.getElementById(
                            "piaEvidenceSearch"
                        );

                    if (search) {
                        search.value =
                            `relationship ${relationshipId}`;
                    }

                    renderEvidenceTable();
                }, 0);
            }
        );
    });

    tbody.querySelectorAll(
        "[data-relationship-edit]"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            () => {
                const id =
                    Number(
                        button.dataset.relationshipEdit
                    );

                const relationship =
                    relationshipsCache.find(
                        (item) =>
                            Number(item.id) === id
                    );

                if (!relationship) {
                    return;
                }

                loadRelationshipIntoForm(
                    relationship
                );

                document.querySelector(
                    ".pia-relationship-editor-card"
                )?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        );
    });
}


/* =========================================================
   Evidence & Sources V1
========================================================= */

let evidenceCache = [];
let evidenceDataLoaded = false;
let evidenceDataLoading = false;
let currentEditingEvidenceId = null;

function initEvidenceManagement() {
    document.getElementById("piaNewEvidenceButton")
        ?.addEventListener("click", resetEvidenceForm);

    document.getElementById("piaEvidenceResetButton")
        ?.addEventListener("click", resetEvidenceForm);

    document.getElementById("piaEvidenceForm")
        ?.addEventListener("submit", saveEvidence);

    document.getElementById("piaEvidenceDeleteButton")
        ?.addEventListener("click", deleteEvidence);

    document.getElementById("piaEvidenceVerifyButton")
        ?.addEventListener("click", () => updateEvidenceStatus("verified"));

    document.getElementById("piaEvidenceDisputeButton")
        ?.addEventListener("click", () => updateEvidenceStatus("disputed"));

    document.getElementById("piaEvidenceRejectButton")
        ?.addEventListener("click", () => updateEvidenceStatus("rejected"));

    document.getElementById("piaEvidenceSearch")
        ?.addEventListener("input", renderEvidenceTable);

    document.getElementById("piaEvidenceTypeFilter")
        ?.addEventListener("change", renderEvidenceTable);

    document.getElementById("piaEvidenceStatusFilter")
        ?.addEventListener("change", renderEvidenceTable);
}

async function ensureEvidenceDataLoaded(force = false) {
    if (
        !force &&
        (evidenceDataLoaded || evidenceDataLoading)
    ) {
        return;
    }

    evidenceDataLoading = true;

    try {
        await loadEvidence();

        evidenceDataLoaded = true;
        renderEvidenceTable();

        if (
            evidenceCache.length > 0 &&
            !currentEditingEvidenceId
        ) {
            loadEvidenceIntoForm(
                evidenceCache[0]
            );
        } else if (
            evidenceCache.length === 0
        ) {
            resetEvidenceForm();
        }
    } catch (error) {
        console.error(
            "Evidence management load error:",
            error
        );

        openPrototypeNotice(
            "证据数据读取失败",
            error.message ||
            "无法从 SQLite 数据库读取证据资料。"
        );
    } finally {
        evidenceDataLoading = false;
    }
}

async function evidenceApiFetch(
    path,
    options = {}
) {
    const token = getAdminToken();

    if (!token) {
        throw new Error(
            "管理员登录状态已失效，请重新登录后台。"
        );
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
    };

    if (
        options.body &&
        !headers["Content-Type"]
    ) {
        headers["Content-Type"] =
            "application/json";
    }

    const response =
        await fetch(
            `${PEOPLE_INTELLIGENCE_API}${path}`,
            {
                ...options,
                headers
            }
        );

    let data = {};

    try {
        data = await response.json();
    } catch (error) {
        data = {};
    }

    if (
        !response.ok ||
        data.success === false
    ) {
        throw new Error(
            data.message ||
            `证据 API 请求失败 (${response.status})`
        );
    }

    return data;
}

async function loadEvidence() {
    const data =
        await evidenceApiFetch(
            "/evidence"
        );

    evidenceCache =
        Array.isArray(data.evidence)
            ? data.evidence
            : [];
}

function collectEvidenceFormData() {
    return {
        entity_type:
            document.getElementById(
                "piaEvidenceEntityType"
            )?.value || "relationship",

        entity_id:
            Number(
                document.getElementById(
                    "piaEvidenceEntityId"
                )?.value || 0
            ),

        evidence_type:
            document.getElementById(
                "piaEvidenceType"
            )?.value || "web",

        source_name:
            document.getElementById(
                "piaEvidenceSourceName"
            )?.value.trim() || "",

        source_title:
            document.getElementById(
                "piaEvidenceSourceTitle"
            )?.value.trim() || "",

        source_url:
            document.getElementById(
                "piaEvidenceSourceUrl"
            )?.value.trim() || "",

        publisher:
            document.getElementById(
                "piaEvidencePublisher"
            )?.value.trim() || "",

        published_at:
            document.getElementById(
                "piaEvidencePublishedAt"
            )?.value || "",

        evidence_summary:
            document.getElementById(
                "piaEvidenceSummary"
            )?.value.trim() || "",

        source_tier:
            document.getElementById(
                "piaEvidenceSourceTier"
            )?.value || "secondary",

        confidence_level:
            document.getElementById(
                "piaEvidenceConfidence"
            )?.value || "medium",

        verification_status:
            document.getElementById(
                "piaEvidenceVerification"
            )?.value || "pending",

        is_primary_source:
            document.getElementById(
                "piaEvidenceIsPrimarySource"
            )?.checked ? 1 : 0,

        archived_url:
            document.getElementById(
                "piaEvidenceArchivedUrl"
            )?.value.trim() || ""
    };
}

function validateEvidenceForm(data) {
    if (
        !Number.isInteger(data.entity_id) ||
        data.entity_id < 1
    ) {
        openPrototypeNotice(
            "证据资料不完整",
            "请填写有效的目标 ID。"
        );
        return false;
    }

    if (!data.source_name) {
        openPrototypeNotice(
            "证据资料不完整",
            "请填写来源名称。"
        );
        return false;
    }

    return true;
}

async function saveEvidence(event) {
    event.preventDefault();

    const data =
        collectEvidenceFormData();

    if (!validateEvidenceForm(data)) {
        return;
    }

    const saveButton =
        document.getElementById(
            "piaEvidenceSaveButton"
        );

    if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "保存中...";
    }

    try {
        const result =
            await evidenceApiFetch(
                currentEditingEvidenceId
                    ? `/evidence/${currentEditingEvidenceId}`
                    : "/evidence",
                {
                    method:
                        currentEditingEvidenceId
                            ? "PUT"
                            : "POST",
                    body: JSON.stringify(data)
                }
            );

        if (result.evidence) {
            currentEditingEvidenceId =
                result.evidence.id;

            loadEvidenceIntoForm(
                result.evidence
            );
        }

        await loadEvidence();
        renderEvidenceTable();

        openPrototypeNotice(
            "保存成功",
            "证据资料已经写入 SQLite 数据库。"
        );
    } catch (error) {
        console.error(
            "Save evidence error:",
            error
        );

        openPrototypeNotice(
            "证据保存失败",
            error.message ||
            "无法保存证据资料。"
        );
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.textContent = "保存证据";
        }
    }
}


async function updateEvidenceStatus(status) {
    if (!currentEditingEvidenceId) {
        openPrototypeNotice(
            "尚未保存",
            "请先保存证据后再执行审核操作。"
        );
        return;
    }

    try {
        const result =
            await evidenceApiFetch(
                `/evidence/${currentEditingEvidenceId}/status`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        verification_status: status
                    })
                }
            );

        if (result.evidence) {
            loadEvidenceIntoForm(
                result.evidence
            );
        }

        await loadEvidence();
        renderEvidenceTable();

        const labels = {
            verified: "审核通过",
            disputed: "已标记争议",
            rejected: "已拒绝"
        };

        openPrototypeNotice(
            labels[status] || "状态已更新",
            "证据审核状态已经写入 SQLite 数据库。"
        );
    } catch (error) {
        openPrototypeNotice(
            "证据审核失败",
            error.message ||
            "无法更新证据审核状态。"
        );
    }
}

async function deleteEvidence() {
    if (!currentEditingEvidenceId) {
        return;
    }

    if (
        !window.confirm(
            "确定删除当前证据吗？此操作不可恢复。"
        )
    ) {
        return;
    }

    try {
        await evidenceApiFetch(
            `/evidence/${currentEditingEvidenceId}`,
            {
                method: "DELETE"
            }
        );

        currentEditingEvidenceId = null;

        await loadEvidence();
        renderEvidenceTable();
        resetEvidenceForm();

        openPrototypeNotice(
            "证据已删除",
            "当前证据记录已从 SQLite 数据库删除。"
        );
    } catch (error) {
        openPrototypeNotice(
            "删除失败",
            error.message ||
            "无法删除证据记录。"
        );
    }
}

function loadEvidenceIntoForm(evidence) {
    currentEditingEvidenceId =
        evidence.id;

    const setValue = (id, value) => {
        const element =
            document.getElementById(id);

        if (element) {
            element.value =
                value == null ? "" : value;
        }
    };

    setValue(
        "piaEvidenceId",
        evidence.id
    );
    setValue(
        "piaEvidenceEntityType",
        evidence.entity_type
    );
    setValue(
        "piaEvidenceEntityId",
        evidence.entity_id
    );
    setValue(
        "piaEvidenceType",
        evidence.evidence_type
    );
    setValue(
        "piaEvidenceSourceName",
        evidence.source_name
    );
    setValue(
        "piaEvidenceSourceTitle",
        evidence.source_title
    );
    setValue(
        "piaEvidenceSourceUrl",
        evidence.source_url
    );
    setValue(
        "piaEvidencePublisher",
        evidence.publisher
    );
    setValue(
        "piaEvidencePublishedAt",
        evidence.published_at
    );
    setValue(
        "piaEvidenceSummary",
        evidence.evidence_summary
    );
    setValue(
        "piaEvidenceSourceTier",
        evidence.source_tier ||
        "secondary"
    );
    setValue(
        "piaEvidenceConfidence",
        evidence.confidence_level ||
        "medium"
    );
    setValue(
        "piaEvidenceVerification",
        evidence.verification_status ||
        "pending"
    );
    setValue(
        "piaEvidenceArchivedUrl",
        evidence.archived_url
    );

    const checkbox =
        document.getElementById(
            "piaEvidenceIsPrimarySource"
        );

    if (checkbox) {
        checkbox.checked =
            Number(
                evidence.is_primary_source
            ) === 1;
    }

    const title =
        document.getElementById(
            "piaEvidenceEditorTitle"
        );

    if (title) {
        title.textContent =
            `编辑证据 #${evidence.id}`;
    }

    updateEvidenceEditorStatus(
        evidence.verification_status
    );

    const evidenceActionButtons = [
        "piaEvidenceVerifyButton",
        "piaEvidenceDisputeButton",
        "piaEvidenceRejectButton",
        "piaEvidenceDeleteButton"
    ];

    evidenceActionButtons.forEach((id) => {
        const button =
            document.getElementById(id);

        if (button) {
            button.disabled = false;
        }
    });
}

function resetEvidenceForm() {
    document.getElementById(
        "piaEvidenceForm"
    )?.reset();

    currentEditingEvidenceId = null;

    const id =
        document.getElementById(
            "piaEvidenceId"
        );

    if (id) {
        id.value = "";
    }

    const entityType =
        document.getElementById(
            "piaEvidenceEntityType"
        );

    if (entityType) {
        entityType.value =
            "relationship";
    }

    const sourceTier =
        document.getElementById(
            "piaEvidenceSourceTier"
        );

    if (sourceTier) {
        sourceTier.value =
            "secondary";
    }

    const verification =
        document.getElementById(
            "piaEvidenceVerification"
        );

    if (verification) {
        verification.value =
            "pending";
    }

    const confidence =
        document.getElementById(
            "piaEvidenceConfidence"
        );

    if (confidence) {
        confidence.value =
            "medium";
    }

    const title =
        document.getElementById(
            "piaEvidenceEditorTitle"
        );

    if (title) {
        title.textContent =
            "新增证据";
    }

    updateEvidenceEditorStatus(
        "pending"
    );

    [
        "piaEvidenceVerifyButton",
        "piaEvidenceDisputeButton",
        "piaEvidenceRejectButton",
        "piaEvidenceDeleteButton"
    ].forEach((id) => {
        const button =
            document.getElementById(id);

        if (button) {
            button.disabled = true;
        }
    });
}

function updateEvidenceEditorStatus(status) {
    const badge =
        document.getElementById(
            "piaEvidenceEditorStatus"
        );

    if (!badge) {
        return;
    }

    const labels = {
        pending: "待审核",
        verified: "已核验",
        disputed: "存在争议",
        rejected: "已拒绝"
    };

    badge.className =
        `pia-status ${status || "pending"}`;

    badge.textContent =
        labels[status] ||
        status ||
        "待审核";
}

function renderEvidenceTable() {
    const tbody =
        document.getElementById(
            "piaEvidenceTableBody"
        );

    if (!tbody) {
        return;
    }

    const query =
        (
            document.getElementById(
                "piaEvidenceSearch"
            )?.value || ""
        ).trim().toLowerCase();

    const type =
        document.getElementById(
            "piaEvidenceTypeFilter"
        )?.value || "all";

    const status =
        document.getElementById(
            "piaEvidenceStatusFilter"
        )?.value || "all";

    const rows =
        evidenceCache.filter(
            (evidence) => {
                if (
                    type !== "all" &&
                    evidence.evidence_type !==
                    type
                ) {
                    return false;
                }

                if (
                    status !== "all" &&
                    evidence.verification_status !==
                    status
                ) {
                    return false;
                }

                if (!query) {
                    return true;
                }

                const haystack = [
                    evidence.source_name,
                    evidence.source_title,
                    evidence.source_url,
                    evidence.publisher,
                    evidence.evidence_summary,
                    evidence.entity_type,
                    evidence.entity_id
                ]
                    .filter(Boolean)
                    .join(" ")
                    .toLowerCase();

                return haystack.includes(query);
            }
        );

    const count =
        document.getElementById(
            "piaEvidenceCount"
        );

    if (count) {
        count.textContent =
            `共 ${rows.length} 条`;
    }

    if (!rows.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="pia-evidence-empty">
                    暂无符合条件的证据数据
                </td>
            </tr>
        `;
        return;
    }

    const typeLabels = {
        web: "网页",
        company_filing: "公司文件",
        exchange_filing: "交易所披露",
        government_record: "政府记录",
        news: "新闻",
        api: "API",
        document: "文档",
        other: "其他"
    };

    const tierLabels = {
        primary: "一级",
        secondary: "二级",
        tertiary: "三级"
    };

    const statusLabels = {
        pending: "待审核",
        verified: "已核验",
        disputed: "存在争议",
        rejected: "已拒绝"
    };

    const confidenceLabels = {
        high: "高",
        medium: "中",
        low: "低"
    };

    tbody.innerHTML =
        rows.map((evidence) => {
            const updatedAt =
                evidence.updated_at
                    ? String(
                        evidence.updated_at
                    ).slice(0, 10)
                    : "—";

            const sourceLabel =
                evidence.source_title ||
                evidence.source_name ||
                "未命名来源";

            return `
                <tr>
                    <td>
                        <strong>
                            ${escapeHtml(evidence.entity_type)}
                            #${escapeHtml(evidence.entity_id)}
                        </strong>
                    </td>
                    <td>
                        ${escapeHtml(
                typeLabels[evidence.evidence_type] ||
                evidence.evidence_type ||
                "—"
            )}
                    </td>
                    <td>
                        <strong>${escapeHtml(sourceLabel)}</strong>
                        <span class="pia-evidence-subtext">
                            ${escapeHtml(evidence.source_name || "")}
                        </span>
                    </td>
                    <td>
                        ${escapeHtml(
                tierLabels[evidence.source_tier] ||
                evidence.source_tier ||
                "—"
            )}
                    </td>
                    <td>
                        <span class="pia-status ${escapeHtml(evidence.verification_status || "pending")}">
                            ${escapeHtml(
                statusLabels[
                evidence.verification_status
                ] ||
                evidence.verification_status ||
                "待审核"
            )}
                        </span>
                    </td>
                    <td>
                        ${escapeHtml(
                confidenceLabels[
                evidence.confidence_level
                ] ||
                evidence.confidence_level ||
                "—"
            )}
                    </td>
                    <td>${escapeHtml(updatedAt)}</td>
                    <td>
                        <button
                            type="button"
                            class="pia-evidence-action"
                            data-evidence-edit="${escapeHtml(evidence.id)}"
                        >
                            编辑
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

    tbody.querySelectorAll(
        "[data-evidence-edit]"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            () => {
                const id =
                    Number(
                        button.dataset.evidenceEdit
                    );

                const evidence =
                    evidenceCache.find(
                        (item) =>
                            Number(item.id) === id
                    );

                if (!evidence) {
                    return;
                }

                loadEvidenceIntoForm(
                    evidence
                );

                document.querySelector(
                    ".pia-evidence-editor-card"
                )?.scrollIntoView({
                    behavior: "smooth",
                    block: "start"
                });
            }
        );
    });
}


/* =========================================================
   AI / Data Review Queue V1
========================================================= */

let reviewQueueCache = [];
let reviewQueueLoading = false;

function initReviewQueue() {
    document.getElementById(
        "piaReviewRefreshButton"
    )?.addEventListener(
        "click",
        () => loadReviewQueue()
    );

    document.getElementById(
        "piaReviewSearch"
    )?.addEventListener(
        "input",
        () => loadReviewQueue()
    );

    document.getElementById(
        "piaReviewTypeFilter"
    )?.addEventListener(
        "change",
        () => loadReviewQueue()
    );

    document.getElementById(
        "piaReviewStatusFilter"
    )?.addEventListener(
        "change",
        () => loadReviewQueue()
    );

    document.getElementById(
        "piaReviewPublicationFilter"
    )?.addEventListener(
        "change",
        () => loadReviewQueue()
    );
}

async function loadReviewQueue() {
    if (reviewQueueLoading) {
        return;
    }

    reviewQueueLoading = true;

    const tbody =
        document.getElementById(
            "piaReviewTableBody"
        );

    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="pia-review-empty">
                    正在读取审核队列...
                </td>
            </tr>
        `;
    }

    try {
        const search =
            document.getElementById(
                "piaReviewSearch"
            )?.value.trim() || "";

        const type =
            document.getElementById(
                "piaReviewTypeFilter"
            )?.value || "all";

        const status =
            document.getElementById(
                "piaReviewStatusFilter"
            )?.value || "reviewable";

        const publication =
            document.getElementById(
                "piaReviewPublicationFilter"
            )?.value || "all";

        const params =
            new URLSearchParams();

        params.set("type", type);
        params.set("status", status);
        params.set(
            "publication",
            publication
        );

        if (search) {
            params.set("search", search);
        }

        const data =
            await relationshipApiFetch(
                `/review-queue?${params.toString()}`
            );

        reviewQueueCache =
            Array.isArray(data.items)
                ? data.items
                : [];

        updateReviewSummary(
            data.summary || {}
        );

        renderReviewQueue();
    } catch (error) {
        console.error(
            "Review queue load error:",
            error
        );

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="pia-review-empty">
                        审核队列读取失败
                    </td>
                </tr>
            `;
        }

        openPrototypeNotice(
            "审核队列读取失败",
            error.message ||
            "无法读取统一审核数据。"
        );
    } finally {
        reviewQueueLoading = false;
    }
}

function updateReviewSummary(summary) {
    const pairs = [
        [
            "piaReviewTotal",
            summary.total || 0
        ],
        [
            "piaReviewDraftCount",
            summary.draft || 0
        ],
        [
            "piaReviewPendingCount",
            summary.pending || 0
        ],
        [
            "piaReviewDisputedCount",
            summary.disputed || 0
        ]
    ];

    pairs.forEach(([id, value]) => {
        const element =
            document.getElementById(id);

        if (element) {
            element.textContent =
                String(value);
        }
    });
}

function renderReviewQueue() {
    const tbody =
        document.getElementById(
            "piaReviewTableBody"
        );

    if (!tbody) {
        return;
    }

    const count =
        document.getElementById(
            "piaReviewCount"
        );

    if (count) {
        count.textContent =
            `共 ${reviewQueueCache.length} 条`;
    }

    if (!reviewQueueCache.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="pia-review-empty">
                    当前没有符合条件的待审核数据
                </td>
            </tr>
        `;
        return;
    }

    const typeLabels = {
        person: "人物",
        organization: "机构",
        relationship: "关系",
        evidence: "证据"
    };

    const statusLabels = {
        draft: "草稿",
        pending: "待审核",
        verified: "已核验",
        disputed: "存在争议",
        hidden: "已隐藏",
        rejected: "已拒绝"
    };

    const confidenceLabels = {
        high: "高",
        medium: "中",
        low: "低"
    };

    tbody.innerHTML =
        reviewQueueCache.map((item) => {
            const evidenceText =
                item.object_type === "relationship"
                    ? `${Number(item.verified_evidence_count || 0)} / ${Number(item.evidence_count || 0)}`
                    : "—";

            const updatedAt =
                item.updated_at
                    ? String(
                        item.updated_at
                    ).slice(0, 10)
                    : "—";

            return `
                <tr>
                    <td>
                        ${escapeHtml(
                typeLabels[item.object_type] ||
                item.object_type
            )}
                        <span class="pia-evidence-subtext">
                            #${escapeHtml(item.object_id)}
                        </span>
                    </td>

                    <td class="pia-review-object">
                        <strong>${escapeHtml(item.title || "—")}</strong>
                        <span>${escapeHtml(item.subtitle || "")}</span>
                    </td>

                    <td>
                        ${escapeHtml(
                confidenceLabels[
                item.confidence_level
                ] ||
                item.confidence_level ||
                "—"
            )}
                    </td>

                    <td class="pia-review-evidence">
                        ${escapeHtml(evidenceText)}
                    </td>

                    <td>
                        <span class="pia-status ${escapeHtml(item.verification_status || "draft")}">
                            ${escapeHtml(
                statusLabels[
                item.verification_status
                ] ||
                item.verification_status ||
                "—"
            )}
                        </span>
                    </td>

                    <td>
                        ${item.object_type === "evidence"
                    ? `<span class="pia-review-publication unpublished">不适用</span>`
                    : Number(item.is_public) === 1
                        ? `<span class="pia-review-publication published">已发布</span>`
                        : `<span class="pia-review-publication unpublished">未发布</span>`
                }
                    </td>

                    <td>${escapeHtml(updatedAt)}</td>

                    <td>
                        <div class="pia-review-actions">
                            ${item.verification_status !== "verified" &&
                    item.verification_status !== "hidden" &&
                    item.verification_status !== "rejected"
                    ? `
                                        <button
                                            type="button"
                                            class="pia-review-action primary"
                                            data-review-action="verify"
                                            data-review-type="${escapeHtml(item.object_type)}"
                                            data-review-id="${escapeHtml(item.object_id)}"
                                        >
                                            审核通过
                                        </button>
                                    `
                    : ""
                }

                            ${item.verification_status === "verified" &&
                    item.object_type !== "evidence"
                    ? `
                                        <button
                                            type="button"
                                            class="pia-review-action ${Number(item.is_public) === 1 ? "unpublish" : "publish"}"
                                            data-review-action="${Number(item.is_public) === 1 ? "unpublish" : "publish"}"
                                            data-review-type="${escapeHtml(item.object_type)}"
                                            data-review-id="${escapeHtml(item.object_id)}"
                                        >
                                            ${Number(item.is_public) === 1 ? "取消发布" : "发布"}
                                        </button>
                                    `
                    : ""
                }

                            ${item.verification_status !== "hidden" &&
                    item.verification_status !== "rejected"
                    ? `
                                        <button
                                            type="button"
                                            class="pia-review-action"
                                            data-review-action="dispute"
                                            data-review-type="${escapeHtml(item.object_type)}"
                                            data-review-id="${escapeHtml(item.object_id)}"
                                        >
                                            标记争议
                                        </button>
                                    `
                    : ""
                }

                            ${item.verification_status !== "hidden" &&
                    item.verification_status !== "rejected"
                    ? `
                                        <button
                                            type="button"
                                            class="pia-review-action danger"
                                            data-review-action="reject"
                                            data-review-type="${escapeHtml(item.object_type)}"
                                            data-review-id="${escapeHtml(item.object_id)}"
                                        >
                                            拒绝/隐藏
                                        </button>
                                    `
                    : ""
                }
                        </div>
                    </td>
                </tr>
            `;
        }).join("");

    tbody.querySelectorAll(
        "[data-review-action]"
    ).forEach((button) => {
        button.addEventListener(
            "click",
            async () => {
                const action =
                    button.dataset.reviewAction;

                const type =
                    button.dataset.reviewType;

                const id =
                    Number(
                        button.dataset.reviewId
                    );

                await applyReviewAction(
                    type,
                    id,
                    action
                );
            }
        );
    });
}

async function applyReviewAction(
    type,
    id,
    action
) {
    if (!type || !id) {
        return;
    }

    const endpointMap = {
        person:
            `/people/${id}/status`,
        organization:
            `/organizations/${id}/status`,
        relationship:
            `/relationships/${id}/status`,
        evidence:
            `/evidence/${id}/status`
    };

    const endpoint =
        endpointMap[type];

    if (!endpoint) {
        return;
    }

    if (
        action === "publish" ||
        action === "unpublish"
    ) {
        if (type === "evidence") {
            return;
        }

        const publicationEndpointMap = {
            person:
                `/people/${id}/publication`,
            organization:
                `/organizations/${id}/publication`,
            relationship:
                `/relationships/${id}/publication`
        };

        const publicationEndpoint =
            publicationEndpointMap[type];

        if (!publicationEndpoint) {
            return;
        }

        try {
            await relationshipApiFetch(
                publicationEndpoint,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        is_public:
                            action === "publish"
                    })
                }
            );

            openPrototypeNotice(
                action === "publish"
                    ? "发布成功"
                    : "已取消发布",
                action === "publish"
                    ? "该已核验数据现在可以供前台公开数据接口使用。"
                    : "该数据已经从公开状态撤回。"
            );

            await loadReviewQueue();

            if (type === "relationship") {
                relationshipDataLoaded = false;
            }

            if (type === "organization") {
                organizationDataLoaded = false;
            }

            return;
        } catch (error) {
            openPrototypeNotice(
                "发布操作失败",
                error.message ||
                "无法更新发布状态。"
            );

            return;
        }
    }

    let status;

    if (action === "verify") {
        status = "verified";
    } else if (action === "dispute") {
        status = "disputed";
    } else if (action === "reject") {
        status =
            type === "evidence"
                ? "rejected"
                : "hidden";
    } else {
        return;
    }

    try {
        await relationshipApiFetch(
            endpoint,
            {
                method: "PATCH",
                body: JSON.stringify({
                    verification_status:
                        status
                })
            }
        );

        openPrototypeNotice(
            "审核状态已更新",
            action === "verify"
                ? "该数据已经审核通过。"
                : action === "dispute"
                    ? "该数据已经标记为存在争议。"
                    : "该数据已经拒绝或隐藏。"
        );

        await loadReviewQueue();

        if (type === "relationship") {
            relationshipDataLoaded = false;
        }

        if (type === "evidence") {
            evidenceDataLoaded = false;
        }

        if (type === "organization") {
            organizationDataLoaded = false;
        }
    } catch (error) {
        openPrototypeNotice(
            "审核操作失败",
            error.message ||
            "无法更新审核状态。"
        );
    }
}

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}