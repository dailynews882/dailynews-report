const db = require("./db");

db.all(
    `
    SELECT
        id,
        game_code,
        draw_number,
        official_draw_number,
        draw_date,
        main_numbers,
        special_numbers,
        jackpot,
        prize_structure,
        source_name,
        source_status
    FROM lottery_draws
    WHERE game_code = ?
      AND official_draw_number = ?
    ORDER BY id DESC
    `,
    [
        "sg-toto",
        "4211"
    ],
    (error, rows) => {
        if (error) {
            console.error(
                "数据库查询失败：",
                error
            );

            db.close();
            return;
        }

        console.log("");
        console.log(
            "4211 数据库记录数量：",
            rows.length
        );

        console.log("");

        rows.forEach(
            (row) => {
                console.log(
                    "================================"
                );

                console.log(
                    "ID:",
                    row.id
                );

                console.log(
                    "Draw No.:",
                    row.official_draw_number
                );

                console.log(
                    "开奖日期:",
                    row.draw_date
                );

                console.log(
                    "主号码:",
                    row.main_numbers
                );

                console.log(
                    "额外号:",
                    row.special_numbers
                );

                console.log(
                    "Group 1 Prize:",
                    row.jackpot
                );

                console.log(
                    "数据状态:",
                    row.source_status
                );

                console.log(
                    "数据来源:",
                    row.source_name
                );

                console.log(
                    "Prize Structure:",
                    row.prize_structure
                );
            }
        );

        db.close();
    }
);