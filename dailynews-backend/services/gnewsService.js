const crypto = require("crypto");
const db = require("../db");

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
    "my"
]);

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

function normalizeArticle(article, category) {
    const originalUrl = normalizeUrl(article?.url);
    const sourceName = normalizeText(article?.source?.name);
    const title = normalizeText(article?.title);
    const summary = normalizeText(article?.description);
    const apiContent = normalizeText(article?.content);

    return {
        title,
        category,
        summary,
        content: apiContent || summary || title,
        image_url: normalizeText(article?.image),
        video_url: "",
        source: sourceName || "GNews",
        author: "GNews API",
        status: "published",
        is_vip: 0,
        views: 0,
        original_url: originalUrl,
        external_id: originalUrl
            ? createExternalId(originalUrl)
            : "",
        api_provider: "gnews",
        published_at: normalizeText(article?.publishedAt)
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
        const configurationError = new Error(
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
        apikey: apiKey
    });

    const apiUrl =
        `https://gnews.io/api/v4/top-headlines?${query.toString()}`;

    const apiResponse = await fetch(apiUrl, {
        method: "GET",
        headers: {
            Accept: "application/json"
        },
        signal: AbortSignal.timeout(15000)
    });

    const responseData =
        await apiResponse.json().catch(function () {
            return {};
        });

    if (!apiResponse.ok) {
        const apiError = new Error(
            responseData?.errors?.[0] ||
            responseData?.message ||
            "Failed to fetch GNews articles"
        );

        apiError.statusCode = apiResponse.status;
        throw apiError;
    }

    const rawArticles = Array.isArray(
        responseData.articles
    )
        ? responseData.articles
        : [];

    const articles = rawArticles
        .map(function (article) {
            return normalizeArticle(
                article,
                filters.category
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
            Number(responseData.totalArticles) ||
            articles.length,
        articles
    };
}

async function previewGNews(input = {}) {
    return fetchGNews(input);
}

async function importGNews(input = {}) {
    const result = await fetchGNews(input);

    const importedArticles = [];
    const skippedArticles = [];
    const failedArticles = [];

    for (const article of result.articles) {
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
                        ?
                    )
                `,
                [
                    article.title,
                    article.category,
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
                original_url: article.original_url
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