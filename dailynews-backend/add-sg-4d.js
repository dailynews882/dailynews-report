const db = require("./db");

const sql = `
    INSERT OR IGNORE INTO lottery_games (
        game_code,
        country_code,
        country_name,
        game_name,
        game_name_en,
        main_number_min,
        main_number_max,
        main_number_count,
        special_number_min,
        special_number_max,
        special_number_count,
        zone_count,
        draw_schedule,
        timezone,
        source_name,
        source_url,
        sort_order,
        is_active,
        show_on_home
    )
    VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
    )
`;

const values = [
    "sg-4d",
    "sg",
    "新加坡",
    "4D",
    "Singapore 4D",
    0,
    9999,
    23,
    null,
    null,
    0,
    0,
    "Wednesday, Saturday, Sunday",
    "Asia/Singapore",
    "Singapore Pools",
    "https://www.singaporepools.com.sg",
    2,
    1,
    1
];

db.run(
    sql,
    values,
    function (error) {
        if (error) {
            console.error(
                "Add Singapore 4D config error:",
                error
            );

            process.exit(1);
        }

        console.log(
            "Singapore 4D config ready."
        );

        console.log(
            "changes:",
            this.changes
        );

        db.close();
    }
);