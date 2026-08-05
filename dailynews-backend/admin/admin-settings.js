const SITE_LOGO_API = "/api/site-settings/logo";

function getAdminToken() {
    return localStorage.getItem("adminToken") || "";
}

function getAdminHeaders() {
    const token = getAdminToken();

    return {
        Authorization: `Bearer ${token}`
    };
}

function showLogoMessage(message, type = "") {
    const messageBox = document.getElementById("siteLogoMessage");

    if (!messageBox) {
        return;
    }

    messageBox.textContent = message;
    messageBox.className = "logo-management-message";

    if (type) {
        messageBox.classList.add(`logo-message-${type}`);
    }
}

function updateLogoPreview(logoUrl) {
    const imagePreview = document.getElementById("siteLogoPreview");
    const defaultPreview = document.getElementById(
        "siteLogoDefaultPreview"
    );

    if (!imagePreview || !defaultPreview) {
        return;
    }

    if (logoUrl) {
        const previewSource = logoUrl.startsWith("blob:")
            ? logoUrl
            : `${logoUrl}?v=${Date.now()}`;

        imagePreview.src = previewSource;
        imagePreview.hidden = false;
        defaultPreview.hidden = true;
        return;
    }

    imagePreview.removeAttribute("src");
    imagePreview.hidden = true;
    defaultPreview.hidden = false;
}

async function loadCurrentLogo() {
    try {
        const response = await fetch(SITE_LOGO_API, {
            method: "GET",
            headers: {
                Accept: "application/json"
            }
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "读取当前 LOGO 失败。"
            );
        }

        updateLogoPreview(result.logoUrl || null);
    } catch (error) {
        console.error("Load current logo error:", error);
        showLogoMessage(
            error.message || "读取当前 LOGO 失败。",
            "error"
        );
    }
}

async function uploadSiteLogo() {
    const fileInput = document.getElementById("siteLogoInput");
    const uploadButton = document.getElementById(
        "uploadSiteLogoBtn"
    );

    if (!fileInput || !uploadButton) {
        return;
    }

    const file = fileInput.files?.[0];

    if (!file) {
        showLogoMessage("请先选择 LOGO 图片。", "error");
        return;
    }

    if (file.size > 2 * 1024 * 1024) {
        showLogoMessage("LOGO 图片不能超过 2MB。", "error");
        return;
    }

    const allowedTypes = [
        "image/png",
        "image/jpeg",
        "image/webp"
    ];

    if (!allowedTypes.includes(file.type)) {
        showLogoMessage(
            "只允许上传 PNG、JPG、JPEG 或 WebP 图片。",
            "error"
        );
        return;
    }

    const token = getAdminToken();

    if (!token) {
        showLogoMessage(
            "管理员登录已失效，请重新登录。",
            "error"
        );
        return;
    }

    const formData = new FormData();
    formData.append("logo", file);

    uploadButton.disabled = true;
    uploadButton.textContent = "正在上传…";
    showLogoMessage("正在上传 LOGO…");

    try {
        const response = await fetch(SITE_LOGO_API, {
            method: "POST",
            headers: getAdminHeaders(),
            body: formData
        });

        const result = await response.json();

        if (
            response.status === 401 ||
            response.status === 403
        ) {
            localStorage.removeItem("adminToken");
            localStorage.removeItem("adminUser");
            localStorage.removeItem("adminLoggedIn");

            throw new Error(
                result.message || "管理员登录已失效，请重新登录。"
            );
        }

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "上传 LOGO 失败。"
            );
        }

        updateLogoPreview(result.logoUrl);
        fileInput.value = "";

        const fileNameBox = document.getElementById(
            "siteLogoFileName"
        );

        if (fileNameBox) {
            fileNameBox.textContent = "尚未选择图片";
        }

        showLogoMessage(
            result.message || "网站 LOGO 上传成功。",
            "success"
        );
    } catch (error) {
        console.error("Upload site logo error:", error);

        showLogoMessage(
            error.message || "上传 LOGO 失败。",
            "error"
        );
    } finally {
        uploadButton.disabled = false;
        uploadButton.textContent = "上传并应用";
    }
}

async function resetSiteLogo() {
    const resetButton = document.getElementById(
        "resetSiteLogoBtn"
    );

    if (!resetButton) {
        return;
    }

    const token = getAdminToken();

    if (!token) {
        showLogoMessage(
            "管理员登录已失效，请重新登录。",
            "error"
        );
        return;
    }

    const confirmed = window.confirm(
        "确定恢复默认 LOGO 吗？当前上传的 LOGO 文件将被删除。"
    );

    if (!confirmed) {
        return;
    }

    resetButton.disabled = true;
    resetButton.textContent = "正在恢复…";
    showLogoMessage("正在恢复默认 LOGO…");

    try {
        const response = await fetch(SITE_LOGO_API, {
            method: "DELETE",
            headers: {
                ...getAdminHeaders(),
                Accept: "application/json"
            }
        });

        const result = await response.json();

        if (
            response.status === 401 ||
            response.status === 403
        ) {
            localStorage.removeItem("adminToken");
            localStorage.removeItem("adminUser");
            localStorage.removeItem("adminLoggedIn");

            throw new Error(
                result.message || "管理员登录已失效，请重新登录。"
            );
        }

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "恢复默认 LOGO 失败。"
            );
        }

        updateLogoPreview(null);

        showLogoMessage(
            result.message || "已经恢复默认 LOGO。",
            "success"
        );
    } catch (error) {
        console.error("Reset site logo error:", error);

        showLogoMessage(
            error.message || "恢复默认 LOGO 失败。",
            "error"
        );
    } finally {
        resetButton.disabled = false;
        resetButton.textContent = "恢复默认 LOGO";
    }
}

document.addEventListener("DOMContentLoaded", () => {
    const categoryModal =
        document.getElementById(
            "newsCategoryModal"
        );

    const countryModal =
        document.getElementById(
            "newsCountryModal"
        );

    if (categoryModal) {
        document.body.appendChild(
            categoryModal
        );
    }

    if (countryModal) {
        document.body.appendChild(
            countryModal
        );
    }
    const fileInput = document.getElementById("siteLogoInput");
    const uploadButton = document.getElementById(
        "uploadSiteLogoBtn"
    );
    const resetButton = document.getElementById(
        "resetSiteLogoBtn"
    );
    const fileNameBox = document.getElementById(
        "siteLogoFileName"
    );

    if (fileInput && fileNameBox) {
        fileInput.addEventListener("change", () => {
            const file = fileInput.files?.[0];

            fileNameBox.textContent = file
                ? file.name
                : "尚未选择图片";

            if (file) {
                const previewUrl = URL.createObjectURL(file);
                updateLogoPreview(previewUrl);
            }
        });
    }

    if (uploadButton) {
        uploadButton.addEventListener(
            "click",
            uploadSiteLogo
        );
    }

    if (resetButton) {
        resetButton.addEventListener(
            "click",
            resetSiteLogo
        );
    }

    loadCurrentLogo();
});

/*
 * =====================================
 * 新闻分类与国家管理
 * =====================================
 */

const NEWS_METADATA_API =
    "/api/news-metadata/admin";

let newsCategoryRecords = [];
let newsCountryRecords = [];

function getMetadataAdminToken() {
    return localStorage.getItem(
        "adminToken"
    );
}

function getMetadataHeaders() {
    const token =
        getMetadataAdminToken();

    return {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization:
            `Bearer ${token}`
    };
}

function escapeMetadataHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function showMetadataMessage(
    elementId,
    message,
    type = "success"
) {
    const element =
        document.getElementById(
            elementId
        );

    if (!element) {
        return;
    }

    element.textContent =
        message || "";

    element.dataset.type =
        type;
}

async function metadataRequest(
    url,
    options = {}
) {
    const response =
        await fetch(url, {
            ...options,
            headers: {
                ...getMetadataHeaders(),
                ...(options.headers || {})
            }
        });

    let result = null;

    try {
        result =
            await response.json();
    } catch (error) {
        result = null;
    }

    if (
        response.status === 401 ||
        response.status === 403
    ) {
        localStorage.removeItem(
            "adminToken"
        );

        alert(
            result?.message ||
            "管理员登录已过期，请重新登录。"
        );

        window.location.href =
            "/admin/admin.html";

        throw new Error(
            "管理员登录已过期"
        );
    }

    if (
        !response.ok ||
        !result?.success
    ) {
        throw new Error(
            result?.message ||
            "请求失败。"
        );
    }

    return result;
}

async function loadNewsCategoriesAdmin() {
    const tableBody =
        document.getElementById(
            "newsCategoryTableBody"
        );

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = `
    <tr>
      <td colspan="7">
        正在加载新闻分类...
      </td>
    </tr>
  `;

    try {
        const result =
            await metadataRequest(
                `${NEWS_METADATA_API}/categories`
            );

        newsCategoryRecords =
            Array.isArray(
                result.categories
            )
                ? result.categories
                : [];

        renderNewsCategoryTable();
    } catch (error) {
        tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          ${escapeMetadataHtml(
            error.message
        )}
        </td>
      </tr>
    `;
    }
}

function renderNewsCategoryTable() {
    const tableBody =
        document.getElementById(
            "newsCategoryTableBody"
        );

    if (!tableBody) {
        return;
    }

    if (
        newsCategoryRecords.length === 0
    ) {
        tableBody.innerHTML = `
      <tr>
        <td colspan="7">
          暂无新闻分类
        </td>
      </tr>
    `;

        return;
    }

    tableBody.innerHTML =
        newsCategoryRecords
            .map((category) => {
                const activeText =
                    Number(category.is_active) === 1
                        ? "已启用"
                        : "已停用";

                const homeText =
                    Number(
                        category.show_in_home_nav
                    ) === 1
                        ? "显示"
                        : "隐藏";

                return `
          <tr>
            <td>
              ${escapeMetadataHtml(
                    category.sort_order
                )}
            </td>

            <td>
              ${escapeMetadataHtml(
                    category.category_code
                )}
            </td>

            <td>
              ${escapeMetadataHtml(
                    category.category_name
                )}
            </td>

            <td>
              ${escapeMetadataHtml(
                    category.category_name_en
                )}
            </td>

            <td>
              <span
                class="metadata-status"
                data-active="${Number(
                    category.is_active
                ) === 1
                    }"
              >
                ${activeText}
              </span>
            </td>

            <td>
              ${homeText}
            </td>

            <td>
              <div class="metadata-action-row">
                <button
                  type="button"
                  class="small-btn"
                  onclick="editNewsCategory(
                    ${Number(category.id)}
                  )"
                >
                  编辑
                </button>

                <button
                  type="button"
                  class="small-btn metadata-delete-btn"
                  onclick="deleteNewsCategory(
                    ${Number(category.id)}
                  )"
                >
                  删除
                </button>
              </div>
            </td>
          </tr>
        `;
            })
            .join("");
}

function showMetadataModal(modal) {
    if (!modal) {
        return;
    }

    modal.hidden = false;

    modal.style.position = "fixed";
    modal.style.inset = "0";
    modal.style.zIndex = "99999";
    modal.style.display = "flex";
    modal.style.alignItems = "center";
    modal.style.justifyContent = "center";
    modal.style.padding = "20px";
    modal.style.background = "rgba(0, 9, 20, 0.82)";

    const modalBox =
        modal.querySelector(
            ".metadata-modal"
        );

    if (modalBox) {
        modalBox.style.width =
            "min(560px, calc(100vw - 40px))";

        modalBox.style.maxHeight =
            "90vh";

        modalBox.style.overflowY =
            "auto";

        modalBox.style.border =
            "1px solid #126c99";

        modalBox.style.borderRadius =
            "12px";

        modalBox.style.background =
            "#082441";

        modalBox.style.boxShadow =
            "0 20px 70px rgba(0, 0, 0, 0.55)";
    }

    document.body.style.overflow =
        "hidden";
}

function hideMetadataModal(modal) {
    if (!modal) {
        return;
    }

    modal.hidden = true;
    modal.style.display = "none";

    document.body.style.overflow = "";
}

function openNewsCategoryModal(
    category = null
) {
    const modal =
        document.getElementById(
            "newsCategoryModal"
        );

    if (!modal) {
        return;
    }

    document.getElementById(
        "newsCategoryModalTitle"
    ).textContent =
        category
            ? "编辑新闻分类"
            : "新增新闻分类";

    document.getElementById(
        "newsCategoryId"
    ).value =
        category?.id || "";

    document.getElementById(
        "newsCategoryCode"
    ).value =
        category?.category_code || "";

    document.getElementById(
        "newsCategoryName"
    ).value =
        category?.category_name || "";

    document.getElementById(
        "newsCategoryNameEn"
    ).value =
        category?.category_name_en || "";

    document.getElementById(
        "newsCategorySortOrder"
    ).value =
        category?.sort_order ?? 0;

    document.getElementById(
        "newsCategoryIsActive"
    ).checked =
        category
            ? Number(
                category.is_active
            ) === 1
            : true;

    document.getElementById(
        "newsCategoryShowHome"
    ).checked =
        category
            ? Number(
                category.show_in_home_nav
            ) === 1
            : true;

    showMetadataModal(modal);
}

function closeNewsCategoryModal() {
    hideMetadataModal(
        document.getElementById(
            "newsCategoryModal"
        )
    );
}

window.editNewsCategory =
    function (id) {
        const category =
            newsCategoryRecords.find(
                (item) =>
                    Number(item.id) ===
                    Number(id)
            );

        if (category) {
            openNewsCategoryModal(
                category
            );
        }
    };

window.deleteNewsCategory =
    async function (id) {
        const category =
            newsCategoryRecords.find(
                (item) =>
                    Number(item.id) ===
                    Number(id)
            );

        if (!category) {
            return;
        }

        const confirmed =
            window.confirm(
                `确定删除分类“${category.category_name}”吗？`
            );

        if (!confirmed) {
            return;
        }

        try {
            const result =
                await metadataRequest(
                    `${NEWS_METADATA_API}/categories/${id}`,
                    {
                        method: "DELETE"
                    }
                );

            showMetadataMessage(
                "newsCategoryMessage",
                result.message,
                "success"
            );

            await loadNewsCategoriesAdmin();
        } catch (error) {
            showMetadataMessage(
                "newsCategoryMessage",
                error.message,
                "error"
            );
        }
    };

async function saveNewsCategory() {
    const id =
        document.getElementById(
            "newsCategoryId"
        ).value;

    const payload = {
        category_code:
            document.getElementById(
                "newsCategoryCode"
            ).value,
        category_name:
            document.getElementById(
                "newsCategoryName"
            ).value,
        category_name_en:
            document.getElementById(
                "newsCategoryNameEn"
            ).value,
        sort_order:
            document.getElementById(
                "newsCategorySortOrder"
            ).value,
        is_active:
            document.getElementById(
                "newsCategoryIsActive"
            ).checked
                ? 1
                : 0,
        show_in_home_nav:
            document.getElementById(
                "newsCategoryShowHome"
            ).checked
                ? 1
                : 0
    };

    const button =
        document.getElementById(
            "saveNewsCategoryBtn"
        );

    const originalText =
        button.textContent;

    button.disabled = true;
    button.textContent =
        "正在保存...";

    try {
        const result =
            await metadataRequest(
                id
                    ? `${NEWS_METADATA_API}/categories/${id}`
                    : `${NEWS_METADATA_API}/categories`,
                {
                    method: id
                        ? "PUT"
                        : "POST",
                    body:
                        JSON.stringify(payload)
                }
            );

        closeNewsCategoryModal();

        showMetadataMessage(
            "newsCategoryMessage",
            result.message,
            "success"
        );

        await loadNewsCategoriesAdmin();
    } catch (error) {
        showMetadataMessage(
            "newsCategoryMessage",
            error.message,
            "error"
        );

        alert(error.message);
    } finally {
        button.disabled = false;
        button.textContent =
            originalText;
    }
}

async function loadNewsCountriesAdmin() {
    const tableBody =
        document.getElementById(
            "newsCountryTableBody"
        );

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = `
    <tr>
      <td colspan="8">
        正在加载国家...
      </td>
    </tr>
  `;

    try {
        const result =
            await metadataRequest(
                `${NEWS_METADATA_API}/countries`
            );

        newsCountryRecords =
            Array.isArray(
                result.countries
            )
                ? result.countries
                : [];

        renderNewsCountryTable();
    } catch (error) {
        tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          ${escapeMetadataHtml(
            error.message
        )}
        </td>
      </tr>
    `;
    }
}

function renderNewsCountryTable() {
    const tableBody =
        document.getElementById(
            "newsCountryTableBody"
        );

    if (!tableBody) {
        return;
    }

    if (
        newsCountryRecords.length === 0
    ) {
        tableBody.innerHTML = `
      <tr>
        <td colspan="8">
          暂无国家
        </td>
      </tr>
    `;

        return;
    }

    tableBody.innerHTML =
        newsCountryRecords
            .map((country) => {
                const activeText =
                    Number(country.is_active) === 1
                        ? "已启用"
                        : "已停用";

                const homeText =
                    Number(
                        country.show_in_home_menu
                    ) === 1
                        ? "显示"
                        : "隐藏";

                return `
          <tr>
            <td>
              ${escapeMetadataHtml(
                    country.sort_order
                )}
            </td>

            <td>
              ${escapeMetadataHtml(
                    country.country_code
                )}
            </td>

            <td>
              ${escapeMetadataHtml(
                    country.country_name
                )}
            </td>

            <td>
              ${escapeMetadataHtml(
                    country.country_name_en
                )}
            </td>

            <td>
              ${escapeMetadataHtml(
                    country.region
                )}
            </td>

            <td>
              <span
                class="metadata-status"
                data-active="${Number(
                    country.is_active
                ) === 1
                    }"
              >
                ${activeText}
              </span>
            </td>

            <td>
              ${homeText}
            </td>

            <td>
              <div class="metadata-action-row">
                <button
                  type="button"
                  class="small-btn"
                  onclick="editNewsCountry(
                    ${Number(country.id)}
                  )"
                >
                  编辑
                </button>

                <button
                  type="button"
                  class="small-btn metadata-delete-btn"
                  onclick="deleteNewsCountry(
                    ${Number(country.id)}
                  )"
                >
                  删除
                </button>
              </div>
            </td>
          </tr>
        `;
            })
            .join("");
}

function openNewsCountryModal(
    country = null
) {
    const modal =
        document.getElementById(
            "newsCountryModal"
        );

    if (!modal) {
        return;
    }

    document.getElementById(
        "newsCountryModalTitle"
    ).textContent =
        country
            ? "编辑国家"
            : "新增国家";

    document.getElementById(
        "newsCountryId"
    ).value =
        country?.id || "";

    document.getElementById(
        "newsCountryCode"
    ).value =
        country?.country_code || "";

    document.getElementById(
        "newsCountryName"
    ).value =
        country?.country_name || "";

    document.getElementById(
        "newsCountryNameEn"
    ).value =
        country?.country_name_en || "";

    document.getElementById(
        "newsCountryRegion"
    ).value =
        country?.region || "";

    document.getElementById(
        "newsCountrySortOrder"
    ).value =
        country?.sort_order ?? 0;

    document.getElementById(
        "newsCountryIsActive"
    ).checked =
        country
            ? Number(
                country.is_active
            ) === 1
            : true;

    document.getElementById(
        "newsCountryShowHome"
    ).checked =
        country
            ? Number(
                country.show_in_home_menu
            ) === 1
            : true;

    showMetadataModal(modal);
}

function closeNewsCountryModal() {
    hideMetadataModal(
        document.getElementById(
            "newsCountryModal"
        )
    );
}

window.editNewsCountry =
    function (id) {
        const country =
            newsCountryRecords.find(
                (item) =>
                    Number(item.id) ===
                    Number(id)
            );

        if (country) {
            openNewsCountryModal(
                country
            );
        }
    };

window.deleteNewsCountry =
    async function (id) {
        const country =
            newsCountryRecords.find(
                (item) =>
                    Number(item.id) ===
                    Number(id)
            );

        if (!country) {
            return;
        }

        const confirmed =
            window.confirm(
                `确定删除国家“${country.country_name}”吗？`
            );

        if (!confirmed) {
            return;
        }

        try {
            const result =
                await metadataRequest(
                    `${NEWS_METADATA_API}/countries/${id}`,
                    {
                        method: "DELETE"
                    }
                );

            showMetadataMessage(
                "newsCountryMessage",
                result.message,
                "success"
            );

            await loadNewsCountriesAdmin();
        } catch (error) {
            showMetadataMessage(
                "newsCountryMessage",
                error.message,
                "error"
            );
        }
    };

async function saveNewsCountry() {
    const id =
        document.getElementById(
            "newsCountryId"
        ).value;

    const payload = {
        country_code:
            document.getElementById(
                "newsCountryCode"
            ).value,
        country_name:
            document.getElementById(
                "newsCountryName"
            ).value,
        country_name_en:
            document.getElementById(
                "newsCountryNameEn"
            ).value,
        region:
            document.getElementById(
                "newsCountryRegion"
            ).value,
        sort_order:
            document.getElementById(
                "newsCountrySortOrder"
            ).value,
        is_active:
            document.getElementById(
                "newsCountryIsActive"
            ).checked
                ? 1
                : 0,
        show_in_home_menu:
            document.getElementById(
                "newsCountryShowHome"
            ).checked
                ? 1
                : 0
    };

    const button =
        document.getElementById(
            "saveNewsCountryBtn"
        );

    const originalText =
        button.textContent;

    button.disabled = true;
    button.textContent =
        "正在保存...";

    try {
        const result =
            await metadataRequest(
                id
                    ? `${NEWS_METADATA_API}/countries/${id}`
                    : `${NEWS_METADATA_API}/countries`,
                {
                    method: id
                        ? "PUT"
                        : "POST",
                    body:
                        JSON.stringify(payload)
                }
            );

        closeNewsCountryModal();

        showMetadataMessage(
            "newsCountryMessage",
            result.message,
            "success"
        );

        await loadNewsCountriesAdmin();
    } catch (error) {
        showMetadataMessage(
            "newsCountryMessage",
            error.message,
            "error"
        );

        alert(error.message);
    } finally {
        button.disabled = false;
        button.textContent =
            originalText;
    }
}

document.addEventListener(
    "DOMContentLoaded",
    () => {
        document.getElementById(
            "addNewsCategoryBtn"
        )?.addEventListener(
            "click",
            () =>
                openNewsCategoryModal()
        );

        document.getElementById(
            "closeNewsCategoryModalBtn"
        )?.addEventListener(
            "click",
            closeNewsCategoryModal
        );

        document.getElementById(
            "saveNewsCategoryBtn"
        )?.addEventListener(
            "click",
            saveNewsCategory
        );

        document.getElementById(
            "addNewsCountryBtn"
        )?.addEventListener(
            "click",
            () =>
                openNewsCountryModal()
        );

        document.getElementById(
            "closeNewsCountryModalBtn"
        )?.addEventListener(
            "click",
            closeNewsCountryModal
        );

        document.getElementById(
            "saveNewsCountryBtn"
        )?.addEventListener(
            "click",
            saveNewsCountry
        );

        document.getElementById(
            "newsCategoryModal"
        )?.addEventListener(
            "click",
            (event) => {
                if (
                    event.target.id ===
                    "newsCategoryModal"
                ) {
                    closeNewsCategoryModal();
                }
            }
        );

        document.getElementById(
            "newsCountryModal"
        )?.addEventListener(
            "click",
            (event) => {
                if (
                    event.target.id ===
                    "newsCountryModal"
                ) {
                    closeNewsCountryModal();
                }
            }
        );

        loadNewsCategoriesAdmin();
        loadNewsCountriesAdmin();
    }
);