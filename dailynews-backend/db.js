const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./dailynews.db", (err) => {
  if (err) {
    console.error("Database connection error:", err.message);
  } else {
    console.log("SQLite database connected.");
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      account TEXT UNIQUE NOT NULL,
      account_type TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      member_level TEXT DEFAULT 'free',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL,
      otp_code TEXT NOT NULL,
      account_type TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      balance REAL DEFAULT 0,
      reward_balance REAL DEFAULT 0,
      total_recharge REAL DEFAULT 0,
      total_spend REAL DEFAULT 0,
      withdrawable_balance REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      status TEXT DEFAULT 'success',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subscription_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_type TEXT NOT NULL,
      plan_name TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'SGD',
      status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'wallet',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      paid_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  
  db.run(`
  CREATE TABLE IF NOT EXISTS payment_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    provider TEXT DEFAULT 'stripe',
    provider_session_id TEXT,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'SGD',
    status TEXT DEFAULT 'pending',
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    paid_at DATETIME,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

  db.run(`
  CREATE TABLE IF NOT EXISTS news (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT DEFAULT 'general',
    summary TEXT,
    content TEXT NOT NULL,
    image_url TEXT,
    video_url TEXT,
    source TEXT,
    author TEXT DEFAULT 'DailyNews Admin',
    status TEXT DEFAULT 'published',
    is_vip INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

  // 给 users 表补充 VIP 字段；如果字段已存在，SQLite 会报错，这里忽略即可。
  db.run(`ALTER TABLE users ADD COLUMN vip_expire_at DATETIME`, () => {});
  db.run(`ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'free'`, () => {});
});

module.exports = db;