"use strict";
// Explicit, additive migration. Importing never opens any database.
const { withAuthTransaction } = require("../utils/authTransaction");
const { SCHEMA } = require("./migrate-password-reset");
const COLUMNS = {
    account_status: "TEXT NOT NULL DEFAULT 'active' CHECK(account_status IN ('active','temporary_ban','permanent_ban','deleted'))",
    banned_until: "TEXT", ban_reason: "TEXT", deleted_at: "TEXT", auth_version: "INTEGER NOT NULL DEFAULT 0"
};
async function migrate(source) {
    return withAuthTransaction(source, async ({ get, run }) => {
        if (!await get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")) throw new Error("Existing users table required");
        for (const [name, definition] of Object.entries(COLUMNS)) {
            if (!await get("SELECT name FROM pragma_table_info('users') WHERE name=?", [name])) await run(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
        }
        if (await get("SELECT id FROM users WHERE auth_version IS NULL OR typeof(auth_version)<>'integer' OR auth_version<0 OR account_status NOT IN ('active','temporary_ban','permanent_ban','deleted') OR account_status IS NULL LIMIT 1")) throw new Error("Existing account state needs review; no data was rewritten");
        for (const sql of SCHEMA.split(';').map(s => s.trim()).filter(Boolean)) await run(sql);
        await run(`CREATE TABLE IF NOT EXISTS admin_user_roles (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
            role TEXT NOT NULL CHECK(role IN ('editor','admin')),
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
        await run(`CREATE TABLE IF NOT EXISTS admin_account_deletions (
            user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
            prior_status TEXT NOT NULL CHECK(prior_status IN ('active','temporary_ban','permanent_ban')),
            prior_banned_until TEXT,prior_ban_reason TEXT,deleted_at TEXT NOT NULL)`);
        await run(`CREATE TABLE IF NOT EXISTS admin_account_audit (
            id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            admin_actor TEXT NOT NULL,action TEXT NOT NULL,reason TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
        for (const [table, columns] of Object.entries({
            admin_user_roles: ['user_id','role','updated_at'],
            admin_account_deletions: ['user_id','prior_status','prior_banned_until','prior_ban_reason','deleted_at'],
            admin_account_audit: ['id','user_id','admin_actor','action','reason','created_at'],
            password_reset_otps: ['id','email','user_id','auth_version','code_hash','expires_at','used','attempt_count','request_ip','created_at']
        })) for (const name of columns) if (!await get(`SELECT name FROM pragma_table_info('${table}') WHERE name=?`, [name])) throw new Error("Incompatible existing table: " + table);
        return { success: true, schema: "account-admin-and-password-reset" };
    });
}
module.exports = { migrate };
if (require.main === module) (async () => {
    const fs = require("fs"), path = require("path"), sqlite = require("sqlite3");
    const args = process.argv.slice(2);
    if (args.length !== 3 || args[0] !== "--db" || args[2] !== "--apply" || !path.isAbsolute(args[1])) throw new Error("Usage: node scripts/migrate-account-admin.js --db <absolute existing database path> --apply");
    const filename = fs.realpathSync(args[1]);
    if (!fs.statSync(filename).isFile()) throw new Error("An existing database file is required");
    const db = await new Promise((resolve, reject) => { const c = new sqlite.Database(filename, sqlite.OPEN_READWRITE, e => e ? reject(e) : resolve(c)); });
    try { console.log(JSON.stringify(await migrate(db))); }
    finally { await new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve())); }
})().catch(() => { console.error("Account schema migration failed and was not confirmed committed; inspect before retrying."); process.exitCode = 1; });
