const db = require("./db");

db.all("PRAGMA table_info(pi_people)", [], (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  console.table(
    rows.map(row => ({
      name: row.name,
      type: row.type,
      notnull: row.notnull,
      default: row.dflt_value
    }))
  );

  db.all(
    "SELECT id, name_zh, name_en, verification_status, record_status, is_public FROM pi_people ORDER BY id",
    [],
    (err, people) => {
      if (err) {
        console.error(err);
        process.exit(1);
      }

      console.table(people);
      process.exit(0);
    }
  );
});
