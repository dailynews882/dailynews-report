const db = require("./db");

db.all(
    `
    SELECT
        id,
        name_zh,
        name_en,
        organization_type,
        country_region,
        verification_status,
        is_public,
        record_status,
        updated_at
    FROM pi_organizations
    ORDER BY id ASC
    `,
    [],
    (error, rows) => {
        if (error) {
            console.error(
                "QUERY ERROR:",
                error
            );

            db.close();
            return;
        }

        console.log(
            "\n=== PI ORGANIZATIONS ==="
        );

        console.table(rows);

        db.close();
    }
);