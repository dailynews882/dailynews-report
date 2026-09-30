const db = require("./db");

db.run(
    `
    DELETE FROM lottery_draws
    WHERE
      id = ?
      AND game_code = ?
      AND source_name = ?
  `,
    [
        378,
        "sg-toto",
        "Manual Admin Entry"
    ],
    function (error) {
        if (error) {
            console.error(
                "删除测试开奖记录失败:",
                error
            );

            db.close();
            return;
        }

        console.log(
            "删除完成，影响记录数:",
            this.changes
        );

        db.close();
    }
);