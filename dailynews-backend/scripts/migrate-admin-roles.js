"use strict";
// Explicit compatibility migration of the existing role table only. No automatic grants.
const { withAuthTransaction } = require("../utils/authTransaction");
async function migrate(source) {
    return withAuthTransaction(source, async ({ get, run }) => {
        const table = await get("SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_user_roles'");
        if (!table) throw new Error("Run the existing account-admin migration first");
        const columns = await get("SELECT COUNT(*) n FROM pragma_table_info('admin_user_roles')");
        if (columns.n !== 3 || !await get("SELECT name FROM pragma_table_info('admin_user_roles') WHERE name='user_id' AND pk=1") ||
            !await get("SELECT name FROM pragma_table_info('admin_user_roles') WHERE name='role' AND [notnull]=1") ||
            !await get("SELECT name FROM pragma_table_info('admin_user_roles') WHERE name='updated_at' AND [notnull]=1")) throw new Error("Unexpected role table layout; manual review required");
        if (await get("SELECT user_id FROM admin_user_roles WHERE role NOT IN ('editor','admin','hr') OR role IS NULL LIMIT 1")) throw new Error("Unknown existing role; no data changed");
        if (await get("PRAGMA foreign_key_check")) throw new Error("Existing foreign key violation; no data changed");
        if (!/'hr'/.test(table.sql)) {
            if (await get("SELECT name FROM sqlite_master WHERE tbl_name='admin_user_roles' AND (type='trigger' OR (type='index' AND sql IS NOT NULL)) LIMIT 1")) throw new Error("Custom role index/trigger needs manual review");
            if (await get(`SELECT s.name FROM sqlite_master s JOIN pragma_foreign_key_list(s.name) f ON 1=1
                WHERE s.type='table' AND f.[table]='admin_user_roles' LIMIT 1`)) throw new Error("Dependent role foreign key needs manual review");
            const before = await get("SELECT COUNT(*) n FROM admin_user_roles");
            await run(`CREATE TABLE admin_user_roles_hr_upgrade (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
                role TEXT NOT NULL CHECK(role IN ('editor','admin','hr')),
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
            await run("INSERT INTO admin_user_roles_hr_upgrade(user_id,role,updated_at) SELECT user_id,role,updated_at FROM admin_user_roles");
            const after = await get("SELECT COUNT(*) n FROM admin_user_roles_hr_upgrade");
            if (before.n !== after.n) throw new Error("Role preservation check failed");
            await run("DROP TABLE admin_user_roles");
            await run("ALTER TABLE admin_user_roles_hr_upgrade RENAME TO admin_user_roles");
        }
        if (await get("PRAGMA foreign_key_check")) throw new Error("Post-migration foreign key violation");
        return { success: true, schema: "existing-admin-roles-with-hr", automatic_role_grants: false };
    });
}
module.exports = { migrate };
if (require.main === module) (async () => {
    const fs = require("fs"), path = require("path"), sqlite = require("sqlite3");
    const args = process.argv.slice(2);
    if (args.length !== 3 || args[0] !== "--db" || args[2] !== "--apply" || !path.isAbsolute(args[1])) throw new Error("Usage: node scripts/migrate-admin-roles.js --db <absolute existing database path> --apply");
    const filename = fs.realpathSync(args[1]);
    if (!fs.statSync(filename).isFile()) throw new Error("Existing database file required");
    const db = await new Promise((resolve, reject) => { const c = new sqlite.Database(filename, sqlite.OPEN_READWRITE, e => e ? reject(e) : resolve(c)); });
    try { console.log(JSON.stringify(await migrate(db))); }
    finally { await new Promise((resolve, reject) => db.close(e => e ? reject(e) : resolve())); }
})().catch(() => { console.error("Role compatibility migration failed; no successful commit confirmed. Inspect before retrying."); process.exitCode = 1; });
