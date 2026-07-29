const ADMIN_NEWS_API = "/api/news";

const GNEWS_AUTO_FETCH_CONFIG_API =
    "/api/site-settings/gnews-auto-fetch";

let adminNewsRecords = [];

document.addEventListener("DOMContentLoaded", function () {
    loadAdminNewsRecords();
    initializeGNewsAutoFetchConfig();
});

async function loadAdminNewsRecords() {
    const tableBody = document.getElementById("adminNewsTableBody");

    if (!tableBody) {
        console.error("找不到 adminNewsTableBody");
        return;
    }

    tableBody.innerHTML = `
        <tr>
            <td colspan="8" class="admin-news-loading">
                正在加载真实新闻数据……
            </td>
        </tr>
    `;

    try {
        const response = await fetch(ADMIN_NEWS_API, {
            method: "GET",
            headers: {
                Accept: "application/json"
            },
            cache: "no-store"
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "获取新闻列表失败"
            );
        }

        adminNewsRecords = Array.isArray(result.data)
            ? result.data
            : [];

        renderAdminNewsRecords(adminNewsRecords);
        updateAdminNewsStatistics(adminNewsRecords);
    } catch (error) {
        console.error("加载后台新闻失败：", error);

        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="admin-news-loading">
                    加载新闻失败：${escapeAdminNewsHtml(error.message)}
                </td>
            </tr>
        `;
    }
}

function renderAdminNewsRecords(records) {
    const tableBody = document.getElementById("adminNewsTableBody");

    if (!tableBody) {
        return;
    }

    tableBody.innerHTML = "";

    if (!records.length) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="admin-news-loading">
                    当前数据库中没有新闻。
                </td>
            </tr>
        `;
        return;
    }

    records.forEach(function (news) {
        const row = document.createElement("tr");

        const status = String(news.status || "draft").toLowerCase();
        const hasSummary = Boolean(
            String(news.summary || "").trim()
        );

        row.dataset.newsId = String(news.id);
        row.dataset.status = status;
        row.dataset.ai = hasSummary
            ? "generated"
            : "not_generated";

        const statusLabel = getAdminNewsStatusLabel(status);
        const statusClass = getAdminNewsStatusClass(status);
        const apiLabel = getAdminNewsApiLabel(news);
        const publishedTime = formatAdminNewsDate(
            news.published_at || news.created_at
        );

        row.innerHTML = `
            <td>${escapeAdminNewsHtml(news.id)}</td>

            <td class="admin-news-title-cell">
                ${escapeAdminNewsHtml(news.title || "未命名新闻")}
            </td>

            <td>
                ${escapeAdminNewsHtml(news.category || "general")}
            </td>

            <td class="admin-news-source-cell">
                <span
                    class="admin-news-source-text"
                    title="${escapeAdminNewsHtml(news.source || "DailyNews")}"
                >
                    ${escapeAdminNewsHtml(news.source || "DailyNews")}
                </span>
            </td>

            <td>
                <span class="status ${hasSummary ? "vip" : "banned"
            }">
                    ${apiLabel}
                </span>
            </td>

            <td>
                <span class="status ${statusClass}">
                    ${statusLabel}
                </span>
            </td>

            <td>
                ${escapeAdminNewsHtml(publishedTime)}
            </td>

            <td class="admin-news-actions">
                <button
                    type="button"
                    class="table-btn"
                    onclick="viewRealNews(${Number(news.id)})"
                >
                    查看
                </button>

                <a
                    class="table-btn"
                    href="./news-edit.html?id=${encodeURIComponent(news.id)}"
                >
                    编辑
                </a>

                <button
                    type="button"
                    class="table-btn danger"
                    onclick="deleteRealNews(${Number(news.id)})"
                >
                    删除
                </button>
            </td>
        `;

        tableBody.appendChild(row);
    });
}

function updateAdminNewsStatistics(records) {
    const totalElement =
        document.getElementById("newsTotalCount");

    const todayElement =
        document.getElementById("newsTodayCount");

    const apiElement =
        document.getElementById("newsApiCount");

    const pendingElement =
        document.getElementById("newsPendingCount");

    const todayKey = getLocalDateKey(new Date());

    const todayCount = records.filter(function (news) {
        if (!news.created_at) {
            return false;
        }

        const createdDate = new Date(news.created_at);

        if (Number.isNaN(createdDate.getTime())) {
            return false;
        }

        return getLocalDateKey(createdDate) === todayKey;
    }).length;

    const apiCount = records.filter(function (news) {
        return (
            String(news.api_provider || "").toLowerCase() === "gnews" ||
            String(news.author || "").toLowerCase().includes("gnews")
        );
    }).length;

    const pendingCount = records.filter(function (news) {
        return String(news.status || "").toLowerCase() === "pending";
    }).length;

    if (totalElement) {
        totalElement.textContent = String(records.length);
    }

    if (todayElement) {
        todayElement.textContent = String(todayCount);
    }

    if (apiElement) {
        apiElement.textContent = String(apiCount);
    }

    if (pendingElement) {
        pendingElement.textContent = String(pendingCount);
    }
}

window.filterNewsRecords = function () {
    const searchInput =
        document.getElementById("newsSearchInput");

    const statusFilter =
        document.getElementById("newsStatusFilter");

    const aiFilter =
        document.getElementById("newsAiFilter");

    const keyword = String(
        searchInput?.value || ""
    ).trim().toLowerCase();

    const selectedStatus =
        statusFilter?.value || "all";

    const selectedAi =
        aiFilter?.value || "all";

    const filteredRecords = adminNewsRecords.filter(function (news) {
        const searchableText = [
            news.title,
            news.category,
            news.source,
            news.author
        ]
            .map(function (value) {
                return String(value || "").toLowerCase();
            })
            .join(" ");

        const newsStatus =
            String(news.status || "draft").toLowerCase();

        const newsAi = String(news.summary || "").trim()
            ? "generated"
            : "not_generated";

        const matchesKeyword =
            !keyword || searchableText.includes(keyword);

        const matchesStatus =
            selectedStatus === "all" ||
            newsStatus === selectedStatus;

        const matchesAi =
            selectedAi === "all" ||
            newsAi === selectedAi;

        return (
            matchesKeyword &&
            matchesStatus &&
            matchesAi
        );
    });

    renderAdminNewsRecords(filteredRecords);
};

window.viewRealNews = function (newsId) {
    const news = adminNewsRecords.find(function (item) {
        return Number(item.id) === Number(newsId);
    });

    if (!news) {
        alert("没有找到这条新闻。");
        return;
    }

    const modal = document.getElementById("newsModal");
    const modalContent =
        document.getElementById("newsModalContent");

    if (!modal || !modalContent) {
        window.location.href =
            `../public/news-detail.html?id=${encodeURIComponent(newsId)}`;
        return;
    }

    modalContent.innerHTML = `
        <p><strong>新闻ID：</strong>${escapeAdminNewsHtml(news.id)}</p>
        <p><strong>标题：</strong>${escapeAdminNewsHtml(news.title)}</p>
        <p><strong>分类：</strong>${escapeAdminNewsHtml(news.category)}</p>
        <p><strong>来源：</strong>${escapeAdminNewsHtml(news.source)}</p>
        <p><strong>作者：</strong>${escapeAdminNewsHtml(news.author)}</p>
        <p><strong>状态：</strong>${escapeAdminNewsHtml(news.status)}</p>
        <p><strong>发布时间：</strong>${escapeAdminNewsHtml(
        formatAdminNewsDate(news.published_at || news.created_at)
    )}</p>
        <p><strong>摘要：</strong></p>
        <p>${escapeAdminNewsHtml(news.summary || "暂无摘要")}</p>
    `;

    modal.style.display = "flex";
};

window.deleteRealNews = async function (newsId) {
    const news = adminNewsRecords.find(function (item) {
        return Number(item.id) === Number(newsId);
    });

    if (!news) {
        alert("没有找到这条新闻。");
        return;
    }

    const confirmed = confirm(
        `确定要删除这条新闻吗？\n\n${news.title}`
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            `${ADMIN_NEWS_API}/${encodeURIComponent(newsId)}`,
            {
                method: "DELETE",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "删除新闻失败"
            );
        }

        alert("新闻删除成功。");
        await loadAdminNewsRecords();
    } catch (error) {
        console.error("删除新闻失败：", error);
        alert(`删除失败：${error.message}`);
    }
};

function getAdminNewsApiLabel(news) {
    const provider =
        String(news.api_provider || "").toLowerCase();

    const author =
        String(news.author || "").toLowerCase();

    if (provider === "gnews" || author.includes("gnews")) {
        return "API导入";
    }

    if (String(news.summary || "").trim()) {
        return "已有摘要";
    }

    return "未生成";
}

function getAdminNewsStatusLabel(status) {
    const labels = {
        published: "已发布",
        pending: "待审核",
        draft: "草稿",
        unpublished: "未发布",
        hidden: "已隐藏"
    };

    return labels[status] || status || "未知";
}

function getAdminNewsStatusClass(status) {
    if (status === "published") {
        return "vip";
    }

    if (status === "pending" || status === "draft") {
        return "normal";
    }

    return "banned";
}

function formatAdminNewsDate(value) {
    if (!value) {
        return "—";
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    });
}

function getLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function escapeAdminNewsHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function getGNewsAutoFetchElements() {
    return {
        enabled:
            document.getElementById("gnewsAutoEnabled"),

        interval:
            document.getElementById("gnewsAutoInterval"),

        max:
            document.getElementById("gnewsAutoMax"),

        category:
            document.getElementById("gnewsAutoCategory"),

        language:
            document.getElementById("gnewsAutoLanguage"),

        country:
            document.getElementById("gnewsAutoCountry"),

        status:
            document.getElementById(
                "gnewsAutoPublishStatus"
            ),

        saveButton:
            document.getElementById(
                "gnewsAutoSaveButton"
            ),

        message:
            document.getElementById(
                "gnewsAutoMessage"
            ),

        statusBadge:
            document.getElementById(
                "gnewsAutoStatusBadge"
            ),
    };
}

function setGNewsAutoMessage(
    message,
    type = "normal"
) {
    const { message: messageBox } =
        getGNewsAutoFetchElements();

    if (!messageBox) {
        return;
    }

    messageBox.textContent = message || "";

    if (type === "normal") {
        delete messageBox.dataset.type;
        return;
    }

    messageBox.dataset.type = type;
}

function updateGNewsAutoStatusBadge(enabled) {
    const { statusBadge } =
        getGNewsAutoFetchElements();

    if (!statusBadge) {
        return;
    }

    const isEnabled = Boolean(enabled);

    statusBadge.dataset.enabled =
        isEnabled ? "true" : "false";

    statusBadge.textContent =
        isEnabled
            ? "自动抓取已启用"
            : "自动抓取已关闭";
}

function setGNewsAutoFormDisabled(disabled) {
    const elements = getGNewsAutoFetchElements();

    [
        elements.enabled,
        elements.interval,
        elements.max,
        elements.category,
        elements.language,
        elements.country,
        elements.status,
        elements.saveButton,
    ].forEach(function (element) {
        if (element) {
            element.disabled = Boolean(disabled);
        }
    });
}

function applyGNewsAutoFetchConfig(config = {}) {
    const elements = getGNewsAutoFetchElements();

    const enabled =
        config.enabled === true;

    if (elements.enabled) {
        elements.enabled.checked = enabled;
    }

    if (elements.interval) {
        elements.interval.value = String(
            config.intervalMinutes ?? 15
        );
    }

    if (elements.max) {
        elements.max.value = String(
            config.max ?? 25
        );
    }

    if (elements.category) {
        elements.category.value =
            config.category || "general";
    }

    if (elements.language) {
        elements.language.value =
            config.language || "en";
    }

    if (elements.country) {
        elements.country.value =
            config.country || "sg";
    }

    if (elements.status) {
        elements.status.value =
            config.status || "published";
    }

    updateGNewsAutoStatusBadge(enabled);
}

function getGNewsAutoFetchFormConfig() {
    const elements = getGNewsAutoFetchElements();

    return {
        enabled:
            Boolean(elements.enabled?.checked),

        intervalMinutes:
            Number.parseInt(
                elements.interval?.value || "15",
                10
            ),

        max:
            Number.parseInt(
                elements.max?.value || "25",
                10
            ),

        category:
            elements.category?.value ||
            "general",

        language:
            elements.language?.value ||
            "en",

        country:
            elements.country?.value ||
            "sg",

        status:
            elements.status?.value ||
            "published",
    };
}

async function loadGNewsAutoFetchConfig() {
    setGNewsAutoFormDisabled(true);

    setGNewsAutoMessage(
        "正在读取自动抓取配置……",
        "loading"
    );

    try {
        const response = await fetch(
            GNEWS_AUTO_FETCH_CONFIG_API,
            {
                method: "GET",
                headers:
                    getAdminAuthorizationHeaders(),
                cache: "no-store",
            }
        );

        const result =
            await response.json().catch(function () {
                return {};
            });

        if (!response.ok || !result.success) {
            throw new Error(
                result.message ||
                "读取自动抓取配置失败"
            );
        }

        applyGNewsAutoFetchConfig(
            result.config || {}
        );

        setGNewsAutoMessage(
            "自动抓取配置读取成功。",
            "success"
        );
    } catch (error) {
        console.error(
            "读取自动抓取配置失败：",
            error
        );

        setGNewsAutoMessage(
            `读取配置失败：${error.message}`,
            "error"
        );
    } finally {
        setGNewsAutoFormDisabled(false);
    }
}

async function saveGNewsAutoFetchConfig() {
    const config =
        getGNewsAutoFetchFormConfig();

    setGNewsAutoFormDisabled(true);

    setGNewsAutoMessage(
        "正在保存自动抓取配置……",
        "loading"
    );

    try {
        const response = await fetch(
            GNEWS_AUTO_FETCH_CONFIG_API,
            {
                method: "PUT",
                headers: {
                    ...getAdminAuthorizationHeaders(),
                    "Content-Type":
                        "application/json",
                },
                body: JSON.stringify(config),
            }
        );

        const result =
            await response.json().catch(function () {
                return {};
            });

        if (!response.ok || !result.success) {
            throw new Error(
                result.message ||
                "保存自动抓取配置失败"
            );
        }

        applyGNewsAutoFetchConfig(
            result.config || config
        );

        setGNewsAutoMessage(
            result.message ||
            "自动抓取配置保存成功。",
            "success"
        );
    } catch (error) {
        console.error(
            "保存自动抓取配置失败：",
            error
        );

        setGNewsAutoMessage(
            `保存失败：${error.message}`,
            "error"
        );
    } finally {
        setGNewsAutoFormDisabled(false);
    }
}

function initializeGNewsAutoFetchConfig() {
    const elements = getGNewsAutoFetchElements();

    if (
        !elements.enabled ||
        !elements.saveButton
    ) {
        console.error(
            "找不到 GNews 自动抓取配置区域。"
        );
        return;
    }

    elements.enabled.addEventListener(
        "change",
        function () {
            updateGNewsAutoStatusBadge(
                elements.enabled.checked
            );

            setGNewsAutoMessage(
                "配置尚未保存，请点击“保存自动抓取配置”。",
                "warning"
            );
        }
    );

    elements.saveButton.addEventListener(
        "click",
        saveGNewsAutoFetchConfig
    );

    loadGNewsAutoFetchConfig();
}

function getGNewsRequestSettings() {
    return {
        category:
            document.getElementById("gnewsCategory")?.value ||
            "general",

        lang:
            document.getElementById("gnewsLanguage")?.value ||
            "en",

        country:
            document.getElementById("gnewsCountry")?.value ||
            "sg",

        max:
            document.getElementById("gnewsMax")?.value ||
            "3"
    };
}

function buildGNewsQueryString(settings) {
    return new URLSearchParams({
        category: settings.category,
        lang: settings.lang,
        country: settings.country,
        max: settings.max
    }).toString();
}

function getAdminAuthorizationHeaders() {
    const adminToken = localStorage.getItem("adminToken");

    if (!adminToken) {
        throw new Error("管理员登录已失效，请重新登录。");
    }

    return {
        Accept: "application/json",
        Authorization: `Bearer ${adminToken}`
    };
}

function setGNewsMessage(message, type = "normal") {
    const messageBox =
        document.getElementById("gnewsImportMessage");

    if (!messageBox) {
        return;
    }

    messageBox.textContent = message;
    messageBox.dataset.type = type;
}

function setGNewsButtonsDisabled(disabled) {
    const previewButton =
        document.getElementById("gnewsPreviewButton");

    const importButton =
        document.getElementById("gnewsImportButton");

    if (previewButton) {
        previewButton.disabled = disabled;
    }

    if (importButton) {
        importButton.disabled = disabled;
    }
}

window.previewGNewsArticles = async function () {
    const previewBox =
        document.getElementById("gnewsPreviewBox");

    const previewList =
        document.getElementById("gnewsPreviewList");

    const previewCount =
        document.getElementById("gnewsPreviewCount");

    if (!previewBox || !previewList || !previewCount) {
        alert("找不到 GNews 预览区域，请检查页面代码。");
        return;
    }

    setGNewsButtonsDisabled(true);
    setGNewsMessage("正在从 GNews 获取新闻预览……", "loading");

    previewBox.hidden = false;
    previewCount.textContent = "正在加载";
    previewList.innerHTML = `
        <div class="gnews-preview-empty">
            正在获取新闻，请稍候……
        </div>
    `;

    try {
        const settings = getGNewsRequestSettings();
        const queryString = buildGNewsQueryString(settings);

        const response = await fetch(
            `/api/admin/news-import/preview?${queryString}`,
            {
                method: "GET",
                headers: getAdminAuthorizationHeaders(),
                cache: "no-store"
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "获取 GNews 新闻预览失败"
            );
        }

        const articles = Array.isArray(result.data)
            ? result.data
            : [];

        previewCount.textContent = `${articles.length} 条`;
        previewList.innerHTML = "";

        if (!articles.length) {
            previewList.innerHTML = `
                <div class="gnews-preview-empty">
                    当前条件下没有获取到新闻。
                </div>
            `;

            setGNewsMessage(
                "请求成功，但没有符合条件的新闻。",
                "warning"
            );

            return;
        }

        articles.forEach(function (article, index) {
            const item = document.createElement("article");
            item.className = "gnews-preview-item";

            item.innerHTML = `
                <div class="gnews-preview-number">
                    ${index + 1}
                </div>

                <div class="gnews-preview-content">
                    <h4>
                        ${escapeAdminNewsHtml(
                article.title || "未命名新闻"
            )}
                    </h4>

                    <p class="gnews-preview-meta">
                        来源：
                        ${escapeAdminNewsHtml(
                article.source || "GNews"
            )}
                        · 发布时间：
                        ${escapeAdminNewsHtml(
                formatAdminNewsDate(
                    article.published_at
                )
            )}
                    </p>

                    <p class="gnews-preview-summary">
                        ${escapeAdminNewsHtml(
                article.summary || "暂无摘要"
            )}
                    </p>
                </div>
            `;

            previewList.appendChild(item);
        });

        setGNewsMessage(
            `预览成功，共获取 ${articles.length} 条新闻。`,
            "success"
        );
    } catch (error) {
        console.error("预览 GNews 新闻失败：", error);

        previewCount.textContent = "0 条";
        previewList.innerHTML = `
            <div class="gnews-preview-empty">
                ${escapeAdminNewsHtml(error.message)}
            </div>
        `;

        setGNewsMessage(
            `预览失败：${error.message}`,
            "error"
        );
    } finally {
        setGNewsButtonsDisabled(false);
    }
};

window.importGNewsArticles = async function () {
    const settings = getGNewsRequestSettings();

    const confirmed = confirm(
        `确定导入 GNews 新闻吗？\n\n` +
        `分类：${settings.category}\n` +
        `语言：${settings.lang}\n` +
        `国家或地区：${settings.country}\n` +
        `最多导入：${settings.max} 条`
    );

    if (!confirmed) {
        return;
    }

    setGNewsButtonsDisabled(true);
    setGNewsMessage(
        "正在获取并导入 GNews 新闻，请稍候……",
        "loading"
    );

    try {
        const queryString = buildGNewsQueryString(settings);

        const response = await fetch(
            `/api/admin/news-import/import?${queryString}`,
            {
                method: "POST",
                headers: {
                    ...getAdminAuthorizationHeaders(),
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({})
            }
        );

        const result = await response.json();

        if (!response.ok || !result.success) {
            throw new Error(
                result.message || "导入 GNews 新闻失败"
            );
        }

        const importedCount =
            Number(result.importedCount) || 0;

        const skippedCount =
            Number(result.skippedCount) || 0;

        const failedCount =
            Number(result.failedCount) || 0;

        setGNewsMessage(
            `导入完成：新增 ${importedCount} 条，` +
            `跳过重复 ${skippedCount} 条，` +
            `失败 ${failedCount} 条。`,
            failedCount > 0 ? "warning" : "success"
        );

        alert(
            `GNews 导入完成\n\n` +
            `新增：${importedCount} 条\n` +
            `重复跳过：${skippedCount} 条\n` +
            `失败：${failedCount} 条`
        );

        await loadAdminNewsRecords();
    } catch (error) {
        console.error("导入 GNews 新闻失败：", error);

        setGNewsMessage(
            `导入失败：${error.message}`,
            "error"
        );

        alert(`导入失败：${error.message}`);
    } finally {
        setGNewsButtonsDisabled(false);
    }
};