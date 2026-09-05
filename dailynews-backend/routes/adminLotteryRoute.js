const express = require("express");
const db = require("../db");

const {
    verifyAdminToken
} = require("../middleware/adminAuth");

const {
    syncLatestSingaporeTotoDraw
} = require(
    "../services/sgTotoSyncService"
);

const {
    syncSingapore4dDraw,
    syncLatestSingapore4dDraw
} = require(
    "../services/sg4dSyncService"
);

const router = express.Router();

function normalizeNumber(value) {
    const number = Number(value);

    if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > 49
    ) {
        return null;
    }

    return number;
}

function normalize4dManualNumber(value) {
    const text =
        String(
            value === undefined ||
                value === null
                ? ""
                : value
        ).trim();

    if (
        !/^\d{4}$/.test(text)
    ) {
        return null;
    }

    return text;
}

/*
 * ==========================================
 * 手动添加开奖记录
 * POST /api/admin/lottery/manual
 * ==========================================
 */
router.post(
    "/manual",
    verifyAdminToken,
    (req, res) => {
        const {
            game_code,
            draw_number,
            draw_date,
            main_numbers,
            special_number
        } = req.body || {};

        const normalizedGameCode =
            String(game_code || "")
                .trim()
                .toLowerCase();

        const normalizedDrawNumber =
            String(draw_number || "")
                .trim();

        const normalizedDrawDate =
            String(draw_date || "")
                .trim();

        if (
            normalizedGameCode !==
            "sg-toto"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "目前只支持 Singapore TOTO"
            });
        }

        if (!normalizedDrawNumber) {
            return res.status(400).json({
                success: false,
                message:
                    "Draw No. 不能为空"
            });
        }

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(
                normalizedDrawDate
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "开奖日期格式不正确"
            });
        }

        if (
            !Array.isArray(main_numbers) ||
            main_numbers.length !== 6
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "必须输入6个主号码"
            });
        }

        const normalizedMainNumbers =
            main_numbers.map(
                normalizeNumber
            );

        if (
            normalizedMainNumbers.some(
                number => number === null
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "主号码必须是1-49之间的整数"
            });
        }

        const uniqueMainNumbers =
            new Set(
                normalizedMainNumbers
            );

        if (
            uniqueMainNumbers.size !== 6
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "6个主号码不能重复"
            });
        }

        const normalizedSpecialNumber =
            normalizeNumber(
                special_number
            );

        if (
            normalizedSpecialNumber === null
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "额外号必须是1-49之间的整数"
            });
        }

        if (
            uniqueMainNumbers.has(
                normalizedSpecialNumber
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "额外号不能与主号码重复"
            });
        }

        normalizedMainNumbers.sort(
            (a, b) => a - b
        );

        const mainNumbersJson =
            JSON.stringify(
                normalizedMainNumbers
            );

        const specialNumbersJson =
            JSON.stringify([
                normalizedSpecialNumber
            ]);

        const nowIso =
            new Date().toISOString();

        const checkSql = `
            SELECT
                id,
                draw_number,
                draw_date
            FROM lottery_draws
            WHERE
                game_code = ?
                AND (
                    draw_number = ?
                    OR draw_date = ?
                )
            LIMIT 1
        `;

        db.get(
            checkSql,
            [
                normalizedGameCode,
                normalizedDrawNumber,
                normalizedDrawDate
            ],
            (
                checkError,
                existingRow
            ) => {
                if (checkError) {
                    console.error(
                        "Check manual lottery draw error:",
                        checkError
                    );

                    return res
                        .status(500)
                        .json({
                            success: false,
                            message:
                                "检查开奖记录失败"
                        });
                }

                if (existingRow) {
                    return res
                        .status(409)
                        .json({
                            success: false,
                            message:
                                "该期号或开奖日期已经存在"
                        });
                }

                const insertSql = `
                    INSERT INTO lottery_draws (
                        game_code,
                        draw_number,
                        official_draw_number,
                        draw_date,
                        main_numbers,
                        special_numbers,
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
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                `;

                db.run(
                    insertSql,
                    [
                        normalizedGameCode,
                        normalizedDrawNumber,
                        normalizedDrawNumber,
                        normalizedDrawDate,
                        mainNumbersJson,
                        specialNumbersJson,
                        "Manual Admin Entry",
                        "",
                        "manual",
                        nowIso
                    ],
                    function (
                        insertError
                    ) {
                        if (insertError) {
                            console.error(
                                "Insert manual lottery draw error:",
                                insertError
                            );

                            return res
                                .status(500)
                                .json({
                                    success: false,
                                    message:
                                        "保存开奖记录失败"
                                });
                        }

                        return res.json({
                            success: true,
                            message:
                                "开奖记录保存成功",
                            draw: {
                                id:
                                    this.lastID,
                                game_code:
                                    normalizedGameCode,
                                draw_number:
                                    normalizedDrawNumber,
                                draw_date:
                                    normalizedDrawDate,
                                main_numbers:
                                    normalizedMainNumbers,
                                special_numbers: [
                                    normalizedSpecialNumber
                                ]
                            }
                        });
                    }
                );
            }
        );
    }
);

/*
 * ==========================================
 * Singapore 4D 手工新增 / 修正开奖记录
 * POST /api/admin/lottery/manual-4d
 * ==========================================
 */
router.post(
    "/manual-4d",
    verifyAdminToken,
    (req, res) => {
        const {
            draw_number,
            draw_date,
            first_prize,
            second_prize,
            third_prize,
            starter_prizes,
            consolation_prizes
        } = req.body || {};

        const normalizedDrawNumber =
            String(draw_number || "").trim();

        const normalizedDrawDate =
            String(draw_date || "").trim();

        if (
            !/^\d{4}$/.test(
                normalizedDrawNumber
            )
        ) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "Draw No. 必须是4位数字"
                });
        }

        if (
            !/^\d{4}-\d{2}-\d{2}$/.test(
                normalizedDrawDate
            )
        ) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "开奖日期格式不正确"
                });
        }

        const normalizedFirstPrize =
            normalize4dManualNumber(
                first_prize
            );

        const normalizedSecondPrize =
            normalize4dManualNumber(
                second_prize
            );

        const normalizedThirdPrize =
            normalize4dManualNumber(
                third_prize
            );

        if (
            !normalizedFirstPrize ||
            !normalizedSecondPrize ||
            !normalizedThirdPrize
        ) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "1st / 2nd / 3rd Prize 必须全部是4位数字"
                });
        }

        if (
            !Array.isArray(
                starter_prizes
            ) ||
            starter_prizes.length !== 10
        ) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "Starter Prizes 必须输入10个号码"
                });
        }

        if (
            !Array.isArray(
                consolation_prizes
            ) ||
            consolation_prizes.length !== 10
        ) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "Consolation Prizes 必须输入10个号码"
                });
        }

        const normalizedStarterPrizes =
            starter_prizes.map(
                normalize4dManualNumber
            );

        const normalizedConsolationPrizes =
            consolation_prizes.map(
                normalize4dManualNumber
            );

        if (
            normalizedStarterPrizes.some(
                number => number === null
            )
        ) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "Starter Prizes 的10个号码必须全部是4位数字"
                });
        }

        if (
            normalizedConsolationPrizes.some(
                number => number === null
            )
        ) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "Consolation Prizes 的10个号码必须全部是4位数字"
                });
        }

        const mainNumbers = [
            normalizedFirstPrize,
            normalizedSecondPrize,
            normalizedThirdPrize
        ];

        const prizeStructure = {
            first:
                normalizedFirstPrize,

            second:
                normalizedSecondPrize,

            third:
                normalizedThirdPrize,

            starter:
                normalizedStarterPrizes,

            consolation:
                normalizedConsolationPrizes
        };

        const mainNumbersJson =
            JSON.stringify(
                mainNumbers
            );

        const specialNumbersJson =
            JSON.stringify([]);

        const prizeStructureJson =
            JSON.stringify(
                prizeStructure
            );

        const nowIso =
            new Date().toISOString();

        const checkSql = `
            SELECT
                id,
                draw_number,
                draw_date
            FROM lottery_draws
            WHERE
                game_code = 'sg-4d'
                AND (
                    draw_number = ?
                    OR official_draw_number = ?
                    OR draw_date = ?
                )
            LIMIT 1
        `;

        db.get(
            checkSql,
            [
                normalizedDrawNumber,
                normalizedDrawNumber,
                normalizedDrawDate
            ],
            (
                checkError,
                existingRow
            ) => {
                if (checkError) {
                    console.error(
                        "Check manual Singapore 4D draw error:",
                        checkError
                    );

                    return res
                        .status(500)
                        .json({
                            success: false,
                            message:
                                "检查 Singapore 4D 开奖记录失败"
                        });
                }

                if (existingRow) {
                    const updateSql = `
                        UPDATE lottery_draws
                        SET
                            draw_number = ?,
                            official_draw_number = ?,
                            draw_date = ?,
                            main_numbers = ?,
                            special_numbers = ?,
                            prize_structure = ?,
                            source_name = ?,
                            source_url = ?,
                            source_status = ?,
                            fetched_at = ?,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    `;

                    db.run(
                        updateSql,
                        [
                            normalizedDrawNumber,
                            normalizedDrawNumber,
                            normalizedDrawDate,
                            mainNumbersJson,
                            specialNumbersJson,
                            prizeStructureJson,
                            "Manual Admin Entry",
                            "",
                            "manual_verified",
                            nowIso,
                            existingRow.id
                        ],
                        function (
                            updateError
                        ) {
                            if (updateError) {
                                console.error(
                                    "Update manual Singapore 4D draw error:",
                                    updateError
                                );

                                return res
                                    .status(500)
                                    .json({
                                        success: false,
                                        message:
                                            "修正 Singapore 4D 开奖记录失败"
                                    });
                            }

                            return res.json({
                                success: true,
                                action:
                                    "updated",
                                message:
                                    `Singapore 4D Draw ${normalizedDrawNumber} 已手工修正并保存`,
                                draw: {
                                    id:
                                        existingRow.id,

                                    game_code:
                                        "sg-4d",

                                    draw_number:
                                        normalizedDrawNumber,

                                    draw_date:
                                        normalizedDrawDate,

                                    main_numbers:
                                        mainNumbers,

                                    prize_structure:
                                        prizeStructure,

                                    source_status:
                                        "manual_verified"
                                }
                            });
                        }
                    );

                    return;
                }

                const insertSql = `
                    INSERT INTO lottery_draws (
                        game_code,
                        draw_number,
                        official_draw_number,
                        draw_date,
                        main_numbers,
                        special_numbers,
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
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                `;

                db.run(
                    insertSql,
                    [
                        "sg-4d",
                        normalizedDrawNumber,
                        normalizedDrawNumber,
                        normalizedDrawDate,
                        mainNumbersJson,
                        specialNumbersJson,
                        prizeStructureJson,
                        "Manual Admin Entry",
                        "",
                        "manual_verified",
                        nowIso
                    ],
                    function (
                        insertError
                    ) {
                        if (insertError) {
                            console.error(
                                "Insert manual Singapore 4D draw error:",
                                insertError
                            );

                            return res
                                .status(500)
                                .json({
                                    success: false,
                                    message:
                                        "新增 Singapore 4D 开奖记录失败"
                                });
                        }

                        return res.json({
                            success: true,
                            action:
                                "inserted",
                            message:
                                `Singapore 4D Draw ${normalizedDrawNumber} 已手工新增并保存`,
                            draw: {
                                id:
                                    this.lastID,

                                game_code:
                                    "sg-4d",

                                draw_number:
                                    normalizedDrawNumber,

                                draw_date:
                                    normalizedDrawDate,

                                main_numbers:
                                    mainNumbers,

                                prize_structure:
                                    prizeStructure,

                                source_status:
                                    "manual_verified"
                            }
                        });
                    }
                );
            }
        );
    }
);

/*
 * ==========================================
 * 自动同步 Singapore Pools 最新一期
 * POST /api/admin/lottery/sync
 * ==========================================
 */
router.post(
    "/sync",
    verifyAdminToken,
    async (
        req,
        res
    ) => {
        try {
            const result =
                await syncLatestSingaporeTotoDraw();

            let message =
                "最新期开奖数据同步完成";

            if (
                result.action ===
                "inserted"
            ) {
                message =
                    `已新增最新一期 Draw ${result.official_draw_number}`;
            } else if (
                result.action ===
                "updated"
            ) {
                message =
                    `Draw ${result.official_draw_number} 已存在，官方数据已重新校验并更新`;
            }

            return res.json({
                success: true,
                message,
                result
            });
        } catch (
        error
        ) {
            console.error(
                "Sync latest lottery error:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    message:
                        error.message ||
                        "同步最新期开奖数据失败"
                });
        }
    }
);

/*
 * ==========================================
 * 自动同步 Singapore Pools 4D 最新一期
 * POST /api/admin/lottery/sync-4d
 * ==========================================
 */
router.post(
    "/sync-4d",
    verifyAdminToken,
    async (
        req,
        res
    ) => {
        try {
            const result =
                await syncLatestSingapore4dDraw();

            let message =
                "Singapore 4D 最新期开奖数据同步完成";

            if (
                result.action ===
                "inserted"
            ) {
                message =
                    `已新增 Singapore 4D 最新一期 Draw ${result.official_draw_number}`;
            } else if (
                result.action ===
                "updated"
            ) {
                message =
                    `Singapore 4D Draw ${result.official_draw_number} 已存在，官方数据已重新校验并更新`;
            }

            return res.json({
                success: true,
                message,
                result
            });
        } catch (
        error
        ) {
            console.error(
                "Sync latest Singapore 4D error:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    message:
                        error.message ||
                        "同步 Singapore 4D 最新期开奖数据失败"
                });
        }
    }
);

/*
 * ==========================================
 * 同步 Singapore Pools 4D 指定 Draw
 * POST /api/admin/lottery/sync-4d-draw
 * ==========================================
 */
router.post(
    "/sync-4d-draw",
    verifyAdminToken,
    async (
        req,
        res
    ) => {
        try {
            const drawNumber =
                String(
                    req.body?.draw_number || ""
                ).trim();

            if (
                !/^\d{4}$/.test(
                    drawNumber
                )
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message:
                            "请输入正确的4位 Draw No."
                    });
            }

            const result =
                await syncSingapore4dDraw(
                    drawNumber
                );

            let message =
                `Singapore 4D Draw ${drawNumber} 同步完成`;

            if (
                result.action ===
                "inserted"
            ) {
                message =
                    `Singapore 4D Draw ${drawNumber} 已新增`;
            } else if (
                result.action ===
                "updated"
            ) {
                message =
                    `Singapore 4D Draw ${drawNumber} 已重新校验并更新`;
            }

            return res.json({
                success: true,
                message,
                result
            });
        } catch (
        error
        ) {
            console.error(
                "Sync Singapore 4D specified draw error:",
                error
            );

            return res
                .status(500)
                .json({
                    success: false,
                    message:
                        error.message ||
                        "同步指定 Singapore 4D Draw 失败"
                });
        }
    }
);

module.exports = router;