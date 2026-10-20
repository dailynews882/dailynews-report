"use strict";
/** V11.3-B3.2: Wikidata cross-check, read-only and never official identity verification. */
const https = require("https");
const { normName } = require("./piHousePtrEvidenceService");
const HOST = "www.wikidata.org";
const MAX_BYTES = 4 * 1024 * 1024;
const cache = new Map();
function error(message, status = 502) { const e = new Error(message); e.status = status; return e; }
function getEntity(qid) {
    if (!/^Q[1-9]\d{0,14}$/.test(qid)) return Promise.reject(error("Wikidata QID 格式无效", 400));
    const cached = cache.get(qid);
    if (cached && Date.now() - cached.time < 60 * 60 * 1000) return Promise.resolve(cached.data);
    return new Promise((resolve, reject) => {
        const path = `/wiki/Special:EntityData/${qid}.json`;
        const req = https.get({
            hostname: HOST, path, timeout: 15000, headers: {
                "Accept": "application/json", "User-Agent": "DailyNews-PeopleIntelligence/11.3 (https://www.dailynews.report; Wikidata research)"
            }
        }, res => {
            if (res.statusCode !== 200) { res.resume(); return reject(error(`Wikidata HTTP ${res.statusCode}`, res.statusCode === 404 ? 404 : 502)); }
            let bytes = 0; const parts = [];
            res.on("data", part => {
                bytes += part.length;
                if (bytes > MAX_BYTES) { res.destroy(error("Wikidata 响应超过大小限制")); return; }
                parts.push(part);
            });
            res.on("error", reject);
            res.on("end", () => {
                try {
                    const payload = JSON.parse(Buffer.concat(parts).toString("utf8"));
                    const entity = payload && payload.entities && payload.entities[qid];
                    if (!entity || entity.missing !== undefined || entity.id !== qid || entity.type !== "item") throw error("Wikidata 人物条目不存在", 404);
                    cache.set(qid, { data: entity, time: Date.now() });
                    resolve(entity);
                } catch (e) { reject(e.status ? e : error("Wikidata JSON 解析失败")); }
            });
        });
        req.on("timeout", () => req.destroy(error("Wikidata 查询超时", 504)));
        req.on("error", reject);
    });
}
function claimIds(entity, property) {
    return (entity.claims && entity.claims[property] || []).filter(x => x.rank !== "deprecated").map(x => {
        const value = x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value;
        return value && typeof value.id === "string" ? value.id : null;
    }).filter(Boolean);
}
function occupationSummaries(entity) {
    return (entity.claims && entity.claims.P39 || []).filter(x => x.rank !== "deprecated").slice(0, 30).map(x => {
        const value = x.mainsnak && x.mainsnak.datavalue && x.mainsnak.datavalue.value;
        const qualifier = x.qualifiers || {};
        const date = prop => {
            const entry = (qualifier[prop] || [])[0];
            return entry && entry.datavalue && entry.datavalue.value && entry.datavalue.value.time || null;
        };
        const district = (qualifier.P768 || []).map(v => v.datavalue && v.datavalue.value && v.datavalue.value.id).filter(Boolean);
        return { position_qid: value && value.id || null, start_time: date("P580"), end_time: date("P582"), electoral_district_qids: district };
    }).filter(x => x.position_qid);
}
function namesMatch(a, b) {
    const x = normName(a).split(" ").filter(Boolean), y = normName(b).split(" ").filter(Boolean);
    return x.length >= 2 && y.length >= 2 && ((x[0] === y[0] && x[x.length - 1] === y[y.length - 1]) || (x[0] === y[y.length - 1] && x[x.length - 1] === y[0]));
}
function evaluateEntity({ qid, name, filing, entity }) {
    const en = entity.labels && entity.labels.en && entity.labels.en.value || null;
    const aliases = (entity.aliases && entity.aliases.en || []).map(a => a.value).slice(0, 30);
    const names = [en, ...aliases].filter(Boolean);
    const matchName = names.some(x => namesMatch(name, x));
    const matchFiler = names.some(x => namesMatch(filing && filing.filer_name, x));
    const human = claimIds(entity, "P31").includes("Q5");
    const roles = occupationSummaries(entity);
    const status = !human || !matchName || !matchFiler ? "identity_conflict_manual_review" : "cross_source_consistent_unverified";
    return {
        provider: "WIKIDATA", mode: "qid_crosscheck_read_only", qid,
        wikidata_url: `https://www.wikidata.org/wiki/${qid}`,
        entity_data_url: `https://${HOST}/wiki/Special:EntityData/${qid}.json`,
        english_label: en, english_aliases: aliases,
        checks: {
            wikidata_entity_found: true, instance_of_human: human, requested_name_matches_wikidata: matchName,
            filing_name_matches_wikidata: matchFiler, official_unique_identifier_confirmed: false,
            official_district_crosschecked: false, tenure_at_filing_crosschecked: false
        },
        positions_held: roles, status,
        verified_person_match: false, verified_transactions: false,
        note: "Wikidata 是可编辑的第三方知识库。姓名和人物类型相符仅是交叉一致性，P39 任职声明未与官方任期/选区逐项核对；不能认定为官方身份核验。"
    };
}
async function crosscheckWikidata({ qid, name, filing }) {
    const entity = await getEntity(qid);
    return evaluateEntity({ qid, name, filing, entity });
}
module.exports = { crosscheckWikidata, evaluateEntity, namesMatch, _getEntity: getEntity };
