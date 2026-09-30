const sqlite3 = require("sqlite3").verbose();
const path = require("path");

const databasePath = path.join(__dirname, "dailynews.db");

const db = new sqlite3.Database(databasePath, (err) => {
  if (err) {
    console.error("Database connection error:", err.message);
    return;
  }
  console.log("SQLite database connected:", databasePath);
});

db.run("PRAGMA foreign_keys = ON");
db.run("PRAGMA busy_timeout = 5000");

function addColumnIfMissing(sql, columnName) {
  db.run(sql, (err) => {
    if (!err || String(err.message).includes("duplicate column name")) return;
    console.error(`Failed to add column ${columnName}:`, err.message);
  });
}

db.serialize(() => {
  /* =========================================================
     人谱情报实体主表 (已包含全量商业要素)
  ========================================================= */
  db.run(`
    CREATE TABLE IF NOT EXISTS pi_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      name_zh TEXT,
      name_en TEXT NOT NULL,
      aliases TEXT,
      gender TEXT DEFAULT '',
      marital_status TEXT DEFAULT '',
      birth_date TEXT,
      death_date TEXT,
      nationality TEXT,
      country_region TEXT,
      primary_role TEXT,
      profession_type TEXT DEFAULT '',
      core_organization TEXT DEFAULT '',
      title_honor TEXT DEFAULT '',
      education TEXT DEFAULT '',
      estimated_net_worth TEXT DEFAULT '',
      wealth_source TEXT DEFAULT '',
      family_trust TEXT DEFAULT '',
      biography TEXT,
      tags TEXT,
      profile_image_url TEXT,
      verification_status TEXT NOT NULL DEFAULT 'draft',
      confidence_level TEXT NOT NULL DEFAULT 'medium',
      record_status TEXT NOT NULL DEFAULT 'active',
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 安全补充字段
  addColumnIfMissing("ALTER TABLE pi_people ADD COLUMN gender TEXT DEFAULT ''", "gender");
  addColumnIfMissing("ALTER TABLE pi_people ADD COLUMN marital_status TEXT DEFAULT ''", "marital_status");
  addColumnIfMissing("ALTER TABLE pi_people ADD COLUMN profession_type TEXT DEFAULT ''", "profession_type");
  addColumnIfMissing("ALTER TABLE pi_people ADD COLUMN core_organization TEXT DEFAULT ''", "core_organization");
  addColumnIfMissing("ALTER TABLE pi_people ADD COLUMN title_honor TEXT DEFAULT ''", "title_honor");
  addColumnIfMissing("ALTER TABLE pi_people ADD COLUMN education TEXT DEFAULT ''", "education");
  addColumnIfMissing("ALTER TABLE pi_people ADD COLUMN estimated_net_worth TEXT DEFAULT ''", "estimated_net_worth");
  addColumnIfMissing("ALTER TABLE pi_people ADD COLUMN wealth_source TEXT DEFAULT ''", "wealth_source");
  addColumnIfMissing("ALTER TABLE pi_people ADD COLUMN family_trust TEXT DEFAULT ''", "family_trust");

  /* =========================================================
     机构、关系表与类型字典
  ========================================================= */
  db.run(`
    CREATE TABLE IF NOT EXISTS pi_organizations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE,
      name_zh TEXT,
      name_en TEXT NOT NULL,
      aliases TEXT,
      organization_type TEXT NOT NULL DEFAULT 'company',
      country_region TEXT,
      headquarters TEXT,
      founded_date TEXT,
      industry TEXT,
      industry_primary TEXT,
      industry_secondary TEXT,
      description TEXT,
      website_url TEXT,
      logo_url TEXT,
      listed_status TEXT,
      ticker_symbol TEXT,
      exchange_name TEXT,
      isin TEXT,
      lei TEXT,
      verification_status TEXT NOT NULL DEFAULT 'draft',
      confidence_level TEXT NOT NULL DEFAULT 'medium',
      record_status TEXT NOT NULL DEFAULT 'active',
      is_public INTEGER NOT NULL DEFAULT 0,
      data_updated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pi_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_entity_type TEXT NOT NULL,
      source_entity_id INTEGER NOT NULL,
      target_entity_type TEXT NOT NULL,
      target_entity_id INTEGER NOT NULL,
      relationship_type TEXT NOT NULL,
      relationship_label TEXT,
      direction_type TEXT NOT NULL DEFAULT 'directed',
      role_title TEXT,
      ownership_percentage REAL,
      voting_percentage REAL,
      investment_amount REAL,
      currency TEXT,
      is_control_relationship INTEGER NOT NULL DEFAULT 0,
      start_date TEXT,
      end_date TEXT,
      relationship_status TEXT NOT NULL DEFAULT 'current',
      is_current INTEGER NOT NULL DEFAULT 1,
      description TEXT,
      notes TEXT,
      verification_status TEXT NOT NULL DEFAULT 'draft',
      confidence_level TEXT NOT NULL DEFAULT 'medium',
      is_public INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS pi_evidence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      evidence_type TEXT NOT NULL DEFAULT 'web',
      source_name TEXT,
      source_title TEXT,
      source_url TEXT,
      publisher TEXT,
      published_at TEXT,
      retrieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      evidence_summary TEXT,
      source_tier TEXT NOT NULL DEFAULT 'secondary',
      confidence_level TEXT NOT NULL DEFAULT 'medium',
      verification_status TEXT NOT NULL DEFAULT 'pending',
      is_primary_source INTEGER NOT NULL DEFAULT 0,
      archived_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

module.exports = db;