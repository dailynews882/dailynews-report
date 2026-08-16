const db = require("../db");

const {
    fetchSingaporeTotoResult
} = require(
    "./sgTotoResultService"
);

function parseJsonArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value !== "string") {
        return [];
    }

    try {
        const parsed =
            JSON.parse(value);

        return Array.isArray(parsed)
            ? parsed
            : [];
    } catch (error) {
        return [];
    }
}

function normalizeNumberArray(
    values
) {
    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .map(Number)
        .filter(
            (number) =>
                Number.isInteger(number)
        );
}

function arraysEqual(
    first,
    second
) {
    if (
        first.length !==
        second.length
    ) {
        return false;
    }

    return first.every(
        (value, index) =>
            value === second[index]
    );
}

function findExistingDrawByDate(
    gameCode,
    drawDate
) {
    return new Promise(
        (resolve, reject) => {
            db.get(
                `
                SELECT
                    *
                FROM lottery_draws
                WHERE game_code = ?
                  AND draw_date = ?
                ORDER BY id DESC
                LIMIT 1
                `,
                [
                    gameCode,
                    drawDate
                ],
                (error, row) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(row || null);
                }
            );
        }
    );
}

function updateExistingDraw(
    id,
    officialResult
) {
    return new Promise(
        (resolve, reject) => {
            const prizeStructureJson =
                JSON.stringify(
                    officialResult.prize_structure || {
                        groups: []
                    }
                );

            db.run(
                `
                UPDATE lottery_draws
                SET
                    official_draw_number = ?,
                    jackpot = ?,
                    prize_structure = ?,
                    source_name = ?,
                    source_url = ?,
                    source_status = ?,
                    fetched_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [
                    officialResult.official_draw_number,
                    officialResult.group1_prize !== null
                        ? String(
                            officialResult.group1_prize
                        )
                        : "",
                    prizeStructureJson,
                    officialResult.source_name ||
                    "Singapore Pools",
                    officialResult.source_url || "",
                    "official_verified",
                    officialResult.fetched_at ||
                    new Date().toISOString(),
                    id
                ],
                function (error) {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve({
                        changes:
                            this.changes
                    });
                }
            );
        }
    );
}

async function syncSingaporeTotoDraw(
    officialDrawNumber
) {
    const officialResult =
        await fetchSingaporeTotoResult(
            officialDrawNumber
        );

    const existingDraw =
        await findExistingDrawByDate(
            "sg-toto",
            officialResult.draw_date
        );

    if (!existingDraw) {
        throw new Error(
            `数据库中找不到开奖日期 ` +
            `${officialResult.draw_date} ` +
            `对应的 sg-toto 历史记录。`
        );
    }

    const databaseMainNumbers =
        normalizeNumberArray(
            parseJsonArray(
                existingDraw.main_numbers
            )
        );

    const databaseSpecialNumbers =
        normalizeNumberArray(
            parseJsonArray(
                existingDraw.special_numbers
            )
        );

    const officialMainNumbers =
        normalizeNumberArray(
            officialResult.main_numbers
        );

    const officialSpecialNumbers =
        normalizeNumberArray(
            [
                officialResult.special_number
            ]
        );

    if (
        !arraysEqual(
            databaseMainNumbers,
            officialMainNumbers
        )
    ) {
        throw new Error(
            `主号码不一致，禁止更新。` +
            `数据库=${JSON.stringify(
                databaseMainNumbers
            )}，` +
            `官方=${JSON.stringify(
                officialMainNumbers
            )}`
        );
    }

    if (
        !arraysEqual(
            databaseSpecialNumbers,
            officialSpecialNumbers
        )
    ) {
        throw new Error(
            `额外号码不一致，禁止更新。` +
            `数据库=${JSON.stringify(
                databaseSpecialNumbers
            )}，` +
            `官方=${JSON.stringify(
                officialSpecialNumbers
            )}`
        );
    }

    const updateResult =
        await updateExistingDraw(
            existingDraw.id,
            officialResult
        );

    return {
        success: true,

        database_id:
            existingDraw.id,

        draw_date:
            officialResult.draw_date,

        official_draw_number:
            officialResult.official_draw_number,

        main_numbers:
            officialResult.main_numbers,

        special_number:
            officialResult.special_number,

        group1_prize:
            officialResult.group1_prize,

        prize_structure:
            officialResult.prize_structure,

        updated_rows:
            updateResult.changes
    };
}

module.exports = {
    syncSingaporeTotoDraw
};