const sqlite3 = require("sqlite3").verbose();
const path = require("path");

/*

* 始终使用项目目录中的 dailynews.db。
* 避免从不同目录启动服务器时创建新的空数据库。
  */
const databasePath = path.join(
  __dirname,
  "dailynews.db"
);

const db = new sqlite3.Database(
  databasePath,
  (err) => {
    if (err) {
      console.error(
        "Database connection error:",
        err.message
      );
      return;
    }

    console.log(
      "SQLite database connected:",
      databasePath
    );

  }
);

/*

* 开启外键约束。
  */
db.run("PRAGMA foreign_keys = ON");

/*

* 数据库繁忙时最多等待5秒，
* 减少 SQLITE_BUSY 错误。
  */
db.run("PRAGMA busy_timeout = 5000");

/*

* 安全增加字段。
*
* 字段已经存在时忽略；
* 其他错误会显示在终端。
  */
function addColumnIfMissing(
  sql,
  columnName
) {
  db.run(sql, (err) => {
    if (!err) {
      console.log(
        `Database column added: ${columnName}`
      );
      return;
    }

    if (
      !String(err.message).includes(
        "duplicate column name"
      )
    ) {
      console.error(
        `Failed to add column ${columnName}:`,
        err.message
      );
    }
  });
}

db.serialize(() => {
  /*
  
  * ==============================
  * 用户表
  * ==============================
    */
  db.run(`     CREATE TABLE IF NOT EXISTS users (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   username TEXT UNIQUE NOT NULL,
   account TEXT UNIQUE NOT NULL,
   account_type TEXT NOT NULL,
   password_hash TEXT NOT NULL,
   email TEXT,
   phone TEXT,
   email_verified INTEGER DEFAULT 0,
   phone_verified INTEGER DEFAULT 0,
   member_level TEXT DEFAULT 'free',
   subscription_status TEXT DEFAULT 'free',
   vip_expire_at DATETIME,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   updated_at DATETIME
      )
    `);

  /*
  
  * 兼容旧数据库，逐个补充用户字段。
    */
  addColumnIfMissing(
    `ALTER TABLE users
  ADD COLUMN email TEXT`,
    "users.email"
  );

  addColumnIfMissing(
    `ALTER TABLE users
     ADD COLUMN phone TEXT`,
    "users.phone"
  );

  addColumnIfMissing(
    `ALTER TABLE users
     ADD COLUMN email_verified INTEGER DEFAULT 0`,
    "users.email_verified"
  );

  addColumnIfMissing(
    `ALTER TABLE users
     ADD COLUMN phone_verified INTEGER DEFAULT 0`,
    "users.phone_verified"
  );

  addColumnIfMissing(
    `ALTER TABLE users
     ADD COLUMN vip_expire_at DATETIME`,
    "users.vip_expire_at"
  );

  addColumnIfMissing(
    `ALTER TABLE users
     ADD COLUMN subscription_status TEXT DEFAULT 'free'`,
    "users.subscription_status"
  );

  /*
  
  * 注意：
  * SQLite 不允许通过 ALTER TABLE 增加
  * DEFAULT CURRENT_TIMESTAMP 的字段。
  *
  * 所以这里先增加普通 DATETIME 字段，
  * 再给旧数据补充时间。
    */
  addColumnIfMissing(
    `ALTER TABLE users
  ADD COLUMN updated_at DATETIME`,
    "users.updated_at"
  );

  db.run(`     UPDATE users
    SET updated_at = COALESCE(
      updated_at,
      created_at,
      CURRENT_TIMESTAMP
    )
    WHERE updated_at IS NULL
  `);

  db.run(`     CREATE UNIQUE INDEX IF NOT EXISTS
    idx_users_email_unique
    ON users(email)
    WHERE email IS NOT NULL
  `);

  db.run(`     CREATE UNIQUE INDEX IF NOT EXISTS
    idx_users_phone_unique
    ON users(phone)
    WHERE phone IS NOT NULL
  `);

  /*
  
  * ==============================
  * 验证码表
  * ==============================
    */
  db.run(`     CREATE TABLE IF NOT EXISTS otps (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   account TEXT NOT NULL,
   otp_code TEXT NOT NULL,
   account_type TEXT NOT NULL,
   expires_at DATETIME NOT NULL,
   used INTEGER DEFAULT 0,
   purpose TEXT DEFAULT 'register',
   attempt_count INTEGER DEFAULT 0,
   request_ip TEXT,
   last_sent_at DATETIME,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

  addColumnIfMissing(
    `ALTER TABLE otps
     ADD COLUMN purpose TEXT DEFAULT 'register'`,
    "otps.purpose"
  );

  addColumnIfMissing(
    `ALTER TABLE otps
     ADD COLUMN attempt_count INTEGER DEFAULT 0`,
    "otps.attempt_count"
  );

  addColumnIfMissing(
    `ALTER TABLE otps
     ADD COLUMN request_ip TEXT`,
    "otps.request_ip"
  );

  addColumnIfMissing(
    `ALTER TABLE otps
     ADD COLUMN last_sent_at DATETIME`,
    "otps.last_sent_at"
  );

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_otps_account_type_used
    ON otps(account, account_type, used)
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_otps_expires_at
    ON otps(expires_at)
  `);

  /*
  
  * ==============================
  * 钱包表
  * ==============================
    */
  db.run(`     CREATE TABLE IF NOT EXISTS wallets (
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
   FOREIGN KEY (user_id)
     REFERENCES users(id)
      )
    `);

  /*
  
  * ==============================
  * 钱包交易记录
  * ==============================
    */
  db.run(`     CREATE TABLE IF NOT EXISTS wallet_transactions (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   user_id INTEGER NOT NULL,
   type TEXT NOT NULL,
   amount REAL NOT NULL,
   status TEXT DEFAULT 'success',
   description TEXT,
   provider TEXT,
   provider_reference TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   FOREIGN KEY (user_id)
     REFERENCES users(id)
      )
    `);

  addColumnIfMissing(
    `ALTER TABLE wallet_transactions
     ADD COLUMN provider TEXT`,
    "wallet_transactions.provider"
  );

  addColumnIfMissing(
    `ALTER TABLE wallet_transactions
     ADD COLUMN provider_reference TEXT`,
    "wallet_transactions.provider_reference"
  );

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_wallet_transactions_user_id
    ON wallet_transactions(user_id)
  `);

  /*
  
  * ==============================
  * 会员订单历史表
  * ==============================
    */
  db.run(`     CREATE TABLE IF NOT EXISTS subscription_orders (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   user_id INTEGER NOT NULL,
   plan_type TEXT NOT NULL,
   plan_name TEXT NOT NULL,
   amount REAL NOT NULL,
   currency TEXT DEFAULT 'SGD',
   status TEXT DEFAULT 'pending',
   payment_method TEXT DEFAULT 'wallet',
   provider TEXT,
   provider_session_id TEXT,
   provider_subscription_id TEXT,
   provider_invoice_id TEXT,
   provider_payment_id TEXT,
   stripe_price_id TEXT,
   period_start DATETIME,
   period_end DATETIME,
   failure_reason TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   paid_at DATETIME,
   updated_at DATETIME,
   FOREIGN KEY (user_id)
     REFERENCES users(id)
      )
    `);

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN provider TEXT`,
    "subscription_orders.provider"
  );

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN provider_session_id TEXT`,
    "subscription_orders.provider_session_id"
  );

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN provider_subscription_id TEXT`,
    "subscription_orders.provider_subscription_id"
  );

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN provider_invoice_id TEXT`,
    "subscription_orders.provider_invoice_id"
  );

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN provider_payment_id TEXT`,
    "subscription_orders.provider_payment_id"
  );

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN stripe_price_id TEXT`,
    "subscription_orders.stripe_price_id"
  );

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN period_start DATETIME`,
    "subscription_orders.period_start"
  );

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN period_end DATETIME`,
    "subscription_orders.period_end"
  );

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN failure_reason TEXT`,
    "subscription_orders.failure_reason"
  );

  addColumnIfMissing(
    `ALTER TABLE subscription_orders
     ADD COLUMN updated_at DATETIME`,
    "subscription_orders.updated_at"
  );

  db.run(`     UPDATE subscription_orders
    SET updated_at = COALESCE(
      updated_at,
      created_at,
      CURRENT_TIMESTAMP
    )
    WHERE updated_at IS NULL
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_subscription_orders_user_id
    ON subscription_orders(user_id)
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_subscription_orders_status
    ON subscription_orders(status)
  `);

  db.run(`     CREATE UNIQUE INDEX IF NOT EXISTS
    idx_subscription_orders_session
    ON subscription_orders(provider_session_id)
    WHERE provider_session_id IS NOT NULL
  `);

  /*
  
  * ==============================
  * 用户当前订阅状态表
  *
  * 每个用户只保存一条当前订阅。
  * Stripe是订阅状态的真实来源。
  * ==============================
    */
  db.run(`     CREATE TABLE IF NOT EXISTS user_subscriptions (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   user_id INTEGER UNIQUE NOT NULL,
   provider TEXT DEFAULT 'stripe',
   stripe_customer_id TEXT,
   stripe_subscription_id TEXT,
   stripe_price_id TEXT,
   status TEXT DEFAULT 'incomplete',
   current_period_start DATETIME,
   current_period_end DATETIME,
   cancel_at_period_end INTEGER DEFAULT 0,
   canceled_at DATETIME,
   last_invoice_id TEXT,
   last_payment_status TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   updated_at DATETIME,
   FOREIGN KEY (user_id)
     REFERENCES users(id)
      )
    `);

  db.run(`     CREATE UNIQUE INDEX IF NOT EXISTS
    idx_user_subscriptions_subscription
    ON user_subscriptions(stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_user_subscriptions_customer
    ON user_subscriptions(stripe_customer_id)
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_user_subscriptions_status
    ON user_subscriptions(status)
  `);

  /*
  
  * ==============================
  * Stripe支付订单表
  *
  * 当前保留钱包充值兼容性，
  * 同时支持VIP订阅订单。
  * ==============================
    */
  db.run(`     CREATE TABLE IF NOT EXISTS payment_orders (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   user_id INTEGER NOT NULL,
   order_type TEXT DEFAULT 'wallet_topup',
   plan_type TEXT,
   provider TEXT DEFAULT 'stripe',
   provider_session_id TEXT,
   provider_customer_id TEXT,
   provider_subscription_id TEXT,
   provider_invoice_id TEXT,
   provider_payment_id TEXT,
   amount REAL NOT NULL,
   paid_amount REAL DEFAULT 0,
   currency TEXT DEFAULT 'SGD',
   status TEXT DEFAULT 'pending',
   description TEXT,
   failure_reason TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   paid_at DATETIME,
   updated_at DATETIME,
   FOREIGN KEY (user_id)
     REFERENCES users(id)
      )
    `);

  addColumnIfMissing(
    `ALTER TABLE payment_orders
     ADD COLUMN order_type TEXT DEFAULT 'wallet_topup'`,
    "payment_orders.order_type"
  );

  addColumnIfMissing(
    `ALTER TABLE payment_orders
     ADD COLUMN plan_type TEXT`,
    "payment_orders.plan_type"
  );

  addColumnIfMissing(
    `ALTER TABLE payment_orders
     ADD COLUMN provider_customer_id TEXT`,
    "payment_orders.provider_customer_id"
  );

  addColumnIfMissing(
    `ALTER TABLE payment_orders
     ADD COLUMN provider_subscription_id TEXT`,
    "payment_orders.provider_subscription_id"
  );

  addColumnIfMissing(
    `ALTER TABLE payment_orders
     ADD COLUMN provider_invoice_id TEXT`,
    "payment_orders.provider_invoice_id"
  );

  addColumnIfMissing(
    `ALTER TABLE payment_orders
     ADD COLUMN provider_payment_id TEXT`,
    "payment_orders.provider_payment_id"
  );

  addColumnIfMissing(
    `ALTER TABLE payment_orders
     ADD COLUMN paid_amount REAL DEFAULT 0`,
    "payment_orders.paid_amount"
  );

  addColumnIfMissing(
    `ALTER TABLE payment_orders
     ADD COLUMN failure_reason TEXT`,
    "payment_orders.failure_reason"
  );

  addColumnIfMissing(
    `ALTER TABLE payment_orders
     ADD COLUMN updated_at DATETIME`,
    "payment_orders.updated_at"
  );

  db.run(`     UPDATE payment_orders
    SET updated_at = COALESCE(
      updated_at,
      created_at,
      CURRENT_TIMESTAMP
    )
    WHERE updated_at IS NULL
  `);

  db.run(`     CREATE UNIQUE INDEX IF NOT EXISTS
    idx_payment_provider_session
    ON payment_orders(provider_session_id)
    WHERE provider_session_id IS NOT NULL
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_payment_orders_user_id
    ON payment_orders(user_id)
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_payment_orders_status
    ON payment_orders(status)
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_payment_orders_subscription
    ON payment_orders(provider_subscription_id)
  `);

  /*
  
  * ==============================
  * Stripe Webhook事件记录表
  *
  * Stripe可能重复发送同一个事件。
  * event_id设为唯一，防止重复开通会员。
  * ==============================
    */
  db.run(`     CREATE TABLE IF NOT EXISTS stripe_webhook_events (
   id INTEGER PRIMARY KEY AUTOINCREMENT,
   event_id TEXT UNIQUE NOT NULL,
   event_type TEXT NOT NULL,
   status TEXT DEFAULT 'processing',
   error_message TEXT,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   processed_at DATETIME
      )
    `);

  db.run(`     CREATE UNIQUE INDEX IF NOT EXISTS
    idx_stripe_webhook_event_id
    ON stripe_webhook_events(event_id)
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_stripe_webhook_event_status
    ON stripe_webhook_events(status)
  `);

  /*
  
  * ==============================
  * 新闻表
  * ==============================
    */
  db.run(`     CREATE TABLE IF NOT EXISTS news (
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

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_news_status_created_at
    ON news(status, created_at)
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_news_category
    ON news(category)
  `);
});

/*
 * ==============================
 * 网站系统设置表
 * ==============================
 */

db.run(
  `
    CREATE TABLE IF NOT EXISTS site_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  (tableError) => {
    if (tableError) {
      console.error(
        "Create site_settings table error:",
        tableError.message
      );
      return;
    }

    db.run(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_site_settings_key
        ON site_settings(setting_key)
      `,
      (indexError) => {
        if (indexError) {
          console.error(
            "Create site_settings index error:",
            indexError.message
          );
        }
      }
    );
  }
);

module.exports = db;
