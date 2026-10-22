"use strict";

const sqlite3 = require("sqlite3");
const queues = new Map();

function withAuthTransaction(source, operation) {
  // Waiting native BEGIN calls can occupy every libuv worker, starving the
  // connection holding the lock. Queue locally before opening connections;
  // BEGIN IMMEDIATE still provides exclusion across separate Node processes.
  const key = source.filename;
  const previous = queues.get(key) || Promise.resolve();
  const result = previous.catch(() => {}).then(() => executeTransaction(source, operation));
  queues.set(key, result);
  const release = () => { if (queues.get(key) === result) queues.delete(key); };
  result.then(release, release);
  return result;
}

// A dedicated connection owns this transaction. Never BEGIN on the shared
// application connection: unrelated wallet/payment statements could join it.
async function executeTransaction(source, operation) {
  let connection;
  let transactionOpen = false;
  try {
    connection = await new Promise((resolve, reject) => {
      const candidate = new sqlite3.Database(source.filename, sqlite3.OPEN_READWRITE,
        error => error ? reject(error) : resolve(candidate));
    });
    const run = (sql, params = []) => new Promise((resolve, reject) => {
      connection.run(sql, params, function (error) {
        error ? reject(error) : resolve({ changes: this.changes, lastID: this.lastID });
      });
    });
    const get = (sql, params = []) => new Promise((resolve, reject) => {
      connection.get(sql, params, (error, row) => error ? reject(error) : resolve(row));
    });
    await run("PRAGMA foreign_keys=ON");
    await run("PRAGMA busy_timeout=10000");
    await run("BEGIN IMMEDIATE");
    transactionOpen = true;
    const result = await operation({ run, get });
    await run("COMMIT");
    transactionOpen = false;
    return result;
  } catch (error) {
    if (connection && transactionOpen) {
      await new Promise(resolve => connection.run("ROLLBACK", resolve));
    }
    throw error;
  } finally {
    if (connection) await new Promise((resolve, reject) => {
      connection.close(error => error ? reject(error) : resolve());
    });
  }
}

module.exports = { withAuthTransaction };
