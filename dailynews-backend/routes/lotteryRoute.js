const express = require("express");
const db = require("../db");

const router = express.Router();

/*
 * =========================================
 * 工具函数
 * =========================================
 */

function parseJsonArray(value) {
    if (Array.isArray(value)) {
        return value;
    }

    if (typeof value !== "string") {
        return [];
    }

    try {
        const parsed = JSON.parse(value);

        return Array.isArray(parsed)
            ? parsed
            : [];
    } catch (error) {
        return [];
    }
}

function parseJsonObject(value) {
    if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value)
    ) {
        return value;
    }

    if (typeof value !== "string") {
        return {};
    }

    try {
        const parsed =
            JSON.parse(value);

        return (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed)
        )
            ? parsed
            : {};
    } catch (error) {
        return {};
    }
}

function formatDraw(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        game_code: row.game_code,
        draw_number: row.draw_number,
        draw_date: row.draw_date,
        draw_datetime: row.draw_datetime || null,

        main_numbers: parseJsonArray(
            row.main_numbers
        ),

        special_numbers: parseJsonArray(
            row.special_numbers
        ),

        official_draw_number:
            row.official_draw_number || "",

        jackpot:
            row.jackpot || "",

        prize_structure:
            parseJsonObject(
                row.prize_structure
            ),

        currency:
            row.currency || "",

        source_name: row.source_name || "",
        source_url: row.source_url || "",
        source_status:
            row.source_status || "",

        fetched_at: row.fetched_at || null,
        created_at: row.created_at || null,
        updated_at: row.updated_at || null
    };
}

/*
 * =========================================
 * GET /api/lottery/games
 *
 * 获取当前启用的彩票游戏
 * =========================================
 */

router.get(
    "/games",
    (req, res) => {
        const sql = `
            SELECT
                id,
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
                draw_schedule,
                timezone,
                source_name,
                source_url,
                sort_order,
                is_active,
                show_on_home
            FROM lottery_games
            WHERE is_active = 1
            ORDER BY
                sort_order ASC,
                id ASC
        `;

        db.all(
            sql,
            [],
            (error, rows) => {
                if (error) {
                    console.error(
                        "读取彩票游戏失败：",
                        error.message
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "读取彩票游戏失败"
                    });
                }

                return res.json({
                    success: true,
                    total: rows.length,
                    games: rows
                });
            }
        );
    }
);

/*
 * =========================================
 * GET /api/lottery/:gameCode/latest
 *
 * 获取某种彩票最新一期
 *
 * 示例：
 * /api/lottery/sg-toto/latest
 * =========================================
 */

router.get(
    "/:gameCode/latest",
    (req, res) => {
        const gameCode =
            String(
                req.params.gameCode || ""
            ).trim();

        if (!gameCode) {
            return res.status(400).json({
                success: false,
                message:
                    "缺少 gameCode"
            });
        }

        const sql = `
            SELECT
                *
            FROM lottery_draws
            WHERE game_code = ?
            ORDER BY
                draw_date DESC,
                id DESC
            LIMIT 1
        `;

        db.get(
            sql,
            [gameCode],
            (error, row) => {
                if (error) {
                    console.error(
                        "读取最新彩票结果失败：",
                        error.message
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "读取最新彩票结果失败"
                    });
                }

                if (!row) {
                    return res.status(404).json({
                        success: false,
                        message:
                            "没有找到开奖结果"
                    });
                }

                return res.json({
                    success: true,
                    draw: formatDraw(row)
                });
            }
        );
    }
);

/*
 * =========================================
 * GET /api/lottery/:gameCode/history
 *
 * 获取历史开奖
 *
 * 示例：
 * /api/lottery/sg-toto/history?limit=30
 *
 * limit：
 * 默认 30
 * 最小 1
 * 最大 500
 * =========================================
 */

router.get(
    "/:gameCode/history",
    (req, res) => {
        const gameCode =
            String(
                req.params.gameCode || ""
            ).trim();

        if (!gameCode) {
            return res.status(400).json({
                success: false,
                message: "缺少 gameCode"
            });
        }

        const startDate =
            String(
                req.query.start_date || ""
            ).trim();

        const endDate =
            String(
                req.query.end_date || ""
            ).trim();

        const hasStartDate =
            startDate.length > 0;

        const hasEndDate =
            endDate.length > 0;

        /*
         * =========================================
         * 日期范围查询模式
         *
         * 示例：
         * /api/lottery/sg-4d/history
         * ?start_date=2025-01-01
         * &end_date=2026-09-02
         * =========================================
         */
        if (
            hasStartDate ||
            hasEndDate
        ) {
            if (
                !hasStartDate ||
                !hasEndDate
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "日期范围查询必须同时提供 start_date 和 end_date"
                });
            }

            const datePattern =
                /^\d{4}-\d{2}-\d{2}$/;

            if (
                !datePattern.test(startDate) ||
                !datePattern.test(endDate)
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "日期格式必须为 YYYY-MM-DD"
                });
            }

            if (startDate > endDate) {
                return res.status(400).json({
                    success: false,
                    message:
                        "start_date 不能晚于 end_date"
                });
            }

            /*
             * 日期范围模式最多返回 3000 期。
             *
             * 当前 Singapore 4D 数据为 2531 期，
             * 因此可以覆盖现有全部历史数据。
             */
            const rangeLimit = 3000;

            const sql = `
                SELECT
                    *
                FROM lottery_draws
                WHERE
                    game_code = ?
                    AND draw_date >= ?
                    AND draw_date <= ?
                ORDER BY
                    draw_date DESC,
                    id DESC
                LIMIT ?
            `;

            return db.all(
                sql,
                [
                    gameCode,
                    startDate,
                    endDate,
                    rangeLimit
                ],
                (error, rows) => {
                    if (error) {
                        console.error(
                            "读取彩票日期范围历史数据失败：",
                            error.message
                        );

                        return res.status(500).json({
                            success: false,
                            message:
                                "读取彩票日期范围历史数据失败"
                        });
                    }

                    const draws =
                        rows.map(formatDraw);

                    return res.json({
                        success: true,
                        game_code: gameCode,
                        query_mode:
                            "date_range",
                        start_date:
                            startDate,
                        end_date:
                            endDate,
                        total:
                            draws.length,
                        max_limit:
                            rangeLimit,
                        draws
                    });
                }
            );
        }

        /*
         * =========================================
         * 最近期数查询模式
         *
         * 保留原有功能：
         * /api/lottery/sg-toto/history?limit=50
         * /api/lottery/sg-4d/history?limit=50
         * =========================================
         */

        let limit =
            Number.parseInt(
                req.query.limit,
                10
            );

        if (
            !Number.isInteger(limit) ||
            limit < 1
        ) {
            limit = 30;
        }

        if (limit > 500) {
            limit = 500;
        }

        const sql = `
            SELECT
                *
            FROM lottery_draws
            WHERE game_code = ?
            ORDER BY
                draw_date DESC,
                id DESC
            LIMIT ?
        `;

        db.all(
            sql,
            [
                gameCode,
                limit
            ],
            (error, rows) => {
                if (error) {
                    console.error(
                        "读取彩票历史数据失败：",
                        error.message
                    );

                    return res.status(500).json({
                        success: false,
                        message:
                            "读取彩票历史数据失败"
                    });
                }

                const draws =
                    rows.map(formatDraw);

                return res.json({
                    success: true,
                    game_code:
                        gameCode,
                    query_mode:
                        "recent",
                    total:
                        draws.length,
                    limit,
                    draws
                });
            }
        );
    }
);

module.exports = router;