"use strict";
// Targeted tests use a synthetic in-memory database; no dotenv, email or payment calls.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), Module = require("node:module");
const express = require("express"), sqlite = require("sqlite3"), jwt = require("jsonwebtoken");
const root = path.resolve(__dirname, "..");
const source = name => fs.readFileSync(path.join(root, name), "utf8");
function load(name, overrides) {
  const filename = path.join(root, name), m = new Module(filename);
  m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
  m.require = key => {
    if (Object.hasOwn(overrides, key)) return overrides[key];
    if (key === "../db" || key === "dotenv") throw Error("Real database/config forbidden");
    return Module.prototype.require.call(m, key);
  };
  m._compile(source(name), filename); return m.exports;
}
function browser(values = new Map(), fetch = async () => ({ status: 200, ok: true, json: async () => ({ success: true, user: { username: "Fixture" } }) }), temporaryValues = new Map()) {
  function element() {
    return { value: "", textContent: "", style: {}, dataset: {}, children: [], listeners: {}, classList: { add() {}, remove() {} },
      setAttribute(k, v) { this[k] = v; }, removeAttribute(k) { delete this[k]; },
      addEventListener(k, fn) { this.listeners[k] = fn; },
      appendChild(child) { this.children.push(child); }, append(...children) { this.children.push(...children); },
      replaceChildren(...children) { this.children = children; } };
  }
  const elements = new Map(), events = {}, timers = [];
  const context = { console: { log() {}, warn() {}, error() {} }, URLSearchParams, Date,
    localStorage: { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, String(v)), removeItem: k => values.delete(k) },
    sessionStorage: { getItem: k => temporaryValues.get(k) ?? null, setItem: (k, v) => temporaryValues.set(k, String(v)), removeItem: k => temporaryValues.delete(k) },
    document: { body: { style: {} }, querySelector() { return null; },
      getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      createElement: element, addEventListener(k, fn) { events["document:" + k] = fn; } },
    location: { pathname: "/admin/admin-news.html", href: "/", reload() {} },
    addEventListener(k, fn) { events[k] = fn; },
    setTimeout(fn) { timers.push(fn); return timers.length; }, clearTimeout(id) { timers[id - 1] = null; },
    setInterval() {}, clearInterval() {}, alert() {}, confirm: () => true, fetch };
  context.window = context; vm.createContext(context);
  return { context, elements, events, values, temporaryValues, timers, run: file => vm.runInContext(source(file), context) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function startSession(b) {
  b.run("public/auth-session.js"); b.run("public/auth-modal.js"); b.events["document:DOMContentLoaded"]();
}

test("login: real login callback persists across fresh page contexts and legacy storage is restored", async () => {
  const values = new Map();
  const first = browser(values, async url => ({ status: 200, ok: true,
    json: async () => url.endsWith("/login") ? { success: true, token: "synthetic-token", user: { username: "Fixture" } } : { success: true, user: { username: "Fixture" } } }));
  startSession(first);
  first.context.document.getElementById("loginAccount").value = "fixture@example.test";
  first.context.document.getElementById("loginPassword").value = "Fixture123!";
  await first.elements.get("loginForm").listeners.submit({ preventDefault() {} });
  assert.equal(values.get("token"), "synthetic-token");
  const reopened = browser(values); startSession(reopened); await tick();
  assert.equal(reopened.elements.get("authUserName").textContent, "Fixture");
  assert.equal(reopened.elements.get("loginBtn").style.display, "none");
  values.delete("token"); values.delete("dailynewsUser");
  const legacy = browser(values); startSession(legacy); await tick();
  assert.equal(values.get("token"), "synthetic-token");
  assert.equal(legacy.elements.get("authUserName").textContent, "Fixture");
});

test("login: transient errors and invalid profile cache retain the token; explicit logout clears every alias", async () => {
  const values = new Map([["token", "fixture"], ["dailynews_token", "fixture"], ["dailynewsUser", "{invalid"], ["dailynews_user", '{"username":"Cached"}']]);
  const b = browser(values, async () => { throw Error("Failed to fetch"); }); startSession(b); await tick();
  assert.equal(values.get("token"), "fixture");
  assert.equal(b.elements.get("authUserName").textContent, "Cached");
  b.elements.get("logoutBtn").listeners.click(); assert.equal(values.size, 0);
  const reopened = browser(values); startSession(reopened);
  assert.equal(reopened.elements.get("authUserArea").style.display, "none");
});

test("login: 401/403 revoke cached login; 429/503 do not; old requests cannot clear a new login", async () => {
  for (const status of [401, 403, 429, 503]) {
    const values = new Map([["token", "old"], ["dailynewsUser", '{"username":"Cached"}']]);
    const b = browser(values, async () => ({ status, ok: false, json: async () => ({ success: false }) }));
    startSession(b); await tick();
    assert.equal(values.has("token"), status !== 401 && status !== 403);
  }
  let finish;
  const b = browser(new Map([["token", "old"]]), () => new Promise(resolve => { finish = resolve; }));
  startSession(b); b.context.dailynewsSession.save("new", { username: "New" });
  finish({ status: 401 }); await tick(); assert.equal(b.values.get("token"), "new");
});

test("login: restored browser history and other-tab logout refresh the visible identity", async () => {
  const b = browser(new Map([["token", "fixture"], ["dailynewsUser", '{"username":"Cached"}']]));
  startSession(b); await tick();
  b.context.dailynewsSession.clear(); b.events.storage({ key: "token" });
  assert.equal(b.elements.get("authUserArea").style.display, "none");
  b.context.dailynewsSession.save("fixture", { username: "Cached" });
  b.events.pageshow({ persisted: true }); await tick();
  assert.equal(b.elements.get("authUserName").textContent, "Fixture");
});

test("login: standalone login and member/wallet pages use the same persistent session; wallet 503 cannot log out", async () => {
  const standalone = browser(new Map(), async () => ({ status: 200, ok: true,
    json: async () => ({ success: true, token: "standalone-fixture", user: { username: "Fixture" } }) }));
  standalone.context.location.hostname = "www.dailynews.report";
  standalone.run("public/auth-session.js");
  vm.runInContext(source("login.html").match(/<script>([\s\S]*?)<\/script>/)[1], standalone.context);
  standalone.context.document.getElementById("account").value = "fixture@example.test";
  standalone.context.document.getElementById("password").value = "Fixture123!";
  await standalone.context.login();
  assert.equal(standalone.values.get("token"), "standalone-fixture");
  const returned = browser(standalone.values); startSession(returned); await tick();
  assert.equal(returned.elements.get("authUserName").textContent, "Fixture");
  const b = browser(new Map([["dailynews_token", "fixture"]]), async () => ({ status: 503, ok: false, json: async () => ({ success: false }) }));
  b.run("public/auth-session.js");
  const wallet = source("public/wallet.html").match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(wallet, b.context); await tick();
  assert.equal(b.values.get("token"), "fixture");
  for (const name of ["public/index.html", "public/my.html", "public/wallet.html", "login.html", "register.html"]) {
    assert(source(name).includes('/auth-session.js?v=20261023-remember'), name);
  }
  assert(source("login.html").includes("window.dailynewsSession.save(data.token, data.user)"));
});

test("remember choice: checkbox defaults checked, sits below password, and preserves compact modal controls", () => {
  const html = source("public/index.html");
  assert.match(html, /<input type="checkbox" id="rememberLogin"[^>]*\bchecked\s*\/>/);
  assert(html.indexOf('id="rememberLogin"') > html.indexOf('id="loginPassword"'));
  assert(html.indexOf('id="rememberLogin"') < html.indexOf('<button type="submit" class="auth-submit-btn">'));
  assert(html.includes("记住登录状态"));
  assert(html.includes('#loginModal .auth-message:empty { display: none; }'));
  assert(html.includes('id="forgotPasswordBtn"')); assert(html.includes('id="switchToRegister"'));
});

test("remember choice: successful modal callback selects persistent or session storage and updates identity", async () => {
  for (const remember of [true, false]) {
    const b = browser(new Map([["dailynewsLikes", "keep"]]), async url => ({ status: 200, ok: true,
      json: async () => url.endsWith("/login") ? { success: true, token: "choice-token", user: { username: "SignedInMember" } } : { success: true, user: { username: "SignedInMember" } } }));
    startSession(b);
    const field = id => b.context.document.getElementById(id);
    field("loginAccount").value = "autofilled@example.test";
    field("loginPassword").value = "Autofilled123!";
    field("rememberLogin").checked = remember;
    assert.equal(field("authUserArea").style.display, "none", "Autofill alone is not authentication");
    await field("loginForm").listeners.submit({ preventDefault() {} });
    assert.equal(field("authUserName").textContent, "SignedInMember");
    assert.equal(field("authUserArea").style.display, "flex");
    const selected = remember ? b.values : b.temporaryValues;
    const other = remember ? b.temporaryValues : b.values;
    assert.equal(selected.get("token"), "choice-token");
    assert.equal(selected.get("dailynews_token"), "choice-token");
    assert.equal(other.has("token"), false); assert.equal(other.has("dailynewsUser"), false);
    assert.equal(b.values.get("dailynewsLikes"), "keep");
    const refreshed = browser(b.values, b.context.fetch, b.temporaryValues); startSession(refreshed); await tick();
    assert.equal(refreshed.elements.get("authUserName").textContent, "SignedInMember");
    assert.equal(other.has("token"), false, "Profile refresh cannot promote a session-only token");
    const reopened = browser(b.values, b.context.fetch); startSession(reopened); await tick();
    assert.equal(reopened.elements.get("authUserArea").style.display, remember ? "flex" : "none");
  }
});

test("remember choice: changing mode removes old credentials from both stores; explicit logout clears all aliases", () => {
  const b = browser(new Map([["token", "old"], ["user", "{}"], ["adminToken", "unrelated"]]), undefined,
    new Map([["dailynews_token", "old-session"], ["dailynews_user", "{}"]]));
  b.run("public/auth-session.js");
  b.context.dailynewsSession.save("session-only", { username: "Session" }, false);
  assert.equal(b.values.has("token"), false); assert.equal(b.values.has("user"), false);
  b.context.dailynewsSession.save("persistent", { username: "Persistent" }, true);
  assert.equal(b.temporaryValues.size, 0);
  startSession(b);
  b.temporaryValues.set("user", "{}"); b.elements.get("logoutBtn").listeners.click();
  assert.deepEqual([...b.values], [["adminToken", "unrelated"]]); assert.equal(b.temporaryValues.size, 0);
});

test("remember choice: session-only validation clears 401/403, retains temporary failures and ignores stale responses", async () => {
  for (const status of [401, 403, 429, 503]) {
    const b = browser(new Map(), async () => ({ status, ok: false, json: async () => ({ success: false }) }),
      new Map([["token", "session-only"], ["dailynewsUser", '{"username":"Cached"}']]));
    startSession(b); await tick();
    assert.equal(b.temporaryValues.has("token"), status !== 401 && status !== 403);
    assert.equal(b.values.size, 0);
  }
  let finish;
  const b = browser(new Map(), () => new Promise(resolve => { finish = resolve; }), new Map([["token", "old"]]));
  startSession(b); b.context.dailynewsSession.save("new", { username: "New" }, false);
  finish({ status: 401 }); await tick(); assert.equal(b.temporaryValues.get("token"), "new");
});

test("remember choice: member profile refresh and wallet requests use session token without creating persistent credentials", async () => {
  const calls = [];
  const b = browser(new Map(), async (url, options) => {
    calls.push({ url, options }); return { status: 200, ok: true,
      json: async () => ({ success: true, user: { username: "SessionMember" }, wallet: {} }) };
  }, new Map([["token", "session-only"]]));
  b.run("public/auth-session.js");
  Object.assign(b.context, { API_AUTH: "/api/auth", API_WALLET: "/api/wallet", requireLogin: () => b.context.dailynewsSession.token(),
    clearLoginData: () => b.context.dailynewsSession.clear(), setUserProfile() {}, setWalletData() {}, showMessage() {} });
  const html = source("public/my.html");
  const profile = html.slice(html.indexOf("    async function loadMyProfile()"), html.indexOf("    async function openCustomerPortal()"));
  vm.runInContext(profile, b.context); await b.context.loadMyProfile();
  assert.equal(b.values.size, 0);
  assert.equal(JSON.parse(b.temporaryValues.get("dailynewsUser")).username, "SessionMember");
  assert(calls.some(call => call.url === "/api/wallet/me"));
  assert(calls.every(call => call.options.headers.Authorization === "Bearer session-only"));
});

test("remember choice: failed login does not authenticate autofilled fields or save credentials", async () => {
  const b = browser(new Map(), async () => ({ status: 401, ok: false, json: async () => ({ success: false, message: "Invalid login" }) }));
  startSession(b);
  b.context.document.getElementById("loginAccount").value = "autofilled@example.test";
  b.context.document.getElementById("loginPassword").value = "Autofilled123!";
  b.context.document.getElementById("rememberLogin").checked = false;
  await b.elements.get("loginForm").listeners.submit({ preventDefault() {} });
  assert.equal(b.elements.get("authUserArea").style.display, "none");
  assert.equal(b.values.size, 0); assert.equal(b.temporaryValues.size, 0);
});

test("remember choice: password reset success clears both persistent and session credentials", async () => {
  const b = browser(new Map([["token", "persistent"]]), async () => ({ status: 200, ok: true,
    json: async () => ({ success: true, message: "Synthetic reset success" }) }), new Map([["token", "temporary"]]));
  b.run("public/password-reset.js"); b.events["document:DOMContentLoaded"]();
  const field = id => b.context.document.getElementById(id);
  field("resetEmail").value = "fixture@example.test"; field("resetCode").value = "123456";
  field("resetPassword").value = field("resetConfirmPassword").value = "Synthetic123!";
  field("passwordResetForm").reset = () => {};
  await field("passwordResetForm").listeners.submit({ preventDefault() {} });
  assert.equal(b.values.size, 0); assert.equal(b.temporaryValues.size, 0);
});

test("admin news: frontend uses authenticated same-origin backend paging, next/previous/page jump and reset-on-filter", async () => {
  const calls = [];
  const b = browser(new Map([["adminToken", "fixture-admin"]]), async (url, options) => {
    calls.push({ url, options }); const page = Number(new URL(url, "https://www.dailynews.report").searchParams.get("page") || 1);
    return { status: 200, ok: true, json: async () => ({ success: true,
      data: [{ id: 1, title: "Fixture", status: "draft" }], pagination: { page, pageSize: 10, totalPages: 4, total: 34 }, statistics: { total: 34, today: 4, api: 2, pending: 3 } }) };
  });
  b.run("admin/admin-news.js"); await b.context.loadAdminNewsRecords();
  assert.equal(calls[0].url, "/api/news/admin-page?page=1&search=&status=all&ai=all");
  assert.equal(calls[0].options.headers.Authorization, "Bearer fixture-admin");
  assert.equal(b.elements.get("newsTotalCount").textContent, "34");
  let controls = b.elements.get("adminNewsPagination").children;
  await controls.find(e => e.textContent === "下一页").listeners.click();
  assert(calls.at(-1).url.includes("page=2"));
  controls = b.elements.get("adminNewsPagination").children;
  await controls.find(e => e.textContent === "上一页").listeners.click();
  controls = b.elements.get("adminNewsPagination").children;
  const form = controls.at(-1); form.children[0].value = "4";
  form.listeners.submit({ preventDefault() {} }); await tick(); assert(calls.at(-1).url.includes("page=4"));
  b.context.document.getElementById("newsSearchInput").value = "unique";
  b.context.document.getElementById("newsStatusFilter").value = "draft";
  b.context.document.getElementById("newsAiFilter").value = "generated";
  b.context.filterNewsRecords(); await b.timers.at(-1)();
  assert(calls.at(-1).url.includes("page=1&search=unique&status=draft&ai=generated"));
  await b.context.deleteRealNews(1);
  const deletion = calls.find(call => call.options.method === "DELETE");
  assert.equal(deletion.options.headers.Authorization, "Bearer fixture-admin");
});

test("admin news: transient admin verification failure does not erase administrator credentials", async () => {
  const b = browser(new Map([["adminToken", "fixture-admin"]]), async () => { throw Error("Failed to fetch"); });
  const script = source("admin/admin.js");
  vm.runInContext(script.slice(0, script.indexOf("})();") + 5), b.context); await tick();
  assert.equal(b.values.get("adminToken"), "fixture-admin");
});

test("admin news: real SQLite backend pagination, authorization, filters and existing operations", async t => {
  const db = new sqlite.Database(":memory:");
  const run = (sql, args = []) => new Promise((resolve, reject) => db.run(sql, args, e => e ? reject(e) : resolve()));
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, e => e ? reject(e) : resolve()));
  const previous = { ADMIN_JWT_SECRET: process.env.ADMIN_JWT_SECRET, ADMIN_USERNAME: process.env.ADMIN_USERNAME, JWT_SECRET: process.env.JWT_SECRET };
  process.env.ADMIN_JWT_SECRET = require("node:crypto").randomBytes(32).toString("hex");
  process.env.JWT_SECRET = require("node:crypto").randomBytes(32).toString("hex");
  process.env.ADMIN_USERNAME = "FixtureOwner";
  let server;
  try {
    await exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT,account_status TEXT,banned_until TEXT,auth_version INTEGER);
      CREATE TABLE admin_user_roles(user_id INTEGER,role TEXT);
      CREATE TABLE news(id INTEGER PRIMARY KEY,title TEXT,category TEXT,country_code TEXT,country_name TEXT,region TEXT,
      summary TEXT,content TEXT,image_url TEXT,video_url TEXT,source TEXT,author TEXT,status TEXT,is_vip INTEGER,views INTEGER,
      created_at TEXT,updated_at TEXT,published_at TEXT);
      INSERT INTO users VALUES(1,'Editor','active',NULL,0); INSERT INTO admin_user_roles VALUES(1,'editor');`);
    for (let id = 1; id <= 25; id++) await run(`INSERT INTO news(id,title,category,country_code,summary,content,author,status,is_vip,created_at)
      VALUES(?,?,'finance','sg',?,'Synthetic body','GNews',?,0,'2026-10-23')`, [id, id === 3 ? "literal %_ keyword" : "Fixture " + id, id % 2 ? "Summary" : "", id % 3 ? "published" : "draft"]);
    const identityModule = require("../middleware/adminIdentity");
    const identity = { ...identityModule, ...identityModule.createAdminIdentity(db) };
    const access = load("middleware/newsReadAccess.js", { "./adminIdentity": identity });
    const userAuth = load("middleware/userAuth.js", { "../db": db });
    const news = load("routes/newsRoute.js", { "../db": db, "../middleware/adminAuth": identity, "../middleware/newsReadAccess": access, "../middleware/userAuth": userAuth });
    const app = express(); app.use(express.json()); app.use("/api/news", news);
    server = await new Promise(resolve => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
    const base = "http://127.0.0.1:" + server.address().port;
    const owner = jwt.sign({ username: "FixtureOwner", role: "admin", type: "admin_access", principal: "environment" }, process.env.ADMIN_JWT_SECRET);
    const editor = jwt.sign({ id: 1, role: "admin", type: "admin_access", principal: "user", auth_version: 0 }, process.env.ADMIN_JWT_SECRET);
    async function request(url, token = owner, method = "GET", body) {
      const response = await fetch(base + url, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    }
    await t.test("anonymous/member access is denied; superadmin and editor receive drafts", async () => {
      assert.equal((await request("/api/news/admin-page", null)).status, 401);
      const member = jwt.sign({ id: 1, auth_version: 0 }, process.env.JWT_SECRET);
      assert.equal((await request("/api/news/admin-page", member)).status, 401);
      assert.equal((await request("/api/news/admin-page", owner)).status, 200);
      assert((await request("/api/news/admin-page", editor)).body.data.some(n => n.status === "draft"));
    });
    await t.test("page size is ten with stable tied timestamps and no overlap; final and excessive pages work", async () => {
      const one = (await request("/api/news/admin-page?page=1")).body;
      const two = (await request("/api/news/admin-page?page=2")).body;
      assert.equal(one.data.length, 10); assert.equal(one.pagination.total, 25); assert.equal(one.pagination.pageSize, 10);
      assert.deepEqual(one.data.map(n => n.id), [25,24,23,22,21,20,19,18,17,16]);
      assert(!two.data.some(n => one.data.some(x => x.id === n.id)));
      const last = (await request("/api/news/admin-page?page=999")).body;
      assert.equal(last.pagination.page, 3); assert.equal(last.data.length, 5); assert.equal(one.statistics.total, 25);
    });
    await t.test("server-side search/status/AI filters, literal wildcard search, empty result and invalid input", async () => {
      const filtered = (await request("/api/news/admin-page?status=draft&ai=generated")).body;
      assert(filtered.data.length); assert(filtered.data.every(n => n.status === "draft" && n.summary));
      const literal = (await request("/api/news/admin-page?search=" + encodeURIComponent("%_"))).body;
      assert.deepEqual(literal.data.map(n => n.id), [3]);
      const empty = (await request("/api/news/admin-page?search=absent")).body;
      assert.equal(empty.data.length, 0); assert.equal(empty.pagination.total, 0); assert.equal(empty.pagination.totalPages, 1);
      for (const query of ["page=0", "page=-1", "page=1&page=2", "status=invalid", "ai=invalid", "search[x]=bad"]) {
        assert.equal((await request("/api/news/admin-page?" + query)).status, 400, query);
      }
    });
    await t.test("backend still enforces bans and auth_version changes for admin pagination", async () => {
      await run("UPDATE users SET auth_version=1 WHERE id=1");
      assert.equal((await request("/api/news/admin-page", editor)).status, 401);
      await run("UPDATE users SET auth_version=0,account_status='permanent_ban' WHERE id=1");
      assert.equal((await request("/api/news/admin-page", editor)).status, 403);
      await run("UPDATE users SET account_status='active' WHERE id=1");
    });
    await t.test("existing detail/edit/publish/delete remain authorized; public list and homepage pagination stay isolated", async () => {
      assert.equal((await request("/api/news/3", editor)).status, 200);
      assert.equal((await request("/api/news/3", editor, "PUT", { title: "Edited fixture", content: "Edited body", status: "draft", country_code: "sg" })).status, 200);
      assert.equal((await request("/api/news/3/publish", editor, "PATCH")).status, 200);
      assert.equal((await request("/api/news/3", null, "DELETE")).status, 401);
      assert.equal((await request("/api/news/3", editor, "DELETE")).status, 200);
      const publicList = (await request("/api/news", null)).body.data;
      assert(publicList.every(n => n.status === "published"));
      const home = (await request("/api/news/public-page", null)).body;
      assert.equal(home.pagination.pageSize, 10); assert.equal(home.data.length, 10); assert(home.data.every(n => n.status === "published"));
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve()));
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
});
