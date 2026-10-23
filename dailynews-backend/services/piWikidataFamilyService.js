"use strict";

// Live, bounded reads only. No entity cache, database or ingest dependency.
const API = "https://www.wikidata.org/w/api.php";
const SPARQL = "https://query.wikidata.org/sparql";
const QID = /^Q[1-9]\d{0,14}$/;
const TYPES = { P22: "father", P25: "mother", P26: "spouse", P40: "child", P3373: "sibling" };
const LABELS = { father: "父亲", mother: "母亲", parent: "父母（未区分）", spouse: "配偶声明（状态未知）", child: "子女", sibling: "兄弟姐妹" };
const LIMITS = Object.freeze({ nodes: 80, requests: 16, concurrency: 2, timeout: 25000, reverse: 40 });
let active = 0, windowStart = 0, windowCount = 0, reverseAfter = 0;
const cooldowns = new Map();

function context() { return { deadline: Date.now() + LIMITS.timeout, requests: 0, active: 0, warnings: [] }; }
function warn(ctx, section, code) {
    if (!ctx.warnings.some(w => w.section === section && w.code === code)) ctx.warnings.push({ section, code });
}
function errorCode(error) { return typeof error?.code === "string" ? error.code : (/abort|timeout/i.test(error?.name || "") ? "TIMEOUT" : "UPSTREAM_ERROR"); }
function failure(code) { return Object.assign(new Error(code), { code }); }

async function requestJson(url, ctx, options = {}) {
    const host = new URL(url).host;
    const now = Date.now();
    if (now - windowStart >= 60000) { windowStart = now; windowCount = 0; }
    if (now >= Math.min(ctx.deadline, options.deadline || ctx.deadline)) throw failure("TIMEOUT");
    if (ctx.requests >= LIMITS.requests) throw failure("REQUEST_LIMIT");
    if ((cooldowns.get(host) || 0) > now || windowCount >= 120) throw failure("RATE_LIMITED");
    if (active >= 4 || ctx.active >= LIMITS.concurrency) throw failure("BUSY");
    active++; ctx.active++; ctx.requests++; windowCount++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Math.min(options.timeoutMs || 8000, ctx.deadline - now, (options.deadline || ctx.deadline) - now)));
    try {
        const response = await fetch(String(url), {
            headers: { Accept: "application/json", "User-Agent": "DailyNewsPeopleIntelligence/11.4 (https://www.dailynews.report)" },
            signal: controller.signal
        });
        if (response.status === 429 || response.status === 503) {
            const retry = Number(response.headers?.get?.("retry-after"));
            cooldowns.set(host, Date.now() + Math.min(120000, Math.max(1000, (retry || 30) * 1000)));
            throw failure("RATE_LIMITED");
        }
        if (!response.ok) throw failure(`HTTP_${response.status}`);
        // Bound response memory as well as request time, including streaming bodies.
        let data;
        if (response.body?.getReader) {
            const reader = response.body.getReader(), chunks = []; let bytes = 0;
            try {
                for (;;) {
                    const item = await reader.read(); if (item.done) break;
                    bytes += item.value.byteLength;
                    if (bytes > 6 * 1024 * 1024) { controller.abort(); throw failure("RESPONSE_LIMIT"); }
                    chunks.push(Buffer.from(item.value));
                }
                data = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            } finally { reader.releaseLock(); }
        } else data = await response.json();
        if (data?.error) {
            if (["maxlag", "ratelimited"].includes(data.error.code)) {
                cooldowns.set(host, Date.now() + 30000); throw failure("RATE_LIMITED");
            }
            throw failure("API_ERROR");
        }
        return data;
    } catch (error) {
        if (controller.signal.aborted && error.code !== "RESPONSE_LIMIT") throw failure("TIMEOUT");
        throw error;
    } finally { clearTimeout(timer); active--; ctx.active--; }
}
function apiUrl(params) {
    const url = new URL(API);
    for (const [key, value] of Object.entries({ format: "json", maxlag: 5, ...params })) url.searchParams.set(key, String(value));
    return url;
}
function claimId(claim, property) {
    if (!claim || claim.rank === "deprecated" || claim.mainsnak?.snaktype !== "value") return null;
    if (claim.mainsnak.property && claim.mainsnak.property !== property) return null;
    const id = claim.mainsnak.datavalue?.value?.id;
    return QID.test(id || "") ? id : null;
}
function claims(entity, property) { return Array.isArray(entity?.claims?.[property]) ? entity.claims[property] : []; }
function ids(entity, property) { return [...new Set(claims(entity, property).map(c => claimId(c, property)).filter(Boolean))]; }
function human(entity) { return entity && entity.missing === undefined && ids(entity, "P31").includes("Q5"); }
function localized(values) {
    for (const lang of ["zh", "zh-hans", "zh-hant", "en"]) if (typeof values?.[lang]?.value === "string") return values[lang].value;
    return "";
}
async function entities(idsToLoad, ctx, section = "entities", strict = false, options = {}) {
    const result = {};
    const list = [...new Set(idsToLoad.filter(id => QID.test(id)))].slice(0, LIMITS.nodes);
    if (idsToLoad.length > LIMITS.nodes) warn(ctx, section, "NODE_LIMIT");
    for (let offset = 0; offset < list.length; offset += 10) {
        const batch = list.slice(offset, offset + 10);
        try {
            const data = await requestJson(apiUrl({ action: "wbgetentities", ids: batch.join("|"), props: "labels|descriptions|aliases|claims" + (section === "root" ? "|sitelinks" : ""), languages: "zh|zh-hans|zh-hant|en" }), ctx, options);
            if (!data.entities || typeof data.entities !== "object") throw failure("INVALID_RESPONSE");
            for (const id of batch) {
                const entity = data.entities?.[id];
                if (entity && entity.missing === undefined && (!entity.id || entity.id === id)) result[id] = entity;
                else warn(ctx, section, "ENTITY_MISSING");
            }
        } catch (error) { if (strict) throw error; warn(ctx, section, errorCode(error)); }
    }
    return result;
}
function snaks(values) {
    const result = {};
    for (const [property, list] of Object.entries(values || {}).slice(0, 20)) {
        if (!/^P\d+$/.test(property) || !Array.isArray(list)) continue;
        result[property] = list.filter(s => s && typeof s === "object").slice(0, 10).map(s => ({ snaktype: s.snaktype, datatype: s.datatype, datavalue: s.datavalue }));
    }
    return result;
}
function spouseStatus(claim, now = new Date()) {
    const qualifiers = claim.qualifiers || {};
    for (const snak of Array.isArray(qualifiers.P582) ? qualifiers.P582.filter(Boolean) : []) {
        const value = snak.datavalue?.value;
        const match = value?.time?.match(/^\+(\d{4})-(\d{2})-(\d{2})T/);
        if (!match || value.precision < 9) continue;
        // An imprecise end date is past only after its entire period ended.
        const end = value.precision === 9 ? Date.UTC(+match[1] + 1, 0, 1)
            : value.precision === 10 ? Date.UTC(+match[1], +match[2], 1)
                : Date.UTC(+match[1], +match[2] - 1, +match[3] + 1);
        if (end <= now.getTime()) return { status: "former", as_of: null };
    }
    for (const snak of Array.isArray(qualifiers.P585) ? qualifiers.P585.filter(Boolean) : []) {
        const value = snak.datavalue?.value;
        if (value?.precision >= 11 && value.time?.slice(1, 11) === now.toISOString().slice(0, 10))
            return { status: "current", as_of: now.toISOString().slice(0, 10) };
    }
    return { status: "unknown", as_of: null };
}
function statements(subject, entity) {
    const result = [];
    for (const [property, type] of Object.entries(TYPES)) {
        for (const claim of claims(entity, property).slice(0, 200)) {
            const target = claimId(claim, property);
            if (!target || target === subject) continue;
            const statementId = typeof claim.id === "string" && claim.id.startsWith(subject + "$") ? claim.id : null;
            const marriage = type === "spouse" ? spouseStatus(claim) : null;
            result.push({ from: subject, to: target, type,
                label: marriage?.status === "former" ? "前配偶（有结束时间声明）" : marriage?.status === "current" ? `配偶（声明日期 ${marriage.as_of}）` : LABELS[type],
                property, statement_id: statementId, statement_subject: subject, statement_object: target,
                rank: claim.rank || "normal", qualifiers: snaks(claim.qualifiers),
                references: (Array.isArray(claim.references) ? claim.references : []).filter(ref => ref && typeof ref === "object").slice(0, 10).map(ref => ({ hash: ref.hash, snaks: snaks(ref.snaks) })),
                source: "Wikidata", source_url: `https://www.wikidata.org/wiki/${subject}#${statementId ? statementId.replace("$", "-") : property}`,
                verification_status: "external_candidate", direction: "direct", derived: false,
                ...(marriage ? { spouse_status: marriage.status, spouse_as_of: marriage.as_of } : {}) });
        }
    }
    return result;
}
function inverse(edge, root) {
    const type = { father: "child", mother: "child", child: "parent", spouse: "spouse", sibling: "sibling" }[edge.type];
    return { ...edge, from: root, to: edge.from, type, statement_label: edge.label, label: type === "spouse" ? edge.label : LABELS[type], direction: "inverse" };
}
function dedupe(edges) {
    return [...new Map(edges.map(e => [`${e.from}|${e.to}|${e.type}|${e.statement_id || e.source_url}`, e])).values()];
}
async function reverseIds(root, ctx) {
    if (!QID.test(root)) throw failure("INVALID_QID");
    if (Date.now() < reverseAfter) { warn(ctx, "reverse", "RATE_LIMITED"); return []; }
    reverseAfter = Date.now() + 1000;
    // Fixed property allowlist and a validated QID; no caller-provided SPARQL.
    const query = `PREFIX wd: <http://www.wikidata.org/entity/> PREFIX wdt: <http://www.wikidata.org/prop/direct/> SELECT DISTINCT ?person WHERE { VALUES ?property { wdt:P22 wdt:P25 wdt:P26 wdt:P40 wdt:P3373 } ?person ?property wd:${root} . } ORDER BY ?person LIMIT ${LIMITS.reverse + 1}`;
    const url = new URL(SPARQL); url.searchParams.set("query", query); url.searchParams.set("format", "json");
    try {
        const data = await requestJson(url, ctx);
        if (!Array.isArray(data.results?.bindings)) throw failure("INVALID_RESPONSE");
        if (data.results.bindings.length > LIMITS.reverse) warn(ctx, "reverse", "RESULT_LIMIT");
        return [...new Set(data.results.bindings.slice(0, LIMITS.reverse).map(row => {
            const match = row.person?.value?.match(/^https?:\/\/www\.wikidata\.org\/entity\/(Q[1-9]\d{0,14})$/);
            return match?.[1];
        }).filter(id => id && id !== root))];
    } catch (error) { warn(ctx, "reverse", errorCode(error)); return []; }
}
async function family(root, person, ctx) {
    if (!QID.test(root) || !human(person)) throw failure("INVALID_PERSON");
    if (Object.keys(TYPES).some(p => (person.claims?.[p] || []).length > 200)) warn(ctx, "family", "STATEMENT_LIMIT");
    const direct = statements(root, person);
    const incomingIds = await reverseIds(root, ctx);
    const relatedIds = [...new Set([...direct.map(e => e.to), ...incomingIds])];
    if (relatedIds.length > LIMITS.nodes - 1) warn(ctx, "family", "NODE_LIMIT");
    const related = await entities(relatedIds.slice(0, LIMITS.nodes - 1), ctx, "family");
    const all = { [root]: person, ...related };
    let edges = direct;
    for (const id of incomingIds) if (human(related[id]))
        edges.push(...statements(id, related[id]).filter(e => e.to === root).map(e => inverse(e, root)));
    // A parent's explicit P40 claims are a sourced two-edge path to siblings.
    // Do not invent a P3373 assertion, shared second parent, or spouse relationship.
    const parentIds = [...new Set(edges.filter(e => ["father", "mother", "parent"].includes(e.type)).map(e => e.to))];
    const parentChildren = parentIds.flatMap(id => human(all[id]) ? statements(id, all[id]).filter(e => e.type === "child") : []);
    const siblingIds = [...new Set(parentChildren.map(e => e.to).filter(id => !all[id]))];
    const siblingRoom = Math.max(0, LIMITS.nodes - Object.keys(all).length);
    if (siblingIds.length > siblingRoom) warn(ctx, "siblings", "NODE_LIMIT");
    Object.assign(all, await entities(siblingIds.slice(0, siblingRoom), ctx, "siblings"));
    // Reuse already fetched children for explicit parent statements; never infer a co-parent or spouse.
    const children = [...new Set(edges.filter(e => e.type === "child").map(e => e.to))];
    const childEdges = children.flatMap(id => human(all[id]) ? statements(id, all[id]).filter(e => ["father", "mother"].includes(e.type)) : []);
    const missingIds = [...new Set(childEdges.map(e => e.to).filter(id => !all[id]))];
    const missing = missingIds.slice(0, Math.max(0, LIMITS.nodes - Object.keys(all).length));
    if (missing.length < missingIds.length) warn(ctx, "co_parents", "NODE_LIMIT");
    Object.assign(all, await entities(missing, ctx, "co_parents"));
    const valid = edge => human(all[edge.from]) && human(all[edge.to]);
    if ([...edges, ...childEdges].some(e => !valid(e))) warn(ctx, "family", "UNVERIFIED_PERSON_OMITTED");
    edges = dedupe(edges.filter(valid));
    return { entities: all, relations: edges, childRelations: dedupe([...childEdges, ...parentChildren].filter(valid)),
        summaries: children.filter(id => human(all[id])).map(id => ({ child_id: id, father_ids: ids(all[id], "P22").filter(p => human(all[p])), mother_ids: ids(all[id], "P25").filter(p => human(all[p])),
            father_status: ids(all[id], "P22").length ? "wikidata_declared" : "not_declared", mother_status: ids(all[id], "P25").length ? "wikidata_declared" : "not_declared", verification_status: "external_candidate" })) };
}

module.exports = { QID, TYPES, LABELS, LIMITS, context, warn, errorCode, requestJson, apiUrl, ids, human, localized, entities, statements, spouseStatus, inverse, dedupe, family };
