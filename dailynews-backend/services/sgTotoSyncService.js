const db = require("../db");

const {
    fetchSingaporeTotoResult,
    fetchLatestSingaporeTotoResult
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

function normalizeNumberArray(values) {
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

function hasPrizeStructure(
    officialResult
) {
    return Boolean(
        officialResult &&
        officialResult.prize_structure &&
        Array.isArray(
            officialResult.prize_structure.groups
        ) &&
        officialResult.prize_structure.groups.length > 0
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

                    resolve(
                        row || null
                    );
                }
            );
        }
    );
}

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
            "sg-toto",
            officialResult.official_draw_number
        );

    if (byOfficialNumber) {
        return byOfficialNumber;
    }

    return findExistingDrawByDate(
        "sg-toto",
        officialResult.draw_date
    );
}

function insertOfficialDraw(
    officialResult
) {
    return new Promise(
        (resolve, reject) => {
            const mainNumbers =
                normalizeNumberArray(
                    officialResult.main_numbers
                );

            const specialNumbers =
                normalizeNumberArray(
                    [
                        officialResult.special_number
                    ]
                );

            const prizeStructureJson =
                JSON.stringify(
                    officialResult.prize_structure || {
                        groups: []
                    }
                );

            const drawNumber =
                String(
                    officialResult.official_draw_number ||
                    ""
                );

            const sourceStatus =
                hasPrizeStructure(
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
                    "sg-toto",
                    drawNumber,
                    drawNumber,
                    officialResult.draw_date,
                    JSON.stringify(
                        mainNumbers
                    ),
                    JSON.stringify(
                        specialNumbers
                    ),
                    officialResult.group1_prize !== null &&
                        officialResult.group1_prize !== undefined
                        ? String(
                            officialResult.group1_prize
                        )
                        : "",
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

            const sourceStatus =
                hasPrizeStructure(
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
                    officialResult.group1_prize !== null &&
                        officialResult.group1_prize !== undefined
                        ? String(
                            officialResult.group1_prize
                        )
                        : "",
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

function validateExistingNumbers(
    existingDraw,
    officialResult
) {
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
}

async function saveOfficialResult(
    officialResult
) {
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

            main_numbers:
                officialResult.main_numbers,

            special_number:
                officialResult.special_number,

            group1_prize:
                officialResult.group1_prize,

            prize_structure:
                officialResult.prize_structure,

            source_status:
                insertResult.source_status,

            prize_complete:
                hasPrizeStructure(
                    officialResult
                ),

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

        main_numbers:
            officialResult.main_numbers,

        special_number:
            officialResult.special_number,

        group1_prize:
            officialResult.group1_prize,

        prize_structure:
            officialResult.prize_structure,

        source_status:
            updateResult.source_status,

        prize_complete:
            hasPrizeStructure(
                officialResult
            ),

        updated_rows:
            updateResult.changes
    };
}

async function syncSingaporeTotoDraw(
    officialDrawNumber
) {
    const officialResult =
        await fetchSingaporeTotoResult(
            officialDrawNumber
        );

    return saveOfficialResult(
        officialResult
    );
}

async function syncLatestSingaporeTotoDraw() {
    const officialResult =
        await fetchLatestSingaporeTotoResult();

    return saveOfficialResult(
        officialResult
    );
}

module.exports = {
    syncSingaporeTotoDraw,
    syncLatestSingaporeTotoDraw
};