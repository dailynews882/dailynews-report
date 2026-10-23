"use strict";
// One isolated integration run: no server.js, dotenv, real database, mail or payment provider.
const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), Module = require("node:module"), vm = require("node:vm"), crypto = require("node:crypto");
const express = require("express"), sqlite = require("sqlite3"), bcrypt = require("bcrypt"), jwt = require("jsonwebtoken");
const root = path.resolve(__dirname, "..");
function load(relative, overrides) {
    const filename = path.join(root, relative), m = new Module(filename);
    m.filename = filename; m.paths = Module._nodeModulePaths(path.dirname(filename));
    m.require = function (name) {
        if (Object.hasOwn(overrides, name)) return overrides[name];
        if (name === "../db" || name === "./db" || name === "dotenv") throw new Error("Application database/config forbidden");
        return Module.prototype.require.call(this, name);
    };
    m._compile(fs.readFileSync(filename, "utf8"), filename); return m.exports;
}
test("four features: production account permissions with existing reset and news routes", async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "dailynews-four-features-")), Original = sqlite.Database, connections = new Set();
    sqlite.Database = function (filename, ...args) {
        assert.equal(path.dirname(path.resolve(filename)), directory);
        const c = new Original(filename, ...args); connections.add(c);
        const close = c.close.bind(c); c.close = cb => close(e => { if (!e) connections.delete(c); cb(e); }); return c;
    };
    const keys = ['JWT_SECRET','ADMIN_JWT_SECRET','ADMIN_USERNAME','ADMIN_PASSWORD_HASH','V115_TEST_DB'];
    const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
    process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex'); process.env.ADMIN_JWT_SECRET = crypto.randomBytes(32).toString('hex');
    process.env.ADMIN_USERNAME = 'ConfiguredOwner'; process.env.ADMIN_PASSWORD_HASH = await bcrypt.hash('OwnerFixture123!', 4); delete process.env.V115_TEST_DB;
    const db = await new Promise((ok, no) => { const c = new sqlite.Database(path.join(directory, 'fixture.sqlite'), e => e ? no(e) : ok(c)); });
    const exec = sql => new Promise((ok, no) => db.exec(sql, e => e ? no(e) : ok()));
    const run = (sql, args = []) => new Promise((ok, no) => db.run(sql, args, function (e) { e ? no(e) : ok(this); }));
    const get = (sql, args = []) => new Promise((ok, no) => db.get(sql, args, (e, row) => e ? no(e) : ok(row)));
    let server;
    try {
        await exec(`PRAGMA foreign_keys=ON;
            CREATE TABLE users(id INTEGER PRIMARY KEY,username TEXT UNIQUE,account TEXT UNIQUE,account_type TEXT,password_hash TEXT,email TEXT UNIQUE,phone TEXT UNIQUE,
                email_verified INTEGER DEFAULT 1,phone_verified INTEGER DEFAULT 0,member_level TEXT DEFAULT 'free',subscription_status TEXT DEFAULT 'free',vip_expire_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
            CREATE TABLE wallets(id INTEGER PRIMARY KEY,user_id INTEGER UNIQUE REFERENCES users(id),balance REAL DEFAULT 0,reward_balance REAL DEFAULT 0,status TEXT DEFAULT 'active');
            CREATE TABLE wallet_transactions(id INTEGER PRIMARY KEY,user_id INTEGER REFERENCES users(id),amount REAL);
            CREATE TABLE news(id INTEGER PRIMARY KEY,title TEXT,category TEXT,country_code TEXT,country_name TEXT,region TEXT,summary TEXT,image_url TEXT,video_url TEXT,source TEXT,author TEXT,status TEXT,is_vip INTEGER,views INTEGER DEFAULT 0,content TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,updated_at TEXT,published_at TEXT);`);
        const password = await bcrypt.hash('MemberFixture123!', 4);
        for (let id = 1; id <= 6; id++) {
            await run("INSERT INTO users(id,username,account,account_type,email,password_hash) VALUES (?, ?, ?, 'email', ?, ?)", [id, 'FixtureUser'+id, 'fixture'+id+'@example.test', 'fixture'+id+'@example.test', password]);
            await run("INSERT INTO wallets(user_id,balance) VALUES (?,?)", [id, id*10]);
        }
        await run("INSERT INTO wallet_transactions(user_id,amount) VALUES(4,40)");
        for (let id=1; id<=24; id++) await run("INSERT INTO news(id,title,status,is_vip,content,category,country_code,created_at) VALUES (?,?,'published',0,'fixture content','finance',?,'2026-10-22')", [id, 'Fixture '+id, id%2?'sg':'us']);
        const { migrate } = require('../scripts/migrate-account-admin');
        await t.test('additive migration is repeatable and preserves users, passwords, wallet balances and history', async () => {
            await migrate(db); await migrate(db);
            assert.equal((await get('SELECT COUNT(*) n FROM users')).n,6);
            assert.equal((await get('SELECT password_hash FROM users WHERE id=1')).password_hash,password);
            assert.equal((await get('SELECT balance FROM wallets WHERE user_id=4')).balance,40);
            assert.equal((await get('SELECT amount FROM wallet_transactions WHERE user_id=4')).amount,40);
        });
        const identityModule = require('../middleware/adminIdentity');
        const identity = { ...identityModule, ...identityModule.createAdminIdentity(db) };
        const userAuth = load('middleware/userAuth.js', { '../db':db });
        const newsAccess = load('middleware/newsReadAccess.js', { './adminIdentity':identity });
        const inbox = new Map(), app = express(); app.use(express.json());
        const accounts = load('routes/accountAdminRoute.js', { '../db':db, '../middleware/adminIdentity':identity });
        app.use('/api/admin/users', load('routes/adminUsersRoute.js', { '../db':db, './accountAdminRoute':accounts, '../middleware/adminIdentity':identity }));
        const adminRoutes = load('routes/adminIdentityRoute.js', { '../db':db, '../middleware/adminIdentity':identity });
        app.use('/api/admin/auth', load('routes/adminAuthRoute.js', { './adminIdentityRoute':adminRoutes }));
        app.use('/api/auth', load('routes/authRoute.js', { '../db':db, '../middleware/userAuth':userAuth,
            '../utils/emailSender':{sendEmailOtp:async()=>{},sendPasswordResetEmail:async(email,code)=>inbox.set(email,code)}, '../utils/smsSender':{sendSmsOtp:async()=>{throw Error('Real SMS forbidden');}} }));
        app.use('/api/news', load('routes/newsRoute.js', { '../db':db, '../middleware/userAuth':userAuth, '../middleware/adminAuth':identity, '../middleware/newsReadAccess':newsAccess }));
        server = await new Promise(ok => { const s=app.listen(0,'127.0.0.1',()=>ok(s)); });
        const base='http://127.0.0.1:'+server.address().port;
        const request=async(url,body,token,method=body===undefined?'GET':'POST')=>{
            const r=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
            return {status:r.status,body:await r.json()};
        };
        const login=async(username,password='MemberFixture123!')=>request('/api/admin/auth/login',{username,password});
        const owner=(await login('ConfiguredOwner','OwnerFixture123!')).body.token; assert(owner);
        const action=(id,name,token=owner,extra={})=>request(`/api/admin/users/${id}/${name}`,{reason:'Synthetic fixture audit reason',...extra},token);
        let moderator,editor;
        await t.test('configured superadmin verifies; wrong credentials and forged admin identity are rejected',async()=>{
            assert.equal((await request('/api/admin/auth/verify',undefined,owner)).body.admin.adminRole,'superadmin');
            assert.equal((await login('ConfiguredOwner','WrongFixture123!')).status,401);
            const forged=jwt.sign({id:3,role:'admin',type:'admin_access'},process.env.JWT_SECRET);
            assert.equal((await request('/api/admin/users',undefined,forged)).status,401);
            const legacy=jwt.sign({username:'ConfiguredOwner',role:'admin',type:'admin_access'},process.env.ADMIN_JWT_SECRET);
            assert.equal((await request('/api/admin/auth/verify',undefined,legacy)).status,200);
        });
        await t.test('superadmin assigns editor/admin roles and staff can login with existing bcrypt passwords',async()=>{
            assert.equal((await action(1,'role',owner,{role:'admin'})).status,200);
            assert.equal((await action(2,'role',owner,{role:'editor'})).status,200);
            moderator=(await login('FixtureUser1')).body.token; editor=(await login('FixtureUser2')).body.token;
            assert(moderator && editor);
            assert.equal((await request('/api/admin/users',undefined,moderator)).status,200);
            assert.equal((await action(3,'role',owner,{role:'superadmin'})).status,400);
        });
        await t.test('editor and ordinary member cannot bypass user/role administration by direct HTTP requests',async()=>{
            assert.equal((await request('/api/admin/users',undefined,editor)).status,403);
            assert.equal((await action(3,'temporary-ban',editor,{days:1})).status,403);
            assert.equal((await action(3,'role',editor,{role:'admin'})).status,403);
            assert.equal((await login('FixtureUser3')).status,401);
            const forged=jwt.sign({id:3,principal:'user',auth_version:0,adminRole:'superadmin',role:'admin',type:'admin_access'},process.env.ADMIN_JWT_SECRET);
            assert.notEqual((await request('/api/admin/users',undefined,forged)).status,200);
        });
        await t.test('editor can manage draft news; public and member tokens cannot see drafts',async()=>{
            const created=await request('/api/news',{title:'Draft fixture',content:'private fixture',status:'draft',is_vip:0,country_code:'sg'},editor);
            assert.equal(created.status,200);const id=created.body.data.id;
            assert.equal((await request('/api/news/'+id,undefined,editor)).status,200);
            assert.equal((await request('/api/news/'+id)).status,403);
            assert(!(await request('/api/news')).body.data.some(n=>n.id===id));
        });
        await t.test('moderator temporary ban and unban revoke member login tokens',async()=>{
            const member=(await request('/api/auth/login',{account:'fixture3@example.test',password:'MemberFixture123!'})).body.token;
            assert.equal((await action(3,'temporary-ban',moderator,{days:1})).status,200);
            assert.equal((await request('/api/auth/me',undefined,member)).status,403);
            assert.equal((await request('/api/auth/login',{account:'fixture3@example.test',password:'MemberFixture123!'})).status,403);
            assert.equal((await action(3,'unban',moderator)).status,200);
            assert.equal((await request('/api/auth/me',undefined,member)).status,401);
        });
        await t.test('moderator cannot permanently ban, delete, restore, assign roles or moderate staff',async()=>{
            for(const name of ['permanent-ban','soft-delete','restore','role'])assert.equal((await action(4,name,moderator,{role:'admin'})).status,403);
            assert.equal((await action(2,'temporary-ban',moderator,{days:1})).status,403);
            assert.equal((await action(1,'temporary-ban',moderator,{days:1})).status,403);
        });
        await t.test('deleting then restoring a permanently banned user preserves the permanent ban and finances',async()=>{
            assert.equal((await action(4,'permanent-ban')).status,200);
            assert.equal((await action(4,'unban',moderator)).status,403);
            assert.equal((await action(4,'soft-delete')).status,200);
            assert.equal((await get('SELECT account_status FROM users WHERE id=4')).account_status,'deleted');
            assert.equal((await action(4,'restore')).status,200);
            assert.equal((await get('SELECT account_status FROM users WHERE id=4')).account_status,'permanent_ban');
            assert.equal((await get('SELECT balance FROM wallets WHERE user_id=4')).balance,40);
            assert.equal((await get('SELECT amount FROM wallet_transactions WHERE user_id=4')).amount,40);
            assert.equal((await action(4,'unban')).status,200);
        });
        await t.test('soft deletion retains identifiers and restoration cannot revive an old token or reset code',async()=>{
            const old=(await request('/api/auth/login',{account:'fixture3@example.test',password:'MemberFixture123!'})).body.token;
            await request('/api/auth/password-reset/request',{email:'fixture3@example.test'}); const code=inbox.get('fixture3@example.test');assert(code);
            assert.equal((await action(3,'soft-delete')).status,200);
            assert.equal((await get('SELECT email FROM users WHERE id=3')).email,'fixture3@example.test');
            assert.equal((await request('/api/auth/me',undefined,old)).status,403);
            assert.equal((await action(3,'restore')).status,200);
            assert.equal((await request('/api/auth/me',undefined,old)).status,401);
            assert.equal((await request('/api/auth/password-reset/confirm',{email:'fixture3@example.test',code,newPassword:'NewFixture123!'})).status,400);
        });
        await t.test('audit failure rolls back account state and auth_version on the dedicated connection',async()=>{
            const before=await get('SELECT account_status,auth_version FROM users WHERE id=5');
            await exec("CREATE TRIGGER fixture_audit_fail BEFORE INSERT ON admin_account_audit BEGIN SELECT RAISE(ABORT,'fixture failure'); END;");
            assert.equal((await action(5,'temporary-ban',owner,{days:7})).status,503);
            assert.deepEqual(await get('SELECT account_status,auth_version FROM users WHERE id=5'),before);
            await exec('DROP TRIGGER fixture_audit_fail');
            assert.equal((await action(5,'temporary-ban',owner,{days:7})).status,200);
            assert.equal((await action(5,'unban')).status,200);
        });
        await t.test('revoked editor token immediately loses draft and write permissions',async()=>{
            assert.equal((await action(2,'role',owner,{role:'member'})).status,200);
            assert.equal((await request('/api/admin/auth/verify',undefined,editor)).status,401);
            assert.equal((await request('/api/news',{title:'Rejected fixture',content:'fixture',status:'draft'},editor)).status,401);
            assert(!(await request('/api/news',undefined,editor)).body.data.some(n=>n.status==='draft'));
        });
        await t.test('existing reset flow sends/consumes code, changes password, revokes staff JWT, and allows fresh login',async()=>{
            const email='fixture1@example.test';
            assert.equal((await request('/api/auth/password-reset/request',{email})).status,200);const code=inbox.get(email);assert.match(code,/^\d{6}$/);
            const reset=await request('/api/auth/password-reset/confirm',{email,code,newPassword:'ChangedFixture123!'});assert.equal(reset.status,200);
            assert.equal((await request('/api/admin/auth/verify',undefined,moderator)).status,401);
            assert.equal((await login('FixtureUser1')).status,401);
            assert.equal((await login('FixtureUser1','ChangedFixture123!')).status,200);
            assert.equal((await request('/api/auth/login',{account:email,password:'ChangedFixture123!'})).status,200);
            assert.equal((await request('/api/auth/password-reset/confirm',{email,code,newPassword:'AnotherFixture123!'})).status,400);
        });
        await t.test('homepage page size is 10, tied timestamps are stable, filters and page navigation work',async()=>{
            const one=await request('/api/news/public-page?page=1'),two=await request('/api/news/public-page?page=2&snapshot='+one.body.pagination.snapshot);
            assert.equal(one.body.pagination.pageSize,10);assert.equal(one.body.data.length,10);assert.equal(two.body.data.length,10);
            assert(!two.body.data.some(n=>one.body.data.some(x=>x.id===n.id)));
            const filtered=await request('/api/news/public-page?page=1&country=sg&category=finance');assert(filtered.body.data.every(n=>n.country_code==='sg'&&n.category==='finance'));
        });
        await t.test('historically anonymized deleted identities are not silently restored',async()=>{
            await run("UPDATE users SET account_status='deleted',username='__v115_deleted_user_6__',account='__v115_deleted_account_6__',email=NULL WHERE id=6");
            assert.equal((await action(6,'restore')).status,409);
            assert.equal((await get('PRAGMA integrity_check')).integrity_check,'ok');assert.equal(await get('PRAGMA foreign_key_check'),undefined);
        });
        await t.test('member matching owner username cannot impersonate owner or become immune to moderation',async()=>{
            await run("INSERT INTO users(id,username,account,email,account_type,password_hash) VALUES(7,?,'collision@example.test','collision@example.test','email',?)", [process.env.ADMIN_USERNAME,password]);
            assert.equal((await login('ConfiguredOwner')).status,401);
            assert.equal((await action(7,'temporary-ban',owner,{days:1})).status,200);
            assert.equal((await action(7,'unban')).status,200);
            assert.equal((await action(7,'role',owner,{role:'admin'})).status,409);
            assert.equal((await action(7,'soft-delete')).status,200);
            assert.equal((await login('ConfiguredOwner','OwnerFixture123!')).status,200);
        });
    } finally {
        if(server)await new Promise(ok=>server.close(ok));
        await new Promise((ok,no)=>db.close(e=>e?no(e):ok()));assert.equal(connections.size,0);sqlite.Database=Original;
        for(const k of keys)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];
    }
});
test('remember login: actual modal persists across contexts, tolerates malformed cache and logs out explicitly',async()=>{
    const values=new Map(), source=fs.readFileSync(path.join(root,'public/auth-modal.js'),'utf8');
    function browser(){
        const elements=new Map(), element=()=>({value:'',style:{},classList:{add(){},remove(){}},setAttribute(){},removeAttribute(){},listeners:{},addEventListener(k,v){this.listeners[k]=v;}});
        const context={document:{body:{style:{}},querySelector(){return null;},getElementById(id){if(!elements.has(id))elements.set(id,element());return elements.get(id);},addEventListener(event,fn){if(event==='DOMContentLoaded')fn();}},
            localStorage:{getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)},console:{log(){},warn(){},error(){}},
            window:{location:{href:'/',reload(){}},setTimeout(){}},fetch:async url=>({status:200,ok:true,json:async()=>url.endsWith('/login')?{success:true,token:'fixture-persistent-token',user:{username:'FixtureMember'}}:{success:true,user:{username:'FixtureMember'}}})};
        vm.createContext(context);vm.runInContext(source.replace('  refreshCurrentUser();','  globalThis.refreshSession = refreshCurrentUser;'),context);return {context,elements};
    }
    const first=browser();first.context.document.getElementById('loginAccount').value='fixture@example.test';first.context.document.getElementById('loginPassword').value='FixturePass123!';
    await first.elements.get('loginForm').listeners.submit({preventDefault(){}});assert.equal(values.get('token'),'fixture-persistent-token');
    const second=browser();await second.context.refreshSession();assert.equal(values.get('token'),'fixture-persistent-token');
    values.set('dailynewsUser','{invalid-json');const third=browser();await third.context.refreshSession();assert.equal(values.get('token'),'fixture-persistent-token');
    third.elements.get('logoutBtn').listeners.click();assert.equal(values.has('token'),false);assert.equal(values.has('dailynewsUser'),false);
});
