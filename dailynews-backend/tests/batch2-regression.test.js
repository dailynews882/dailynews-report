"use strict";

// No server.js, dotenv, application database, real mail or payment transport.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const vm = require("node:vm");
const crypto = require("node:crypto");
const express = require("express");
const sqlite = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const root = path.resolve(__dirname, "..");
const resetPath = "/api/auth/password-reset/";

function load(relative, overrides) {
  const filename = path.join(root, relative);
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  module.require = function (name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === "../db" || name === "./db" || name === "dotenv") throw new Error("Application database/config forbidden");
    return Module.prototype.require.call(this, name);
  };
  module._compile(fs.readFileSync(filename, "utf8"), filename);
  return module.exports;
}
async function until(condition) {
  const deadline = Date.now() + 3000;
  while (!(await condition())) {
    if (Date.now() > deadline) throw new Error("Fixture condition timed out");
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

test("batch 2 isolated password reset and public pagination", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dailynews-batch2-test-"));
  const OriginalDatabase = sqlite.Database;
  const connections = new Set();
  sqlite.Database = function (filename, ...args) {
    assert.equal(path.dirname(path.resolve(filename)), directory);
    const db = new OriginalDatabase(filename, ...args);
    connections.add(db);
    const close = db.close.bind(db);
    db.close = callback => close(error => { if (!error) connections.delete(db); callback(error); });
    return db;
  };
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  const db = await new Promise((resolve, reject) => {
    const connection = new sqlite.Database(path.join(directory, "fixture.sqlite"), error => error ? reject(error) : resolve(connection));
  });
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (error) { error ? reject(error) : resolve(this); }));
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (error, row) => error ? reject(error) : resolve(row)));
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
  const inbox = new Map();
  let deliveryFailure = false;
  let failures = 0;
  let server;
  try {
    await exec(`CREATE TABLE users (
      id INTEGER PRIMARY KEY,username TEXT UNIQUE,account TEXT UNIQUE,account_type TEXT,password_hash TEXT,
      email TEXT UNIQUE,phone TEXT,email_verified INTEGER DEFAULT 1,phone_verified INTEGER DEFAULT 0,
      member_level TEXT DEFAULT 'free',subscription_status TEXT DEFAULT 'free',vip_expire_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,account_status TEXT DEFAULT 'active',banned_until TEXT,
      auth_version INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE wallets(user_id INTEGER UNIQUE,balance REAL DEFAULT 0,reward_balance REAL DEFAULT 0,status TEXT DEFAULT 'active');
      CREATE TABLE news(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT,category TEXT,country_code TEXT,country_name TEXT,
        region TEXT,summary TEXT,image_url TEXT,video_url TEXT,source TEXT,author TEXT,status TEXT,is_vip INTEGER,
        views INTEGER DEFAULT 0,content TEXT,created_at TEXT,updated_at TEXT,published_at TEXT);`);
    const migration = require("../scripts/migrate-password-reset");
    await t.test("standalone migration applies idempotently only to disposable temp fixtures", async () => {
      await migration.applyToTemporaryDatabase(db);
      await migration.applyToTemporaryDatabase(db);
      assert.equal((await get("SELECT COUNT(*) AS n FROM password_reset_otps")).n, 0);
      await assert.rejects(migration.applyToTemporaryDatabase({ filename: path.join(root, "package.json") }), /restricted/);
    });
    await t.test("migration CLI defaults to read-only and leaves schema version unchanged", async () => {
      const before = await get("PRAGMA schema_version");
      const { execFile } = require("node:child_process");
      const output = await new Promise((resolve, reject) => {
        execFile(process.execPath, [path.join(root, "scripts/migrate-password-reset.js"), "--db", db.filename],
          { timeout: 10000, env: { SystemRoot: process.env.SystemRoot || "" } },
          (error, stdout) => error ? reject(new Error("Temporary migration CLI inspection failed")) : resolve(stdout));
      });
      assert.equal(JSON.parse(output).mode, "read-only");
      assert.deepEqual(await get("PRAGMA schema_version"), before);
    });
    const originalHash = await bcrypt.hash("OriginalPass123!", 12);
    let userNumber = 0;
    const user = async (name, status = "active", verified = 1) => {
      const id = ++userNumber;
      const email = name.toLowerCase() + "@example.test";
      await run("INSERT INTO users(id,username,account,account_type,email,password_hash,account_status,email_verified) VALUES (?,?,?,'email',?,?,?,?)",
        [id, name, email, email, originalHash, status, verified]);
      await run("INSERT INTO wallets(user_id) VALUES (?)", [id]);
      return { id, email };
    };
    const active = await user("ActiveUser");
    const permanent = await user("PermanentUser", "permanent_ban");
    const deleted = await user("DeletedUser", "deleted");
    const temporary = await user("TemporaryUser", "temporary_ban");
    const unverified = await user("UnverifiedUser", "active", 0);
    const auth = load("middleware/userAuth.js", { "../db": db });
    const deps = { "../db": db, "../middleware/userAuth": auth };
    const app = express();
    app.use(express.json());
    // Isolate IP quotas between test scenarios without external proxy requests.
    app.use((req, res, next) => { Object.defineProperty(req, "ip", { value: String(req.headers["x-fixture-ip"] || "fixture-default") }); next(); });
    app.use("/api/auth", load("routes/authRoute.js", { ...deps,
      "../utils/emailSender": {
        sendPasswordResetEmail: async (email, code) => {
          if (deliveryFailure) { failures++; throw new Error("Simulated delivery failure"); }
          inbox.set(email, code);
        }, sendEmailOtp: async () => { throw new Error("Registration delivery forbidden in batch2 tests"); }
      }, "../utils/smsSender": { sendSmsOtp: async () => { throw new Error("SMS forbidden"); } }
    }));
    app.use("/api/news", load("routes/newsRoute.js", deps));
    server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    let sequence = 0;
    const request = async (url, body, ip = "fixture-" + (++sequence)) => {
      const response = await fetch(base + url, { method: body === undefined ? "GET" : "POST",
        headers: { "Content-Type": "application/json", "X-Fixture-IP": ip },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json() };
    };
    const send = (email, ip) => request(resetPath + "request", { email }, ip);
    const confirm = (email, code = inbox.get(email.trim().toLowerCase()), newPassword = "Replacement123!") => request(resetPath + "confirm", { email, code, newPassword });
    const delivered = async email => { await until(() => inbox.has(email)); return inbox.get(email); };
    await t.test("known, unknown, banned, deleted and unverified emails have identical request responses", async () => {
      const results = [];
      for (const email of [active.email, "unknown@example.test", permanent.email, deleted.email, unverified.email]) results.push(await send(email));
      for (const result of results) assert.deepEqual(result, results[0]);
      assert.equal(results[0].status, 200);
      await delivered(active.email);
      assert.equal(inbox.size, 1);
      assert.match(inbox.get(active.email), /^[1-9]\d{5}$/);
      const otp = await get("SELECT * FROM password_reset_otps WHERE email=?", [active.email]);
      assert.match(otp.code_hash, /^[a-f0-9]{64}$/);
      assert.notEqual(otp.code_hash, inbox.get(active.email));
      assert(Math.abs(Date.parse(otp.expires_at) - Date.parse(otp.created_at) - 300000) < 100);
      assert.deepEqual(await send("unknown@example.test"), results[0]);
      assert.deepEqual(await send(active.email), results[0]);
    });
    await t.test("reset updates bcrypt hash, increments auth_version and revokes the old JWT", async () => {
      const token = jwt.sign({ id: active.id, auth_version: 0 }, process.env.JWT_SECRET);
      const result = await confirm(active.email);
      assert.equal(result.status, 200); assert.equal(result.body.token, undefined);
      const current = await get("SELECT * FROM users WHERE id=?", [active.id]);
      assert.equal(current.auth_version, 1);
      assert.equal(current.account_status, "active");
      assert(await bcrypt.compare("Replacement123!", current.password_hash));
      assert(!(await bcrypt.compare("OriginalPass123!", current.password_hash)));
      const oldSession = await new Promise(resolve => auth.checkUserToken({ headers: { authorization: "Bearer " + token } }, resolve));
      assert.equal(oldSession.code, "TOKEN_REVOKED");
      assert.equal((await confirm(active.email)).status, 400);
      const login = await request("/api/auth/login", { account: active.email, password: "Replacement123!" });
      assert.equal(login.status, 200);
      assert.equal(jwt.verify(login.body.token, process.env.JWT_SECRET).auth_version, 1);
    });
    await t.test("permanent ban and soft deletion cannot reset even with an internally known decoy code", async () => {
      for (const account of [permanent, deleted, unverified]) {
        const knownDecoyHash = crypto.createHmac("sha256", process.env.JWT_SECRET)
          .update("dailynews:password-reset:v1:" + account.email + ":123456").digest("hex");
        await run("UPDATE password_reset_otps SET code_hash=? WHERE email=?", [knownDecoyHash, account.email]);
        const result = await confirm(account.email, "123456");
        assert.equal(result.status, 400);
        const row = await get("SELECT password_hash,auth_version,account_status FROM users WHERE id=?", [account.id]);
        assert.equal(row.password_hash, originalHash); assert.equal(row.auth_version, 0);
      }
    });
    await t.test("temporary ban survives reset and still blocks login", async () => {
      await run("UPDATE users SET banned_until=? WHERE id=?", [new Date(Date.now() + 86400000).toISOString(), temporary.id]);
      await send(temporary.email); await delivered(temporary.email);
      assert.equal((await confirm(temporary.email)).status, 200);
      assert.equal((await get("SELECT account_status FROM users WHERE id=?", [temporary.id])).account_status, "temporary_ban");
      assert.equal((await request("/api/auth/login", { account: temporary.email, password: "Replacement123!" })).body.code, "ACCOUNT_TEMP_BANNED");
    });
    await t.test("ban, deletion, version or email changes after issuance invalidate recovery", async () => {
      for (const change of ["account_status='permanent_ban'", "account_status='deleted'", "auth_version=auth_version+1", "email='changed@example.test'"]) {
        const account = await user("ChangeUser" + userNumber);
        await send(account.email); await delivered(account.email);
        await run("UPDATE users SET " + change + " WHERE id=?", [account.id]);
        assert.equal((await confirm(account.email)).status, 400);
        assert.equal((await get("SELECT password_hash FROM users WHERE id=?", [account.id])).password_hash, originalHash);
      }
    });
    await t.test("five parallel incorrect guesses exhaust attempts and cannot be followed by the correct code", async () => {
      const account = await user("AttemptsUser"); await send(account.email); await delivered(account.email);
      const wrong = inbox.get(account.email) === "111111" ? "222222" : "111111";
      const results = await Promise.all(Array.from({ length: 6 }, () => confirm(account.email, wrong)));
      assert(results.every(result => result.status === 400));
      const otp = await get("SELECT used,attempt_count FROM password_reset_otps WHERE email=?", [account.email]);
      assert.deepEqual(otp, { used: 1, attempt_count: 5 });
      assert.equal((await confirm(account.email)).status, 400);
    });
    await t.test("expired and superseded codes are rejected; normalized email works", async () => {
      const account = await user("ExpiredUser"); await send(account.email); await delivered(account.email);
      await run("UPDATE password_reset_otps SET expires_at=? WHERE email=?", [new Date(Date.now() - 1).toISOString(), account.email]);
      assert.equal((await confirm(account.email)).status, 400);
      await run("UPDATE password_reset_otps SET created_at=? WHERE email=?", [new Date(Date.now() - 61000).toISOString(), account.email]);
      const old = await get("SELECT id FROM password_reset_otps WHERE email=? ORDER BY id DESC LIMIT 1", [account.email]);
      inbox.delete(account.email);
      await send(" " + account.email.toUpperCase() + " "); await delivered(account.email);
      assert.equal((await get("SELECT used FROM password_reset_otps WHERE id=?", [old.id])).used, 1);
      assert.equal((await get("SELECT COUNT(*) AS n FROM password_reset_otps WHERE email=? AND used=0", [account.email])).n, 1);
      assert.equal((await confirm(" " + account.email.toUpperCase() + " ")).status, 200);
    });
    await t.test("concurrent requests send once and concurrent confirmations succeed once", async () => {
      const account = await user("ConcurrentUser");
      const sends = await Promise.all(Array.from({ length: 3 }, () => send(account.email)));
      assert(sends.every(result => result.status === 200)); await delivered(account.email);
      assert.equal((await get("SELECT COUNT(*) AS n FROM password_reset_otps WHERE email=?", [account.email])).n, 1);
      const results = await Promise.all(Array.from({ length: 3 }, () => confirm(account.email)));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 400, 400]);
      assert.equal((await get("SELECT auth_version FROM users WHERE id=?", [account.id])).auth_version, 1);
    });
    await t.test("password update failure rolls back OTP consumption and allows retry", async () => {
      const account = await user("RollbackReset"); await send(account.email); await delivered(account.email);
      await exec("CREATE TRIGGER fixture_reset_failure BEFORE UPDATE OF password_hash ON users BEGIN SELECT RAISE(ABORT,'fixture'); END;");
      assert.equal((await confirm(account.email)).status, 503);
      assert.equal((await get("SELECT used FROM password_reset_otps WHERE email=?", [account.email])).used, 0);
      assert.equal((await get("SELECT auth_version FROM users WHERE id=?", [account.id])).auth_version, 0);
      await exec("DROP TRIGGER fixture_reset_failure;");
      assert.equal((await confirm(account.email)).status, 200);
    });
    await t.test("delivery failures preserve the generic response and invalidate the undelivered code", async () => {
      const account = await user("DeliveryReset"); deliveryFailure = true;
      const known = await send(account.email); const unknown = await send("delivery-unknown@example.test");
      assert.deepEqual(known, unknown);
      await until(() => failures > 0);
      await until(async () => (await get("SELECT used FROM password_reset_otps WHERE email=?", [account.email])).used === 1);
      deliveryFailure = false;
    });
    await t.test("invalid inputs and missing configuration do not write reset records", async () => {
      assert.equal((await send("not-an-email")).status, 400);
      assert.equal((await confirm(active.email, "123456", "weak")).status, 400);
      const secret = process.env.JWT_SECRET; delete process.env.JWT_SECRET;
      try { assert.equal((await send("missing@example.test")).status, 503); }
      finally { process.env.JWT_SECRET = secret; }
      assert.equal((await get("SELECT COUNT(*) AS n FROM password_reset_otps WHERE email='missing@example.test'")).n, 0);
    });
    await t.test("email and IP rolling quotas have the same response for known and unknown accounts", async () => {
      const account = await user("QuotaReset");
      const created = new Date(Date.now() - 120000).toISOString();
      for (const email of [account.email, "quota-unknown@example.test"]) for (let i = 0; i < 5; i++) {
        await run("INSERT INTO password_reset_otps(email,code_hash,expires_at,request_ip,created_at) VALUES (?,'fixture',?,'fixture-seeded',?)", [email, created, created]);
      }
      const results = await Promise.all([send(account.email), send("quota-unknown@example.test")]);
      assert.deepEqual(results[0], results[1]);
      assert.equal((await get("SELECT COUNT(*) AS n FROM password_reset_otps WHERE email=?", [account.email])).n, 5);
      for (let i = 0; i < 20; i++) await run("INSERT INTO password_reset_otps(email,code_hash,expires_at,request_ip,created_at) VALUES (?,'fixture',?,'fixture-ip-limit',?)", ["ip" + i + "@example.test", created, created]);
      assert.equal((await send("ip-blocked@example.test", "fixture-ip-limit")).status, 200);
      assert.equal((await get("SELECT COUNT(*) AS n FROM password_reset_otps WHERE email='ip-blocked@example.test'")).n, 0);
    });
    await t.test("missing reset schema fails closed uniformly without altering existing login", async () => {
      await exec("ALTER TABLE password_reset_otps RENAME TO fixture_hidden_reset_otps;");
      try {
        const known = await send(active.email);
        const unknown = await send("schema-unknown@example.test");
        assert.equal(known.status, 503); assert.deepEqual(known, unknown);
        assert.equal((await request("/api/auth/login", { account: active.email, password: "Replacement123!" })).status, 200);
      } finally { await exec("ALTER TABLE fixture_hidden_reset_otps RENAME TO password_reset_otps;"); }
    });

    const page = query => request("/api/news/public-page" + (query ? "?" + query : ""));
    await t.test("empty pagination and malformed parameters are handled safely", async () => {
      const empty = await page();
      assert.equal(empty.status, 200); assert.deepEqual(empty.body.data, []);
      assert.equal(empty.body.pagination.total, 0); assert.equal(empty.body.pagination.page, 1);
      for (const query of ["page=0", "page=-1", "page=1.2", "page=1000001", "snapshot=-1", "country=invalid", "category=x%27OR%201=1", "page=1&page=2"]) assert.equal((await page(query)).status, 400);
    });
    await t.test("configured page size and stable ID tie-breaker produce disjoint complete pages", async () => {
      for (let id = 1; id <= 25; id++) await run("INSERT INTO news(id,title,summary,content,status,is_vip,category,country_code,created_at) VALUES (?,?,?,'private body','published',?,?,?,?)",
        [id, "Fixture " + id, "Summary", id % 2, id % 2 ? "business" : "general", id % 3 ? "sg" : "us", "2026-10-22 12:00:00"]);
      await run("INSERT INTO news(id,title,status,created_at) VALUES (26,'Draft secret','draft','2026-10-22 12:00:00')");
      const first = (await page()).body;
      const size = require("../config/newsFeed").PAGE_SIZE;
      assert.equal(size, 10); assert.equal(first.data.length, size);
      assert.deepEqual(first.data.map(row => row.id), [25,24,23,22,21,20,19,18,17,16]);
      const snapshot = first.pagination.snapshot;
      const second = (await page("page=2&snapshot=" + snapshot)).body;
      const third = (await page("page=3&snapshot=" + snapshot)).body;
      const ids = [...first.data,...second.data,...third.data].map(row => row.id);
      assert.equal(new Set(ids).size, 25); assert.equal(ids.length, 25);
      assert.equal(first.pagination.total, 25); assert.equal(first.pagination.totalPages, 3);
      assert(first.data.every(row => row.content === undefined && row.status === "published"));
      const clamped = (await page("page=999&snapshot=" + snapshot)).body;
      assert.equal(clamped.pagination.page, 3); assert.deepEqual(clamped.data, third.data);
    });
    await t.test("new inserts do not shift a pagination snapshot and filters combine on the server", async () => {
      const first = (await page()).body;
      const before = (await page("page=2&snapshot=" + first.pagination.snapshot)).body;
      await run("INSERT INTO news(id,title,status,is_vip,category,country_code,created_at) VALUES (27,'New fixture','published',1,'business','sg','2026-10-22 13:00:00')");
      const after = (await page("page=2&snapshot=" + first.pagination.snapshot)).body;
      assert.deepEqual(after.data.map(row => row.id), before.data.map(row => row.id));
      assert.equal((await page()).body.data[0].id, 27);
      const filtered = (await page("country=sg&category=business")).body;
      assert(filtered.data.every(row => row.country_code === "sg" && row.category === "business"));
      assert.equal(filtered.pagination.total, (await get("SELECT COUNT(*) AS n FROM news WHERE status='published' AND country_code='sg' AND category='business'")).n);
      assert.equal((await request("/api/news")).body.data.length, 26);
      assert.equal((await request("/api/news/27")).status, 401);
      assert.equal((await request("/api/news/public/27")).status, 401);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    // All delivery assertions above wait until asynchronous work has settled.
    await require("../utils/authTransaction").withAuthTransaction(db, async () => {});
    await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve()));
    assert.equal(connections.size, 0);
    sqlite.Database = OriginalDatabase;
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
    assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
    assert(path.basename(directory).startsWith("dailynews-batch2-test-"));
    fs.rmSync(directory, { recursive: true });
  }
});

function domFixture() {
  const elements = new Map();
  const documentListeners = {};
  function element(tag = "div") {
    const classes = new Set();
    return { tagName: tag, children: [], listeners: {}, attributes: {}, value: "", style: {}, disabled: false,
      classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name), add: name => classes.add(name), remove: name => classes.delete(name) },
      setAttribute(name, value) { this.attributes[name] = value; }, removeAttribute(name) { delete this.attributes[name]; },
      appendChild(child) { this.children.push(child); }, replaceChildren() { this.children = []; },
      addEventListener(name, callback) { this.listeners[name] = callback; }, focus() {}, reset() {},
      querySelectorAll() { return []; }, contains() { return false; },
      set innerHTML(value) { this.html = value; this.children = []; }, get innerHTML() { return this.html || ""; }
    };
  }
  const document = {
    body: { style: {} },
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element,
    querySelectorAll() { return []; },
    addEventListener(name, callback) { documentListeners[name] = callback; },
    querySelector(selector) {
      if (selector === ".auth-modal.show") return [...elements.values()].find(item => item.classList.contains("show")) || null;
      return null;
    }
  };
  return { document, elements, documentListeners };
}

test("password reset modal submits normalized email and clears stale local sessions only on success", async () => {
  const { document, documentListeners } = domFixture();
  const calls = [];
  const stored = new Map([["token", "fixture-old"], ["dailynewsUser", "fixture-user"]]);
  const context = { document, console, Date,
    localStorage: { removeItem: key => stored.delete(key) },
    window: { setInterval: () => 1, clearInterval() {}, setTimeout() {}, location: { reload() {} } },
    fetch: async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return { ok: true, json: async () => ({ success: true, message: "Fixture accepted" }) }; }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "public/password-reset.js"), "utf8"), context);
  documentListeners.DOMContentLoaded();
  document.getElementById("loginAccount").value = "User@Example.Test";
  document.getElementById("forgotPasswordBtn").listeners.click();
  assert(document.getElementById("passwordResetModal").classList.contains("show"));
  await document.getElementById("sendResetCode").listeners.click();
  assert.equal(calls[0].url, resetPath + "request");
  assert.equal(calls[0].body.email, "user@example.test");
  assert.equal(document.getElementById("sendResetCode").disabled, true);
  await document.getElementById("sendResetCode").listeners.click();
  assert.equal(calls.length, 1);
  document.getElementById("resetCode").value = "123456";
  document.getElementById("resetPassword").value = "NewFixture123!";
  document.getElementById("resetConfirmPassword").value = "Mismatch123!";
  await document.getElementById("passwordResetForm").listeners.submit({ preventDefault() {} });
  assert.equal(calls.length, 1); assert(stored.has("token"));
  document.getElementById("resetConfirmPassword").value = "NewFixture123!";
  await document.getElementById("passwordResetForm").listeners.submit({ preventDefault() {} });
  assert.equal(calls[1].url, resetPath + "confirm"); assert.equal(calls[1].body.code, "123456");
  assert.equal(stored.has("token"), false); assert.equal(stored.has("dailynewsUser"), false);
});

test("password reset modal keeps session and supports retry after transient delivery request failure", async () => {
  const { document, documentListeners } = domFixture();
  let removed = 0;
  const context = { document, console, localStorage: { removeItem() { removed++; } },
    window: { setInterval: () => 1, clearInterval() {}, location: {} },
    fetch: async () => { throw new TypeError("Fixture offline"); } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "public/password-reset.js"), "utf8"), context);
  documentListeners.DOMContentLoaded();
  document.getElementById("resetEmail").value = "user@example.test";
  await document.getElementById("sendResetCode").listeners.click();
  assert.equal(document.getElementById("sendResetCode").disabled, false);
  assert.equal(removed, 0);
  document.getElementById("resetBackToLogin").listeners.click();
  assert(document.getElementById("loginModal").classList.contains("show"));
});

function pagePayload(page, snapshot = 50, category = "general") {
  return { success: true, data: [{ id: page, title: "Fixture news", status: "published", category, views: 7 }],
    pagination: { page, pageSize: 10, total: 50, totalPages: 5, snapshot } };
}
function newsBrowser(fetch) {
  const dom = domFixture();
  const context = { ...dom, URLSearchParams, console, fetch,
    localStorage: { getItem: () => "[]" },
    window: { location: { origin: "http://fixture.test" }, addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "public/news-home.js"), "utf8"), context);
  return context;
}

test("homepage previous/next, page jump and category/country filters share server pagination", async () => {
  const urls = [];
  const context = newsBrowser(async url => {
    urls.push(new URL(url, "http://fixture.test"));
    const query = urls.at(-1).searchParams;
    return { ok: true, json: async () => pagePayload(Number(query.get("page")), 50, query.get("category") || "general") };
  });
  await context.loadNewsHome();
  const nav = context.document.getElementById("newsPagination");
  assert.equal(nav.hidden, false);
  assert(nav.children.find(item => item.textContent === "上一页").disabled);
  await nav.children.find(item => item.textContent === "下一页").listeners.click();
  assert.equal(urls.at(-1).searchParams.get("page"), "2");
  assert.equal(urls.at(-1).searchParams.get("snapshot"), "50");
  await nav.children.find(item => item.textContent === "上一页").listeners.click();
  assert.equal(urls.at(-1).searchParams.get("page"), "1");
  const jumpForm = nav.children.find(item => item.tagName === "form");
  jumpForm.children[0].children[0].value = "5";
  await jumpForm.listeners.submit({ preventDefault() {} });
  assert.equal(urls.at(-1).searchParams.get("page"), "5");
  await until(() => nav.children.some(item => item.textContent === "下一页" && item.disabled));
  context.bindDynamicCategoryEvents();
  context.document.getElementById("homeSecondaryNavInner").listeners.click({ preventDefault() {}, target: { closest: () => ({ dataset: { category: "business" } }) } });
  await until(() => urls.at(-1).searchParams.get("category") === "business");
  assert.equal(urls.at(-1).searchParams.get("page"), "1");
  assert.equal(urls.at(-1).searchParams.has("snapshot"), false);
  await context.loadNewsHome("us", 1, true);
  assert.equal(urls.at(-1).searchParams.get("country"), "us");
  assert.equal(urls.at(-1).searchParams.get("category"), "business");
  assert.equal(urls.at(-1).searchParams.get("page"), "1");
  assert(context.document.getElementById("newsList").children[0].innerHTML.includes('data-action="favorite"'));
  assert(context.document.getElementById("newsList").children[0].innerHTML.includes('data-action="comment"'));
});

test("stale homepage responses cannot overwrite the latest filter results", async () => {
  const pending = [];
  const context = newsBrowser(url => new Promise(resolve => pending.push({ url, resolve })));
  const old = context.loadNewsHome("sg");
  const current = context.loadNewsHome("us");
  pending[1].resolve({ ok: true, json: async () => pagePayload(1, 70) }); await current;
  pending[0].resolve({ ok: true, json: async () => pagePayload(4, 20) }); await old;
  assert.equal(vm.runInContext("newsSnapshot", context), 70);
  assert.equal(vm.runInContext("newsPagination.page", context), 1);
});

test("index inline syntax and reset/pagination controls are wired to existing scripts", () => {
  const html = fs.readFileSync(path.join(root, "public/index.html"), "utf8");
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  for (const id of ["forgotPasswordBtn", "passwordResetModal", "passwordResetForm", "newsPagination"]) assert.equal((html.match(new RegExp('id="' + id + '"', "g")) || []).length, 1);
  assert(html.includes('src="/password-reset.js"')); assert(html.includes('src="/news-home.js"'));
});

test("password reset mail has a distinct template and validates the code using a simulated transport", async () => {
  const deliveries = [];
  const module = { exports: {} };
  const context = { module, console: { log() {}, error() {} },
    process: { env: { EMAIL_FROM: "fixture@example.test", RESEND_API_KEY: "fixture-only" } },
    require(name) {
      assert.equal(name, "resend");
      return { Resend: class { constructor() { this.emails = { send: async mail => { deliveries.push(mail); return { data: { id: "fixture" } }; } }; } } };
    }
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "utils/emailSender.js"), "utf8"), context);
  await module.exports.sendPasswordResetEmail("USER@EXAMPLE.TEST", "123456");
  assert.equal(deliveries[0].to[0], "user@example.test");
  assert(deliveries[0].subject.includes("密码重置"));
  assert(deliveries[0].text.includes("123456"));
  await assert.rejects(module.exports.sendPasswordResetEmail("user@example.test", "<script>"));
  assert.equal(deliveries.length, 1);
});
