"use strict";

// Run directly with node --test. Never load server.js, db.js or dotenv.
// Every SQLite connection is restricted to a newly generated OS temp directory.
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
const jwt = require("jsonwebtoken");
const root = path.resolve(__dirname, "..");

function load(relative, overrides) {
  const filename = path.join(root, relative);
  const module = new Module(filename);
  module.filename = filename;
  module.paths = Module._nodeModulePaths(path.dirname(filename));
  module.require = function (name) {
    if (Object.hasOwn(overrides, name)) return overrides[name];
    if (name === "../db" || name === "./db" || name === "dotenv") throw new Error("Real database/config import forbidden");
    return Module.prototype.require.call(this, name);
  };
  module._compile(fs.readFileSync(filename, "utf8"), filename);
  return module.exports;
}

test("batch 1 isolated HTTP and SQLite regression", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dailynews-batch1-test-"));
  const OriginalDatabase = sqlite.Database;
  const openConnections = new Set();
  sqlite.Database = function (filename, ...args) {
    assert.equal(path.dirname(path.resolve(filename)), directory, "Only generated fixture DBs may be opened");
    const connection = new OriginalDatabase(filename, ...args);
    openConnections.add(connection);
    const close = connection.close.bind(connection);
    connection.close = callback => close(error => {
      if (!error) openConnections.delete(connection);
      callback(error);
    });
    return connection;
  };
  const oldSecret = process.env.JWT_SECRET;
  const oldAdmin = process.env.ADMIN_JWT_SECRET;
  process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.ADMIN_JWT_SECRET = crypto.randomBytes(32).toString("hex");
  const db = await new Promise((resolve, reject) => {
    const candidate = new sqlite.Database(path.join(directory, "fixture.sqlite"), error => error ? reject(error) : resolve(candidate));
  });
  const run = (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));
  const get = (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
  let server;
  try {
    await exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, account TEXT UNIQUE,
        account_type TEXT, password_hash TEXT, email TEXT UNIQUE, phone TEXT UNIQUE,
        email_verified INTEGER, phone_verified INTEGER, member_level TEXT DEFAULT 'free',
        subscription_status TEXT DEFAULT 'free', vip_expire_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        account_status TEXT DEFAULT 'active', banned_until TEXT, auth_version INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE wallets (id INTEGER PRIMARY KEY, user_id INTEGER UNIQUE REFERENCES users(id), balance REAL DEFAULT 0,
        reward_balance REAL DEFAULT 0,status TEXT DEFAULT 'active',total_recharge REAL DEFAULT 0,total_spend REAL DEFAULT 0,withdrawable_balance REAL DEFAULT 0);
      CREATE TABLE otps (id INTEGER PRIMARY KEY,account TEXT,account_type TEXT,otp_code TEXT,expires_at TEXT,
        used INTEGER DEFAULT 0,purpose TEXT,attempt_count INTEGER DEFAULT 0,request_ip TEXT,last_sent_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE news (id INTEGER PRIMARY KEY,title TEXT,category TEXT,country_code TEXT,country_name TEXT,region TEXT,
        summary TEXT,image_url TEXT,video_url TEXT,source TEXT,author TEXT,status TEXT,is_vip INTEGER,views INTEGER DEFAULT 0,
        content TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT,published_at TEXT);
      CREATE TABLE wallet_transactions (id INTEGER PRIMARY KEY,user_id INTEGER,type TEXT,amount REAL,status TEXT,description TEXT,created_at TEXT);
      CREATE TABLE subscription_orders (id INTEGER PRIMARY KEY,user_id INTEGER,plan_type TEXT,plan_name TEXT,amount REAL,currency TEXT,status TEXT,payment_method TEXT,created_at TEXT,paid_at TEXT);
      INSERT INTO news(id,title,status,is_vip,content,country_code) VALUES
        (1,'Free fixture','published',0,'free body','sg'),(2,'VIP fixture','published',1,'vip body','sg'),
        (3,'Draft fixture','draft',0,'private draft','us'),(4,'Pending fixture','pending',1,'private pending','us');`);
    const inbox = new Map();
    let failDelivery = false;
    const auth = load("middleware/userAuth.js", { "../db": db });
    const routeDeps = { "../db": db, "../middleware/userAuth": auth };
    const app = express();
    app.use(express.json());
    app.use("/api/auth", load("routes/authRoute.js", {
      ...routeDeps,
      jsonwebtoken: { ...jwt, sign(payload, ...args) {
        if (payload.username === "SigningFail") throw new Error("Fixture signing failure");
        return jwt.sign(payload, ...args);
      } },
      "../utils/emailSender": { sendEmailOtp: async (email, code) => {
        if (failDelivery) throw new Error("Simulated delivery failure");
        inbox.set(email, code);
      } },
      "../utils/smsSender": { sendSmsOtp: async () => { throw new Error("SMS is not used in these tests"); } }
    }));
    app.use("/api/news", load("routes/newsRoute.js", routeDeps));
    app.use("/api/wallet", load("routes/walletRoute.js", routeDeps));
    app.use("/api/subscription", load("routes/subscriptionRoute.js", routeDeps));
    app.use("/api/payment", load("routes/paymentRoute.js", {
      ...routeDeps, stripe: class { constructor() { return new Proxy({}, { get() { throw new Error("External payments forbidden"); } }); } }
    }));
    server = await new Promise(resolve => { const instance = app.listen(0, "127.0.0.1", () => resolve(instance)); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = async (url, body, token, method = body === undefined ? "GET" : "POST") => {
      const response = await fetch(base + url, { method,
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      return { status: response.status, body: await response.json(), cache: response.headers.get("cache-control") };
    };
    const registration = (email, username, code = inbox.get(email)) => ({ email, username, code, password: "FixturePass123!" });
    const send = email => request("/api/auth/email/send-code", { account: email });
    let userToken, userId;

    await t.test("public lists hide all unpublished metadata; authenticated admin reads remain compatible", async () => {
      const publicList = await request("/api/news?status=all&admin=true");
      assert.deepEqual(publicList.body.data.map(n => n.id), [1, 2]);
      assert.equal(publicList.cache, "private, no-store");
      const admin = jwt.sign({ role: "admin", type: "admin_access" }, process.env.ADMIN_JWT_SECRET);
      const adminList = await request("/api/news", undefined, admin);
      assert.equal(adminList.body.data.length, 4);
      assert.equal((await request("/api/news?country=us", undefined, admin)).body.data.length, 2);
      assert.equal((await request("/api/news?country=us")).body.data.length, 0);
      assert.equal((await request("/api/news/3", undefined, admin)).body.data.content, "private draft");
      assert.equal((await get("SELECT views FROM news WHERE id=3")).views, 0);
      const fakeAdmin = jwt.sign({ role: "admin", type: "admin_access" }, process.env.JWT_SECRET);
      assert.equal((await request("/api/news", undefined, fakeAdmin)).body.data.length, 2);
      assert.equal((await request("/api/news/3", undefined, fakeAdmin)).status, 403);
      const expiredAdmin = jwt.sign({ role: "admin", type: "admin_access" }, process.env.ADMIN_JWT_SECRET, { expiresIn: -1 });
      assert.equal((await request("/api/news", undefined, expiredAdmin)).body.data.length, 2);
      assert.equal((await request("/api/news/3", undefined, expiredAdmin)).status, 403);
      assert.equal((await request("/api/news?country=invalid")).status, 400);
    });
    await t.test("both detail URLs protect drafts and VIP bodies, and denied reads never increment views", async () => {
      for (const prefix of ["/api/news/", "/api/news/public/"]) {
        assert.equal((await request(prefix + "1")).body.data.content, "free body");
        assert.equal((await request(prefix + "2")).status, 401);
        const draft = await request(prefix + "3");
        assert.equal(draft.status, 403); assert.equal(draft.body.data, undefined);
        assert.equal((await request(prefix + "999")).status, 404);
      }
      assert.equal((await get("SELECT views FROM news WHERE id=2")).views, 0);
    });
    await t.test("admin create-edit-publish-delete lifecycle preserves public and VIP boundaries", async () => {
      const admin = jwt.sign({ role: "admin", type: "admin_access" }, process.env.ADMIN_JWT_SECRET);
      const draft = { title: "Lifecycle fixture", content: "private lifecycle body", status: "draft", is_vip: 1, country_code: "sg" };
      assert.equal((await request("/api/news", draft)).status, 401);
      const created = await request("/api/news", draft, admin);
      assert.equal(created.status, 200);
      const id = created.body.data.id;
      assert.equal((await request("/api/news/" + id, undefined, admin)).body.data.content, draft.content);
      assert(!(await request("/api/news")).body.data.some(n => n.id === id));
      const edited = { ...draft, title: "Edited fixture" };
      assert.equal((await request("/api/news/" + id, edited, undefined, "PUT")).status, 401);
      assert.equal((await request("/api/news/" + id, edited, admin, "PUT")).status, 200);
      assert.equal((await request("/api/news/" + id, undefined, admin)).body.data.title, edited.title);
      assert.equal((await request(`/api/news/${id}/publish`, {}, undefined, "PATCH")).status, 401);
      assert.equal((await request(`/api/news/${id}/publish`, {}, admin, "PATCH")).status, 200);
      assert((await request("/api/news")).body.data.some(n => n.id === id));
      assert.equal((await request("/api/news/" + id)).status, 401);
      assert.equal((await request("/api/news/public/" + id)).status, 401);
      assert.equal((await request("/api/news/" + id, undefined, undefined, "DELETE")).status, 401);
      assert.equal((await request("/api/news/" + id, undefined, admin, "DELETE")).status, 200);
      assert.equal((await request("/api/news/" + id, undefined, admin)).status, 404);
    });
    await t.test("concurrent sends reserve one OTP; concurrent registrations create exactly one user and wallet", async () => {
      const email = "parallel@example.test";
      const sends = await Promise.all([send(email), send(email), send(email)]);
      assert.deepEqual(sends.map(r => r.status).sort(), [200, 429, 429]);
      const row = await get("SELECT * FROM otps WHERE account=?", [email]);
      assert.match(row.otp_code, /^[a-f0-9]{64}$/);
      assert.notEqual(row.otp_code, inbox.get(email));
      const attempts = await Promise.all([1, 2, 3].map(n => request("/api/auth/email/register", registration(email, "Parallel" + n))));
      assert.deepEqual(attempts.map(r => r.status).sort(), [201, 400, 400]);
      const success = attempts.find(r => r.status === 201).body;
      userToken = success.token; userId = success.user.id;
      assert.equal(jwt.verify(userToken, process.env.JWT_SECRET).auth_version, 0);
      assert.equal((await get("SELECT COUNT(*) AS n FROM users WHERE email=?", [email])).n, 1);
      assert.equal((await get("SELECT COUNT(*) AS n FROM wallets WHERE user_id=?", [userId])).n, 1);
      assert.equal((await get("SELECT used FROM otps WHERE account=?", [email])).used, 1);
      assert.equal((await request("/api/auth/login", { account: email, password: "FixturePass123!" })).status, 200);
    });
    await t.test("new tokens work with member, wallet, subscription and payment authentication contracts", async () => {
      assert.equal((await request("/api/auth/me", undefined, userToken)).body.user.id, userId);
      assert.equal((await request("/api/wallet/me", undefined, userToken)).body.wallet.balance, 0);
      assert.deepEqual((await request("/api/wallet/transactions", undefined, userToken)).body.transactions, []);
      assert.equal((await request("/api/subscription/my-orders", undefined, userToken)).status, 200);
      assert.equal((await request("/api/news/2", undefined, userToken)).body.code, "VIP_REQUIRED");
      assert.equal((await request("/api/news/3", undefined, userToken)).body.data, undefined);
      const invalidPlan = await request("/api/subscription/buy-with-wallet", { planType: "fixture-invalid" }, userToken);
      assert.equal(invalidPlan.status, 400);
      // This reaches the existing payment handler without calling Stripe.
      const payment = await request("/api/payment/create-subscription-session", { planType: "fixture-invalid" }, userToken);
      assert.notEqual(payment.status, 401); assert.notEqual(payment.status, 403); assert.notEqual(payment.status, 404);
      await run("UPDATE users SET member_level='vip' WHERE id=?", [userId]);
      for (const prefix of ["/api/news/", "/api/news/public/"]) assert.equal((await request(prefix + "2", undefined, userToken)).body.data.content, "vip body");
      await run("UPDATE users SET account_status='permanent_ban' WHERE id=?", [userId]);
      assert.equal((await request("/api/news/2", undefined, userToken)).body.code, "ACCOUNT_BANNED");
      await run("UPDATE users SET account_status='active',auth_version=auth_version+1 WHERE id=?", [userId]);
      assert.equal((await request("/api/news/2", undefined, userToken)).body.code, "TOKEN_REVOKED");
    });
    await t.test("wallet failure rolls back user insertion and OTP consumption; retry succeeds", async () => {
      const email = "rollback@example.test";
      assert.equal((await send(email)).status, 200);
      await exec("CREATE TRIGGER fixture_wallet_failure BEFORE INSERT ON wallets BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
      assert.equal((await request("/api/auth/email/register", registration(email, "RollbackUser"))).status, 500);
      assert.equal((await get("SELECT COUNT(*) AS n FROM users WHERE email=?", [email])).n, 0);
      assert.equal((await get("SELECT used FROM otps WHERE account=?", [email])).used, 0);
      await exec("DROP TRIGGER fixture_wallet_failure;");
      assert.equal((await request("/api/auth/email/register", registration(email, "RollbackUser"))).status, 201);
    });
    await t.test("signing failure rolls back the user, wallet and consumed OTP", async () => {
      const email = "sign-failure@example.test";
      await send(email);
      const wallets = (await get("SELECT COUNT(*) AS n FROM wallets")).n;
      assert.equal((await request("/api/auth/email/register", registration(email, "SigningFail"))).status, 500);
      assert.equal((await get("SELECT COUNT(*) AS n FROM users WHERE email=?", [email])).n, 0);
      assert.equal((await get("SELECT COUNT(*) AS n FROM wallets")).n, wallets);
      assert.equal((await get("SELECT used FROM otps WHERE account=?", [email])).used, 0);
    });
    await t.test("parallel incorrect guesses are persisted atomically and consume the OTP at five failures", async () => {
      const email = "attempts@example.test";
      await send(email);
      const wrong = inbox.get(email) === "111111" ? "222222" : "111111";
      const responses = await Promise.all(Array.from({ length: 6 }, () => request("/api/auth/email/register", registration(email, "WrongUser", wrong))));
      assert(responses.every(r => r.status === 400));
      const otp = await get("SELECT used,attempt_count FROM otps WHERE account=?", [email]);
      assert.deepEqual(otp, { used: 1, attempt_count: 5 });
      assert.equal((await request("/api/auth/email/register", registration(email, "WrongUser"))).status, 400);
    });
    await t.test("competing emails cannot register the same username; losing OTP remains usable", async () => {
      const emails = ["unique1@example.test", "unique2@example.test"];
      await Promise.all(emails.map(send));
      const results = await Promise.all(emails.map(email => request("/api/auth/email/register", registration(email, "UniqueName"))));
      assert.deepEqual(results.map(r => r.status).sort(), [201, 400]);
      const loser = emails[results.findIndex(r => r.status === 400)];
      assert.equal((await get("SELECT used FROM otps WHERE account=?", [loser])).used, 0);
      assert.equal((await request("/api/auth/email/register", registration(loser, "UniqueOther"))).status, 201);
    });
    await t.test("OTP consumption write failure rolls back and does not create an account", async () => {
      const email = "consume-failure@example.test";
      await send(email);
      await exec("CREATE TRIGGER fixture_otp_failure BEFORE UPDATE OF used ON otps WHEN NEW.account='consume-failure@example.test' BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
      assert.equal((await request("/api/auth/email/register", registration(email, "ConsumeUser"))).status, 500);
      assert.equal((await get("SELECT COUNT(*) AS n FROM users WHERE email=?", [email])).n, 0);
      assert.equal((await get("SELECT used FROM otps WHERE account=?", [email])).used, 0);
      await exec("DROP TRIGGER fixture_otp_failure;");
    });
    await t.test("transaction rollback cannot roll back statements on the shared business connection", async () => {
      const { withAuthTransaction } = require("../utils/authTransaction");
      let independent;
      await assert.rejects(withAuthTransaction(db, async ({ run: transactionRun }) => {
        await transactionRun("INSERT INTO otps(account) VALUES ('rolled-back@example.test')");
        independent = run("INSERT INTO wallet_transactions(id,user_id,amount) VALUES (99,?,42)", [userId]);
        throw new Error("Fixture rollback");
      }), /Fixture rollback/);
      await independent;
      assert.equal((await get("SELECT COUNT(*) AS n FROM otps WHERE account='rolled-back@example.test'")).n, 0);
      assert.equal((await get("SELECT amount FROM wallet_transactions WHERE id=99")).amount, 42);
    });
    await t.test("independent Node processes serialize transactions on the same temporary database", async () => {
      const { execFile } = require("node:child_process");
      const childCode = `
        const path = require('node:path');
        const filename = process.argv[1];
        if (!path.basename(path.dirname(filename)).startsWith('dailynews-batch1-test-') || path.basename(filename) !== 'fixture.sqlite') throw Error('Invalid fixture');
        const { withAuthTransaction } = require(process.argv[2]);
        (async () => {
          for (let i=0;i<4;i++) await withAuthTransaction({ filename }, async ({run}) => {
            await run("INSERT INTO otps(account,purpose) VALUES ('child-fixture@example.test','fixture-only')");
            await new Promise(resolve => setTimeout(resolve, 15));
          });
        })().catch(() => { process.exitCode=1; });`;
      await Promise.all(Array.from({ length: 3 }, () => new Promise((resolve, reject) => {
        execFile(process.execPath, ["-e", childCode, db.filename, path.join(root, "utils/authTransaction.js")],
          { timeout: 15000, env: { SystemRoot: process.env.SystemRoot || "" } }, error => error ? reject(new Error("Isolated transaction child failed")) : resolve());
      })));
      assert.equal((await get("SELECT COUNT(*) AS n FROM otps WHERE purpose='fixture-only'")).n, 12);
    });
    await t.test("expired, replayed and conflicting registrations fail safely", async () => {
      const email = "expired@example.test";
      await send(email);
      await run("UPDATE otps SET expires_at=? WHERE account=?", [new Date(Date.now() - 1000).toISOString(), email]);
      assert.equal((await request("/api/auth/email/register", registration(email, "ExpiredUser"))).status, 400);
      const conflict = "conflict@example.test"; await send(conflict);
      assert.equal((await request("/api/auth/email/register", registration(conflict, "RollbackUser"))).status, 400);
      assert.equal((await get("SELECT used FROM otps WHERE account=?", [conflict])).used, 0);
      assert.equal((await request("/api/auth/email/register", registration(conflict, "DifferentUser"))).status, 201);
    });
    await t.test("delivery failure removes the reserved code and malformed email is rejected", async () => {
      failDelivery = true;
      assert.equal((await send("delivery@example.test")).status, 500);
      assert.equal((await get("SELECT COUNT(*) AS n FROM otps WHERE account='delivery@example.test'")).n, 0);
      failDelivery = false;
      assert.equal((await send("delivery@example.test")).status, 200);
      assert.equal((await send("invalid@localhost")).status, 400);
    });
    await t.test("resend invalidates the old OTP and rolling account/IP limits are enforced", async () => {
      const email = "resend@example.test";
      await send(email);
      const old = await get("SELECT id FROM otps WHERE account=?", [email]);
      await run("UPDATE otps SET last_sent_at=? WHERE id=?", [new Date(Date.now() - 61000).toISOString(), old.id]);
      assert.equal((await send(email)).status, 200);
      assert.equal((await get("SELECT used FROM otps WHERE id=?", [old.id])).used, 1);
      assert.equal((await get("SELECT COUNT(*) AS n FROM otps WHERE account=? AND used=0", [email])).n, 1);
      const sentAt = new Date(Date.now() - 120000).toISOString();
      for (let i = 0; i < 5; i++) await run("INSERT INTO otps(account,account_type,purpose,last_sent_at,created_at,request_ip) VALUES ('quota@example.test','email','register',?,?,'fixture-quota')", [sentAt, sentAt]);
      assert.equal((await send("quota@example.test")).status, 429);
      for (let i = 0; i < 20; i++) await run("INSERT INTO otps(account,account_type,purpose,last_sent_at,request_ip) VALUES (?,'email','register',?,'127.0.0.1')", ["ip-quota" + i + "@example.test", sentAt]);
      assert.equal((await send("ip-blocked@example.test")).status, 429);
    });
    await t.test("missing JWT key blocks login, registration and sending before mutations", async () => {
      const secret = process.env.JWT_SECRET; delete process.env.JWT_SECRET;
      try {
        assert.equal((await send("missing@example.test")).body.code, "AUTH_NOT_CONFIGURED");
        assert.equal((await request("/api/auth/email/register", registration("missing@example.test", "MissingUser", "123456"))).status, 503);
        assert.equal((await request("/api/auth/login", { account: "parallel@example.test", password: "FixturePass123!" })).status, 503);
        assert.equal((await get("SELECT COUNT(*) AS n FROM otps WHERE account='missing@example.test'")).n, 0);
      } finally { process.env.JWT_SECRET = secret; }
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await new Promise((resolve, reject) => db.close(err => err ? reject(err) : resolve()));
    assert.equal(openConnections.size, 0, "All temporary database connections must close");
    sqlite.Database = OriginalDatabase;
    if (oldSecret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = oldSecret;
    if (oldAdmin === undefined) delete process.env.ADMIN_JWT_SECRET; else process.env.ADMIN_JWT_SECRET = oldAdmin;
    assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir()));
    assert(path.basename(directory).startsWith("dailynews-batch1-test-"));
    fs.rmSync(directory, { recursive: true });
  }
});

test("frontend session recovery preserves transient failures and clears explicit auth failures", async t => {
  const modalSource = fs.readFileSync(path.join(root, "public/auth-modal.js"), "utf8");
  const profileSource = fs.readFileSync(path.join(root, "public/my.html"), "utf8");
  const profile = profileSource.slice(profileSource.indexOf("    async function loadMyProfile()"), profileSource.indexOf("    async function openCustomerPortal()"));
  const outcomes = ["network", 429, 500, 503, "invalid-json", 401, 403, 200];
  for (const outcome of outcomes) await t.test(String(outcome), async () => {
    const values = new Map([["token", "fixture-session"], ["dailynewsUser", JSON.stringify({ username: "FixtureUser" })]]);
    const element = () => ({ style: {}, classList: { add() {}, remove() {} }, setAttribute() {}, removeAttribute() {}, addEventListener() {} });
    const elements = new Map();
    const document = { getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
      addEventListener(event, callback) { if (event === "DOMContentLoaded") callback(); } };
    const context = { document, localStorage: { getItem: key => values.get(key) || null, setItem: (key, val) => values.set(key, val), removeItem: key => values.delete(key) },
      console: { log() {}, warn() {}, error() {} }, window: { location: { href: "/my.html" } },
      fetch: async () => {
        if (outcome === "network") throw new TypeError("Offline fixture");
        return { status: typeof outcome === "number" ? outcome : 502, ok: outcome === 200,
          json: async () => { if (outcome === "invalid-json") throw new SyntaxError("Gateway HTML"); return { success: outcome === 200, user: { username: "FixtureUser" }, wallet: {} }; } };
      }
    };
    vm.createContext(context);
    vm.runInContext(modalSource.replace("  refreshCurrentUser();", "  globalThis.recover = refreshCurrentUser; globalThis.validateEmail = isValidEmail;"), context);
    await context.recover();
    assert.equal(values.has("token"), outcome !== 401 && outcome !== 403);
    assert.equal(context.validateEmail("a@localhost"), false);
    assert.equal(context.validateEmail("a@example.test"), true);
    // Exercise the actual member page function independently.
    values.set("token", "fixture-session");
    Object.assign(context, { API_AUTH: "/api/auth", API_WALLET: "/api/wallet", requireLogin: () => values.get("token"),
      clearLoginData: () => values.delete("token"), setUserProfile() {}, setWalletData() {}, showMessage() {} });
    vm.runInContext(profile + "\nglobalThis.profile = loadMyProfile;", context);
    await context.profile();
    assert.equal(values.has("token"), outcome !== 401 && outcome !== 403);
    assert.equal(context.window.location.href === "/", outcome === 401 || outcome === 403);
  });
});

test("syntax of member page inline scripts and cryptographic OTP generator", () => {
  const html = fs.readFileSync(path.join(root, "public/my.html"), "utf8");
  for (const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(match[1]);
  const { generateOtp } = require("../utils/otp");
  const original = Math.random;
  Math.random = () => { throw new Error("Insecure randomness forbidden"); };
  try { for (let i = 0; i < 100; i++) assert.match(generateOtp(), /^[1-9]\d{5}$/); }
  finally { Math.random = original; }
});

test("transaction faults release connections and allow the next queued operation", async t => {
  for (const fault of ["none", "setup", "begin", "operation", "commit", "open"]) await t.test(fault, async () => {
    const calls = [];
    let active = 0;
    let maxActive = 0;
    let inject = true;
    const simulated = { OPEN_READWRITE: 2, Database: class {
      constructor(filename, mode, callback) {
        this.failed = fault === "open" && inject;
        if (!this.failed) { active++; maxActive = Math.max(maxActive, active); }
        setImmediate(() => callback(this.failed ? new Error("Fixture open") : null));
      }
      run(sql, params, callback) {
        if (typeof params === "function") callback = params;
        calls.push(sql);
        const fail = inject && ((fault === "setup" && sql.startsWith("PRAGMA")) ||
          (fault === "begin" && sql === "BEGIN IMMEDIATE") || (fault === "commit" && sql === "COMMIT"));
        setImmediate(() => callback.call({ changes: 1, lastID: 1 }, fail ? new Error("Fixture " + fault) : null));
      }
      close(callback) { active--; setImmediate(() => callback(null)); }
    } };
    const { withAuthTransaction } = load("utils/authTransaction.js", { sqlite3: simulated });
    const source = { filename: "virtual-fixture-only" };
    const first = withAuthTransaction(source, async () => {
      if (fault === "operation") throw new Error("Fixture operation");
      return 42;
    });
    if (fault === "none") assert.equal(await first, 42);
    else await assert.rejects(first, /Fixture/);
    assert.equal(active, 0);
    if (fault === "operation" || fault === "commit") assert(calls.includes("ROLLBACK"));
    inject = false;
    assert.equal(await withAuthTransaction(source, async () => 99), 99);
    assert.equal(active, 0);
    assert.equal(maxActive, 1);
  });
});

test("legacy admin read, edit, publish and delete requests carry admin credentials", async () => {
  const calls = [];
  const elements = new Map();
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { value: "fixture", checked: false, style: {}, addEventListener() {}, appendChild() {} });
      return elements.get(id);
    }
  };
  const context = { document, URLSearchParams, localStorage: { getItem: () => "fixture-admin" },
    console: { log() {}, error() {} }, confirm: () => true, alert() {}, setTimeout() {},
    window: { location: { search: "?id=1" } },
    fetch: async (url, options = {}) => {
      calls.push({ url, ...options });
      return { ok: true, status: 200, json: async () => ({ success: true, data: [] }) };
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(root, "admin/news-edit.js"), "utf8") + "\ncurrentNewsId = 1;", context);
  await context.loadNewsDetail(1);
  document.getElementById("newsTitle").value = "Fixture title";
  document.getElementById("newsContent").value = "Fixture body";
  await context.updateNews({ preventDefault() {} });
  await context.publishCurrentNews();
  const listContext = { ...context };
  vm.createContext(listContext);
  vm.runInContext(fs.readFileSync(path.join(root, "admin/news-list.js"), "utf8"), listContext);
  await listContext.loadNewsList();
  await listContext.deleteNews(1);
  assert(calls.some(call => call.method === "PUT"));
  assert(calls.some(call => call.method === "PATCH"));
  assert(calls.some(call => call.method === "DELETE"));
  assert(calls.filter(call => !call.method || call.method === "GET").length >= 2);
  for (const call of calls) assert.equal(call.headers.Authorization, "Bearer fixture-admin");
});
