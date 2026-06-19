const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./dailynews.db", (err) => {
  if (err) {
    console.error("Database connection error:", err.message);
  } else {
    console.log("SQLite database connected.");
  }
});

// 开启 SQLite 外键约束
db.run("PRAGMA foreign_keys = ON");

// 数据库繁忙时最多等待 5 秒，减少 SQLITE_BUSY 错误
db.run("PRAGMA busy_timeout = 5000");

/**
 * 安全添加字段。
 * 字段已经存在时忽略；其他错误仍然显示在终端。
 */
function addColumnIfMissing(sql, columnName) {
  db.run(sql, (err) => {
    if (!err) {
      console.log(`Database column added: ${columnName}`);
      return;
    }

    if (!err.message.includes("duplicate column name")) {
      console.error(`Failed to add column ${columnName}:`, err.message);
    }
  });
}

db.serialize(() => {
  // 用户表
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

  /*
   * 为用户表补充邮箱和手机相关字段。
   * account/account_type 暂时保留，保证旧的注册登录代码继续兼容。
   */
  addColumnIfMissing(
    `ALTER TABLE users ADD COLUMN email TEXT`,
    "users.email"
  );

  addColumnIfMissing(
    `ALTER TABLE users ADD COLUMN phone TEXT`,
    "users.phone"
  );

  addColumnIfMissing(
    `ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0`,
    "users.email_verified"
  );

  addColumnIfMissing(
    `ALTER TABLE users ADD COLUMN phone_verified INTEGER DEFAULT 0`,
    "users.phone_verified"
  );

  addColumnIfMissing(
    `ALTER TABLE users ADD COLUMN vip_expire_at DATETIME`,
    "users.vip_expire_at"
  );

  addColumnIfMissing(
    `ALTER TABLE users ADD COLUMN subscription_status TEXT DEFAULT 'free'`,
    "users.subscription_status"
  );

  addColumnIfMissing(
    `ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
    "users.updated_at"
  );

  // 邮箱字段唯一索引：NULL 不受影响
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
    ON users(email)
    WHERE email IS NOT NULL
  `);

  // 手机号字段唯一索引
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
    ON users(phone)
    WHERE phone IS NOT NULL
  `);

  // 验证码表
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

  /*
   * otp_code 字段后续保存验证码的哈希值，
   * 不再保存用户收到的明文验证码。
   */
  addColumnIfMissing(
    `ALTER TABLE otps ADD COLUMN purpose TEXT DEFAULT 'register'`,
    "otps.purpose"
  );

  addColumnIfMissing(
    `ALTER TABLE otps ADD COLUMN attempt_count INTEGER DEFAULT 0`,
    "otps.attempt_count"
  );

  addColumnIfMissing(
    `ALTER TABLE otps ADD COLUMN request_ip TEXT`,
    "otps.request_ip"
  );

  addColumnIfMissing(
    `ALTER TABLE otps ADD COLUMN last_sent_at DATETIME`,
    "otps.last_sent_at"
  );

  // 加快验证码查询
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_otps_account_type_used
    ON otps(account, account_type, used)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_otps_expires_at
    ON otps(expires_at)
  `);

  // 钱包表
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

  // 钱包交易记录
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
    CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_id
    ON wallet_transactions(user_id)
  `);

  // 会员订阅订单
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
    CREATE INDEX IF NOT EXISTS idx_subscription_orders_user_id
    ON subscription_orders(user_id)
  `);

  // Stripe 等支付服务订单
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
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_provider_session
    ON payment_orders(provider_session_id)
    WHERE provider_session_id IS NOT NULL
  `);

  // 新闻表
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

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_news_status_created_at
    ON news(status, created_at)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS idx_news_category
    ON news(category)
  `);
});

module.exports = db;