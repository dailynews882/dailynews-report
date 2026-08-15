const ADMIN_NEWS_API = "/api/news";

const GNEWS_AUTO_FETCH_CONFIG_API =
    "/api/site-settings/gnews-auto-fetch";

const GNEWS_AUTO_FETCH_STATUS_API =
    "/api/site-settings/gnews-auto-fetch/status";

const GNEWS_AUTO_FETCH_RUN_API =
    "/api/site-settings/gnews-auto-fetch/run";

let adminNewsRecords = [];

const DAILY_NEWS_MANUAL_CATEGORIES = [
    { value: "all", label: "全部 / 自动分类" },
    { value: "politics", label: "政治" },
    { value: "economy", label: "经济" },
    { value: "military", label: "军事/战争" },
    { value: "crypto", label: "数字货币" },
    { value: "politics-figure", label: "政要人物" },
    { value: "semiconductor", label: "半导体" },
    { value: "think-tank", label: "智库/论坛" },
    { value: "influencer", label: "大V博主" },
    { value: "energy", label: "能源" },
    { value: "futures", label: "期货" },
    { value: "precious-metals", label: "黄金/白银" },
];

const MANUAL_TARGET_TO_GNEWS_CATEGORY =
    Object.freeze({
        all: "general",
        politics: "world",
        economy: "business",
        military: "world",
        crypto: "business",
        "politics-figure": "world",
        semiconductor: "technology",
        "think-tank": "world",
        influencer: "general",
        energy: "business",
        futures: "business",
        "precious-metals": "business",
    });

document.addEventListener("DOMContentLoaded", function () {
    initializeManualGNewsCategoryOptions();
    loadAdminNewsRecords();
    initializeGNewsAutoFetchConfig();

    const refreshStatusButton =
        document.getElementById(
            "gnewsAutoRefreshStatusButton"
        );

    const runNowButton =
        document.getElementById(
            "gnewsAutoRunNowButton"
        );

    if (refreshStatusButton) {
        refreshStatusButton.addEventListener(
            "click",
            loadGNewsAutoFetchStatus
        );
    }

    if (runNowButton) {
        runNowButton.addEventListener(
            "click",
            runGNewsAutoFetchNow
        );
    }

    loadGNewsAutoFetchStatus();
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

                ${status !== "published"
                ? `
                        <button
                          type="button"
                          class="table-btn publish"
                          onclick="publishRealNews(${Number(news.id)})"
                        >
                          发布
                        </button>
                      `
                : ""
            }

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
    
    <div class="admin-news-modal-actions">
      ${String(news.status || "").toLowerCase() !==
            "published"
            ? `
            <button
              type="button"
              class="table-btn publish"
              onclick="publishRealNews(${Number(news.id)})"
            >
              发布新闻
            </button>
          `
            : `
            <button
              type="button"
              class="table-btn published-disabled"
              disabled
            >
              新闻已发布
            </button>
          `
        }
    </div>
    `;

    modal.style.display = "flex";
};

window.publishRealNews = async function (newsId) {
    const news = adminNewsRecords.find(function (item) {
        return Number(item.id) === Number(newsId);
    });

    if (!news) {
        alert("没有找到这条新闻。");
        return;
    }

    if (
        String(news.status || "").toLowerCase() ===
        "published"
    ) {
        alert("这条新闻已经发布。");
        return;
    }

    const confirmed = confirm(
        `确定发布这条新闻吗？\n\n${news.title}`
    );

    if (!confirmed) {
        return;
    }

    try {
        const response = await fetch(
            `${ADMIN_NEWS_API}/${encodeURIComponent(
                newsId
            )}/publish`,
            {
                method: "PATCH",
                headers:
                    getAdminAuthorizationHeaders(),
            }
        );

        const result =
            await response
                .json()
                .catch(function () {
                    return {};
                });

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "发布新闻失败"
            );
        }

        alert("新闻发布成功。");

        await loadAdminNewsRecords();
    } catch (error) {
        console.error(
            "发布新闻失败：",
            error
        );

        alert(
            `发布失败：${error.message}`
        );
    }
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

function setGNewsAutoRunMessage(
    message,
    type = "normal"
) {
    const messageBox =
        document.getElementById(
            "gnewsAutoRunMessage"
        );

    if (!messageBox) {
        return;
    }

    messageBox.textContent =
        message || "";

    messageBox.dataset.type = type;
}

function formatGNewsSchedulerDate(
    value
) {
    if (!value) {
        return "--";
    }

    const date = new Date(value);

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return "--";
    }

    return date.toLocaleString(
        "zh-CN",
        {
            hour12: false,
        }
    );
}

function renderGNewsAutoFetchStatus(
    result
) {
    const scheduler =
        result?.scheduler || {};

    const apiUsage =
        result?.apiUsage || {};

    const schedulerState =
        document.getElementById(
            "gnewsAutoSchedulerState"
        );

    const nextRunAt =
        document.getElementById(
            "gnewsAutoNextRunAt"
        );

    const lastRunAt =
        document.getElementById(
            "gnewsAutoLastRunAt"
        );

    const lastResult =
        document.getElementById(
            "gnewsAutoLastResult"
        );

    const apiUsed =
        document.getElementById(
            "gnewsAutoApiUsed"
        );

    const apiRemaining =
        document.getElementById(
            "gnewsAutoApiRemaining"
        );

    const apiSuccess =
        document.getElementById(
            "gnewsAutoApiSuccess"
        );

    const apiFailed =
        document.getElementById(
            "gnewsAutoApiFailed"
        );

    if (schedulerState) {
        if (!scheduler.started) {
            schedulerState.textContent =
                "未启动";
        } else if (
            scheduler.runnerLocked
        ) {
            schedulerState.textContent =
                "正在执行";
        } else if (
            scheduler.timerActive
        ) {
            schedulerState.textContent =
                "等待下一次运行";
        } else {
            schedulerState.textContent =
                "已启动";
        }
    }

    if (nextRunAt) {
        nextRunAt.textContent =
            formatGNewsSchedulerDate(
                scheduler.nextRunAt
            );
    }

    if (lastRunAt) {
        lastRunAt.textContent =
            formatGNewsSchedulerDate(
                scheduler.lastRunAt
            );
    }

    if (lastResult) {
        if (!scheduler.lastResult) {
            lastResult.textContent =
                "暂无运行记录";
        } else if (
            scheduler.lastResult.success
        ) {
            lastResult.textContent =
                scheduler.lastResult.skipped
                    ? "已跳过"
                    : "执行成功";
        } else {
            lastResult.textContent =
                "执行失败";
        }
    }

    if (apiUsed) {
        apiUsed.textContent =
            String(
                apiUsage.requestCount || 0
            );
    }

    if (apiRemaining) {
        apiRemaining.textContent =
            String(
                apiUsage.remaining ?? 0
            );
    }

    if (apiSuccess) {
        apiSuccess.textContent =
            String(
                apiUsage.successCount || 0
            );
    }

    if (apiFailed) {
        apiFailed.textContent =
            String(
                apiUsage.failedCount || 0
            );
    }
}

async function loadGNewsAutoFetchStatus(options = {}) {
    const silent =
        options.silent === true;

    const refreshButton =
        document.getElementById(
            "gnewsAutoRefreshStatusButton"
        );

    if (refreshButton) {
        refreshButton.disabled = true;
    }

    if (!silent) {
        setGNewsAutoRunMessage(
            "正在读取运行状态……",
            "normal"
        );
    }

    try {
        const response = await fetch(
            GNEWS_AUTO_FETCH_STATUS_API,
            {
                method: "GET",
                headers:
                    getAdminAuthorizationHeaders(),
                cache: "no-store",
            }
        );

        const result =
            await response
                .json()
                .catch(function () {
                    return {};
                });

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "读取自动抓取状态失败"
            );
        }

        renderGNewsAutoFetchStatus(
            result
        );

        if (!silent) {
            setGNewsAutoRunMessage(
                "运行状态读取成功。",
                "success"
            );
        }

        return result;
    } catch (error) {
        console.error(
            "读取自动抓取状态失败：",
            error
        );

        setGNewsAutoRunMessage(
            `读取状态失败：${error.message}`,
            "error"
        );

        return null;
    } finally {
        if (refreshButton) {
            refreshButton.disabled =
                false;
        }
    }
}

async function runGNewsAutoFetchNow() {
    const runButton =
        document.getElementById(
            "gnewsAutoRunNowButton"
        );

    const confirmed = confirm(
        "确定立即执行一次 GNews 自动抓取吗？\n\n" +
        "根据所选 Daily News 分类，系统可能调用多个 GNews 抓取入口。"
    );

    if (!confirmed) {
        return;
    }

    if (runButton) {
        runButton.disabled = true;
    }

    setGNewsAutoRunMessage(
        "正在执行 GNews 自动抓取，请稍候……",
        "warning"
    );

    try {
        const response = await fetch(
            GNEWS_AUTO_FETCH_RUN_API,
            {
                method: "POST",
                headers:
                    getAdminAuthorizationHeaders(),
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
                "自动抓取执行失败"
            );
        }

        const runResult =
            result.result || {};

        setGNewsAutoRunMessage(
            `执行完成：收到 ${runResult.receivedCount || 0
            } 条，新增 ${runResult.importedCount || 0
            } 条，跳过 ${runResult.skippedCount || 0
            } 条，失败 ${runResult.failedCount || 0
            } 条。`,
            runResult.failedCount > 0
                ? "warning"
                : "success"
        );

        await loadGNewsAutoFetchStatus({
            silent: true,
        });

        if (
            typeof loadAdminNewsRecords ===
            "function"
        ) {
            await loadAdminNewsRecords();
        }
    } catch (error) {
        console.error(
            "立即执行自动抓取失败：",
            error
        );

        setGNewsAutoRunMessage(
            `执行失败：${error.message}`,
            "error"
        );
    } finally {
        if (runButton) {
            runButton.disabled = false;
        }
    }

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
            config.category || "all";
    }

    if (elements.language) {
        elements.language.value =
            config.language || "en";
    }

    if (elements.country) {
        elements.country.value =
            config.country || "all";
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
            "all",

        language:
            elements.language?.value ||
            "en",

        country:
            elements.country?.value ||
            "all",

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

function initializeManualGNewsCategoryOptions() {
    const categorySelect =
        document.getElementById(
            "gnewsCategory"
        );

    if (!categorySelect) {
        return;
    }

    const currentValue =
        String(
            categorySelect.value || "all"
        ).trim();

    categorySelect.innerHTML = "";

    DAILY_NEWS_MANUAL_CATEGORIES.forEach(
        function (category) {
            const option =
                document.createElement(
                    "option"
                );

            option.value =
                category.value;

            option.textContent =
                category.label;

            categorySelect.appendChild(
                option
            );
        }
    );

    const canKeepCurrentValue =
        DAILY_NEWS_MANUAL_CATEGORIES.some(
            function (category) {
                return (
                    category.value ===
                    currentValue
                );
            }
        );

    categorySelect.value =
        canKeepCurrentValue
            ? currentValue
            : "all";
}

function getManualGNewsCategoryLabel(
    value
) {
    const category =
        DAILY_NEWS_MANUAL_CATEGORIES.find(
            function (item) {
                return (
                    item.value === value
                );
            }
        );

    return category
        ? category.label
        : value;
}

function getGNewsRequestSettings() {
    const targetCategory =
        document.getElementById(
            "gnewsCategory"
        )?.value || "all";

    const gnewsCategory =
        MANUAL_TARGET_TO_GNEWS_CATEGORY[
        targetCategory
        ] || "general";

    return {
        targetCategory,

        category:
            gnewsCategory,

        lang:
            document.getElementById(
                "gnewsLanguage"
            )?.value || "en",

        country:
            document.getElementById(
                "gnewsCountry"
            )?.value || "all",

        max:
            document.getElementById(
                "gnewsMax"
            )?.value || "3",

        status:
            document.getElementById(
                "gnewsImportStatus"
            )?.value || "pending"
    };
}

function buildGNewsQueryString(settings) {
    return new URLSearchParams({
        targetCategory:
            settings.targetCategory,

        category:
            settings.category,

        lang:
            settings.lang,

        country:
            settings.country,

        max:
            settings.max,

        status:
            settings.status
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
                        · 分类：
                        ${escapeAdminNewsHtml(
                article.category || "general"
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

function getManualGNewsImportStatusLabel(
    value
) {
    return value === "published"
        ? "自动直接发布"
        : "导入后进入待审核";
}

window.importGNewsArticles = async function () {
    const settings = getGNewsRequestSettings();

    const confirmed = confirm(
        `确定导入 GNews 新闻吗？\n\n` +
        `Daily News 分类：${getManualGNewsCategoryLabel(
            settings.targetCategory
        )}\n` +
        `GNews 内部抓取入口：${settings.category}\n` +
        `语言：${settings.lang}\n` +
        `国家或地区：${settings.country}\n` +
        `最多导入：${settings.max} 条\n` +
        `导入后状态：${getManualGNewsImportStatusLabel(
            settings.status
        )}`
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