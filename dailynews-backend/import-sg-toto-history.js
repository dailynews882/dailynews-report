const fs = require("fs");
const path = require("path");
const db = require("./db");

const DATA_FILE = path.join(
    __dirname,
    "data",
    "sg-toto-history.json"
);

function fail(message, error) {
    console.error(message);

    if (error) {
        console.error(error.message || error);
    }

    try {
        db.close();
    } catch (_) {
        // Ignore close errors during failure handling.
    }

    process.exit(1);
}

function validateDraw(draw, index) {
    const label = `第 ${index + 1} 条`;

    if (!draw || draw.game_code !== "sg-toto") {
        throw new Error(`${label} game_code 无效`);
    }

    if (
        typeof draw.draw_number !== "string" ||
        !draw.draw_number.trim()
    ) {
        throw new Error(`${label} draw_number 无效`);
    }

    if (
        typeof draw.draw_date !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(draw.draw_date)
    ) {
        throw new Error(`${label} draw_date 无效`);
    }

    if (
        !Array.isArray(draw.main_numbers) ||
        draw.main_numbers.length !== 6
    ) {
        throw new Error(`${label} 必须有 6 个主号码`);
    }

    if (
        !Array.isArray(draw.special_numbers) ||
        draw.special_numbers.length !== 1
    ) {
        throw new Error(`${label} 必须有 1 个额外号码`);
    }

    const mainNumbers = draw.main_numbers.map(Number);
    const specialNumber = Number(draw.special_numbers[0]);

    if (
        mainNumbers.some(
            (number) =>
                !Number.isInteger(number) ||
                number < 1 ||
                number > 49
        )
    ) {
        throw new Error(`${label} 主号码必须是 1-49 的整数`);
    }

    if (
        !Number.isInteger(specialNumber) ||
        specialNumber < 1 ||
        specialNumber > 49
    ) {
        throw new Error(`${label} 额外号码必须是 1-49 的整数`);
    }

    if (new Set(mainNumbers).size !== 6) {
        throw new Error(`${label} 主号码存在重复`);
    }

    if (mainNumbers.includes(specialNumber)) {
        throw new Error(`${label} 额外号码与主号码重复`);
    }

    const sortedNumbers = [...mainNumbers].sort(
        (a, b) => a - b
    );

    if (
        JSON.stringify(sortedNumbers) !==
        JSON.stringify(mainNumbers)
    ) {
        throw new Error(`${label} 主号码未按升序排列`);
    }
}

let payload;

try {
    payload = JSON.parse(
        fs.readFileSync(DATA_FILE, "utf8")
    );
} catch (error) {
    fail(
        `无法读取历史数据文件：${DATA_FILE}`,
        error
    );
}

const draws = Array.isArray(payload?.draws)
    ? payload.draws
    : [];

if (!draws.length) {
    fail("历史开奖数据为空，停止导入。");
}

try {
    draws.forEach(validateDraw);
} catch (error) {
    fail("历史数据校验失败。", error);
}

console.log(
    `准备导入 Singapore TOTO 历史数据：${draws.length} 期`
);

const insertSql = `
    INSERT OR IGNORE INTO lottery_draws (
        game_code,
        draw_number,
        draw_date,
        main_numbers,
        special_numbers,
        source_name,
        source_url,
        source_status,
        created_at,
        updated_at
    )
    VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, 
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    )
`;

let importedCount = 0;
let skippedCount = 0;
let failedCount = 0;

db.serialize(() => {
    db.run("BEGIN TRANSACTION");

    const statement = db.prepare(insertSql);

    draws.forEach((draw) => {
        statement.run(
            [
                draw.game_code,
                draw.draw_number,
                draw.draw_date,
                JSON.stringify(draw.main_numbers),
                JSON.stringify(draw.special_numbers),
                draw.source_name || "Singapore Pools",
                draw.source_url || "",
                draw.source_status || "historical_import",
            ],
            function (error) {
                if (error) {
                    failedCount += 1;

                    console.error(
                        `导入失败 ${draw.draw_date}:`,
                        error.message
                    );

                    return;
                }

                if (this.changes === 1) {
                    importedCount += 1;
                } else {
                    skippedCount += 1;
                }
            }
        );
    });

    statement.finalize((statementError) => {
        if (statementError) {
            db.run("ROLLBACK", () => {
                fail(
                    "历史数据写入失败，事务已回滚。",
                    statementError
                );
            });

            return;
        }

        db.run("COMMIT", (commitError) => {
            if (commitError) {
                fail(
                    "历史数据提交失败。",
                    commitError
                );
            }

            db.get(
                `
                SELECT COUNT(*) AS total
                FROM lottery_draws
                WHERE game_code = ?
                `,
                ["sg-toto"],
                (countError, row) => {
                    if (countError) {
                        fail(
                            "导入完成，但统计数据库记录数失败。",
                            countError
                        );
                    }

                    console.log("");
                    console.log("Singapore TOTO 历史数据导入完成");
                    console.log(`新增：${importedCount} 期`);
                    console.log(`重复跳过：${skippedCount} 期`);
                    console.log(`失败：${failedCount} 期`);
                    console.log(
                        `数据库当前 sg-toto 总记录：${row.total} 期`
                    );

                    db.close(() => {
                        process.exit(
                            failedCount > 0 ? 1 : 0
                        );
                    });
                }
            );
        });
    });
});