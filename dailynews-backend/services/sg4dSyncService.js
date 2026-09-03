const db = require("../db");

const {
    fetchSingapore4dResult,
    fetchLatestSingapore4dResult
} = require(
    "./sg4dResultService"
);


/*
 * ==========================================
 * JSON数组解析
 * ==========================================
 */

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


/*
 * ==========================================
 * 4D号码标准化
 *
 * 非常重要：
 * 所有号码始终保存为4位字符串。
 *
 * 例如：
 * 253  -> "0253"
 * 0616 -> "0616"
 * ==========================================
 */

function normalize4dNumber(value) {
    const text =
        String(
            value ?? ""
        ).trim();

    if (!/^\d{1,4}$/.test(text)) {
        return null;
    }

    return text.padStart(
        4,
        "0"
    );
}


function normalize4dNumberArray(values) {
    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .map(
            normalize4dNumber
        )
        .filter(Boolean);
}


function arraysEqual(first, second) {
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


/*
 * ==========================================
 * 检查4D奖项结构是否完整
 * ==========================================
 */

function hasCompletePrizeStructure(
    officialResult
) {
    const prize =
        officialResult &&
        officialResult.prize_structure;

    if (!prize) {
        return false;
    }

    const first =
        normalize4dNumber(
            prize.first
        );

    const second =
        normalize4dNumber(
            prize.second
        );

    const third =
        normalize4dNumber(
            prize.third
        );

    const starter =
        normalize4dNumberArray(
            prize.starter
        );

    const consolation =
        normalize4dNumberArray(
            prize.consolation
        );

    return Boolean(
        first &&
        second &&
        third &&
        starter.length === 10 &&
        consolation.length === 10
    );
}


/*
 * ==========================================
 * 根据开奖日期查数据库
 * ==========================================
 */

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

                    resolve(
                        row || null
                    );
                }
            );
        }
    );
}


/*
 * ==========================================
 * 根据官方Draw No.查数据库
 * ==========================================
 */

function findExistingDrawByOfficialNumber(
    gameCode,
    officialDrawNumber
) {
    return new Promise(
        (resolve, reject) => {
            db.get(
                `
                SELECT
                    *
                FROM lottery_draws
                WHERE game_code = ?
                  AND official_draw_number = ?
                ORDER BY id DESC
                LIMIT 1
                `,
                [
                    gameCode,
                    String(
                        officialDrawNumber || ""
                    )
                ],
                (error, row) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(
                        row || null
                    );
                }
            );
        }
    );
}


async function findExistingDraw(
    officialResult
) {
    const byOfficialNumber =
        await findExistingDrawByOfficialNumber(
            "sg-4d",
            officialResult.official_draw_number
        );

    if (byOfficialNumber) {
        return byOfficialNumber;
    }

    return findExistingDrawByDate(
        "sg-4d",
        officialResult.draw_date
    );
}


/*
 * ==========================================
 * 新增官方4D开奖结果
 * ==========================================
 */

function insertOfficialDraw(
    officialResult
) {
    return new Promise(
        (resolve, reject) => {
            const mainNumbers =
                normalize4dNumberArray(
                    officialResult.main_numbers
                );

            if (mainNumbers.length !== 3) {
                reject(
                    new Error(
                        "Singapore 4D 前三奖号码不完整，禁止写入数据库。"
                    )
                );

                return;
            }

            const prizeStructureJson =
                JSON.stringify(
                    officialResult.prize_structure || {}
                );

            const drawNumber =
                String(
                    officialResult.official_draw_number ||
                    ""
                );

            const sourceStatus =
                hasCompletePrizeStructure(
                    officialResult
                )
                    ? "official_verified"
                    : "official_partial";

            db.run(
                `
                INSERT INTO lottery_draws (
                    game_code,
                    draw_number,
                    official_draw_number,
                    draw_date,
                    main_numbers,
                    special_numbers,
                    jackpot,
                    prize_structure,
                    source_name,
                    source_url,
                    source_status,
                    fetched_at,
                    created_at,
                    updated_at
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
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )
                `,
                [
                    "sg-4d",
                    drawNumber,
                    drawNumber,
                    officialResult.draw_date,

                    JSON.stringify(
                        mainNumbers
                    ),

                    JSON.stringify(
                        []
                    ),

                    "",

                    prizeStructureJson,

                    officialResult.source_name ||
                    "Singapore Pools",

                    officialResult.source_url ||
                    "",

                    sourceStatus,

                    officialResult.fetched_at ||
                    new Date().toISOString()
                ],
                function (error) {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve({
                        id:
                            this.lastID,

                        changes:
                            this.changes,

                        source_status:
                            sourceStatus
                    });
                }
            );
        }
    );
}


/*
 * ==========================================
 * 更新已有4D开奖结果
 * ==========================================
 */

function updateExistingDraw(
    id,
    officialResult
) {
    return new Promise(
        (resolve, reject) => {
            const mainNumbers =
                normalize4dNumberArray(
                    officialResult.main_numbers
                );

            if (mainNumbers.length !== 3) {
                reject(
                    new Error(
                        "Singapore 4D 前三奖号码不完整，禁止更新数据库。"
                    )
                );

                return;
            }

            const prizeStructureJson =
                JSON.stringify(
                    officialResult.prize_structure || {}
                );

            const sourceStatus =
                hasCompletePrizeStructure(
                    officialResult
                )
                    ? "official_verified"
                    : "official_partial";

            db.run(
                `
                UPDATE lottery_draws
                SET
                    draw_number = ?,
                    official_draw_number = ?,
                    draw_date = ?,
                    main_numbers = ?,
                    special_numbers = ?,
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
                    String(
                        officialResult.official_draw_number ||
                        ""
                    ),

                    String(
                        officialResult.official_draw_number ||
                        ""
                    ),

                    officialResult.draw_date,

                    JSON.stringify(
                        mainNumbers
                    ),

                    JSON.stringify(
                        []
                    ),

                    "",

                    prizeStructureJson,

                    officialResult.source_name ||
                    "Singapore Pools",

                    officialResult.source_url ||
                    "",

                    sourceStatus,

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
                            this.changes,

                        source_status:
                            sourceStatus
                    });
                }
            );
        }
    );
}


/*
 * ==========================================
 * 验证数据库已有号码
 *
 * 已有记录如果前三奖与官方不一致，
 * 禁止自动覆盖。
 * ==========================================
 */

function validateExistingNumbers(
    existingDraw,
    officialResult
) {
    const databaseMainNumbers =
        normalize4dNumberArray(
            parseJsonArray(
                existingDraw.main_numbers
            )
        );

    const officialMainNumbers =
        normalize4dNumberArray(
            officialResult.main_numbers
        );

    if (
        !arraysEqual(
            databaseMainNumbers,
            officialMainNumbers
        )
    ) {
        throw new Error(
            `Singapore 4D 前三奖号码不一致，禁止更新。` +
            `数据库=${JSON.stringify(
                databaseMainNumbers
            )}，` +
            `官方=${JSON.stringify(
                officialMainNumbers
            )}`
        );
    }
}


/*
 * ==========================================
 * 保存官方结果
 * ==========================================
 */

async function saveOfficialResult(
    officialResult
) {
    if (
        !officialResult ||
        officialResult.game_code !== "sg-4d"
    ) {
        throw new Error(
            "无效的 Singapore 4D 官方开奖结果。"
        );
    }

    if (
        !hasCompletePrizeStructure(
            officialResult
        )
    ) {
        throw new Error(
            "Singapore 4D 官方奖项数据不完整，禁止写入数据库。"
        );
    }

    const existingDraw =
        await findExistingDraw(
            officialResult
        );

    if (!existingDraw) {
        const insertResult =
            await insertOfficialDraw(
                officialResult
            );

        return {
            success: true,
            action: "inserted",

            database_id:
                insertResult.id,

            draw_date:
                officialResult.draw_date,

            official_draw_number:
                officialResult.official_draw_number,

            first_prize:
                officialResult.first_prize,

            second_prize:
                officialResult.second_prize,

            third_prize:
                officialResult.third_prize,

            starter_prizes:
                officialResult.starter_prizes,

            consolation_prizes:
                officialResult.consolation_prizes,

            prize_structure:
                officialResult.prize_structure,

            source_status:
                insertResult.source_status,

            prize_complete:
                true,

            inserted_rows:
                insertResult.changes
        };
    }

    validateExistingNumbers(
        existingDraw,
        officialResult
    );

    const updateResult =
        await updateExistingDraw(
            existingDraw.id,
            officialResult
        );

    return {
        success: true,
        action: "updated",

        database_id:
            existingDraw.id,

        draw_date:
            officialResult.draw_date,

        official_draw_number:
            officialResult.official_draw_number,

        first_prize:
            officialResult.first_prize,

        second_prize:
            officialResult.second_prize,

        third_prize:
            officialResult.third_prize,

        starter_prizes:
            officialResult.starter_prizes,

        consolation_prizes:
            officialResult.consolation_prizes,

        prize_structure:
            officialResult.prize_structure,

        source_status:
            updateResult.source_status,

        prize_complete:
            true,

        updated_rows:
            updateResult.changes
    };
}


/*
 * ==========================================
 * 同步指定4D Draw No.
 * ==========================================
 */

async function syncSingapore4dDraw(
    officialDrawNumber
) {
    const officialResult =
        await fetchSingapore4dResult(
            officialDrawNumber
        );

    return saveOfficialResult(
        officialResult
    );
}


/*
 * ==========================================
 * 同步最新一期4D
 * ==========================================
 */

async function syncLatestSingapore4dDraw() {
    const officialResult =
        await fetchLatestSingapore4dResult();

    return saveOfficialResult(
        officialResult
    );
}


module.exports = {
    syncSingapore4dDraw,
    syncLatestSingapore4dDraw
};