/* =========================================================
   People Intelligence Admin Console
   V1.2 Prototype
   File: admin/people-intelligence-admin.js
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    initAdminNavigation();
    initTopbarActions();
    initPersonManagement();

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

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}