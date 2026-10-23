"use strict";
const live = require("./piWikidataFamilyService");
const LANGUAGES = ["zh", "zh-hans", "zh-hant", "en"];
async function searchWikidataCandidates(req, res) {
    const query = String(req.query.q || "").normalize("NFKC").trim().replace(/\s+/g, " ");
    if (!query || query.length > 100) return res.status(400).json({ success: false, message: "请输入1至100个字符的搜索名称" });
    const ctx = live.context(), candidates = new Map();
    try {
        const exact = query.toUpperCase();
        if (live.QID.test(exact)) candidates.set(exact, { wikidata_id: exact, aliases: [], matched_languages: [] });
        else {
            for (let offset = 0; offset < LANGUAGES.length; offset += 2) {
                await Promise.all(LANGUAGES.slice(offset, offset + 2).map(async language => {
                    try {
                        const data = await live.requestJson(live.apiUrl({ action: "wbsearchentities", search: query, language, uselang: language, type: "item", limit: 20 }), ctx);
                        if (!Array.isArray(data.search)) throw Object.assign(new Error(), { code: "INVALID_RESPONSE" });
                        for (const item of data.search) {
                            if (!live.QID.test(item.id || "")) continue;
                            const previous = candidates.get(item.id) || { wikidata_id: item.id, name: item.label || "", description: item.description || "", aliases: [], matched_languages: [] };
                            previous.aliases = [...new Set([...previous.aliases, ...(Array.isArray(item.aliases) ? item.aliases.filter(a => typeof a === "string") : []), ...(item.match?.type === "alias" && typeof item.match.text === "string" ? [item.match.text] : [])])];
                            previous.matched_languages.push(language);
                            if (!previous.description) previous.description = item.description || "";
                            candidates.set(item.id, previous);
                        }
                    } catch (error) { live.warn(ctx, language, live.errorCode(error)); }
                }));
            }
            if (ctx.warnings.length === LANGUAGES.length && !candidates.size)
                return res.status(502).json({ success: false, code: "SEARCH_UNAVAILABLE", warnings: ctx.warnings, message: "外部搜索暂不可用（超时或限流），请稍后重试" });
        }
        const records = await live.entities([...candidates.keys()], ctx, "identity");
        const humans = [...candidates.values()].filter(item => live.human(records[item.wikidata_id])).slice(0, 15).map(item => {
            const entity = records[item.wikidata_id];
            const aliases = LANGUAGES.flatMap(lang => (entity.aliases?.[lang] || []).map(a => a.value)).filter(v => typeof v === "string");
            return { ...item, name: live.localized(entity.labels) || item.name || item.wikidata_id,
                description: live.localized(entity.descriptions) || item.description || "", aliases: [...new Set([...item.aliases, ...aliases])], source: "Wikidata",
                source_url: "https://www.wikidata.org/wiki/" + item.wikidata_id, verification_status: "external_candidate",
                entity_type: "human", wikidata_type: "Q5", type_checked: true };
        });
        if (candidates.size && !Object.keys(records).length && ctx.warnings.some(w => w.section === "identity"))
            return res.status(502).json({ success: false, code: "IDENTITY_UNAVAILABLE", warnings: ctx.warnings, message: "人物身份核验暂不可用，不返回未核验实体" });
        return res.json({ success: true, query, source: "Wikidata", found: humans.length > 0, candidates: humans,
            raw_candidate_count: candidates.size, human_candidate_count: humans.length, partial_results: ctx.warnings.length > 0, warnings: ctx.warnings,
            notice: "已按 Wikidata P31=Q5 核验人物类型；关系真实性仍需独立核验。不使用本地人物回退。" });
    } catch (error) {
        return res.status(502).json({ success: false, code: live.errorCode(error), message: "外部人物搜索暂不可用" });
    }
}
module.exports = { searchWikidataCandidates };
