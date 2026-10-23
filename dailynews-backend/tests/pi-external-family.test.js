"use strict";
// Isolated live-source fixtures only: no server, database, credentials or real network.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const base = path.resolve(__dirname, "..");
const originalFetch = global.fetch;
let live;
beforeEach(() => {
    for (const name of ["piWikidataFamilyService", "piWikidataSearchService", "piWikidataProfileService", "piWikipediaFamilyService"]) delete require.cache[require.resolve("../services/" + name)];
    live = require("../services/piWikidataFamilyService");
    global.fetch = async () => { throw new Error("Unmocked network forbidden"); };
});
afterEach(() => { global.fetch = originalFetch; });
const ok = data => ({ ok: true, status: 200, json: async () => data });
function claim(subject, property, target, extra = {}) {
    return { id: subject + "$" + property + "-" + target, rank: "normal", mainsnak: { property, snaktype: "value", datavalue: { value: { id: target } } }, ...extra };
}
function person(id, claims = {}, label = id) {
    return { id, labels: { zh: { value: label } }, claims: { P31: [claim(id, "P31", "Q5")], ...claims } };
}
function upstream(records, options = {}) {
    const calls = [];
    global.fetch = async (input, init) => {
        const url = new URL(input); calls.push(url);
        assert(["www.wikidata.org", "query.wikidata.org", "zh.wikipedia.org", "en.wikipedia.org"].includes(url.host));
        assert(init.signal, "Every request needs an abort signal");
        if (url.host.endsWith(".wikipedia.org")) {
            if (options.wikipediaFailure) throw Object.assign(new Error(), { name: "TimeoutError" });
            if (url.searchParams.get("action") === "query") return ok({ query: options.pageprops || { pages: [] } });
            return options.parse ? options.parse(url) : ok({ parse: { title: "Fixture", revid: 8001, text: "<p>No explicit family data</p>" } });
        }
        if (url.host === "query.wikidata.org") {
            if (options.reverseFailure) throw Object.assign(new Error(), { name: "TimeoutError" });
            return ok({ results: { bindings: (options.reverse || []).map(id => ({ person: { value: "http://www.wikidata.org/entity/" + id } })) } });
        }
        if (url.searchParams.get("action") === "wbsearchentities") return options.search(url);
        const ids = url.searchParams.get("ids").split("|");
        if (options.failIds?.some(id => ids.includes(id))) throw Object.assign(new Error(), { name: "TimeoutError" });
        return ok({ entities: Object.fromEntries(ids.map(id => [id, records[id] || { id, missing: "" }])) });
    };
    return calls;
}
async function invoke(handler, req) {
    const res = { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await handler(req, res); return res;
}
const search = query => invoke(require("../services/piWikidataSearchService").searchWikidataCandidates, { query: { q: query } });
const profile = qid => invoke(require("../services/piWikidataProfileService").getWikidataProfile, { params: { qid } });
const edge = (from, to, type, property) => ({ from, to, type, property, source_url: "https://www.wikidata.org/wiki/" + from + "#" + property });
const fixture = (qid, edges, nodes) => ({ qid, nodes: nodes.map(id => ({ id, name: id, entity_type: "human" })), family_relations: edges, child_parent_relations: [] });

for (const query of ["张三", "張三", "Jane Smith"]) test("multilingual live search: " + query, async () => {
    const records = { Q10: person("Q10", {}, "张三") };
    records.Q10.aliases = { "zh-hant": [{ value: "張三" }], en: [{ value: "Jane Smith" }] };
    const calls = upstream(records, { search: url => {
        assert.equal(url.searchParams.get("search"), query);
        return ok({ search: [{ id: "Q10", label: "张三", aliases: ["别名"], match: { type: "alias", text: query } }] });
    } });
    const result = await search(query);
    assert.equal(result.statusCode, 200); assert.equal(result.body.candidates.length, 1);
    assert.deepEqual(new Set(calls.filter(u => u.searchParams.has("language")).map(u => u.searchParams.get("language"))), new Set(["zh", "zh-hans", "zh-hant", "en"]));
    assert(result.body.candidates[0].aliases.includes("張三")); assert(result.body.candidates[0].type_checked);
    assert.equal(result.body.candidates[0].matched_languages.length, 4);
});
test("QID and Unicode normalization use exact identity lookup, not name or profile search", async () => {
    const calls = upstream({ Q10: person("Q10") });
    const result = await search(" ｑ１０ ");
    assert.equal(result.body.candidates[0].wikidata_id, "Q10"); assert.equal(calls.length, 1);
    assert.equal(calls[0].searchParams.get("action"), "wbgetentities");
});
test("one language timeout preserves other languages and only verified humans", async () => {
    upstream({ Q10: person("Q10"), Q20: { id: "Q20", claims: {} } }, { search: url => {
        if (url.searchParams.get("language") === "zh-hant") throw Object.assign(new Error(), { name: "TimeoutError" });
        return ok({ search: [{ id: "Q10" }, { id: "Q20" }, { id: "Q0" }] });
    } });
    const result = await search("Name");
    assert.equal(result.body.candidates.length, 1); assert(result.body.partial_results);
    assert.deepEqual(result.body.warnings, [{ section: "zh-hant", code: "TIMEOUT" }]);
});
test("failed identity batch cannot leak unchecked candidates or discard verified batches", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => "Q" + (i + 10));
    upstream(Object.fromEntries(ids.map(id => [id, person(id)])), { failIds: ["Q20"], search: () => ok({ search: ids.map(id => ({ id })) }) });
    const result = await search("Name");
    assert.equal(result.body.candidates.length, 10); assert(result.body.partial_results);
    assert(result.body.candidates.every(c => c.type_checked));
});
test("all language failures return explicit unavailable without local fallback", async () => {
    let calls = 0; global.fetch = async () => { calls++; throw Object.assign(new Error(), { name: "TimeoutError" }); };
    const result = await search("Unknown");
    assert.equal(result.statusCode, 502); assert.equal(result.body.code, "SEARCH_UNAVAILABLE"); assert.equal(calls, 4);
});
test("HTTP rate limit activates cooldown and reports RATE_LIMITED", async () => {
    let calls = 0; global.fetch = async () => { calls++; return { ok: false, status: 429, headers: { get: () => "30" } }; };
    await assert.rejects(live.requestJson(live.apiUrl({}), live.context()), { code: "RATE_LIMITED" });
    await assert.rejects(live.requestJson(live.apiUrl({}), live.context()), { code: "RATE_LIMITED" }); assert.equal(calls, 1);
});
test("request timeout aborts and releases concurrency slots", async () => {
    global.fetch = (url, init) => new Promise((resolve, reject) => init.signal.addEventListener("abort", () => reject(Object.assign(new Error(), { name: "AbortError", code: 20 })), { once: true }));
    const ctx = live.context(); ctx.deadline = Date.now() + 15;
    await assert.rejects(live.requestJson(live.apiUrl({}), ctx), { code: "TIMEOUT" });
    assert.equal(ctx.active, 0);
    global.fetch = async () => ok({ success: true }); assert((await live.requestJson(live.apiUrl({}), live.context())).success);
});
test("request budget and concurrent request limit are enforced", async () => {
    const capped = live.context(); capped.requests = live.LIMITS.requests;
    await assert.rejects(live.requestJson(live.apiUrl({}), capped), { code: "REQUEST_LIMIT" });
    const releases = []; global.fetch = () => new Promise(resolve => { releases.push(() => resolve(ok({}))); });
    const ctx = live.context(), first = live.requestJson(live.apiUrl({}), ctx), second = live.requestJson(live.apiUrl({}), ctx);
    await assert.rejects(live.requestJson(live.apiUrl({}), ctx), { code: "BUSY" });
    for (const release of releases) release();
    await Promise.all([first, second]); assert.equal(ctx.active, 0);
});

test("direct family retains statement IDs, qualifiers and source references", () => {
    const declared = claim("Q10", "P26", "Q20", { qualifiers: { P582: [{ datavalue: { value: { time: "+2000-01-01T00:00:00Z", precision: 11 } } }] }, references: [{ hash: "reference", snaks: { P854: [{ datavalue: { value: "https://example.org/evidence" } }] } }] });
    const edges = live.statements("Q10", person("Q10", { P26: [declared] }));
    assert.equal(edges[0].statement_id, declared.id); assert.equal(edges[0].spouse_status, "former");
    assert.equal(edges[0].references[0].snaks.P854[0].datavalue.value, "https://example.org/evidence");
    assert.equal(edges[0].qualifiers.P582.length, 1); assert(edges[0].source_url.includes("Q10-P26-Q20"));
});
test("missing end or start alone never implies current marriage; explicit dated state is dated", () => {
    assert.equal(live.spouseStatus({}).status, "unknown");
    assert.equal(live.spouseStatus({ qualifiers: { P580: [{ datavalue: { value: { time: "+2000-01-01T00:00:00Z", precision: 11 } } }] } }).status, "unknown");
    const now = new Date("2026-10-23T12:00:00Z");
    const dated = live.spouseStatus({ qualifiers: { P585: [{ datavalue: { value: { time: "+2026-10-23T00:00:00Z", precision: 11 } } }] } }, now);
    assert.deepEqual(dated, { status: "current", as_of: "2026-10-23" });
    assert.equal(live.spouseStatus({ qualifiers: { P582: [{ datavalue: { value: { time: "+2026-00-00T00:00:00Z", precision: 9 } } }] } }, now).status, "unknown");
});
test("deprecated, malformed and self relationships never enter extracted family", () => {
    const records = person("Q10", { P22: [claim("Q10", "P22", "Q20", { rank: "deprecated" }), claim("Q10", "P22", "Q10"), claim("Q10", "P25", "Q30"), claim("Q10", "P22", "BAD")] });
    assert.deepEqual(live.statements("Q10", records), []);
});
test("reverse relationships are checked against actual human statements, not SPARQL names", async () => {
    const root = person("Q10");
    const calls = upstream({ Q10: root, Q20: person("Q20", { P25: [claim("Q20", "P25", "Q10")] }), Q30: person("Q30"), Q40: { id: "Q40", claims: { P22: [claim("Q40", "P22", "Q10")] } } }, { reverse: ["Q20", "Q30", "Q40", "BAD"] });
    const ctx = live.context(), result = await live.family("Q10", root, ctx);
    assert.equal(result.relations.length, 1); assert.equal(result.relations[0].type, "child"); assert.equal(result.relations[0].to, "Q20");
    assert.equal(result.relations[0].statement_subject, "Q20"); assert.equal(result.relations[0].direction, "inverse");
    const query = calls.find(url => url.host === "query.wikidata.org").searchParams.get("query");
    assert(query.includes("wd:Q10")); assert(query.includes("LIMIT 41"));
});
test("reverse-query failure preserves root and direct relatives with explicit partial status", async () => {
    upstream({ Q10: person("Q10", { P22: [claim("Q10", "P22", "Q20")] }), Q20: person("Q20") }, { reverseFailure: true });
    const result = await profile("Q10");
    assert.equal(result.statusCode, 200); assert.equal(result.body.family_relations.length, 1); assert(result.body.partial_results);
    assert(result.body.warnings.some(w => w.section === "reverse" && w.code === "TIMEOUT"));
});
test("reverse queries have frequency control and reject injected IDs before network", async () => {
    const root = person("Q10"), calls = upstream({ Q10: root });
    await live.family("Q10", root, live.context()); const ctx = live.context(); await live.family("Q10", root, ctx);
    assert.equal(calls.filter(u => u.host === "query.wikidata.org").length, 1);
    assert(ctx.warnings.some(w => w.section === "reverse" && w.code === "RATE_LIMITED"));
    await assert.rejects(live.family("Q10 } UNION {}", root, live.context()), { code: "INVALID_PERSON" });
});
test("one failed relative batch preserves profile, successful relatives and existing API fields", async () => {
    const ids = Array.from({ length: 12 }, (_, i) => "Q" + (i + 20));
    const root = person("Q10", { P40: ids.map(id => claim("Q10", "P40", id)) });
    upstream({ Q10: root, ...Object.fromEntries(ids.map(id => [id, person(id)])) }, { failIds: ["Q30"] });
    const result = await profile("Q10");
    assert.equal(result.body.profile.id, "Q10"); assert.equal(result.body.family_relations.length, 10); assert(result.body.partial_results);
    for (const field of ["relations", "nodes", "organization_relations", "education_relations", "child_parent_summaries", "commercial_relation_counts"]) assert(field in result.body);
});
test("female root uses explicit mother statements, without father conflict or fabricated spouse", async () => {
    upstream({ Q10: person("Q10", { P40: [claim("Q10", "P40", "Q20")], P21: [claim("Q10", "P21", "Q6581072")] }), Q20: person("Q20", { P25: [claim("Q20", "P25", "Q10")], P22: [claim("Q20", "P22", "Q30")] }), Q30: person("Q30") });
    const result = await profile("Q10");
    assert.deepEqual(result.body.child_parent_summaries[0].mother_ids, ["Q10"]);
    assert(!result.body.family_relations.some(e => e.type === "spouse"));
    const model = browser().window.PIExternalGraph.buildModel(result.body);
    assert.equal(model.levels.get("Q10"), 0); assert.equal(model.levels.get("Q20"), 1);
    assert.equal(model.nodes.filter(n => n.id === "Q10").length, 1);
});
test("node and request budgets return bounded partial data rather than whole-profile rejection", async () => {
    const ids = Array.from({ length: 95 }, (_, i) => "Q" + (i + 20));
    upstream({ Q10: person("Q10", { P40: ids.map(id => claim("Q10", "P40", id)) }), ...Object.fromEntries(ids.map(id => [id, person(id)])) });
    const result = await profile("Q10");
    assert.equal(result.statusCode, 200); assert(result.body.nodes.length <= 80); assert(result.body.partial_results);
    assert(result.body.warnings.some(w => w.code === "NODE_LIMIT"));
});
test("profile rejects non-humans and unsafe QIDs", async () => {
    const calls = upstream({ Q10: { id: "Q10", claims: {} } });
    assert.equal((await profile("Q10")).statusCode, 422);
    const count = calls.length; assert.equal((await profile("Q10?query=bad")).statusCode, 400); assert.equal(calls.length, count);
});

// Minimal DOM and D3 surface executes the actual graph/controller code without network.
function browser() {
    const elements = [], listeners = new Map(), selections = [];
    class Element {
        constructor(tag = "div") { this.tag = tag; this.children = []; this.style = {}; this.handlers = {}; this.classList = { add() {}, remove() {} }; this.isConnected = true; elements.push(this); }
        append(...items) { for (const item of items) { item.parentElement = this; this.children.push(item); } }
        appendChild(item) { this.append(item); return item; }
        replaceChildren(...items) { this.children = []; this.append(...items); }
        addEventListener(name, fn) { this.handlers[name] = fn; }
        removeAttribute(name) { delete this[name]; }
        getBoundingClientRect() { return { width: 900, height: 700 }; }
        scrollIntoView() {}
    }
    const body = new Element("body");
    for (const id of ["familyTreeSvg", "piFamilyStatus", "piExpandPerson", "piFamilyEvidenceList", "piFamilyEvidence", "piShowFamilyEvidence"]) { const el = new Element(); el.id = id; body.append(el); }
    const document = { body, getElementById: id => elements.find(e => e.id === id) || null, createElement: tag => new Element(tag), createElementNS: (ns, tag) => new Element(tag),
        addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] };
    class Selection {
        constructor(data = []) { this.items = data; this.attrs = {}; this.events = {}; selections.push(this); }
        selectAll() { return new Selection(); } data(data) { this.items = data; return this; } join() { return this; }
        append() { return new Selection(this.items); }
        attr(name, value) { this.attrs[name] = typeof value === "function" ? this.items.map(value) : value; return this; }
        style() { return this; } text(value) { if (typeof value === "function") this.items.map(value); return this; }
        on(name, fn) { this.events[name] = fn; return this; } remove() { return this; }
        call(fn, ...args) { fn(this, ...args); return this; } transition() { return this; } duration() { return this; }
        each(fn) { this.items.forEach((item, i) => fn.call(new Element(), item, i)); return this; }
    }
    const behavior = () => { const fn = () => {}; for (const method of ["scaleExtent", "on", "subject"]) fn[method] = () => fn; fn.transform = () => {}; fn.scaleBy = () => {}; return fn; };
    const identity = { translate() { return this; }, scale() { return this; } };
    const window = { addEventListener(name, fn) { if (!listeners.has(name)) listeners.set(name, []); listeners.get(name).push(fn); }, dispatchEvent(event) { for (const fn of listeners.get(event.type) || []) fn(event); } };
    const sandbox = { window, document, console, URL, AbortController, AbortSignal, setTimeout, clearTimeout, getComputedStyle: () => ({ position: "relative" }),
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        d3: { select: () => new Selection(), zoom: behavior, drag: behavior, zoomIdentity: identity },
        fetch: async () => { throw new Error("Browser network forbidden"); }, alert() {}, location: { search: "" } };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(base, "public/pi-external-graph.js"), "utf8"), sandbox);
    return Object.assign(sandbox, { elements, selections, loadController() { vm.runInContext(fs.readFileSync(path.join(base, "public/people-intelligence.js"), "utf8"), sandbox); return sandbox; } });
}
test("two-hop grandparent and grandchild paths carry both statements and never become direct edges", () => {
    const graph = browser().window.PIExternalGraph;
    const data = fixture("Q10", [edge("Q10", "Q20", "mother", "P25"), edge("Q20", "Q30", "father", "P22"), edge("Q10", "Q40", "child", "P40"), edge("Q40", "Q50", "child", "P40")], ["Q10", "Q20", "Q30", "Q40", "Q50"]);
    const model = graph.buildModel(data);
    assert.equal(model.paths.length, 2);
    assert(model.paths.every(p => p.derived && !p.direct_statement && p.steps.length === 2));
    assert.equal(model.edges.length, 4); assert(!model.edges.some(e => e.from === "Q10" && e.to === "Q30"));
});
test("graph removes duplicate identities, duplicate statements, self-links and third-hop nodes", () => {
    const graph = browser().window.PIExternalGraph, relation = edge("Q10", "Q20", "child", "P40");
    const data = fixture("Q10", [relation, relation, edge("Q10", "Q10", "child", "P40"), edge("Q20", "Q30", "child", "P40"), edge("Q30", "Q40", "child", "P40"), edge("Q20", "Q10", "child", "P40")], ["Q10", "Q10", "Q20", "Q30", "Q40"]);
    const model = graph.buildModel(data);
    assert.equal(model.nodes.length, 3); assert(!model.nodes.some(n => n.id === "Q40"));
    assert(!model.edges.some(e => e.from === e.to)); assert(!model.paths.some(p => p.to === "Q10"));
});
test("actual SVG render and incremental expansion keep root fixed, retain zoom/drag/selection and stop repeated expansion", () => {
    const b = browser(), graph = b.window.PIExternalGraph;
    const first = fixture("Q10", [edge("Q20", "Q10", "mother", "P25")], ["Q10", "Q20"]);
    assert(graph.render(first).rendered); assert(graph.canExpand("Q20"));
    assert(b.selections.some(s => s.attrs.transform?.includes?.("translate(0,0)")));
    assert(graph.merge(fixture("Q20", [edge("Q20", "Q30", "child", "P40")], ["Q20", "Q30"])).rendered);
    assert(!graph.canExpand("Q20")); assert(!graph.canExpand("Q30"));
    assert.equal(graph.merge(first).rendered, false);
    const nodes = b.selections.find(s => s.events.dblclick);
    assert(nodes.events.click && nodes.events.keydown); assert.equal(typeof graph.zoomIn, "function");
});
test("real-time controller blocks legacy local fallback, including when live search fails", async () => {
    const b = browser().loadController(), calls = [];
    b.fetch = async url => { calls.push(url); if (url.includes("search-history")) return ok({}); throw new Error("offline"); };
    await b.loadPersonTopology("张三"); await b.loadAndDisplayEntity("Local name");
    assert(calls.some(u => u.includes("/external/search")));
    assert(!calls.some(u => /people-intelligence\/search\?/.test(u) || u.includes("ingest")));
});
test("out-of-order expansion cannot overwrite a new search or its status", async () => {
    const b = browser().loadController(); let resolve;
    b.window.PIExternalGraph.canExpand = () => true;
    let merged = 0; b.window.PIExternalGraph.merge = () => { merged++; return { rendered: true }; };
    vm.runInContext('piSelectedExternalQid="Q20"', b);
    b.fetch = () => new Promise(done => { resolve = done; });
    const pending = b.piExpandExternalPerson("Q20");
    vm.runInContext('++piExternalSearchSequence; piFamilyStatus("new search")', b);
    resolve(ok({ success: true, qid: "Q20", nodes: [] })); await pending;
    assert.equal(merged, 0); assert.equal(b.document.getElementById("piFamilyStatus").textContent, "new search");
});
test("late candidate profile response cannot replace a newer candidate choice", async () => {
    const b = browser().loadController(); let resolve;
    b.renderExternalCandidates({ candidates: [{ wikidata_id: "Q20", name: "Person", entity_type: "human", type_checked: true }] }, "Person");
    const button = b.elements.find(e => e.tag === "button" && e.textContent === "生成实时人物关系图");
    assert(button); b.fetch = () => new Promise(done => { resolve = done; });
    let rendered = 0; b.window.PIExternalGraph.render = () => { rendered++; };
    const pending = button.handlers.click(); vm.runInContext("++piExternalProfileSequence", b);
    resolve(ok({ success: true, qid: "Q20", nodes: [] })); await pending;
    assert.equal(rendered, 0); assert.equal(button.disabled, false);
});
test("evidence UI is text-safe, rejects executable links and retains both path statements", () => {
    const b = browser().loadController();
    b.piShowEvidence({ paths: [{ from: "Q10", via: "Q20", to: "Q30", label: "祖辈", steps: [edge("Q10", "Q20", "mother", "P25"), edge("Q20", "Q30", "father", "P22")] }], edges: [{ ...edge("Q10", "Q40", "spouse", "P26"), source_url: "javascript:alert(1)", label: "<img onerror=alert(1)>" }] });
    assert(!b.elements.some(e => e.href?.startsWith("javascript:")));
    assert(b.elements.filter(e => e.tag === "a" && e.textContent === "原始声明 ↗").length === 2);
    assert(b.elements.some(e => e.textContent?.includes("不是单条直接声明")));
});
test("service dependency graph cannot import storage or ingest modules; page loads new controls", () => {
    const Module = require("node:module"), original = Module._load;
    try {
        Module._load = function (id, ...args) { assert(!/sqlite|(^|\/)db($|\.)|ingest|node:fs/.test(id), "Persistence dependency forbidden: " + id); return original.call(this, id, ...args); };
        require("../services/piWikidataSearchService"); require("../services/piWikidataProfileService"); require("../services/piWikipediaFamilyService");
    } finally { Module._load = original; }
    const html = fs.readFileSync(path.join(base, "public/people-intelligence.html"), "utf8");
    for (const id of ["piExpandPerson", "piShowFamilyEvidence", "piFamilyStatus", "piFamilyEvidenceList"]) assert.equal((html.match(new RegExp('id="' + id + '"', "g")) || []).length, 1);
    assert(html.includes('src="/pi-external-graph.js"')); assert(html.includes('src="/people-intelligence.js"'));
    for (const file of ["public/people-intelligence.js", "public/pi-external-graph.js", "services/piWikidataSearchService.js", "services/piWikidataProfileService.js", "services/piWikidataFamilyService.js", "services/piWikipediaFamilyService.js"]) {
        const source = fs.readFileSync(path.join(base, file), "utf8");
        assert(!/\?{3,}/.test(source), "Unexpected damaged UI text");
        assert(!/localStorage\.setItem|sessionStorage\.setItem|INSERT INTO|writeFile|appendFile/.test(source), "Retrieved data must not be persisted");
    }
});

// Synthetic API revision, not a captured/current article revision. Names here are fixture facts,
// never a production fallback. Structure covers the reported Zhao Benshan example.
const zhaoHtml = `<table class="infobox biography">
<tr><th>配偶</th><td><a href="/wiki/葛淑珍">葛淑珍</a>（前妻）<br><a href="/wiki/马丽娟">马丽娟</a>（现任）</td></tr>
<tr><th>儿女</th><td>赵玉芳<br>赵铁蛋<br><a href="/wiki/赵一楠">赵一楠</a><br><a href="/wiki/赵一涵">赵一涵</a></td></tr>
<tr><th>亲属</th><td>不明确的亲属名称</td></tr></table>
<div class="mw-heading"><h2 id="家庭">家庭</h2></div>
<p>赵本山的父亲：赵德仁，爷爷名为赵培宽。<sup class="reference"><a href="#cite_note-family">[1]</a></sup></p>
<p>前妻葛淑珍，育有女儿赵玉芳（出生日期略）和儿子赵铁蛋（生平略）。</p>
<h2>徒弟</h2><p>父亲王路人。</p><h2>参考文献</h2>
<ol><li id="cite_note-family">模拟引用 <a href="https://fixture.invalid/reference">来源</a></li></ol>`;
function wikiPerson(qid = "Q197424", title = "赵本山", claims = {}) {
    const root = person(qid, claims, title); root.sitelinks = { zhwiki: { title }, enwiki: { title: "English fixture" } }; return root;
}
function parseFixture(html = zhaoHtml, title = "赵本山") { return { title, revid: 8001, text: html }; }
function wiki() { return require("../services/piWikipediaFamilyService"); }

test("Wikipedia infobox and family section supply Zhao fixture relatives without hardcoded results", async () => {
    const root = wikiPerson(); const calls = upstream({ Q197424: root }, { parse: () => ok({ parse: parseFixture() }) });
    const result = await profile("Q197424"); assert.equal(result.statusCode, 200);
    for (const expected of ["葛淑珍", "马丽娟", "赵玉芳", "赵铁蛋", "赵一楠", "赵一涵", "赵德仁", "赵培宽"]) assert(result.body.nodes.some(n => n.name === expected), expected);
    assert(!result.body.nodes.some(n => n.name === "王路人" || n.name === "不明确的亲属名称"));
    assert(result.body.family_relations.every(e => e.source === "Wikipedia" && e.verification_status === "article_reported_unverified"));
    assert.equal(calls.filter(u => u.host === "query.wikidata.org").length, 1);
    assert(calls.find(u => u.searchParams.get("action") === "wbgetentities").searchParams.get("props").includes("sitelinks"));
});
test("article relatives with no linked QID are scoped temporary identities, isolated between queries", async () => {
    upstream({ Q197424: wikiPerson() }, { parse: () => ok({ parse: parseFixture() }) });
    const first = (await profile("Q197424")).body, second = (await profile("Q197424")).body;
    const id = payload => payload.nodes.find(n => n.name === "赵玉芳").id;
    assert.match(id(first), /^wp:[a-f0-9]{32}:\d+$/); assert.notEqual(id(first), id(second));
    assert.equal(first.nodes.filter(n => n.name === "赵玉芳").length, 1);
});
test("temporary identities are not merged between article subjects or assigned a guessed QID", () => {
    const extracted = { observations: [{ type: "child", name: "张甲", evidence: { url: "https://zh.wikipedia.org/w/index.php?oldid=1", location: { field: "子女" } } }], identities: {} };
    const one = wiki().combine("Q10", [{ id: "Q10", name: "甲" }], [], extracted);
    const two = wiki().combine("Q20", [{ id: "Q20", name: "乙" }], [], extracted);
    assert.notEqual(one.nodes[0].id, two.nodes[0].id); assert.equal(one.nodes[0].identity_status, "session_temporary");
});
test("article evidence retains revision, title, field/section, excerpt and citation links", () => {
    const parsed = wiki().parseArticle(parseFixture(), { host: "zh.wikipedia.org", language: "zh" }, "赵本山");
    const father = parsed.observations.find(o => o.type === "father");
    assert.equal(father.evidence.title, "赵本山"); assert.equal(father.evidence.revision_id, 8001);
    assert(father.evidence.url.includes("oldid=8001")); assert.equal(father.evidence.location.section, "家庭");
    assert.equal(father.evidence.citations[0].id, "cite_note-family");
    assert(father.evidence.citations[0].urls.includes("https://fixture.invalid/reference"));
    assert(parsed.observations.some(o => o.evidence.location.field === "儿女"));
});
test("article grandfather is displayed through the named father, not as a direct Wikidata claim", async () => {
    upstream({ Q197424: wikiPerson() }, { parse: () => ok({ parse: parseFixture() }) });
    const data = (await profile("Q197424")).body, graph = browser().window.PIExternalGraph;
    const model = graph.buildModel(data), father = data.nodes.find(n => n.name === "赵德仁"), grandfather = data.nodes.find(n => n.name === "赵培宽");
    const path = model.paths.find(p => p.to === grandfather.id);
    assert.equal(path.via, father.id); assert(path.derived); assert.equal(path.steps.length, 2);
    assert(!data.family_relations.some(e => e.from === "Q197424" && e.to === grandfather.id));
    assert(path.steps.some(e => e.path_semantics === "expanded_kinship_term" && e.direct_statement === false));
    assert(graph.render(data).rendered); assert(!graph.canExpand(father.id));
});
test("unnamed grandparent intermediates are explicitly unknown rather than fabricated people", () => {
    const parsed = wiki().parseArticle(parseFixture('<h2>家庭</h2><p>赵本山的祖母：张甲。</p>'), { host: "zh.wikipedia.org", language: "zh" }, "赵本山");
    const result = wiki().combine("Q197424", [{ id: "Q197424" }], [], { ...parsed, identities: {} });
    assert.equal(result.relations.length, 2); assert(result.nodes.some(n => n.identity_status === "unknown_intermediate" && n.name.includes("身份未明确")));
    assert(result.relations.every(e => e.derived && e.direct_statement === false));
});
test("mother/father, siblings and maternal grandparents are extracted from explicit labels", () => {
    const html = '<table class="infobox"><tr><th>父母</th><td>王甲（父）和李乙（母）</td></tr><tr><th>兄弟姐妹</th><td>王丙</td></tr></table><h2>家庭</h2><p>王丁的外祖父：李戊，外祖母：林己。</p>';
    const parsed = wiki().parseArticle(parseFixture(html, "王丁"), { host: "zh.wikipedia.org", language: "zh" }, "王丁");
    for (const type of ["father", "mother", "sibling", "maternal_grandfather", "maternal_grandmother"]) assert(parsed.observations.some(o => o.type === type), type);
    const result = wiki().combine("Q10", [{ id: "Q10" }], [], { ...parsed, identities: {} });
    const mother = result.nodes.find(n => n.name === "李乙");
    assert.equal(result.relations.filter(e => e.from === mother.id).length, 2);
});
test("Wikipedia former/current wording is article-attributed, without inferring current marriage", () => {
    const parsed = wiki().parseArticle(parseFixture(), { host: "zh.wikipedia.org", language: "zh" }, "赵本山");
    assert(parsed.observations.some(o => o.name === "葛淑珍" && o.spouse_status === "former"));
    assert(parsed.observations.some(o => o.name === "马丽娟" && o.spouse_status === "reported_current"));
    const neutral = wiki().parseArticle(parseFixture('<table class="infobox"><tr><th>配偶</th><td>王甲</td></tr></table>'), { host: "zh.wikipedia.org", language: "zh" }, "赵本山");
    assert.equal(neutral.observations[0].spouse_status, "unknown");
});
test("explicit article links use official pageprops plus human verification; no name search", async () => {
    const root = wikiPerson("Q10", "王乙"), related = person("Q20", {}, "王甲");
    const calls = upstream({ Q10: root, Q20: related }, { parse: () => ok({ parse: parseFixture('<table class="infobox"><tr><th>父亲</th><td><a href="/wiki/王甲">王甲</a></td></tr></table>', "王乙") }), pageprops: { pages: [{ ns: 0, title: "王甲", pageprops: { wikibase_item: "Q20" } }] } });
    const data = (await profile("Q10")).body;
    assert(data.family_relations.some(e => e.to === "Q20" && e.source === "Wikipedia"));
    assert(!calls.some(u => u.searchParams.get("action") === "wbsearchentities"));
    assert(calls.some(u => u.searchParams.get("ppprop") === "wikibase_item"));
});
test("unverified pageprops identity remains temporary, never accepted as a human QID", async () => {
    upstream({ Q10: wikiPerson("Q10", "王乙"), Q20: { id: "Q20", claims: {} } }, { parse: () => ok({ parse: parseFixture('<table class="infobox"><tr><th>子女</th><td><a href="/wiki/王甲">王甲</a></td></tr></table>', "王乙") }), pageprops: { pages: [{ ns: 0, title: "王甲", pageprops: { wikibase_item: "Q20" } }] } });
    const data = (await profile("Q10")).body;
    assert(data.nodes.some(n => n.name === "王甲" && n.id.startsWith("wp:")));
    assert(!data.family_relations.some(e => e.to === "Q20"));
});
test("different father identities preserve both sources and show an explicit source difference", async () => {
    upstream({ Q10: wikiPerson("Q10", "王乙", { P22: [claim("Q10", "P22", "Q30")] }), Q30: person("Q30", {}, "王丙") }, { parse: () => ok({ parse: parseFixture('<table class="infobox"><tr><th>父亲</th><td>王甲</td></tr></table>', "王乙") }) });
    const data = (await profile("Q10")).body;
    assert(data.family_relations.some(e => e.to === "Q30" && e.source === "Wikidata"));
    assert(data.family_relations.some(e => e.source_difference && e.source === "Wikipedia"));
    assert.equal(data.source_conflicts[0].kind, "possible_parent_identity_difference");
    assert(browser().loadController().piPartialNotice(data).includes("来源差异"));
});
test("same-QID spouse status conflict retains two separate evidence records", () => {
    const old = { ...edge("Q10", "Q20", "spouse", "P26"), source: "Wikidata", spouse_status: "former" };
    const extracted = { observations: [{ type: "spouse", name: "王甲", linked_title: "王甲", spouse_status: "reported_current", evidence: { title: "王乙", url: "https://zh.wikipedia.org/w/index.php?oldid=1" } }], identities: { 王甲: { qid: "Q20" } } };
    const result = wiki().combine("Q10", [{ id: "Q10" }, { id: "Q20" }], [old], extracted);
    assert.equal(result.conflicts[0].kind, "spouse_status_difference"); assert.equal(result.nodes.length, 0);
    const model = browser().window.PIExternalGraph.buildModel({ qid: "Q10", nodes: [{ id: "Q10" }, { id: "Q20" }], family_relations: [old, ...result.relations] });
    assert.equal(model.edges.length, 2);
});
test("Wikipedia failure preserves Wikidata profile and reports partial failure", async () => {
    upstream({ Q10: wikiPerson("Q10", "王乙", { P22: [claim("Q10", "P22", "Q20")] }), Q20: person("Q20") }, { wikipediaFailure: true });
    const data = (await profile("Q10")).body;
    assert(data.success); assert(data.family_relations.some(e => e.source === "Wikidata")); assert(data.partial_results);
    assert(data.warnings.some(w => w.section === "wikipedia" && w.code === "TIMEOUT"));
});
test("fallback to English uses only root sitelinks and official Wikipedia APIs", async () => {
    const calls = upstream({ Q10: wikiPerson("Q10", "王乙") }, { parse: url => url.host === "zh.wikipedia.org" ? ok({ parse: parseFixture('<p>无明确家庭资料</p>', "王乙") }) : ok({ parse: parseFixture('<table class="infobox"><tr><th>Father</th><td>John Example</td></tr></table>', "English fixture") }) });
    const data = (await profile("Q10")).body;
    assert(data.nodes.some(n => n.name === "John Example")); assert.equal(calls.filter(u => u.host.endsWith("wikipedia.org")).length, 2);
    assert(data.wikipedia_articles.some(a => a.language === "en"));
});
test("unsupported prose, unrelated people, counts, hearsay, quotes and scripts do not create relatives", () => {
    const html = '<table class="infobox"><tr><th>子女</th><td>四名子女</td></tr></table><h2>家庭</h2><p>张三的父亲李四。</p><p>据传王乙的父亲王丙。</p><p>父亲是演员。</p><blockquote><p>父亲王丁。</p></blockquote><script><p>父亲王戊。</p></script><h2>作品</h2><p>父亲王己。</p>';
    assert.equal(wiki().parseArticle(parseFixture(html, "王乙"), { host: "zh.wikipedia.org", language: "zh" }, "王乙").observations.length, 0);
});
test("Wikipedia request/node bounds and oversized/malformed articles fail closed without data writes", async () => {
    assert.throws(() => wiki().parseArticle({ title: "A", revid: 0, text: "" }, { host: "zh.wikipedia.org" }, "A"), { code: "INVALID_ARTICLE" });
    assert.throws(() => wiki().parseArticle(parseFixture("x".repeat(1000001)), { host: "zh.wikipedia.org" }, "A"), { code: "ARTICLE_SIZE_LIMIT" });
    const observations = Array.from({ length: 50 }, (_, i) => ({ type: "child", name: "Fixture " + i, evidence: { url: "https://zh.wikipedia.org/w/index.php?oldid=1" } }));
    const result = wiki().combine("Q10", [{ id: "Q10" }], [], { observations, identities: {} });
    assert(result.limited); assert(result.nodes.length <= 24); assert(result.relations.length <= 48);
    const root = wikiPerson("Q10", "王乙"); root.sitelinks = { ...root.sitelinks, badwiki: { title: "http://127.0.0.1/" } };
    const calls = upstream({ Q10: root }, { wikipediaFailure: true }); await profile("Q10");
    assert(calls.filter(u => u.host.endsWith("wikipedia.org")).length <= 2);
});
test("temporary node selection and article evidence UI retain identity and provenance without QID requests", () => {
    const b = browser().loadController(), id = "wp:" + "a".repeat(32) + ":1";
    b.window.dispatchEvent(new b.CustomEvent("pi:external-person-selected", { detail: { qid: id, node: { id, name: "王甲", source: "Wikipedia", source_url: "https://zh.wikipedia.org/w/index.php?oldid=1" } } }));
    assert.equal(b.document.getElementById("piExpandPerson").disabled, true);
    b.piShowEvidence({ edges: [{ from: "Q10", to: id, type: "father", source: "Wikipedia", source_url: "https://zh.wikipedia.org/w/index.php?oldid=1", article: { title: "王乙", revision_id: 1, location: { field: "父亲" }, excerpt: "王甲", citations: [] } }] });
    assert(b.elements.some(e => e.textContent?.includes("文章记载／待独立核验")));
    assert(b.elements.some(e => e.textContent === "文章修订来源 ↗"));
});
