"use strict";
// Isolated live-source fixtures only: no server, database, credentials or real network.
const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const base = path.resolve(__dirname, "..");
const originalFetch = global.fetch;
let live;
beforeEach(() => {
    for (const name of ["piWikidataFamilyService", "piWikidataSearchService", "piWikidataProfileService"]) delete require.cache[require.resolve("../services/" + name)];
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
        assert(["www.wikidata.org", "query.wikidata.org"].includes(url.host));
        assert(init.signal, "Every request needs an abort signal");
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
        require("../services/piWikidataSearchService"); require("../services/piWikidataProfileService");
    } finally { Module._load = original; }
    const html = fs.readFileSync(path.join(base, "public/people-intelligence.html"), "utf8");
    for (const id of ["piExpandPerson", "piShowFamilyEvidence", "piFamilyStatus", "piFamilyEvidenceList"]) assert.equal((html.match(new RegExp('id="' + id + '"', "g")) || []).length, 1);
    assert(html.includes('src="/pi-external-graph.js"')); assert(html.includes('src="/people-intelligence.js"'));
    for (const file of ["public/people-intelligence.js", "public/pi-external-graph.js", "services/piWikidataSearchService.js", "services/piWikidataProfileService.js", "services/piWikidataFamilyService.js"]) {
        const source = fs.readFileSync(path.join(base, file), "utf8");
        assert(!/\?{3,}/.test(source), "Unexpected damaged UI text");
        assert(!/localStorage\.setItem|sessionStorage\.setItem|INSERT INTO|writeFile|appendFile/.test(source), "Retrieved data must not be persisted");
    }
});
