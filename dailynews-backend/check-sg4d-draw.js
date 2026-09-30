const db = require("./db");

db.get(
    `
    SELECT
        id,
        game_code,
        draw_number,
        official_draw_number,
        draw_date,
        main_numbers,
        special_numbers,
        prize_structure,
        source_status,
        source_name
    FROM lottery_draws
    WHERE id = ?
    `,
    [384],
    (error, row) => {
        if (error) {
            console.error(
                "Database error:",
                error
            );

            db.close();
            return;
        }

        if (!row) {
            console.log(
                "没有找到 id=384 的开奖记录。"
            );

            db.close();
            return;
        }

        console.log(
            "DATABASE ROW:"
        );

        console.log({
            id:
                row.id,

            game_code:
                row.game_code,

            draw_number:
                row.draw_number,

            official_draw_number:
                row.official_draw_number,

            draw_date:
                row.draw_date,

            main_numbers:
                row.main_numbers,

            special_numbers:
                row.special_numbers,

            source_status:
                row.source_status,

            source_name:
                row.source_name
        });

        console.log(
            "\nPRIZE STRUCTURE:"
        );

        try {
            const prizeStructure =
                JSON.parse(
                    row.prize_structure
                );

            console.log(
                JSON.stringify(
                    prizeStructure,
                    null,
                    2
                )
            );
        } catch (parseError) {
            console.error(
                "prize_structure JSON解析失败:",
                parseError
            );
        }

        db.close();
    }
);