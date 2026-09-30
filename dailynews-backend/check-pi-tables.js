const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database(
    "./dailynews.db",
    sqlite3.OPEN_READONLY,
    (error) => {
        if (error) {
            console.error(
                "Database open failed:",
                error.message
            );
            process.exit(1);
        }
    }
);

const sql = `
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name IN (
          'pi_corrections',
          'pi_version_history'
      )
    ORDER BY name
`;

db.all(sql, [], (error, rows) => {
    if (error) {
        console.error(
            "Table check failed:",
            error.message
        );
        db.close();
        process.exit(1);
    }

    console.log(
        "=== PEOPLE INTELLIGENCE NEW TABLES ==="
    );

    console.table(rows);

    if (rows.length === 2) {
        console.log(
            "SUCCESS: both tables exist."
        );
    } else {
        console.log(
            `WARNING: expected 2 tables, found ${rows.length}.`
        );
    }

    db.close();
});