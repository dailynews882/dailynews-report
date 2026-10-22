"use strict";

// Standalone migration. Importing this file never opens an application DB.
// CLI inspection is read-only; --apply is restricted to disposable temp fixtures.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const sqlite3 = require("sqlite3");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS password_reset_otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE RESTRICT,
  auth_version INTEGER,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1)),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  request_ip TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_password_reset_email_id ON password_reset_otps(email,id DESC);
CREATE INDEX IF NOT EXISTS idx_password_reset_ip_time ON password_reset_otps(request_ip,created_at);
`;

function assertTemporaryTarget(filename) {
  const resolved = fs.realpathSync(filename);
  const directory = path.dirname(resolved);
  const temp = fs.realpathSync(os.tmpdir());
  if (path.dirname(directory) !== temp || !path.basename(directory).startsWith("dailynews-batch2-test-") ||
      path.basename(resolved) !== "fixture.sqlite") {
    throw new Error("Apply is restricted to a new dailynews-batch2-test-* temp directory and fixture.sqlite");
  }
}

async function applyToTemporaryDatabase(db) {
  assertTemporaryTarget(db.filename);
  await new Promise((resolve, reject) => db.exec("BEGIN IMMEDIATE;\n" + SCHEMA + "\nCOMMIT;", error => {
    if (!error) return resolve();
    db.run("ROLLBACK", () => reject(error));
  }));
}

async function main(args) {
  const flag = args.indexOf("--db");
  if (flag < 0 || !args[flag + 1]) throw new Error("Usage: node scripts/migrate-password-reset.js --db <existing file> [--apply]");
  const filename = fs.realpathSync(path.resolve(args[flag + 1]));
  if (!fs.statSync(filename).isFile() || /^dailynews(?:-v115.*)?\.db$/i.test(path.basename(filename))) {
    throw new Error("Application and V11.5 database files are forbidden");
  }
  const apply = args.includes("--apply");
  if (apply) assertTemporaryTarget(filename);
  const db = await new Promise((resolve, reject) => {
    const candidate = new sqlite3.Database(filename, apply ? sqlite3.OPEN_READWRITE : sqlite3.OPEN_READONLY,
      error => error ? reject(error) : resolve(candidate));
  });
  try {
    if (apply) await applyToTemporaryDatabase(db);
    else await new Promise((resolve, reject) => db.run("PRAGMA query_only=ON", error => error ? reject(error) : resolve()));
    const columns = await new Promise((resolve, reject) => db.all("PRAGMA table_info(password_reset_otps)", (error, rows) => error ? reject(error) : resolve(rows)));
    console.log(JSON.stringify({ mode: apply ? "temporary-apply" : "read-only", columns: columns.map(row => row.name) }));
  } finally { await new Promise((resolve, reject) => db.close(error => error ? reject(error) : resolve())); }
}

module.exports = { SCHEMA, applyToTemporaryDatabase };
if (require.main === module) main(process.argv.slice(2)).catch(() => {
  console.error("Password reset schema check/apply failed; no application database is permitted.");
  process.exitCode = 1;
});
