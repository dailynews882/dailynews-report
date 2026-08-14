const crypto = require("crypto");
const db = require("../db");
const { classifyNews } = require("../utils/newsClassifier");
const {
    reserveGNewsApiRequest,
    markGNewsApiRequestSuccess,
    markGNewsApiRequestFailed,
} = require("./gnewsApiUsageService");

const ALLOWED_CATEGORIES = new Set([
    "general",
    "world",
    "nation",
    "business",
    "technology",
    "entertainment",
    "sports",
    "science",
    "health"
]);

const ALLOWED_LANGUAGES = new Set([
    "en",
    "zh"
]);

const ALLOWED_COUNTRIES = new Set([
    "sg",
    "us",
    "cn",
    "gb",
    "my",
    "jp",
    "kr",
    "de",
    "fr",
    "it",
    "tw",
]);

const COUNTRY_METADATA = Object.freeze({
    sg: {
        name: "Singapore",
        region: "Asia",
    },
    us: {
        name: "United States",
        region: "North America",
    },
    cn: {
        name: "China",
        region: "Asia",
    },
    gb: {
        name: "United Kingdom",
        region: "Europe",
    },
    my: {
        name: "Malaysia",
        region: "Asia",
    },
    jp: {
        name: "Japan",
        region: "Asia",
    },
    kr: {
        name: "South Korea",
        region: "Asia",
    },
    de: {
        name: "Germany",
        region: "Europe",
    },
    fr: {
        name: "France",
        region: "Europe",
    },
    it: {
        name: "Italy",
        region: "Europe",
    },
    tw: {
        name: "Taiwan",
        region: "Asia",
    },
});

const ALLOWED_IMPORT_STATUSES = new Set([
    "published",
    "pending",
]);

const ALLOWED_TARGET_CATEGORIES = new Set([
    "all",
    "politics",
    "economy",
    "military",
    "crypto",
    "politics-figure",
    "semiconductor",
    "think-tank",
    "influencer",
    "energy",
    "futures",
    "precious-metals",
]);

function resolveImportStatus(value) {
    const requestedStatus = String(
        value || "published"
    )
        .trim()
        .toLowerCase();

    return ALLOWED_IMPORT_STATUSES.has(
        requestedStatus
    )
        ? requestedStatus
        : "published";
}

function resolveTargetCategory(value) {
    const requestedCategory =
        String(value || "all")
            .trim()
            .toLowerCase();

    if (
        !ALLOWED_TARGET_CATEGORIES.has(
            requestedCategory
        )
    ) {
        const error = new Error(
            "不支持该目标新闻分类"
        );

        error.statusCode = 400;
        throw error;
    }

    return requestedCategory;
}

function normalizeText(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function normalizeUrl(value) {
    const originalUrl = normalizeText(value);

    if (!originalUrl) {
        return "";
    }

    try {
        const parsedUrl = new URL(originalUrl);

        parsedUrl.hash = "";

        const trackingParameters = [
            "utm_source",
            "utm_medium",
            "utm_campaign",
            "utm_term",
            "utm_content",
            "fbclid",
            "gclid"
        ];

        trackingParameters.forEach(function (parameter) {
            parsedUrl.searchParams.delete(parameter);
        });

        return parsedUrl.toString();
    } catch (error) {
        return originalUrl;
    }
}

function clampMax(value) {
    const parsedValue = Number.parseInt(value, 10);

    if (!Number.isInteger(parsedValue)) {
        return 3;
    }

    return Math.min(
        Math.max(parsedValue, 1),
        25
    );
}

function createExternalId(originalUrl) {
    if (!originalUrl) {
        return "";
    }

    return crypto
        .createHash("sha256")
        .update(originalUrl)
        .digest("hex");
}

function resolveFilters(input = {}) {
    const requestedCategory =
        normalizeText(input.category).toLowerCase() ||
        "general";

    const requestedLanguage =
        normalizeText(input.lang).toLowerCase() ||
        "en";

    const requestedCountry =
        normalizeText(input.country).toLowerCase() ||
        "sg";

    return {
        category: ALLOWED_CATEGORIES.has(requestedCategory)
            ? requestedCategory
            : "general",

        lang: ALLOWED_LANGUAGES.has(requestedLanguage)
            ? requestedLanguage
            : "en",

        country: ALLOWED_COUNTRIES.has(requestedCountry)
            ? requestedCountry
            : "sg",

        max: clampMax(input.max)
    };
}

function normalizeArticle(article, category, status, countryCode) {
    const originalUrl = normalizeUrl(article?.url);
    const sourceName = normalizeText(article?.source?.name);
    const title = normalizeText(article?.title);
    const summary = normalizeText(article?.description);
    const apiContent = normalizeText(article?.content);

    const fetchedCountryCode =
        normalizeText(countryCode).toLowerCase();

    const fetchedCountryMetadata =
        COUNTRY_METADATA[fetchedCountryCode] || {};

    /*
     * =====================================
     * Daily News 自动分类
     * =====================================
     *
     * 不再直接把 GNews 的 category / country
     * 当成新闻真实分类和真实所属国家。
     *
     * 分类器根据：
     * title + summary + content
     *
     * 自动判断：
     * 1. Daily News 新闻分类
     * 2. 新闻主要国家
     *
     * 如果无法可靠判断国家，则继续使用
     * GNews 本次抓取使用的国家作为安全回退。
     */
    const classification = classifyNews({
        title,
        summary,
        content: apiContent
    });

    /*
     * 分类无法判断时统一进入 general。
     *
     * 不使用 GNews 自带 business / technology
     * 等分类，因为它们和 Daily News 的11个
     * 正式分类代码并不一致。
     */
    const resolvedCategory =
        normalizeText(
            classification.categoryCode
        ).toLowerCase() ||
        "general";

    /*
     * 国家能够自动识别时，优先使用真实国家。
     *
     * 无法识别时，回退到本次 GNews
     * 抓取使用的国家，避免 country_code 为空。
     */
    const resolvedCountryCode =
        normalizeText(
            classification.countryCode
        ).toLowerCase();

    const resolvedCountryName =
        normalizeText(
            classification.countryName
        );

    const resolvedRegion =
        normalizeText(
            classification.region
        );

    const resolvedStatus =
        resolveImportStatus(status);

    return {
        title,

        category: resolvedCategory,

        country_code: resolvedCountryCode,
        country_name: resolvedCountryName,
        region: resolvedRegion,

        summary,
        content: apiContent || summary || title,

        image_url: normalizeText(article?.image),
        video_url: "",

        source: sourceName || "GNews",
        author: "GNews API",

        status: resolvedStatus,

        is_vip: 0,
        views: 0,

        original_url: originalUrl,

        external_id: originalUrl
            ? createExternalId(originalUrl)
            : "",

        api_provider: "gnews",

        published_at:
            resolvedStatus === "published"
                ? normalizeText(article?.publishedAt)
                : null,

        classification: {
            category_confidence:
                classification.categoryConfidence || 0,

            category_score:
                classification.categoryScore || 0,

            country_confidence:
                classification.countryConfidence || 0,

            country_score:
                classification.countryScore || 0,

            fetched_country_code:
                fetchedCountryCode,

            original_gnews_category:
                normalizeText(category).toLowerCase()
        }
    };
}

function dbGet(sql, parameters = []) {
    return new Promise(function (resolve, reject) {
        db.get(sql, parameters, function (error, row) {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });
    });
}

function dbRun(sql, parameters = []) {
    return new Promise(function (resolve, reject) {
        db.run(
            sql,
            parameters,
            function handleResult(error) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve({
                    id: this.lastID,
                    changes: this.changes
                });
            }
        );
    });
}

async function fetchGNews(input = {}) {
    const filters = resolveFilters(input);

    const apiKey = normalizeText(
        process.env.GNEWS_API_KEY
    );

    if (!apiKey) {
        const configurationError =
            new Error(
                "GNEWS_API_KEY is not configured"
            );

        configurationError.statusCode = 500;
        throw configurationError;
    }

    const query = new URLSearchParams({
        category: filters.category,
        lang: filters.lang,
        country: filters.country,
        max: String(filters.max),
        apikey: apiKey,
    });

    const apiUrl =
        `https://gnews.io/api/v4/top-headlines?${query.toString()}`;

    /*
     * 在真正发送请求前预占一次调用额度。
     * 达到每日950次时，这里会直接抛出429，
     * 后面的 fetch 不会执行。
     */
    const reservation =
        await reserveGNewsApiRequest();

    let apiResponse = null;
    let responseData = {};
    let requestFailureRecorded = false;

    try {
        apiResponse = await fetch(apiUrl, {
            method: "GET",
            headers: {
                Accept: "application/json",
            },
            signal:
                AbortSignal.timeout(15000),
        });

        responseData =
            await apiResponse
                .json()
                .catch(function () {
                    return {};
                });

        if (!apiResponse.ok) {
            const apiError = new Error(
                responseData?.errors?.[0] ||
                responseData?.message ||
                "Failed to fetch GNews articles"
            );

            apiError.statusCode =
                apiResponse.status;

            try {
                await markGNewsApiRequestFailed({
                    usageDate:
                        reservation.usageDate,
                    statusCode:
                        apiResponse.status,
                    errorMessage:
                        apiError.message,
                });

                requestFailureRecorded = true;
            } catch (usageError) {
                console.error(
                    "Record failed GNews API request error:",
                    usageError
                );
            }

            throw apiError;
        }

        try {
            await markGNewsApiRequestSuccess({
                usageDate:
                    reservation.usageDate,
                statusCode:
                    apiResponse.status,
            });
        } catch (usageError) {
            console.error(
                "Record successful GNews API request error:",
                usageError
            );
        }

        const rawArticles =
            Array.isArray(
                responseData.articles
            )
                ? responseData.articles
                : [];

        const articles = rawArticles
            .map(function (article) {
                return normalizeArticle(
                    article,
                    filters.category,
                    input.status,
                    filters.country
                );
            })
            .filter(function (article) {
                return Boolean(
                    article.title &&
                    article.original_url
                );
            });

        return {
            filters,
            totalArticles:
                Number(
                    responseData.totalArticles
                ) || articles.length,
            articles,
        };
    } catch (error) {
        /*
         * 非成功 HTTP 响应已经在上面记录，
         * 这里不要重复增加 failed_count。
         *
         * 网络断开、DNS错误和超时会在这里记录。
         */
        if (!requestFailureRecorded) {
            try {
                await markGNewsApiRequestFailed({
                    usageDate:
                        reservation.usageDate,
                    statusCode:
                        apiResponse?.status ||
                        null,
                    errorMessage:
                        error?.name ===
                            "TimeoutError"
                            ? "GNews API request timed out"
                            : error?.message ||
                            "GNews API request failed",
                });
            } catch (usageError) {
                console.error(
                    "Record GNews API network failure error:",
                    usageError
                );
            }
        }

        throw error;
    }
}

async function previewGNews(input = {}) {
    const result = await fetchGNews(input);

    const targetCategory =
        resolveTargetCategory(
            input.targetCategory
        );

    const filteredArticles =
        targetCategory === "all"
            ? result.articles
            : result.articles.filter(
                function (article) {
                    return (
                        article.category ===
                        targetCategory
                    );
                }
            );

    return {
        ...result,
        targetCategory,
        articles: filteredArticles,
        previewCount:
            filteredArticles.length,
    };
}

function resolveImportLimit(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return Number.POSITIVE_INFINITY;
    }

    const parsedValue =
        Number.parseInt(
            value,
            10
        );

    if (
        !Number.isInteger(parsedValue) ||
        parsedValue <= 0
    ) {
        return Number.POSITIVE_INFINITY;
    }

    return parsedValue;
}

async function importGNews(input = {}) {
    const result = await fetchGNews(input);

    const targetCategory =
        resolveTargetCategory(
            input.targetCategory
        );

    const importLimit =
        resolveImportLimit(
            input.maxImports
        );

    const importedArticles = [];
    const skippedArticles = [];
    const failedArticles = [];

    const articlesToImport = [];

    for (const article of result.articles) {
        if (
            targetCategory !== "all" &&
            article.category !== targetCategory
        ) {
            skippedArticles.push({
                title: article.title,
                reason: "target_category_mismatch",
                detectedCategory:
                    article.category || "general",
                targetCategory,
            });

            continue;
        }

        articlesToImport.push(article);
    }

    const limitedArticlesToImport =
        Number.isFinite(importLimit)
            ? articlesToImport.slice(
                0,
                importLimit
            )
            : articlesToImport;

    if (
        Number.isFinite(importLimit) &&
        articlesToImport.length >
        limitedArticlesToImport.length
    ) {
        articlesToImport
            .slice(importLimit)
            .forEach(function (article) {
                skippedArticles.push({
                    title: article.title,
                    reason:
                        "import_limit_reached",
                    detectedCategory:
                        article.category ||
                        "general",
                    targetCategory,
                });
            });
    }

    for (
        const article
        of limitedArticlesToImport
    ) {
        try {
            const existingArticle = await dbGet(
                `
                    SELECT
                        id,
                        title,
                        original_url
                    FROM news
                    WHERE original_url = ?
                       OR external_id = ?
                    LIMIT 1
                `,
                [
                    article.original_url,
                    article.external_id
                ]
            );

            if (existingArticle) {
                skippedArticles.push({
                    title: article.title,
                    reason: "duplicate",
                    existingId: existingArticle.id
                });

                continue;
            }

            const insertResult = await dbRun(
                `
                    INSERT INTO news (
                        title,
                        category,
                        country_code,
                        country_name,
                        region,
                        summary,
                        content,
                        image_url,
                        video_url,
                        source,
                        author,
                        status,
                        is_vip,
                        views,
                        original_url,
                        external_id,
                        api_provider,
                        published_at
                    )
                    VALUES (
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?,
                        ?
                    )
                `,
                [
                    article.title,
                    article.category,
                    article.country_code,
                    article.country_name,
                    article.region,
                    article.summary,
                    article.content,
                    article.image_url,
                    article.video_url,
                    article.source,
                    article.author,
                    article.status,
                    article.is_vip,
                    article.views,
                    article.original_url,
                    article.external_id,
                    article.api_provider,
                    article.published_at || null
                ]
            );

            importedArticles.push({
                id: insertResult.id,
                title: article.title,
                category: article.category,
                original_url:
                    article.original_url
            });
        } catch (articleError) {
            console.error(
                "Import individual article error:",
                article.title,
                articleError
            );

            failedArticles.push({
                title: article.title,
                message:
                    articleError.message ||
                    "Unknown import error"
            });
        }
    }

    return {
        filters: result.filters,
        targetCategory,
        importLimit:
            Number.isFinite(importLimit)
                ? importLimit
                : null,
        totalArticles: result.totalArticles,
        receivedCount: result.articles.length,
        importedCount: importedArticles.length,
        skippedCount: skippedArticles.length,
        failedCount: failedArticles.length,
        imported: importedArticles,
        skipped: skippedArticles,
        failed: failedArticles
    };
}

function getErrorStatusCode(error) {
    if (error?.name === "TimeoutError") {
        return 504;
    }

    return Number(error?.statusCode) || 500;
}

function getErrorMessage(error, fallbackMessage) {
    if (error?.name === "TimeoutError") {
        return "GNews API request timed out";
    }

    return error?.message || fallbackMessage;
}

module.exports = {
    resolveFilters,
    previewGNews,
    importGNews,
    getErrorStatusCode,
    getErrorMessage
};