"use strict";
// Synthetic geometry fixtures, not assertions about real biographies.
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), vm = require("node:vm"), http = require("node:http"), { spawn } = require("node:child_process");
const root = path.resolve(__dirname, ".."), graphSource = fs.readFileSync(path.join(root, "public/pi-external-graph.js"), "utf8");
function engine() { const sandbox = { window: {} }; vm.createContext(sandbox); vm.runInContext(graphSource, sandbox); return sandbox.window.PIExternalGraph; }
function relation(from, to, type, extra = {}) { return { from, to, type, source: "fixture", source_url: "https://fixture.invalid/", verification_status: "external_candidate", ...extra }; }
function data(qid, names, edges) { return { qid, nodes: Object.entries(names).map(([id, name]) => ({ id, name, entity_type: "human" })), family_relations: edges, child_parent_relations: [] }; }
const temp = n => "wp:" + "b".repeat(32) + ":" + n;
const zhao = data("Q197424", { Q197424: "赵本山", [temp(1)]: "父亲（模拟）", [temp(2)]: "祖父（模拟）", [temp(3)]: "前配偶（模拟）", [temp(4)]: "配偶（模拟）", [temp(5)]: "子女甲", [temp(6)]: "子女乙", [temp(7)]: "子女丙", [temp(8)]: "子女丁" }, [
    relation("Q197424", temp(1), "father"), relation(temp(1), temp(2), "father", { derived: true }),
    relation("Q197424", temp(3), "spouse", { spouse_status: "former" }), relation("Q197424", temp(4), "spouse", { spouse_status: "reported_current" }),
    ...[5, 6, 7, 8].map(n => relation("Q197424", temp(n), "child"))
]);
const muskNames = { Q100: "Elon Musk (synthetic family fixture)", Q101: "Parent One", Q102: "Parent Two", Q103: "Grandparent", Q104: "Sibling", Q110: "Former Partner One", Q111: "Partner Two", Q112: "Explicit Co-parent (no marriage claim)" };
const muskEdges = [relation("Q100", "Q101", "father"), relation("Q100", "Q102", "mother"), relation("Q101", "Q103", "father"), relation("Q100", "Q104", "sibling"), relation("Q100", "Q110", "spouse", { spouse_status: "former" }), relation("Q100", "Q111", "spouse", { spouse_status: "unknown" })];
for (let i = 0; i < 21; i++) {
    const id = "Q" + (200 + i); muskNames[id] = "Alexandria Maximilian Montgomery Child " + (i + 1);
    muskEdges.push(relation("Q100", id, "child"), relation(id, "Q100", "father"));
    if (i < 20) muskEdges.push(relation(id, i < 7 ? "Q110" : i < 14 ? "Q111" : "Q112", "mother"));
}
const musk = data("Q100", muskNames, muskEdges);
// A second sibling is reachable only through an explicit shared-parent path.
musk.nodes.push({ id: "Q107", name: "Sibling via explicit parent", entity_type: "human" });
musk.family_relations.push(relation("Q101", "Q107", "child"));
const siblingBranch = data("Q104", { Q104: "Sibling", Q105: "Sibling Spouse", Q106: "Sibling Child" }, [relation("Q104", "Q105", "spouse"), relation("Q104", "Q106", "child"), relation("Q106", "Q105", "mother")]);
const female = data("Q300", { Q300: "女性中心人物", Q301: "父亲", Q302: "母亲", Q303: "伴侣", Q304: "子女", Q305: "外祖母", Q306: "孙辈", Q307: "兄弟姐妹" }, [
    relation("Q300", "Q301", "father"), relation("Q300", "Q302", "mother"), relation("Q302", "Q305", "mother"), relation("Q300", "Q303", "spouse"),
    relation("Q300", "Q304", "child"), relation("Q304", "Q300", "mother"), relation("Q304", "Q303", "father"), relation("Q304", "Q306", "child"), relation("Q300", "Q307", "sibling")
]);
function arrangement(fixture) { const graph = engine(); return graph.layout(graph.buildModel(fixture)); }
function geometry(result) {
    for (const row of result.rows.values()) {
        const sorted = row.map(id => result.positions.get(id)).sort((a, b) => a.x - b.x);
        assert(sorted.every(p => p.level === sorted[0].level), "Generation bands remain explicit even with staggered co-parents");
        for (let i = 1; i < sorted.length; i++) assert(sorted[i].x - sorted[i - 1].x >= 200, "No overlapping person cards");
    }
    for (const route of result.routes) {
        assert(!/NaN|undefined|[LCQAST]/.test(route.d), "Orthogonal M/H/V connectors only");
        if (route.kind === "family") {
            const levels = route.unit.parents.map(id => result.positions.get(id).level);
            assert(levels.every(l => l === levels[0]));
            assert(route.unit.children.every(id => result.positions.get(id).level === levels[0] + 1));
        }
    }
}
test("Zhao: ancestor/parent/spouse/child levels and single-parent evidence", () => {
    const result = arrangement(zhao); geometry(result);
    for (const [id, level] of [[temp(2), -2], [temp(1), -1], ["Q197424", 0], [temp(3), 0], [temp(4), 0], [temp(5), 1]]) assert.equal(result.positions.get(id).level, level);
    const children = result.units.find(u => u.parents.includes("Q197424"));
    assert.deepEqual(Array.from(children.parents), ["Q197424"]); assert.equal(children.children.length, 4);
    assert(result.routes.some(r => r.former)); assert(!result.units.some(u => u.parents.includes(temp(3)) || u.parents.includes(temp(4))));
});
test("Musk: co-parent family blocks, 21 children and an unassigned single-parent child", () => {
    const result = arrangement(musk); geometry(result);
    for (const [partner, count] of [["Q110", 7], ["Q111", 7], ["Q112", 6]]) {
        const unit = result.units.find(u => u.parents.includes("Q100") && u.parents.includes(partner)); assert.equal(unit.children.length, count);
        const indexes = unit.children.map(id => result.rows.get(1).indexOf(id)).sort((a, b) => a - b);
        assert.equal(indexes.at(-1) - indexes[0] + 1, count, "Children in each family stay contiguous");
    }
    const unknown = result.units.find(u => u.parents.length === 1 && u.parents[0] === "Q100"); assert.deepEqual(Array.from(unknown.children), ["Q220"]);
    assert(!result.routes.some(r => r.kind === "spouse" && [r.from, r.to].includes("Q112")), "Co-parenthood does not imply marriage");
    assert(result.routes.length < result.model.edges.length);
});
test("female centre: identical rules and correct dual-parent unit", () => {
    const result = arrangement(female); geometry(result);
    for (const [id, level] of [["Q300", 0], ["Q303", 0], ["Q304", 1], ["Q306", 2], ["Q305", -2]]) assert.equal(result.positions.get(id).level, level);
    assert.deepEqual(Array.from(result.units.find(u => u.children.includes("Q304")).parents), ["Q300", "Q303"]);
});
test("positions and route lanes are deterministic under reordered input", () => {
    const a = arrangement(musk), b = arrangement({ ...musk, nodes: [...musk.nodes].reverse(), family_relations: [...musk.family_relations].reverse() });
    for (const [id, p] of a.positions) assert.equal(JSON.stringify(p), JSON.stringify(b.positions.get(id)));
    assert.equal(JSON.stringify(a.routes.map(r => r.key + r.d).sort()), JSON.stringify(b.routes.map(r => r.key + r.d).sort()));
});
test("conflicting parent identities never become an invented multi-parent couple", () => {
    const result = arrangement(data("Q1", { Q1: "中心", Q2: "父亲甲", Q3: "父亲乙", Q4: "母亲" }, [relation("Q1", "Q2", "father"), relation("Q1", "Q3", "father"), relation("Q1", "Q4", "mother")]));
    geometry(result); assert(result.ambiguous.includes("Q1"));
    assert.equal(result.units.length, 1); assert(result.units[0].uncertain);
    assert.equal(result.routes.filter(r => r.kind === "family").length, 0);
});
test("generation contradictions retain evidence and use conflict routes", () => {
    const result = arrangement(data("Q1", { Q1: "中心", Q2: "另一个人物" }, [relation("Q1", "Q2", "father"), relation("Q1", "Q2", "child")]));
    assert.equal(result.model.edges.length, 2); assert.equal(result.model.generation_conflicts, 1); assert(result.routes.some(r => r.kind === "conflict" && r.conflict));
});
test("full Chinese and long English names wrap without omission or ellipsis", () => {
    const graph = engine();
    for (const name of ["非常长的中文人物姓名测试用于验证自动换行", "Alexandria Maximilian Montgomery International Family Member", "WWWWmmmmWWWWmmmmWWWWmmmm"]) {
        const lines = graph.wrapName(name); assert(lines.length > 1); assert.equal(lines.join("").replace(/\s/g, ""), name.replace(/\s/g, "")); assert(!lines.some(l => l.includes("…")));
    }
});
test("duplicate QIDs and temporary identities retain one main node", () => {
    const result = arrangement({ ...zhao, nodes: [...zhao.nodes, ...zhao.nodes], family_relations: [...zhao.family_relations, ...zhao.family_relations] });
    assert.equal(result.positions.size, zhao.nodes.length); geometry(result);
});
test("co-parents align over their own child blocks, not over the centre person's whole row", () => {
    const result = arrangement(musk);
    for (const partner of ["Q110", "Q111", "Q112"]) {
        const unit = result.units.find(u => u.parents.includes(partner));
        const centre = unit.children.reduce((sum, id) => sum + result.positions.get(id).x, 0) / unit.children.length;
        assert.equal(result.positions.get(partner).x, centre);
        assert.equal(result.routes.find(r => r.unit?.key === unit.key).junction.x, centre);
    }
    const seen = result.units.flatMap(u => Array.from(u.children)); assert.equal(new Set(seen).size, seen.length);
});
test("relationship labels use the centre perspective and explicit parent roles, never gender guesses", () => {
    const graph = engine(), model = graph.buildModel(female);
    for (const [id, label] of [["Q301", "父亲"], ["Q302", "母亲"], ["Q305", "外祖母"], ["Q307", "兄弟姐妹"], ["Q304", "子女"]]) assert.equal(graph.relationshipLabel(model, id), label);
    const articleChild = data("Q1", { Q1: "中心", Q2: "未知性别姓名" }, [relation("Q1", "Q2", "child", { article: { location: { relation_term: "女儿" } } })]);
    assert.equal(graph.relationshipLabel(graph.buildModel(articleChild), "Q2"), "女儿");
    assert.equal(graph.relationshipLabel(graph.buildModel(zhao), temp(3)), "前配偶");
});

test("sibling branch keeps its own spouse/child unit and accepts three-edge paths", () => {
    const graph = engine(), model = graph.buildModel({ ...musk, nodes: [...musk.nodes, ...siblingBranch.nodes], family_relations: [...musk.family_relations, ...siblingBranch.family_relations] });
    const result = graph.layout(model); geometry(result);
    assert.match(graph.relationshipLabel(model, "Q107"), /兄弟姐妹.*共同/);
    assert.equal(graph.relationshipLabel(model, "Q106"), "兄弟姐妹的子女（关系路径）");
    assert.equal(graph.relationshipLabel(model, "Q105"), "兄弟姐妹的配偶（关系路径）");
    const unit = result.units.find(u => u.children.includes("Q106"));
    assert.deepEqual(Array.from(unit.parents), ["Q104", "Q105"]);
    assert(!result.units.filter(u => u.parents.includes("Q100")).some(u => u.children.includes("Q106")));
    const reached = data("Q1", { Q1: "Root", Q2: "Parent", Q3: "Sibling", Q4: "Niece", Q5: "Beyond" }, [relation("Q1", "Q2", "father"), relation("Q2", "Q3", "child"), relation("Q3", "Q4", "child"), relation("Q4", "Q5", "child")]);
    assert.deepEqual(Array.from(graph.buildModel(reached).nodes, n => n.id), ["Q1", "Q2", "Q3", "Q4"]);
});

test("multi-family co-parents have vertical space without changing generation or guessing parents", () => {
    const result = arrangement(musk); geometry(result);
    for (const id of ["Q110", "Q111", "Q112"]) {
        const p = result.positions.get(id); assert.equal(p.level, 0); assert(p.y > result.positions.get("Q100").y);
        const unit = result.units.find(u => u.parents.includes(id));
        assert(unit.children.every(child => result.positions.get(child).y - 34 > p.y + p.bottom));
    }
    assert(result.routes.filter(r => r.kind === "family").every(r => r.caption.includes("家庭") && r.unit.parents.every(id => r.caption.includes(result.model.nodes.find(n => n.id === id).name))));
});

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
test("real Chrome/D3: desktop/mobile rendering, full names, selection and viewport retention", { timeout: 60000 }, async t => {
    const executable = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(p => fs.existsSync(p));
    const d3Path = process.env.PI_LAYOUT_D3_FILE;
    if (!executable || !d3Path || !fs.existsSync(d3Path)) { t.skip("Browser or official D3 fixture unavailable; visual acceptance not performed"); return; }
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "dailynews-family-layout-visual-"));
    const html = fs.readFileSync(path.join(root, "public/people-intelligence.html"), "utf8").replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
    const fixtures = { zhao, musk, female };
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, "http://fixture.invalid");
        if (url.pathname === "/d3.js") { res.setHeader("Content-Type", "text/javascript"); res.end(fs.readFileSync(d3Path)); }
        else if (url.pathname === "/graph.js") { res.setHeader("Content-Type", "text/javascript"); res.end(graphSource); }
        else if (url.pathname === "/controller.js") { res.setHeader("Content-Type", "text/javascript"); res.end(fs.readFileSync(path.join(root, "public/people-intelligence.js"), "utf8")); }
        else if (url.pathname === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(fs.readFileSync(path.join(root, "public/style.css"))); }
        else if (url.pathname === "/") {
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            const fixture = JSON.stringify(fixtures[url.searchParams.get("case")] || zhao);
            const init = `window.fixture=${fixture};window.branch=${JSON.stringify(siblingBranch)};window.PIExternalGraph.render(window.fixture);
                window.profileCalls=[];window.fetch=(url,options)=>{profileCalls.push(url);const id=url.split('/').pop();const node=fixture.nodes.find(n=>n.id===id)||{id,name:'Expanded person'};
                return new Promise(resolve=>setTimeout(()=>resolve({ok:true,json:async()=>({success:true,qid:id,profile:{...node,description:node.name+' DETAILS',citizenship:[id+' COUNTRY'],education:[id+' SCHOOL']},nodes:id==='Q104'?branch.nodes:[node],family_relations:id==='Q104'?branch.family_relations:[],organization_relations:[]})}),id==='Q101'?160:15));};
                window.addEventListener('load',()=>{const s=document.createElement('script');s.src='/controller.js';s.onload=()=>{window.controllerReady=true;document.getElementById('piFamilyReadingSize').onclick=()=>PIExternalGraph.focus();};document.body.appendChild(s);});`;
            res.end(html.replace("</body>", '<script src="/d3.js"></script><script src="/graph.js"></script><script>' + init + '</script></body>'));
        } else { res.statusCode = 404; res.end(); }
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let child, socket, call;
    try {
        child = spawn(executable, ["--headless=new", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + path.join(folder, "profile"), "about:blank"], { stdio: "ignore", windowsHide: true });
        let launchError; child.on("error", e => { launchError = e; });
        const portFile = path.join(folder, "profile", "DevToolsActivePort");
        for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) { if (launchError) throw launchError; await delay(100); }
        assert(fs.existsSync(portFile), "Chrome debugger unavailable");
        const [port, endpoint] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
        socket = new WebSocket("ws://127.0.0.1:" + port + endpoint);
        await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
        let sequence = 0; const pending = new Map();
        socket.addEventListener("message", event => {
            const result = JSON.parse(event.data), waiter = pending.get(result.id); if (!waiter) return;
            pending.delete(result.id); clearTimeout(waiter.timer); result.error ? waiter.reject(Error(result.error.message)) : waiter.resolve(result.result);
        });
        call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
            const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(Error("CDP timeout: " + method)); }, 5000);
            pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
        const target = await call("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await call("Target.attachToTarget", { targetId: target.targetId, flatten: true });
        const evaluate = async expression => {
            const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
            assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails)); return result.result.value;
        };
        // Native mouse input is essential: dispatchEvent('click') bypasses D3 drag's mouseup.
        const mouseClick = async (id, count = 1) => {
            const point = await evaluate(`(()=>{const g=document.querySelector('[data-person-id="${id}"]'),c=g.querySelector('circle');const r=c.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
            await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...point }, sessionId);
            for (let clickCount = 1; clickCount <= count; clickCount++) {
                await call("Input.dispatchMouseEvent", { type: "mousePressed", button: "left", buttons: 1, clickCount, ...point }, sessionId);
                await call("Input.dispatchMouseEvent", { type: "mouseReleased", button: "left", buttons: 0, clickCount, ...point }, sessionId);
            }
        };
        await call("Network.enable", {}, sessionId); await call("Network.setBlockedURLs", { urls: ["https://*", "http://www.*"] }, sessionId);
        for (const [name, width, height] of [["zhao", 1600, 1000], ["musk", 1600, 1000], ["female", 1600, 1000], ["female", 390, 844]]) {
            await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
            await call("Page.navigate", { url: "http://127.0.0.1:" + server.address().port + "/?case=" + name }, sessionId);
            await evaluate('new Promise((resolve,reject)=>{let i=0;const check=()=>{if(window.PIExternalGraph?.getState().layout&&window.controllerReady)resolve(true);else if(i++>100)reject(Error("Graph/controller not ready"));else setTimeout(check,20)};check()})');
            await delay(400);
            assert((await evaluate('PIExternalGraph.getState().transform.k')) >= 0.85, "Initial view keeps relation labels readable; overview remains available");
            await evaluate('PIExternalGraph.fit()'); await delay(350);
            const metrics = await evaluate(`(()=>{const nodes=[...document.querySelectorAll('g.pi-person')];return {count:nodes.length,allNames:nodes.every(g=>g.querySelector('.pi-person-fullname').textContent.replace(/\\s/g,'')===fixture.nodes.find(n=>n.id===g.dataset.personId).name.replace(/\\s/g,'')),widths:nodes.map(g=>g.querySelector('.pi-person-fullname').getBBox().width),radii:nodes.map(g=>g.querySelector('circle').getAttribute('r')),diagonal:[...document.querySelectorAll('path.pi-family-route')].some(p=>/[LCQ]/.test(p.getAttribute('d'))),toolbar:getComputedStyle(document.querySelector('.g-canvas-toolbar')).zIndex};})()`);
            assert.equal(metrics.count, fixtures[name].nodes.length); assert(metrics.allNames); assert(metrics.widths.every(w => w <= 190));
            assert(metrics.radii.every(r => r === "30")); assert.equal(metrics.diagonal, false); assert(Number(metrics.toolbar) > 10);
            const textOverlaps = await evaluate(`Array.from(document.querySelectorAll('g.pi-person')).map(g=>{const a=g.querySelector('.pi-person-fullname').getBBox(),b=g.querySelector('.pi-person-relation').getBBox();return {id:g.dataset.personId,width:b.width,relationTop:b.y,nameBottom:a.y+a.height}}).filter(r=>r.width>190||r.relationTop<r.nameBottom)`);
            assert.deepEqual(textOverlaps, [], "Relation labels fit their own area: " + JSON.stringify(textOverlaps));
            const styles = await evaluate('Array.from(document.querySelectorAll("path.pi-family-route"),p=>({stroke:p.getAttribute("stroke"),dash:p.getAttribute("stroke-dasharray")}))');
            assert(styles.every(s => s.stroke === "#334b63" && s.dash === null));
            assert(await evaluate('Array.from(document.querySelectorAll("g.pi-person"),g=>!!g.querySelector(".pi-person-relation").textContent).every(Boolean)'));
            const chosen = name === "zhao" ? temp(4) : name === "musk" ? "Q110" : "Q304";
            await evaluate(`document.getElementById('infoCountry').textContent='OLD CENTRE COUNTRY'`);
            await mouseClick(chosen);
            assert.equal(await evaluate('document.getElementById("infoNameZh").textContent'), fixtures[name].nodes.find(n => n.id === chosen).name);
            if (chosen.startsWith("wp:")) {
                assert.equal(await evaluate('document.getElementById("infoCountry").textContent'), "未获取");
                assert.equal(await evaluate('profileCalls.length'), 0);
                await mouseClick(chosen, 2);
                assert.match(await evaluate('document.getElementById("piFamilyStatus").textContent'), /没有.*QID.*无法.*展开/);
                assert.equal(await evaluate('profileCalls.length'), 0);
                await mouseClick(temp(5));
                assert.equal(await evaluate('document.getElementById("infoNameZh").textContent'), "子女甲");
            } else {
                await delay(60); assert((await evaluate('document.getElementById("infoCountry").textContent')).includes(chosen + " COUNTRY"));
            }
            if (name === "musk") {
                await mouseClick("Q101"); await mouseClick("Q102");
                await delay(230);
                assert.equal(await evaluate('document.getElementById("infoNameZh").textContent'), "Parent Two");
                assert.equal(await evaluate('document.getElementById("infoCountry").textContent'), "Q102 COUNTRY");
                assert(await evaluate('profileCalls.every(u=>u.startsWith("/api/people-intelligence/external/profile/"))'));
                const before = await evaluate('PIExternalGraph.getState().transform');
                await mouseClick("Q104", 2); await delay(100);
                assert.equal(await evaluate('document.getElementById("infoNameZh").textContent'), "Sibling");
                assert.equal(await evaluate('document.querySelectorAll("[data-person-id=Q106]").length'), 1);
                assert.deepEqual(await evaluate('PIExternalGraph.getState().layout.units.find(u=>u.children.includes("Q106")).parents'), ["Q104", "Q105"]);
                assert.equal(await evaluate('PIExternalGraph.getState().selectedId'), "Q104");
                assert.deepEqual(await evaluate('PIExternalGraph.getState().transform'), before);
                assert.equal(await evaluate('profileCalls.filter(u=>u.endsWith("/Q104")).length'), 1, "Double click shares the selection profile request");
            }
            const canvas = await evaluate('(()=>{const r=document.querySelector(".g-canvas-pane").getBoundingClientRect();return {width:r.width,height:r.height,scroll:document.documentElement.scrollWidth,viewport:innerWidth}})()');
            assert(canvas.width > 300 && canvas.height > 400, "The graph canvas remains visible on mobile");
            assert(canvas.scroll <= canvas.viewport + 1, "No page-level horizontal overflow");
            const screenshot = await call("Page.captureScreenshot", { format: "png" }, sessionId);
            fs.writeFileSync(path.join(folder, name + "-" + width + ".png"), Buffer.from(screenshot.data, "base64"));
            await evaluate('PIExternalGraph.focus()');
            assert.equal(await evaluate('PIExternalGraph.getState().transform.k'), 1);
            assert.equal(await evaluate('document.querySelector(".pi-person-relation").getAttribute("font-size")'), "16");
            const reading = await call("Page.captureScreenshot", { format: "png" }, sessionId);
            fs.writeFileSync(path.join(folder, name + "-" + width + "-reading.png"), Buffer.from(reading.data, "base64"));
            if (name === "female" && width > 500) {
                await evaluate('PIExternalGraph.fit()'); await delay(350);
                await mouseClick("Q304"); await evaluate('PIExternalGraph.zoomIn()');
                await delay(300); const before = await evaluate('PIExternalGraph.getState().transform');
                await evaluate(`PIExternalGraph.merge({qid:'Q304',nodes:[{id:'Q304',name:'子女',entity_type:'human'},{id:'Q309',name:'Expanded Grandchild Full Name',entity_type:'human'}],family_relations:[{from:'Q304',to:'Q309',type:'child'}]})`);
                assert.deepEqual(await evaluate('PIExternalGraph.getState().transform'), before);
                assert.equal(await evaluate('PIExternalGraph.getState().selectedId'), "Q304");
                assert.equal(await evaluate('document.querySelectorAll("g.pi-person[data-selected=true]").length'), 1);
            }
        }
        console.log("VISUAL_SCREENSHOTS=" + folder);
    } finally {
        if (call && socket?.readyState === WebSocket.OPEN) { try { await call("Browser.close"); } catch (_) {} }
        socket?.close(); if (child && child.exitCode === null) child.kill();
        await new Promise(resolve => server.close(resolve));
    }
});
