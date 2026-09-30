const express = require("express");

const {
    verifyAdminToken
} = require("../middleware/adminAuth");

const router = express.Router();

const WIKIDATA_API_URL =
    "https://www.wikidata.org/w/api.php";

const WIKIDATA_ENTITY_URL =
    "https://www.wikidata.org/wiki/";

const WIKIDATA_TIMEOUT_MS = 10000;


/*
 * ============================================================
 * Helpers
 * ============================================================
 */

function normalizeText(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}


async function fetchJsonWithTimeout(url) {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, WIKIDATA_TIMEOUT_MS);

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "User-Agent":
                    "DailyNews-PeopleIntelligence/1.0"
            },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(
                `Wikidata HTTP ${response.status}`
            );
        }

        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}


async function searchWikidataEntities(
    query,
    language
) {
    const params = new URLSearchParams({
        action: "wbsearchentities",
        search: query,
        language,
        uselang: language,
        type: "item",
        limit: "10",
        format: "json",
        origin: "*"
    });

    const url =
        `${WIKIDATA_API_URL}?${params.toString()}`;

    const data = await fetchJsonWithTimeout(url);

    if (!data || !Array.isArray(data.search)) {
        return [];
    }

    return data.search.map((item) => ({
        qid: normalizeText(item.id),
        label: normalizeText(item.label),
        description: normalizeText(
            item.description
        ),
        match: item.match || null,
        concept_uri: normalizeText(
            item.concepturi
        ),
        wikidata_url:
            `${WIKIDATA_ENTITY_URL}${encodeURIComponent(
                normalizeText(item.id)
            )}`,
        search_language: language
    }));
}


function mergeSearchResults(
    chineseResults,
    englishResults
) {
    const resultMap = new Map();

    for (const item of chineseResults) {
        if (!item.qid) {
            continue;
        }

        resultMap.set(item.qid, {
            qid: item.qid,

            name_zh: item.label,
            description_zh: item.description,

            name_en: "",
            description_en: "",

            wikidata_url: item.wikidata_url,
            concept_uri: item.concept_uri,

            matched_languages: ["zh"]
        });
    }

    for (const item of englishResults) {
        if (!item.qid) {
            continue;
        }

        const existing = resultMap.get(
            item.qid
        );

        if (existing) {
            existing.name_en = item.label;
            existing.description_en =
                item.description;

            if (
                !existing.matched_languages.includes(
                    "en"
                )
            ) {
                existing.matched_languages.push(
                    "en"
                );
            }

            continue;
        }

        resultMap.set(item.qid, {
            qid: item.qid,

            name_zh: "",
            description_zh: "",

            name_en: item.label,
            description_en: item.description,

            wikidata_url: item.wikidata_url,
            concept_uri: item.concept_uri,

            matched_languages: ["en"]
        });
    }

    return Array.from(
        resultMap.values()
    ).slice(0, 15);
}


/*
 * ============================================================
 * GET /wikidata/search?q=
 *
 * 搜索 Wikidata 候选实体。
 *
 * 当前 V1：
 * 1. 中文搜索
 * 2. 英文搜索
 * 3. 按 QID 去重
 * 4. 不写入数据库
 * ============================================================
 */

router.get(
    "/wikidata/search",
    verifyAdminToken,
    async (req, res) => {
        const query = normalizeText(req.query.q);

        if (!query) {
            return res.status(400).json({
                success: false,
                message: "请输入搜索关键词"
            });
        }

        if (query.length > 120) {
            return res.status(400).json({
                success: false,
                message: "搜索关键词过长"
            });
        }

        try {
            const [
                chineseResults,
                englishResults
            ] = await Promise.all([
                searchWikidataEntities(
                    query,
                    "zh"
                ),
                searchWikidataEntities(
                    query,
                    "en"
                )
            ]);

            const items = mergeSearchResults(
                chineseResults,
                englishResults
            );

            return res.json({
                success: true,
                provider: "wikidata",
                query,
                count: items.length,
                items
            });
        } catch (error) {
            console.error(
                "Wikidata search error:",
                error
            );

            const isTimeout =
                error &&
                error.name === "AbortError";

            return res.status(
                isTimeout ? 504 : 502
            ).json({
                success: false,
                provider: "wikidata",
                message: isTimeout
                    ? "Wikidata 请求超时"
                    : "Wikidata 搜索失败",
                error:
                    process.env.NODE_ENV ===
                        "development"
                        ? String(error.message || error)
                        : undefined
            });
        }
    }
);


module.exports = router;