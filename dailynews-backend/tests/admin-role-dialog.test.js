"use strict";
// One focused role-dialog run. No real accounts, database, server login or network services.
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), http = require("node:http"), { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = name => fs.readFileSync(path.join(root, name), "utf8");
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

test("role dialog authorization: actor identity determines standard options, not the target member role", () => {
    const { assignableRoles } = require("../middleware/adminIdentity");
    const member = { id: 20, account_status: "active", admin_role: "member" };
    for (const role of ["superadmin", "hr"]) assert.deepEqual(assignableRoles({ id: 1, adminRole: role }, member), ["member", "editor"]);
    for (const role of ["admin", "editor", "member"]) assert.deepEqual(assignableRoles({ id: 1, adminRole: role }, member), []);
    assert.deepEqual(assignableRoles({ id: 1, adminRole: "hr" }, { ...member, admin_role: "admin" }), []);
    assert.deepEqual(assignableRoles({ id: 1, adminRole: "superadmin" }, { ...member, admin_role: "superadmin" }), []);
});

test("role dialog browser: desktop/mobile centering, dark theme, real native arrow selection and restricted lists", { timeout: 45000 }, async () => {
    const executable = ["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"].find(p => fs.existsSync(p));
    assert(executable, "A local Chromium browser is required for this UI test");
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), "dailynews-role-dialog-"));
    const html = read("admin/admin-users.html")
        .replace(/<link[^>]+href="admin\.css[^"\s]*"[^>]*>/, () => "<style>" + read("admin/admin.css") + "</style>")
        .replace(/<script\b[^>]*src=[^>]*><\/script>/g, "");
    const server = http.createServer((req, res) => {
        const variant = new URL(req.url, "http://fixture.test").searchParams.get("roles") || "multiple";
        const allowed = variant === "single" ? ["member"] : variant === "none" ? [] : ["member", "editor"];
        const data = { success: true, users: [{ id: 20, username: "SyntheticMember", admin_role: variant === "single" ? "editor" : "member", account_status: "active", allowed_actions: ["role"], assignable_roles: allowed }],
            page: 1, limit: 20, total: 1, admin: { adminRole: "superadmin", principal: "environment" },
            role_labels: { member: "普通用户", editor: "新闻编辑", admin: "管理员", hr: "HR", superadmin: "超级管理员" }, owner_identity: { username: "SyntheticOwner" } };
        const fixture = `localStorage.setItem('adminToken','synthetic-browser-fixture');window.confirm=()=>false;window.alert=()=>{};window.fetch=async()=>({ok:true,json:async()=>(${JSON.stringify(data)})});`;
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html.replace("</body>", () => "<script>" + fixture + "</script><script>" + read("admin/admin-users-live.js") + "</script></body>"));
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    let child, socket, call;
    try {
        child = spawn(executable, ["--headless=new", "--disable-background-networking", "--disable-component-update", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", "--user-data-dir=" + profile, "about:blank"], { stdio: "ignore", windowsHide: true });
        let launchError;
        child.on("error", error => { launchError = error; });
        const portFile = path.join(profile, "DevToolsActivePort");
        for (let n = 0; n < 120 && !fs.existsSync(portFile); n++) { if (launchError) throw launchError; await delay(100); }
        assert(fs.existsSync(portFile), "Browser did not expose the isolated test debugger");
        const [port, endpoint] = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
        socket = new WebSocket("ws://127.0.0.1:" + port + endpoint);
        await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
        let sequence = 0; const pending = new Map(), loadedDocuments = new Set();
        socket.addEventListener("message", event => {
            const result = JSON.parse(event.data), waiter = pending.get(result.id);
            if (result.method === "Page.lifecycleEvent" && result.params.name === "load") loadedDocuments.add(result.params.loaderId);
            if (!waiter) return;
            pending.delete(result.id); clearTimeout(waiter.timer);
            if (result.error) waiter.reject(Error(result.error.message)); else waiter.resolve(result.result);
        });
        call = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
            const id = ++sequence;
            const timer = setTimeout(() => { pending.delete(id); reject(Error("Browser command timed out: " + method)); }, 5000);
            pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
        });
        const target = await call("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await call("Target.attachToTarget", { targetId: target.targetId, flatten: true });
        const evaluate = async expression => {
            const response = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
            assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails)); return response.result.value;
        };
        await call("Page.enable", {}, sessionId);
        await call("Page.setLifecycleEventsEnabled", { enabled: true }, sessionId);
        for (const [width, height, variant] of [[1280,900,"multiple"], [390,740,"multiple"], [1280,900,"single"], [1280,900,"none"]]) {
            await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 }, sessionId);
            const navigation = await call("Page.navigate", { url: "http://127.0.0.1:" + server.address().port + "/?roles=" + variant }, sessionId);
            for (let n = 0; n < 250 && !loadedDocuments.has(navigation.loaderId); n++) await delay(20);
            assert(loadedDocuments.has(navigation.loaderId), "Fixture page did not finish loading");
            await evaluate(`new Promise((resolve,reject)=>{let n=0;const ready=()=>{const b=[...document.querySelectorAll('#usersTable button')].find(x=>x.textContent==='设置角色');if(b){b.click();resolve(true);}else if(n++>100)reject(Error('Role button not ready'));else setTimeout(ready,20);};ready();})`);
            const state = await evaluate(`(()=>{const d=document.getElementById('userRoleDialog'),s=document.getElementById('userRoleSelect'),r=d.getBoundingClientRect(),a=s.getBoundingClientRect();return {modal:d.matches(':modal'),left:r.left,top:r.top,width:r.width,height:r.height,vw:innerWidth,vh:innerHeight,bg:getComputedStyle(d).backgroundColor,options:[...s.options].map(o=>o.value),disabled:s.disabled,pointer:getComputedStyle(s).pointerEvents,arrowHit:document.elementFromPoint(a.right-10,a.top+a.height/2)?.id,arrowX:a.right-10,arrowY:a.top+a.height/2,message:document.getElementById('userRoleAvailability').textContent,submitDisabled:document.getElementById('userRoleSubmit').disabled};})()`);
            assert.equal(state.modal, true);
            assert(Math.abs(state.left + state.width / 2 - state.vw / 2) <= 2, "Dialog must be horizontally centered");
            assert(Math.abs(state.top + state.height / 2 - state.vh / 2) <= 2, "Dialog must be vertically centered");
            assert(state.left >= 0 && state.top >= 0 && state.width <= state.vw && state.height <= state.vh);
            assert.equal(state.bg, "rgb(11, 33, 61)");
            if (variant === "multiple") {
                assert.deepEqual(state.options, ["member", "editor"]); assert.equal(state.disabled, false); assert.equal(state.pointer, "auto"); assert.equal(state.arrowHit, "userRoleSelect");
                await call("Input.dispatchMouseEvent", { type: "mousePressed", x: state.arrowX, y: state.arrowY, button: "left", clickCount: 1 }, sessionId);
                await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: state.arrowX, y: state.arrowY, button: "left", clickCount: 1 }, sessionId);
                for (const [key, code, value] of [["ArrowDown","ArrowDown",40], ["Enter","Enter",13]]) {
                    await call("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: value }, sessionId);
                    await call("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: value }, sessionId);
                }
                assert.equal(await evaluate("document.getElementById('userRoleSelect').value"), "editor");
                assert.equal(await evaluate("document.getElementById('userRoleSubmit').disabled"), false);
            } else if (variant === "single") {
                assert.deepEqual(state.options, ["member"]); assert.equal(state.disabled, false); assert(state.message.includes("仅授权“普通用户”"));
            } else {
                assert.deepEqual(state.options, []); assert.equal(state.disabled, true); assert.equal(state.submitDisabled, true); assert(state.message.includes("未授权"));
            }
            await evaluate("document.getElementById('userRoleCancel').click()");
            assert.equal(await evaluate("document.getElementById('userRoleDialog').open"), false);
        }
    } finally {
        if (call && socket?.readyState === WebSocket.OPEN) { try { await call("Browser.close"); } catch (_) {} }
        if (socket) socket.close();
        if (child && child.exitCode === null) child.kill();
        await new Promise(resolve => server.close(resolve));
    }
});
