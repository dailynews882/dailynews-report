
"use strict";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";

const HUMAN_QID = "Q5";
const REQUEST_TIMEOUT_MS = 12000;
const MAX_CANDIDATES = 15;

async function requestWikidata(params) {
    const url = new URL(WIKIDATA_API);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
        method: "GET",
        headers: {
            Accept: "application/json",
            "User-Agent": "DailyNewsPeopleIntelligence/1.0"
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    });

    if (!response.ok) {
        throw new Error(`Wikidata HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(
            `Wikidata API: ${data.error.info || data.error.code}`
        );
    }

    return data;
}

async function searchLanguage(query, language) {
    const data = await requestWikidata({
        action: "wbsearchentities",
        search: query,
        language,
        uselang: language,
        type: "item",
        limit: 20,
        format: "json"
    });

    return Array.isArray(data.search) ? data.search : [];
}

async function getHumanEntityIds(ids) {
    if (!ids.length) {
        return new Set();
    }

    const humanIds = new Set();

    // 分批获取实体声明，避免单次请求过长。
    for (let index = 0; index < ids.length; index += 20) {
        const batch = ids.slice(index, index + 20);

        const data = await requestWikidata({
            action: "wbgetentities",
            ids: batch.join("|"),
            props: "claims",
            format: "json"
        });

        const entities = data.entities || {};

        for (const id of batch) {
            const entity = entities[id];

            if (!entity || entity.missing !== undefined) {
                continue;
            }

            const instanceClaims = entity.claims?.P31 || [];

            const isHuman = instanceClaims.some(claim => {
                const value = claim.mainsnak?.datavalue?.value;

                return (
                    claim.rank !== "deprecated" &&
                    value?.id === HUMAN_QID
                );
            });

            if (isHuman) {
                humanIds.add(id);
            }
        }
    }

    return humanIds;
}

async function searchWikidataCandidates(req, res) {
    const query = String(req.query.q || "").trim();

    if (!query || query.length > 100) {
        return res.status(400).json({
            success: false,
            message: "请输入1至100个字符的搜索名称"
        });
    }

    try {
        const languages = ["zh", "en"];

        const results = await Promise.allSettled(
            languages.map(language =>
                searchLanguage(query, language)
            )
        );

        const candidates = new Map();
        const failedLanguages = [];

        results.forEach((result, index) => {
            if (result.status !== "fulfilled") {
                failedLanguages.push(languages[index]);
                console.error(
                    "[PI WIKIDATA LANGUAGE]",
                    languages[index],
                    result.reason?.message
                );
                return;
            }

            for (const item of result.value) {
                if (!/^Q[1-9]\d*$/.test(item.id || "")) {
                    continue;
                }

                const existing = candidates.get(item.id);

                if (existing) {
                    if (!existing.description && item.description) {
                        existing.description = item.description;
                    }

                    continue;
                }

                candidates.set(item.id, {
                    wikidata_id: item.id,
                    name: item.label || "",
                    description: item.description || "",
                    aliases: Array.isArray(item.aliases)
                        ? item.aliases
                        : [],
                    source: "Wikidata",
                    source_url:
                        `https://www.wikidata.org/wiki/${item.id}`,
                    verification_status: "external_candidate"
                });
            }
        });

        if (results.every(result => result.status === "rejected")) {
            return res.status(502).json({
                success: false,
                message: "Wikidata 搜索暂时不可用"
            });
        }

        const allCandidates = [...candidates.values()];
        let humanIds;

        try {
            humanIds = await getHumanEntityIds(
                allCandidates.map(item => item.wikidata_id)
            );
        } catch (error) {
            console.error(
                "[PI WIKIDATA HUMAN FILTER]",
                error.message
            );

            // 身份无法验证时不把未验证实体当成人物返回。
            return res.status(502).json({
                success: false,
                message: "人物类型核验失败，请稍后重试"
            });
        }

        const humanCandidates = allCandidates
            .filter(item => humanIds.has(item.wikidata_id))
            .slice(0, MAX_CANDIDATES)
            .map(item => ({
                ...item,
                entity_type: "human",
                wikidata_type: HUMAN_QID,
                type_checked: true
            }));

        return res.json({
            success: true,
            query,
            source: "Wikidata",
            found: humanCandidates.length > 0,
            candidates: humanCandidates,
            raw_candidate_count: allCandidates.length,
            human_candidate_count: humanCandidates.length,
            partial_results: failedLanguages.length > 0,
            notice:
                "已按 Wikidata P31=Q5 过滤人物；人物身份及关联关系仍需核验"
        });

    } catch (error) {
        console.error(
            "[PI WIKIDATA SEARCH]",
            error.message
        );

        return res.status(500).json({
            success: false,
            message: "外部人物搜索失败"
        });
    }
}

module.exports = {
    searchWikidataCandidates
};
