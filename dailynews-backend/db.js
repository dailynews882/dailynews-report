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
   content TEXT DEFAULT '',
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
   original_url TEXT,
   external_id TEXT,
   api_provider TEXT,
   published_at DATETIME,
   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

  addColumnIfMissing(
    `ALTER TABLE news
       ADD COLUMN original_url TEXT`,
    "news.original_url"
  );

  addColumnIfMissing(
    `ALTER TABLE news
       ADD COLUMN external_id TEXT`,
    "news.external_id"
  );

  addColumnIfMissing(
    `ALTER TABLE news
       ADD COLUMN api_provider TEXT`,
    "news.api_provider"
  );

  addColumnIfMissing(
    `ALTER TABLE news
       ADD COLUMN published_at DATETIME`,
    "news.published_at"
  );

  addColumnIfMissing(
    `ALTER TABLE news
       ADD COLUMN country_code TEXT`,
    "news.country_code"
  );

  addColumnIfMissing(
    `ALTER TABLE news
       ADD COLUMN country_name TEXT`,
    "news.country_name"
  );

  addColumnIfMissing(
    `ALTER TABLE news
       ADD COLUMN region TEXT`,
    "news.region"
  );

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_news_status_created_at
    ON news(status, created_at)
  `);

  db.run(`     CREATE INDEX IF NOT EXISTS
    idx_news_category
    ON news(category)
  `);
  /*
 * ==============================
 * 新闻分类基础数据表
 * ==============================
 */
  db.run(`
  CREATE TABLE IF NOT EXISTS news_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_code TEXT NOT NULL UNIQUE,
    category_name TEXT NOT NULL,
    category_name_en TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    show_in_home_nav INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

  db.run(`
  CREATE INDEX IF NOT EXISTS
  idx_news_categories_active_sort
  ON news_categories(
    is_active,
    sort_order
  )
`);

  const defaultNewsCategories = [
    ["general", "综合新闻", "General", 10, 1, 0],
    ["politics", "政治", "Politics", 20, 1, 1],
    ["economy", "经济", "Economy", 30, 1, 1],
    ["military", "军事与战争", "Military & War", 40, 1, 1],
    ["crypto", "数字货币", "Cryptocurrency", 50, 1, 1],
    ["politics-figure", "政要人物", "Political Figures", 60, 1, 1],
    ["semiconductor", "半导体", "Semiconductor", 70, 1, 1],
    ["think-tank", "智库与论坛", "Think Tanks & Forums", 80, 1, 1],
    ["influencer", "大V博主", "Influencers", 90, 1, 1],
    ["energy", "能源", "Energy", 100, 1, 1],
    ["futures", "期货", "Futures", 110, 1, 1],
    ["precious-metals", "黄金与白银", "Gold & Silver", 120, 1, 1]
  ];

  const insertDefaultCategorySql = `
  INSERT OR IGNORE INTO news_categories (
    category_code,
    category_name,
    category_name_en,
    sort_order,
    is_active,
    show_in_home_nav
  )
  VALUES (?, ?, ?, ?, ?, ?)
`;

  defaultNewsCategories.forEach((category) => {
    db.run(
      insertDefaultCategorySql,
      category
    );
  });

  /*
   * ==============================
   * 新闻国家基础数据表
   * ==============================
   */
  db.run(`
  CREATE TABLE IF NOT EXISTS news_countries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    country_code TEXT NOT NULL UNIQUE,
    country_name TEXT NOT NULL,
    country_name_en TEXT DEFAULT '',
    region TEXT DEFAULT '',
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    show_in_home_menu INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

  db.run(`
  CREATE INDEX IF NOT EXISTS
  idx_news_countries_active_sort
  ON news_countries(
    is_active,
    sort_order
  )
`);

  const defaultNewsCountries = [
    ["sg", "新加坡", "Singapore", "Asia", 10, 1, 1],
    ["us", "美国", "United States", "North America", 20, 1, 1],
    ["cn", "中国", "China", "Asia", 30, 1, 1],
    ["gb", "英国", "United Kingdom", "Europe", 40, 1, 1],
    ["my", "马来西亚", "Malaysia", "Asia", 50, 1, 1]
  ];

  const insertDefaultCountrySql = `
  INSERT OR IGNORE INTO news_countries (
    country_code,
    country_name,
    country_name_en,
    region,
    sort_order,
    is_active,
    show_in_home_menu
  )
  VALUES (?, ?, ?, ?, ?, ?, ?)
`;

  defaultNewsCountries.forEach((country) => {
    db.run(
      insertDefaultCountrySql,
      country
    );
  });
});

/*
 * ================================
 * GNews 抓取运行日志表
 * ================================
 */
db.run(
  `
    CREATE TABLE IF NOT EXISTS gnews_fetch_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trigger_type TEXT NOT NULL DEFAULT 'automatic',
      run_status TEXT NOT NULL DEFAULT 'running',
      request_params TEXT,
      received_count INTEGER DEFAULT 0,
      imported_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0,
      failed_count INTEGER DEFAULT 0,
      error_message TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  (tableError) => {
    if (tableError) {
      console.error(
        "Create gnews_fetch_logs table error:",
        tableError.message
      );
      return;
    }

    db.run(
      `
        CREATE INDEX IF NOT EXISTS
        idx_gnews_fetch_logs_started_at
        ON gnews_fetch_logs(started_at)
      `,
      (indexError) => {
        if (indexError) {
          console.error(
            "Create gnews fetch log time index error:",
            indexError.message
          );
        }
      }
    );

    db.run(
      `
        CREATE INDEX IF NOT EXISTS
        idx_gnews_fetch_logs_status
        ON gnews_fetch_logs(run_status)
      `,
      (indexError) => {
        if (indexError) {
          console.error(
            "Create gnews fetch log status index error:",
            indexError.message
          );
        }
      }
    );

    db.run(
      `
        CREATE INDEX IF NOT EXISTS
        idx_gnews_fetch_logs_trigger
        ON gnews_fetch_logs(trigger_type)
      `,
      (indexError) => {
        if (indexError) {
          console.error(
            "Create gnews fetch log trigger index error:",
            indexError.message
          );
        }
      }
    );
  }
);

/*
 * ================================
 * GNews API 每日调用统计表
 * ================================
 *
 * request_count:
 * 已经向 GNews 发出的请求总次数。
 *
 * success_count:
 * 收到成功 HTTP 响应的次数。
 *
 * failed_count:
 * 网络错误、超时或非成功 HTTP 响应次数。
 *
 * usage_date:
 * 当前先使用 UTC 日期 YYYY-MM-DD 统计。
 */
db.run(
  `
    CREATE TABLE IF NOT EXISTS gnews_api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      usage_date TEXT NOT NULL UNIQUE,
      request_count INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      failed_count INTEGER NOT NULL DEFAULT 0,
      last_status_code INTEGER,
      last_error TEXT,
      first_requested_at DATETIME,
      last_requested_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  (tableError) => {
    if (tableError) {
      console.error(
        "Create gnews_api_usage table error:",
        tableError.message
      );
      return;
    }

    db.run(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_gnews_api_usage_date
        ON gnews_api_usage(usage_date)
      `,
      (indexError) => {
        if (indexError) {
          console.error(
            "Create GNews API usage date index error:",
            indexError.message
          );
        }
      }
    );
  }
);

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

/*
 * =========================================
 * 首页广告管理表
 * =========================================
 */

db.run(
  `
    CREATE TABLE IF NOT EXISTS site_ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      image_url TEXT NOT NULL,
      target_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      open_new_tab INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  (tableError) => {
    if (tableError) {
      console.error(
        "Create site_ads table error:",
        tableError.message
      );
      return;
    }

    db.run(
      `
        CREATE INDEX IF NOT EXISTS
        idx_site_ads_sort_order
        ON site_ads(sort_order)
      `,
      (indexError) => {
        if (indexError) {
          console.error(
            "Create site_ads sort order index error:",
            indexError.message
          );
        }
      }
    );

    db.run(
      `
        CREATE INDEX IF NOT EXISTS
        idx_site_ads_active
        ON site_ads(is_active)
      `,
      (indexError) => {
        if (indexError) {
          console.error(
            "Create site_ads active index error:",
            indexError.message
          );
        }
      }
    );
  }
);

db.all(
  "PRAGMA table_info(site_ads)",
  [],
  (schemaError, columns) => {
    if (schemaError) {
      console.error(
        "Read site_ads schema error:",
        schemaError.message
      );
      return;
    }

    const hasContentColumn =
      Array.isArray(columns) &&
      columns.some(function (column) {
        return column.name === "content";
      });

    if (hasContentColumn) {
      return;
    }

    db.run(
      `
        ALTER TABLE site_ads
        ADD COLUMN content TEXT DEFAULT ''
      `,
      (alterError) => {
        if (alterError) {
          console.error(
            "Add site_ads content column error:",
            alterError.message
          );
          return;
        }

        console.log(
          "site_ads content column added"
        );
      }
    );
  }
);

/*
 * ============================================================
 * 全球央行利率表
 * ============================================================
 *
 * 用途：
 * 1. 首页“全球央行利率”模块
 * 2. 后续财经日历二级页面
 * 3. 保存当前值、上次值、预测值、公布值
 * 4. 支持美联储等利率区间
 */

db.run(
  `
    CREATE TABLE IF NOT EXISTS central_bank_rates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      bank_code TEXT NOT NULL UNIQUE,
      country_code TEXT NOT NULL,
      country_name TEXT NOT NULL,
      bank_name TEXT NOT NULL,

      rate_code TEXT NOT NULL,
      rate_name TEXT NOT NULL,

      current_value REAL,
      current_low REAL,
      current_high REAL,

      previous_value REAL,
      previous_low REAL,
      previous_high REAL,

      forecast_value REAL,
      forecast_low REAL,
      forecast_high REAL,

      actual_value REAL,
      actual_low REAL,
      actual_high REAL,

      unit TEXT NOT NULL DEFAULT '%',

      decision_time DATETIME,
      effective_date TEXT,
      next_decision_time DATETIME,

      direction TEXT NOT NULL DEFAULT 'unchanged',
      status TEXT NOT NULL DEFAULT 'published',

      official_source_name TEXT,
      official_source_url TEXT,

      forecast_source_name TEXT,
      forecast_source_url TEXT,

      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 1,

      last_checked_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `,
  (tableError) => {
    if (tableError) {
      console.error(
        "Create central_bank_rates table error:",
        tableError.message
      );

      return;
    }

    db.run(
      `
        CREATE UNIQUE INDEX IF NOT EXISTS
        idx_central_bank_rates_bank_code
        ON central_bank_rates(bank_code)
      `,
      (indexError) => {
        if (indexError) {
          console.error(
            "Create central_bank_rates bank code index error:",
            indexError.message
          );
        }
      }
    );

    db.run(
      `
        CREATE INDEX IF NOT EXISTS
        idx_central_bank_rates_active_sort
        ON central_bank_rates(is_active, sort_order)
      `,
      (indexError) => {
        if (indexError) {
          console.error(
            "Create central_bank_rates active sort index error:",
            indexError.message
          );
        }
      }
    );
  }
);


/*
 * ============================================================
 * 财经日历事件表
 * ============================================================
 *
 * 当前先保存演示数据。
 * 后续接入授权财经日历 API 时继续使用同一张表和接口。
 */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS economic_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_event_id TEXT UNIQUE,
      event_date TEXT NOT NULL,
      event_time TEXT NOT NULL DEFAULT '',
      country_code TEXT NOT NULL,
      country_name TEXT NOT NULL,
      event_title TEXT NOT NULL,
      event_type TEXT NOT NULL DEFAULT 'macro',
      event_type_name TEXT NOT NULL DEFAULT '宏观数据',
      importance INTEGER NOT NULL DEFAULT 1,
      previous_value TEXT DEFAULT '--',
      forecast_value TEXT DEFAULT '--',
      actual_value TEXT DEFAULT '--',
      unit TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      source_name TEXT DEFAULT 'Daily News Demo',
      source_url TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS
    idx_economic_events_date_time
    ON economic_events(event_date, event_time)
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS
    idx_economic_events_filters
    ON economic_events(
      is_active,
      country_code,
      event_type,
      importance,
      status
    )
  `);

  const demoEconomicEvents = [
    [
      "demo-sg-gdp",
      "today",
      "08:30",
      "SG",
      "新加坡",
      "第二季度 GDP 年率终值",
      "macro",
      "宏观数据",
      2,
      "4.1%",
      "4.3%",
      "--",
      "pending"
    ],
    [
      "demo-gb-rate",
      "today",
      "14:00",
      "GB",
      "英国",
      "英国央行利率决议",
      "central-bank",
      "央行事件",
      3,
      "4.00%",
      "3.75%",
      "--",
      "pending"
    ],
    [
      "demo-us-claims",
      "today",
      "20:30",
      "US",
      "美国",
      "初请失业金人数",
      "macro",
      "宏观数据",
      3,
      "218K",
      "220K",
      "216K",
      "published"
    ],
    [
      "demo-us-inventory",
      "today",
      "22:00",
      "US",
      "美国",
      "批发库存月率终值",
      "macro",
      "宏观数据",
      1,
      "0.2%",
      "0.2%",
      "--",
      "pending"
    ],
    [
      "demo-cn-meeting",
      "today",
      "全天",
      "CN",
      "中国",
      "重要财经会议",
      "speech",
      "财经大事",
      2,
      "--",
      "--",
      "--",
      "pending"
    ],
    [
      "demo-cn-cpi",
      "tomorrow",
      "09:30",
      "CN",
      "中国",
      "居民消费价格指数 CPI 年率",
      "macro",
      "宏观数据",
      3,
      "0.1%",
      "0.2%",
      "--",
      "pending"
    ]
  ];

  const insertDemoEventSql = `
    INSERT OR IGNORE INTO economic_events (
      source_event_id,
      event_date,
      event_time,
      country_code,
      country_name,
      event_title,
      event_type,
      event_type_name,
      importance,
      previous_value,
      forecast_value,
      actual_value,
      status
    )
    VALUES (
      ?,
      CASE
        WHEN ? = 'tomorrow'
          THEN date('now', '+8 hours', '+1 day')
        ELSE date('now', '+8 hours')
      END,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `;

  demoEconomicEvents.forEach((event) => {
    db.run(insertDemoEventSql, event);
  });

  db.run(`
    UPDATE economic_events
    SET
      event_date = CASE
        WHEN source_event_id = 'demo-cn-cpi'
          THEN date('now', '+8 hours', '+1 day')
        ELSE date('now', '+8 hours')
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE source_event_id LIKE 'demo-%'
  `);
});


/*
 * ============================================================
 * 商城商品表
 * ============================================================
 */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS store_products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_code TEXT NOT NULL UNIQUE,
      product_name TEXT NOT NULL,
      product_type TEXT NOT NULL DEFAULT 'ebook',
      description TEXT DEFAULT '',
      price REAL NOT NULL DEFAULT 0,
      currency TEXT NOT NULL DEFAULT 'SGD',
      cover_url TEXT DEFAULT '',
      access_url TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      is_featured INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS
    idx_store_products_status_sort
    ON store_products(status, sort_order, id)
  `);

  const defaultStoreProducts = [
    [
      "ebook-global-news",
      "全球新闻行业电子书",
      "ebook",
      "新闻聚合、国际传播和媒体运营的系统化学习资料。",
      19.90,
      "SGD",
      "",
      "",
      "published",
      1,
      10
    ],
    [
      "report-global-market",
      "全球市场研究报告",
      "report",
      "国际财经、科技和地缘政治趋势的专题分析报告。",
      29.90,
      "SGD",
      "",
      "",
      "published",
      1,
      20
    ],
    [
      "video-news-analysis",
      "新闻分析视频课程",
      "video",
      "新闻筛选、内容判断和视频新闻制作的实用课程。",
      39.90,
      "SGD",
      "",
      "",
      "published",
      1,
      30
    ],
    [
      "vip-monthly",
      "Daily News VIP会员",
      "membership",
      "解锁VIP新闻、AI分析、专题报告和更多会员专属功能。",
      9.90,
      "SGD",
      "",
      "/subscribe.html",
      "published",
      1,
      40
    ]
  ];

  const insertDefaultStoreProductSql = `
    INSERT OR IGNORE INTO store_products (
      product_code,
      product_name,
      product_type,
      description,
      price,
      currency,
      cover_url,
      access_url,
      status,
      is_featured,
      sort_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  defaultStoreProducts.forEach((product) => {
    db.run(insertDefaultStoreProductSql, product);
  });
});


/*
 * ============================================================
 * 商城商品图片表
 * image_type:
 * cover  = 商品封面图，最多4张
 * detail = 商品详情图，最多10张
 * ============================================================
 */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS store_product_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      image_type TEXT NOT NULL DEFAULT 'cover',
      image_url TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id)
        REFERENCES store_products(id)
        ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE INDEX IF NOT EXISTS
    idx_store_product_images_product_type_sort
    ON store_product_images(
      product_id,
      image_type,
      sort_order,
      id
    )
  `);
});

module.exports = db;