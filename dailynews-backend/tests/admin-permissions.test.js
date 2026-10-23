"use strict";
// Synthetic temporary fixtures only. Never load db.js, dotenv, real email or payments.
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), Module = require("node:module"), vm = require("node:vm");
const express = require("express"), sqlite = require("sqlite3"), bcrypt = require("bcrypt"), jwt = require("jsonwebtoken");
const root = path.resolve(__dirname, "..");
function load(name, overrides) {
    const filename = path.join(root, name), m = new Module(filename);
    m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
    m.require = key => {
        if (Object.hasOwn(overrides, key)) return overrides[key];
        if (key === "../db" || key === "dotenv") throw Error("Production database/config forbidden");
        return Module.prototype.require.call(m, key);
    };
    m._compile(fs.readFileSync(filename, "utf8"), filename); return m.exports;
}
function api(db) {
    return {
        exec: sql => new Promise((ok, no) => db.exec(sql, e => e ? no(e) : ok())),
        run: (sql, args = []) => new Promise((ok, no) => db.run(sql, args, function (e) { e ? no(e) : ok(this); })),
        get: (sql, args = []) => new Promise((ok, no) => db.get(sql, args, (e, row) => e ? no(e) : ok(row))),
        all: sql => new Promise((ok, no) => db.all(sql, (e, rows) => e ? no(e) : ok(rows)))
    };
}
test("admin permissions: trusted owner, standard HR grants, account lifecycle and transactional audit", async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dailynews-admin-policy-"));
    const db = await new Promise((ok, no) => { const c = new sqlite.Database(path.join(directory, "fixture.sqlite"), e => e ? no(e) : ok(c)); });
    const { exec, run, get, all } = api(db);
    const previous = Object.fromEntries(["ADMIN_USERNAME", "ADMIN_PASSWORD_HASH", "ADMIN_JWT_SECRET", "JWT_SECRET"].map(k => [k, process.env[k]]));
    process.env.ADMIN_USERNAME = "PANTIEZHAN";
    process.env.ADMIN_JWT_SECRET = require("node:crypto").randomBytes(32).toString("hex");
    process.env.JWT_SECRET = require("node:crypto").randomBytes(32).toString("hex");
    process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash("OwnerFixture123!", 4);
    let server;
    try {
        await exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
            CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT UNIQUE,account TEXT UNIQUE,account_type TEXT,password_hash TEXT,email TEXT UNIQUE,phone TEXT UNIQUE,
              email_verified INTEGER DEFAULT 1,phone_verified INTEGER DEFAULT 0,member_level TEXT DEFAULT 'free',subscription_status TEXT DEFAULT 'free',vip_expire_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE wallets(id INTEGER PRIMARY KEY,user_id INTEGER UNIQUE REFERENCES users(id),balance REAL DEFAULT 0,reward_balance REAL DEFAULT 0,status TEXT DEFAULT 'active');
            CREATE TABLE payment_orders(id INTEGER PRIMARY KEY,user_id INTEGER,amount REAL,status TEXT);
            CREATE TABLE user_subscriptions(user_id INTEGER PRIMARY KEY,status TEXT);
            CREATE TABLE news(id INTEGER PRIMARY KEY,title TEXT,category TEXT,country_code TEXT,country_name TEXT,region TEXT,summary TEXT,image_url TEXT,video_url TEXT,source TEXT,author TEXT,status TEXT,is_vip INTEGER,views INTEGER DEFAULT 0,content TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT,published_at TEXT);`);
        const password = await bcrypt.hash("StaffFixture123!", 4);
        for (let id = 1; id <= 25; id++) {
            await run("INSERT INTO users(id,username,account,account_type,email,password_hash) VALUES(?,?,?,'email',?,?)", [id, id === 6 ? "PANTIEZHAN" : "Fixture" + id, "fixture" + id + "@example.test", "fixture" + id + "@example.test", password]);
            await run("INSERT INTO wallets(user_id,balance) VALUES(?,?)", [id, id * 17]);
        }
        await exec("INSERT INTO payment_orders VALUES(1,8,136,'paid'); INSERT INTO user_subscriptions VALUES(8,'active'); INSERT INTO news(id,title,status,content) VALUES(1,'Fixture draft','draft','Synthetic body');");
        await require("../scripts/migrate-account-admin").migrate(db);
        await run("INSERT INTO admin_user_roles(user_id,role,updated_at) VALUES(1,'admin','2026-10-01'),(3,'editor','2026-10-01'),(6,'editor','2026-10-01')");
        const finance = JSON.stringify(await all("SELECT * FROM wallets")) + JSON.stringify(await all("SELECT * FROM payment_orders")) + JSON.stringify(await all("SELECT * FROM user_subscriptions"));
        await t.test("HR compatibility migration repeats safely and preserves old roles, users, finances and foreign keys", async () => {
            const before = await all("SELECT * FROM admin_user_roles ORDER BY user_id");
            const migrate = require("../scripts/migrate-admin-roles").migrate;
            await migrate(db); await migrate(db);
            assert.deepEqual(await all("SELECT * FROM admin_user_roles ORDER BY user_id"), before);
            assert.equal((await get("SELECT COUNT(*) n FROM users")).n, 25);
            assert.equal((await get("PRAGMA integrity_check")).integrity_check, "ok");
            assert.equal(await get("PRAGMA foreign_key_check"), undefined);
        });
        // A pre-approved fixture HR, never an online high-risk role grant.
        await run("INSERT INTO admin_user_roles(user_id,role) VALUES(2,'hr')");
        const identityModule = require("../middleware/adminIdentity");
        const identity = { ...identityModule, ...identityModule.createAdminIdentity(db) };
        const transactions = require("../utils/authTransaction");
        let queued;
        const accounts = load("routes/accountAdminRoute.js", { "../db": db, "../middleware/adminIdentity": identity,
            "../utils/authTransaction": { withAuthTransaction: (source, operation) => { if (queued) queued(); return transactions.withAuthTransaction(source, operation); } } });
        const userAuth = load("middleware/userAuth.js", { "../db": db });
        const newsAccess = load("middleware/newsReadAccess.js", { "./adminIdentity": identity });
        const app = express(); app.use(express.json());
        app.use("/api/admin/users", accounts);
        app.use("/api/admin/auth", load("routes/adminIdentityRoute.js", { "../db": db, "../middleware/adminIdentity": identity }));
        app.use("/api/news", load("routes/newsRoute.js", { "../db": db, "../middleware/adminAuth": identity, "../middleware/userAuth": userAuth, "../middleware/newsReadAccess": newsAccess }));
        app.use("/api/admin/site-fixture", identity.verifyAdminToken, (_req, res) => res.json({ success: true }));
        app.get("/protected", userAuth.verifyUserToken, (_req, res) => res.json({ success: true }));
        server = await new Promise(ok => { const s = app.listen(0, "127.0.0.1", () => ok(s)); });
        const base = "http://127.0.0.1:" + server.address().port;
        async function request(url, token, body, method = body === undefined ? "GET" : "POST") {
            const r = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
            return { status: r.status, body: await r.json() };
        }
        const login = (username, password = "StaffFixture123!") => request("/api/admin/auth/login", null, { username, password });
        const owner = (await login("PANTIEZHAN", "OwnerFixture123!")).body.token;
        const admin = (await login("Fixture1")).body.token, hr = (await login("Fixture2")).body.token, editor = (await login("Fixture3")).body.token;
        assert(owner && admin && hr && editor);
        const action = (id, name, token = owner, extra = {}) => request("/api/admin/users/" + id + "/" + name, token, { reason: "Synthetic administrator audit reason", ...extra });
        const member = id => jwt.sign({ id, auth_version: 0 }, process.env.JWT_SECRET, { expiresIn: "1h" });
        await t.test("PANTIEZHAN uses trusted configured principal; usernames, frontend role claims and member tokens cannot impersonate owner", async () => {
            assert.equal((await request("/api/admin/auth/verify", owner)).body.admin.principal, "environment");
            assert.equal((await login("PANTIEZHAN")).status, 401);
            const forged = jwt.sign({ id: 6, username: "PANTIEZHAN", principal: "user", role: "admin", type: "admin_access", auth_version: 0, adminRole: "superadmin" }, process.env.ADMIN_JWT_SECRET);
            assert.equal((await request("/api/admin/auth/verify", forged)).body.admin.adminRole, "editor");
            assert.equal((await request("/api/admin/users", member(6))).status, 401);
            for (const actor of [{ adminRole: "superadmin", principal: "environment" }, { adminRole: "admin", id: 1 }, { adminRole: "hr", id: 2 }]) {
                assert.deepEqual(identity.accountActions(actor, { id: 1000, admin_role: "superadmin", account_status: "active" }), []);
            }
            assert.equal((await action("PANTIEZHAN", "temporary-ban", admin, { days: 1 })).status, 400);
        });
        await t.test("permission matrix preserves news editor/admin rights and excludes HR from news/site and ordinary members from administration", async () => {
            for (const token of [owner, admin, hr]) assert.equal((await request("/api/admin/users", token)).status, 200);
            assert.equal((await request("/api/admin/users", editor)).status, 403);
            assert.equal((await request("/api/news/admin-page", editor)).status, 200);
            assert.equal((await request("/api/news/admin-page", hr)).status, 403);
            assert.equal((await request("/api/admin/site-fixture", hr)).status, 403);
            assert.equal((await request("/api/admin/site-fixture", admin)).status, 200);
        });
        await t.test("independent approval is mandatory for every direct admin/HR/owner grant, including requests by owner", async () => {
            for (const token of [owner, admin, hr, editor]) for (const role of ["admin", "hr", "superadmin"]) assert.equal((await action(4, "role", token, { role })).status, 403);
            assert.equal((await action(2, "role", hr, { role: "editor" })).status, 403);
            assert.equal((await action(1, "role", admin, { role: "editor" })).status, 403);
            assert.equal((await action(1, "temporary-ban", admin, { days: 1 })).status, 403);
            assert.equal((await action(1, "role", hr, { role: "member" })).status, 403);
        });
        await t.test("HR grants only standard roles, cannot moderate accounts, and role changes revoke old member tokens and write actor/from/to audit", async () => {
            assert.equal((await action(4, "role", hr, { role: "editor" })).status, 200);
            assert.equal((await get("SELECT role FROM admin_user_roles WHERE user_id=4")).role, "editor");
            assert.equal((await request("/protected", member(4))).status, 401);
            const audit = await get("SELECT * FROM admin_account_audit WHERE user_id=4 ORDER BY id DESC LIMIT 1");
            assert.equal(audit.admin_actor, "user:2"); assert.equal(audit.action, "role:editor"); assert(audit.reason.includes("from:member to:editor")); assert(audit.created_at);
            assert.equal((await action(4, "role", hr, { role: "member" })).status, 200);
            for (const name of ["temporary-ban", "permanent-ban", "unban", "soft-delete", "restore"]) assert.equal((await action(5, name, hr, { days: 7 })).status, 403);
        });
        await t.test("moderators select valid ban periods and reasons, only owner controls permanent bans and staff accounts", async () => {
            assert.equal((await action(5, "temporary-ban", admin, { days: 2 })).status, 400);
            assert.equal((await action(5, "temporary-ban", admin, { days: 7, reason: "bad" })).status, 400);
            assert.equal((await action(5, "temporary-ban", admin, { days: 7 })).status, 200);
            assert.equal((await request("/protected", member(5))).status, 403);
            assert.equal((await action(5, "unban", admin)).status, 200);
            assert.equal((await request("/protected", member(5))).status, 401);
            assert.equal((await action(5, "permanent-ban", admin)).status, 403);
            assert.equal((await action(3, "temporary-ban", admin, { days: 7 })).status, 403);
            assert.equal((await action(5, "permanent-ban")).status, 200);
            assert.equal((await action(5, "unban", admin)).status, 403);
            assert.equal((await action(5, "temporary-ban", owner, { days: 1 })).status, 403);
            assert.equal((await action(5, "unban")).status, 200);
        });
        await t.test("soft delete/restore preserves permanent ban and financial rows; anonymized history remains blocked", async () => {
            await action(8, "permanent-ban"); await action(8, "soft-delete");
            assert.equal((await get("SELECT account_status FROM users WHERE id=8")).account_status, "deleted");
            assert.equal((await action(8, "restore")).status, 200);
            assert.equal((await get("SELECT account_status FROM users WHERE id=8")).account_status, "permanent_ban");
            assert.equal((await request("/protected", member(8))).status, 403);
            await action(7, "soft-delete");
            await run("UPDATE users SET username='__v115_deleted_user_7__',account='__v115_deleted_account_7__',email=NULL WHERE id=7");
            assert.equal((await action(7, "restore")).status, 409);
            const listed = (await request("/api/admin/users?search=__v115_deleted_user_7__", owner)).body.users[0];
            assert(!listed.allowed_actions.includes("restore"));
            assert.equal(JSON.stringify(await all("SELECT * FROM wallets")) + JSON.stringify(await all("SELECT * FROM payment_orders")) + JSON.stringify(await all("SELECT * FROM user_subscriptions")), finance);
        });
        await t.test("list preserves fields, role/status search and pagination; expired bans display and filter as active", async () => {
            const page = (await request("/api/admin/users?page=2", hr)).body;
            assert.equal(page.page, 2); assert.equal(page.users.length, 5); assert.equal(page.limit, 20);
            const filtered = (await request("/api/admin/users?role=hr&search=Fixture2", owner)).body;
            assert.equal(filtered.users.length, 1); assert.equal(filtered.users[0].admin_role, "hr");
            for (const key of ["email", "member_level", "subscription_status", "balance", "created_at", "account_status", "allowed_actions", "assignable_roles"]) assert(Object.hasOwn(filtered.users[0], key));
            await run("UPDATE users SET account_status='temporary_ban',banned_until='2000-01-01T00:00:00Z' WHERE id=11");
            const active = (await request("/api/admin/users?status=active&search=Fixture11", hr)).body;
            assert.equal(active.users[0].effective_status, "active");
            assert.equal((await request("/api/admin/users?status=temporary_ban&search=Fixture11", hr)).body.users.length, 0);
        });
        await t.test("audit failure rolls back roles/state/auth_version and releases transaction for later work", async () => {
            const before = await get("SELECT account_status,auth_version FROM users WHERE id=10");
            await exec("CREATE TRIGGER fixture_audit_failure BEFORE INSERT ON admin_account_audit BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END;");
            assert.equal((await action(10, "role", hr, { role: "editor" })).status, 503);
            assert.equal(await get("SELECT role FROM admin_user_roles WHERE user_id=10"), undefined);
            assert.deepEqual(await get("SELECT account_status,auth_version FROM users WHERE id=10"), before);
            await exec("DROP TRIGGER fixture_audit_failure");
            assert.equal((await action(10, "temporary-ban", owner, { days: 3 })).status, 200);
        });
        await t.test("concurrent duplicate role changes commit once, and revoked actor is rechecked inside the transaction", async () => {
            const responses = await Promise.all([action(9, "role", hr, { role: "editor" }), action(9, "role", hr, { role: "editor" })]);
            assert.deepEqual(responses.map(r => r.status).sort(), [200,409]);
            assert.equal((await get("SELECT COUNT(*) n FROM admin_account_audit WHERE user_id=9")).n, 1);
            let release, holding;
            const gate = new Promise(ok => { release = ok; }), entered = new Promise(ok => { holding = ok; });
            const blocking = transactions.withAuthTransaction(db, async tx => { await tx.run("UPDATE users SET auth_version=auth_version+1 WHERE id=2"); holding(); await gate; });
            await entered;
            const seenQueue = new Promise(ok => { queued = ok; });
            const denied = action(12, "role", hr, { role: "editor" });
            await seenQueue; queued = null; release(); await blocking;
            assert.equal((await denied).status, 403);
            assert.equal(await get("SELECT role FROM admin_user_roles WHERE user_id=12"), undefined);
            assert.equal((await request("/api/admin/auth/verify", hr)).status, 401);
        });
        await t.test("migration refuses unexpected role dependencies and leaves old schema/data intact", async () => {
            const extra = await new Promise((ok, no) => { const c = new sqlite.Database(path.join(directory, "old-layout.sqlite"), e => e ? no(e) : ok(c)); });
            const fixture = api(extra);
            try {
                await fixture.exec("CREATE TABLE users(id INTEGER PRIMARY KEY); INSERT INTO users VALUES(1); CREATE TABLE admin_user_roles(user_id INTEGER PRIMARY KEY REFERENCES users(id),role TEXT NOT NULL CHECK(role IN ('editor','admin')),updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP); INSERT INTO admin_user_roles(user_id,role) VALUES(1,'admin'); CREATE INDEX custom_role_index ON admin_user_roles(role);");
                await assert.rejects(require("../scripts/migrate-admin-roles").migrate(extra), /manual review/);
                assert.equal((await fixture.get("SELECT role FROM admin_user_roles WHERE user_id=1")).role, "admin");
                assert.equal(await fixture.get("SELECT name FROM sqlite_master WHERE name='admin_user_roles_hr_upgrade'"), undefined);
            } finally { await new Promise((ok, no) => extra.close(e => e ? no(e) : ok())); }
        });
    } finally {
        if (server) await new Promise(ok => server.close(ok));
        await new Promise((ok, no) => db.close(e => e ? no(e) : ok()));
        for (const [key, value] of Object.entries(previous)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
});

test("admin users UI: authorized role dialog, server-driven operations and filter/page navigation preserve layout", async () => {
    const elements = new Map(), calls = [];
    function element(tag = "div") {
        const item = { tagName: tag, value: "", textContent: "", children: [], dataset: {}, style: {}, events: {}, disabled: false,
            appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
            addEventListener(event, fn) { this.events[event] = fn; }, focus() {}, showModal() { this.open = true; }, close() { this.open = false; } };
        Object.defineProperty(item, "options", { get() { return this.children; } }); return item;
    }
    const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
    get("userStatusFilter").value = "all"; get("userRoleFilter").value = "all";
    const user = { id: 5, username: "Fixture", admin_role: "member", account_status: "active", allowed_actions: ["role"], assignable_roles: ["member", "editor"] };
    const context = { document: { getElementById: get, querySelector: () => get("tbody"), createElement: element, createTextNode: text => ({ textContent: text }) }, URLSearchParams,
        localStorage: { getItem: () => "fixture-admin-token" }, console, setTimeout: fn => fn(), clearTimeout() {},
        window: { confirm: () => true, alert: message => { throw Error(message); } },
        fetch: async (url, options) => {
            calls.push({ url, options }); const page = Number(new URL(url, "http://fixture.test").searchParams.get("page") || 1);
            if (options.method === "POST") { user.admin_role = JSON.parse(options.body).role; return { ok: true, json: async () => ({ success: true }) }; }
            return { ok: true, json: async () => ({ success: true, users: [user], page, limit: 20, total: 25, admin: { adminRole: "hr" }, role_labels: { hr: "HR", member: "普通用户", editor: "新闻编辑" }, owner_identity: { username: "PANTIEZHAN" } }) };
        } };
    vm.createContext(context); vm.runInContext(fs.readFileSync(path.join(root, "admin/admin-users-live.js"), "utf8"), context);
    const tick = () => new Promise(ok => setImmediate(ok)); await tick();
    const actions = get("tbody").children[0].children[8].children;
    assert.deepEqual(actions.map(b => b.textContent), ["查看", "设置角色"]);
    await actions[1].events.click();
    assert.equal(get("userRoleDialog").open, true); assert(get("userRoleCurrent").textContent.includes("普通用户"));
    assert.deepEqual(get("userRoleSelect").children.map(option => option.value), ["member", "editor"]);
    get("userRoleSelect").value = "editor"; get("userRoleSelect").events.change(); get("userRoleReason").value = "Synthetic HR role reason";
    await get("userRoleForm").events.submit({ preventDefault() {} });
    assert.equal(get("userRoleDialog").open, false);
    assert.equal(calls.find(call => call.options.method === "POST").options.headers.Authorization, "Bearer fixture-admin-token");
    get("usersNextPage").events.click(); await tick(); assert(calls.at(-1).url.includes("page=2"));
    get("userRoleFilter").value = "editor"; get("userRoleFilter").events.change(); await tick();
    assert(calls.at(-1).url.includes("page=1") && calls.at(-1).url.includes("role=editor"));
    const html = fs.readFileSync(path.join(root, "admin/admin-users.html"), "utf8");
    assert.equal((html.match(/<th>/g) || []).length, 9); assert(html.includes('id="userRoleDialog"'));
});
