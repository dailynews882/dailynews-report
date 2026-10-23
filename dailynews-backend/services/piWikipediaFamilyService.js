"use strict";
const { randomUUID } = require("node:crypto");
const live = require("./piWikidataFamilyService");
const LIMITS = Object.freeze({ articles: 2, wikipediaRequests: 3, nodes: 24, edges: 48, duration: 8000, htmlBytes: 1000000 });
const SITES = { zhwiki: "zh.wikipedia.org", "zh-hantwiki": "zh.wikipedia.org", enwiki: "en.wikipedia.org" };
const LABELS = { father: "父亲", mother: "母亲", parent: "父母", spouse: "配偶", child: "子女", sibling: "兄弟姐妹", grandfather: "祖父", grandmother: "祖母", maternal_grandfather: "外祖父", maternal_grandmother: "外祖母", grandparent: "祖父母" };
const FIELDS = { 配偶: "spouse", 前配偶: "spouse", 前妻: "spouse", 前夫: "spouse", spouse: "spouse", spouses: "spouse", children: "child", 子女: "child", 儿女: "child", 兒女: "child", father: "father", 父亲: "father", 父親: "father", mother: "mother", 母亲: "mother", 母親: "mother", parents: "parent", 父母: "parent", siblings: "sibling", 兄弟姐妹: "sibling", 兄弟姊妹: "sibling", 祖父: "grandfather", 爷爷: "grandfather", 爺爺: "grandfather", 祖母: "grandmother", 外祖父: "maternal_grandfather", 外祖母: "maternal_grandmother", grandparents: "grandparent" };
const ROLES = { 外祖父: "maternal_grandfather", 外祖母: "maternal_grandmother", 祖父: "grandfather", 爷爷: "grandfather", 爺爺: "grandfather", 祖母: "grandmother", 奶奶: "grandmother", 父亲: "father", 父親: "father", 母亲: "mother", 母親: "mother", 前妻: "spouse", 前夫: "spouse", 妻子: "spouse", 丈夫: "spouse", 配偶: "spouse", 女儿: "child", 女兒: "child", 儿子: "child", 兒子: "child", 姐姐: "sibling", 姊姊: "sibling", 妹妹: "sibling", 哥哥: "sibling", 弟弟: "sibling" };

function decode(text) {
    return String(text).replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, code) => {
        const names = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
        if (names[code.toLowerCase()] !== undefined) return names[code.toLowerCase()];
        const number = code[1]?.toLowerCase() === "x" ? parseInt(code.slice(2), 16) : +code.slice(1);
        return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : "";
    });
}
// Bounded HTML token tree, never a browser DOM. Scripts, styles and citations are not prose.
function tree(html) {
    if (Buffer.byteLength(html) > LIMITS.htmlBytes) throw Object.assign(new Error(), { code: "ARTICLE_SIZE_LIMIT" });
    const root = { tag: "root", attrs: {}, children: [] }, stack = [root]; let count = 0;
    for (const token of html.matchAll(/<!--[\s\S]*?-->|<[^>]+>|[^<]+/g)) {
        if (++count > 50000) throw Object.assign(new Error(), { code: "ARTICLE_SIZE_LIMIT" });
        const value = token[0]; if (value.startsWith("<!--")) continue;
        if (!value.startsWith("<")) { stack.at(-1).children.push({ tag: "text", value: decode(value) }); continue; }
        const end = value.match(/^<\/([\w-]+)/);
        if (end) { const index = stack.findLastIndex(n => n.tag === end[1].toLowerCase()); if (index > 0) stack.length = index; continue; }
        const start = value.match(/^<([\w-]+)/); if (!start) continue;
        const attrs = {};
        for (const attr of value.slice(start[0].length).matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4]);
        const node = { tag: start[1].toLowerCase(), attrs, children: [], parent: stack.at(-1) }; node.parent.children.push(node);
        if (!/\/$/.test(value.slice(0, -1)) && !["br", "hr", "img", "meta", "link", "input", "wbr"].includes(node.tag)) {
            if (stack.length >= 80) throw Object.assign(new Error(), { code: "ARTICLE_DEPTH_LIMIT" });
            stack.push(node);
        }
    }
    return root;
}
function walk(node, predicate, result = []) { if (predicate(node)) result.push(node); for (const child of node.children || []) walk(child, predicate, result); return result; }
function text(node) {
    if (node.tag === "text") return node.value;
    if (["script", "style", "sup"].includes(node.tag) || /(?:^|\s)(?:mw-editsection|reference)(?:\s|$)/.test(node.attrs?.class || "")) return "";
    if (node.tag === "br") return "\n";
    const value = (node.children || []).map(text).join("");
    return value + (["li", "p", "div"].includes(node.tag) ? "\n" : "");
}
function inInfobox(node) { for (let p = node; p; p = p.parent) if (/(?:^|\s)infobox(?:\s|$)/.test(p.attrs?.class || "")) return true; return false; }
function articleTitle(href, host) {
    if (typeof href !== "string" || !href) return null;
    try {
        const url = new URL(href, "https://" + host + "/wiki/");
        if (url.host !== host || !url.pathname.startsWith("/wiki/")) return null;
        const title = decodeURIComponent(url.pathname.slice(6)).replace(/_/g, " ");
        return title && title.length <= 150 && !title.includes(":") ? title : null;
    } catch (_) { return null; }
}
function name(value) {
    const clean = value.replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]/g, "").trim().replace(/^(?:名叫|名為|名为|叫|是|為|为|[:：])\s*/, "").trim();
    if (!clean || clean.length > 70 || /^(?:[一二三四五六七八九十两兩]+[名个個子女]|有[一二三四五六七八九十两兩])/.test(clean) || /^(演员|演員|教师|教師|农民|農民|工人|商人|医生|醫生)$/.test(clean) || /\d|[<>{}=]|未知|不详|不詳|未公开|未公開|不明|无|無|早逝|已故|none|unknown|undisclosed|children|married|born|育有|出生|去世|夭折|结婚|結婚|离婚|離婚|妻子|兒子|儿子|女儿|女兒/i.test(clean)) return null;
    if (/^[\p{Script=Han}·]{2,8}$/u.test(clean) || /^[\p{L}][\p{L} .’'\-]{1,60}$/u.test(clean)) return clean;
    return null;
}
function marriage(value) { return /前妻|前夫|前配偶|离婚|離婚|divorc|former|ex-wife|ex-husband/i.test(value) ? "former" : /现任|現任|current/i.test(value) ? "reported_current" : "unknown"; }
function references(node, document, url) {
    return walk(node, n => n.tag === "a" && /^#cite_note/.test(n.attrs?.href || "")).slice(0, 10).map(a => {
        const id = a.attrs.href.slice(1), target = walk(document, n => n.attrs?.id === id)[0];
        return { id, url: url + "#" + encodeURIComponent(id), text: target ? text(target).trim().slice(0, 500) : text(a).trim(),
            urls: target ? walk(target, n => n.tag === "a" && /^https?:\/\//.test(n.attrs?.href || "")).slice(0, 5).map(n => n.attrs.href) : [] };
    });
}
function parseArticle(parsed, site, subjectName) {
    const html = typeof parsed.text === "string" ? parsed.text : parsed.text?.["*"];
    if (typeof html !== "string" || !Number.isSafeInteger(parsed.revid) || parsed.revid <= 0 || typeof parsed.title !== "string") throw Object.assign(new Error(), { code: "INVALID_ARTICLE" });
    const document = tree(html), url = "https://" + site.host + "/w/index.php?title=" + encodeURIComponent(parsed.title) + "&oldid=" + parsed.revid;
    const article = { title: parsed.title, url, revision_id: parsed.revid, language: site.language, source_type: "wikipedia_article", license: "CC BY-SA; see article history" };
    const results = [];
    function add(type, raw, container, location, status) {
        if (results.length >= LIMITS.edges) return;
        const personName = name(raw); if (!personName || personName === subjectName) return;
        const anchor = walk(container, n => n.tag === "a" && text(n).trim() === personName && articleTitle(n.attrs?.href, site.host))[0];
        results.push({ type, name: personName, linked_title: anchor ? articleTitle(anchor.attrs.href, site.host) : null, spouse_status: status || "unknown",
            evidence: { ...article, location, excerpt: text(container).trim().slice(0, 700), citations: references(container, document, url) } });
    }
    for (const row of walk(document, n => n.tag === "tr" && inInfobox(n))) {
        const header = row.children?.find(n => n.tag === "th"), cell = row.children?.find(n => n.tag === "td"); if (!header || !cell) continue;
        const field = text(header).trim().replace(/[:：]\s*$/, ""), type = FIELDS[field.toLowerCase()]; if (!type) continue;
        for (const value of text(cell).replace(/([）)])(?:和|及)/g, "$1\n").split(/\n|[、；;]|\s+and\s+/i)) {
            const role = /[（(](父|父亲|父親|母|母亲|母親)[）)]/.exec(value)?.[1] || /^(父亲|父親|父|母亲|母親|母)[:：]/.exec(value.trim())?.[1];
            const raw = value.trim().replace(/^(父亲|父親|父|母亲|母親|母)[:：]\s*/, "");
            add(role ? (/^父/.test(role) ? "father" : "mother") : type, raw, cell, { kind: "infobox", field }, marriage(field + " " + value));
        }
    }
    let section = null, level = 0;
    for (const block of walk(document, n => /^h[2-4]$/.test(n.tag) || ["p", "li"].includes(n.tag))) {
        if (inInfobox(block)) continue;
        let excluded = false;
        for (let p = block.parent; p; p = p.parent) if (["script", "style", "blockquote", "sup"].includes(p.tag)) excluded = true;
        if (excluded) continue;
        if (/^h/.test(block.tag)) {
            const title = text(block).trim();
            if (/^(家庭|家族|个人生活|個人生活|family|personal life)$/i.test(title)) { section = title; level = +block.tag[1]; }
            else if (+block.tag[1] <= level) section = null;
            continue;
        }
        if (!section) continue;
        const value = text(block).trim(), escaped = subjectName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rootContext = value.startsWith(subjectName) || new RegExp("^(?:" + Object.keys(ROLES).join("|") + ")").test(value);
        // Only explicit article-subject clauses. Never extract another person's parents or hearsay.
        if (/据传|據傳|传闻|傳聞|疑似|可能是|rumou?r|alleged/i.test(value)) continue;
        const rolePattern = Object.keys(ROLES).sort((a, b) => b.length - a.length).join("|");
        const pattern = new RegExp("(?:^|[，,；;。]\\s*|" + escaped + "(?:的)?)" + "(" + rolePattern + ")(?:名叫|名为|名為|叫|是|为|為|[:：])?\\s*([\\p{Script=Han}·]{2,8})(?=[（(，,；;。\\s]|$)", "gu");
        for (const match of value.matchAll(pattern)) {
            if (!rootContext && !match[0].startsWith(subjectName)) continue;
            add(ROLES[match[1]], match[2], block, { kind: "section", section, relation_term: match[1] }, marriage(match[1]));
        }
        // Explicit child labels in a subject/spouse paragraph; no co-parent edge is inferred.
        if (rootContext) for (const match of value.matchAll(/(?:育有|生有|和|及|、)(?:一[名个個])?(女儿|女兒|儿子|兒子)\s*([\p{Script=Han}·]{2,8})(?=[（(，,；;。\s]|$)/gu)) add("child", match[2], block, { kind: "section", section, relation_term: match[1] });
        // English prose is limited to labelled lines, not free-form NLP.
        const english = value.match(/^(Father|Mother|Spouse|Former spouse|Children|Siblings)\s*:\s*(.+)$/i);
        if (english) for (const raw of english[2].split(/;|\n/)) add(FIELDS[english[1].toLowerCase()] || "spouse", raw, block, { kind: "section", section }, marriage(english[1]));
    }
    return { article, observations: results, limited: results.length >= LIMITS.edges };
}

async function extract(root, person, ctx) {
    const result = { observations: [], articles: [], identities: {} }, deadline = Math.min(ctx.deadline, Date.now() + LIMITS.duration);
    let calls = 0, attempts = 0; const seen = new Set();
    async function request(url) {
        if (++calls > LIMITS.wikipediaRequests || Date.now() >= deadline) throw Object.assign(new Error(), { code: "WIKIPEDIA_BUDGET" });
        return live.requestJson(url, ctx, { timeoutMs: 5000, deadline });
    }
    for (const [siteId, host] of Object.entries(SITES)) {
        const title = person.sitelinks?.[siteId]?.title;
        if (typeof title !== "string" || !title || title.length > 200 || title.includes(":")) continue;
        if (seen.has(host + "|" + title)) continue;
        if (attempts++ >= LIMITS.articles) break;
        seen.add(host + "|" + title);
        try {
            const url = new URL("https://" + host + "/w/api.php");
            url.search = new URLSearchParams({ action: "parse", page: title, prop: "text|revid", redirects: "1", format: "json", formatversion: "2", maxlag: "5", disableeditsection: "1" });
            const data = await request(url);
            const parsed = parseArticle(data.parse || {}, { host, language: siteId.replace(/wiki$/, "") }, live.localized(person.labels));
            result.articles.push(parsed.article); result.observations.push(...parsed.observations);
            if (parsed.limited) live.warn(ctx, "wikipedia", "ARTICLE_RELATION_LIMIT");
            if (parsed.observations.length) break;
        } catch (error) { live.warn(ctx, "wikipedia", live.errorCode(error)); }
    }
    // Resolve only explicit article links via pageprops; never search a relative's name.
    const host = result.observations[0] ? new URL(result.observations[0].evidence.url).host : null;
    const titles = [...new Set(result.observations.map(o => o.linked_title).filter(Boolean))].slice(0, 20);
    if (host && titles.length && Date.now() < deadline) try {
        const url = new URL("https://" + host + "/w/api.php");
        url.search = new URLSearchParams({ action: "query", prop: "pageprops", ppprop: "wikibase_item", titles: titles.join("|"), redirects: "1", format: "json", formatversion: "2", maxlag: "5" });
        const data = await request(url), pages = data.query?.pages;
        if (!Array.isArray(pages)) throw Object.assign(new Error(), { code: "INVALID_PAGEPROPS" });
        const redirects = new Map([...(data.query.normalized || []), ...(data.query.redirects || [])].map(p => [p.from, p.to]));
        const byTitle = new Map(pages.filter(p => p.ns === 0 && !p.missing && live.QID.test(p.pageprops?.wikibase_item || "")).map(p => [p.title, p.pageprops.wikibase_item]));
        const candidates = {};
        for (const title of titles) { let normalized = title; for (let n = 0; n < 5 && redirects.has(normalized); n++) normalized = redirects.get(normalized); if (byTitle.has(normalized)) candidates[title] = byTitle.get(normalized); }
        // Keep identity verification inside the remaining request/time budget.
        if (Date.now() < deadline) {
            const loaded = await live.entities([...new Set(Object.values(candidates))], ctx, "wikipedia_identity", false, { deadline, timeoutMs: 5000 });
            for (const [title, qid] of Object.entries(candidates)) if (live.human(loaded[qid]) && qid !== root) result.identities[title] = { qid, entity: loaded[qid] };
        }
    } catch (error) { live.warn(ctx, "wikipedia_identity", live.errorCode(error)); }
    return result;
}

function combine(root, nodes, wikidataEdges, extracted) {
    const scope = randomUUID().replace(/-/g, ""), additions = [], edges = [], conflicts = [], names = new Map();
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const room = Math.min(LIMITS.nodes, Math.max(0, live.LIMITS.nodes - nodeMap.size)); let limited = false;
    function ensure(observation, placeholder = false) {
        const resolved = observation.linked_title && extracted.identities[observation.linked_title];
        const key = resolved?.qid || [observation.evidence.url, observation.type, observation.name].join("|");
        if (names.has(key)) return names.get(key);
        if (resolved && nodeMap.has(resolved.qid)) { names.set(key, resolved.qid); return resolved.qid; }
        if (additions.length >= room) { limited = true; return null; }
        const id = resolved?.qid || "wp:" + scope + ":" + (additions.length + 1);
        const node = { id, name: observation.name, entity_type: "human", source: "Wikipedia", source_type: "wikipedia_article", source_url: observation.evidence.url,
            description: placeholder ? "中间人物身份未记载；仅用于表示文章明确的跨代关系" : "文章记载／待独立核验", identity_status: resolved ? "qid_pageprops_checked" : placeholder ? "unknown_intermediate" : "session_temporary",
            verification_status: "article_reported_unverified", article: observation.evidence };
        additions.push(node); nodeMap.set(id, node); names.set(key, id); return id;
    }
    function connect(from, to, type, observation, extra = {}) {
        if (!from || !to || from === to || edges.length >= LIMITS.edges) return;
        edges.push({ from, to, type, label: LABELS[type] + (observation.spouse_status === "former" ? "（前配偶）" : observation.spouse_status === "reported_current" ? "（文章称现任）" : "") + " · 文章记载／待独立核验",
            source: "Wikipedia", source_type: "wikipedia_article", source_url: observation.evidence.url, evidence_id: "wp-evidence:" + scope + ":" + edges.length,
            verification_status: "article_reported_unverified", article: observation.evidence, spouse_status: type === "spouse" ? observation.spouse_status : undefined, ...extra });
    }
    const direct = extracted.observations.filter(o => !/grand/.test(o.type));
    for (const observation of direct) connect(root, ensure(observation), observation.type, observation);
    for (const observation of extracted.observations.filter(o => /grand/.test(o.type))) {
        const parentType = /^maternal/.test(observation.type) ? "mother" : observation.type === "grandparent" ? "parent" : "father";
        const candidates = [...new Set(edges.filter(e => e.from === root && e.type === parentType).map(e => e.to))];
        if (!candidates.length) candidates.push(...new Set(wikidataEdges.filter(e => e.from === root && e.type === parentType).map(e => e.to)));
        let middle = candidates.length === 1 ? candidates[0] : null;
        if (!middle) {
            const placeholder = { ...observation, type: parentType, linked_title: null, name: LABELS[parentType] + "（身份未明确）" };
            middle = ensure(placeholder, true);
            connect(root, middle, parentType, observation, { derived: true, direct_statement: false, path_semantics: "expanded_kinship_term", reported_relation: observation.type });
        }
        const nextType = observation.type.endsWith("grandmother") ? "mother" : observation.type === "grandparent" ? "parent" : "father";
        connect(middle, ensure(observation), nextType, observation, { derived: true, direct_statement: false, path_semantics: "expanded_kinship_term", reported_relation: observation.type });
    }
    for (const articleEdge of edges.filter(e => e.from === root)) {
        for (const old of wikidataEdges.filter(e => e.from === root)) {
            const sameIdentity = old.to === articleEdge.to;
            const parentDifference = ["father", "mother"].includes(old.type) && old.type === articleEdge.type && !sameIdentity;
            const statusDifference = sameIdentity && old.type === "spouse" && articleEdge.type === "spouse" && ((old.spouse_status === "former" && articleEdge.spouse_status === "reported_current") || (old.spouse_status === "current" && articleEdge.spouse_status === "former"));
            const roleDifference = sameIdentity && old.type !== articleEdge.type && ![old.type, articleEdge.type].includes("parent");
            if (parentDifference || statusDifference || roleDifference) {
                articleEdge.source_difference = true;
                conflicts.push({ kind: roleDifference ? "relationship_type_difference" : sameIdentity ? "spouse_status_difference" : "possible_parent_identity_difference", wikidata: old, wikipedia: articleEdge, notice: "来源差异／身份待核对；未覆盖任一来源" });
            }
        }
    }
    return { nodes: additions, relations: edges, conflicts, limited };
}
module.exports = { LIMITS, parseArticle, extract, combine };
