const db = require("./db");

db.serialize(() => {
    db.all(
        `
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name IN (
            'lottery_games',
            'lottery_draws'
          )
        ORDER BY name
        `,
        [],
        (tableError, tables) => {
            if (tableError) {
                console.error(
                    "检查彩票表失败：",
                    tableError.message
                );
                process.exit(1);
                return;
            }

            console.log(
                "彩票数据表：",
                tables
            );

            db.all(
                `
                SELECT
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
                    timezone,
                    source_name,
                    is_active
                FROM lottery_games
                ORDER BY sort_order ASC, id ASC
                `,
                [],
                (gameError, games) => {
                    if (gameError) {
                        console.error(
                            "检查彩票游戏失败：",
                            gameError.message
                        );
                        process.exit(1);
                        return;
                    }

                    console.log(
                        "彩票游戏配置：",
                        games
                    );

                    db.close(() => {
                        process.exit(0);
                    });
                }
            );
        }
    );
});