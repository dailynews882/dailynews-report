const db = require("./db");

const sql = `
  SELECT
    id,
    game_code,
    draw_number,
    official_draw_number,
    draw_date,
    source_name
  FROM lottery_draws
  ORDER BY id DESC
  LIMIT 10
`;

db.all(
    sql,
    [],
    (error, rows) => {
        if (error) {
            console.error(
                "查询开奖记录失败:",
                error
            );

            db.close();
            return;
        }

        console.table(rows);

        db.close();
    }
);