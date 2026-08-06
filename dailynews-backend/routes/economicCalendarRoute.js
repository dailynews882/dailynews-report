const express = require("express");
const db = require("../db");

const router = express.Router();

function queryAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows || []);
        });
    });
}

function isValidDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(
        String(value || "")
    );
}

function normalizeOptionalValue(value) {
    const normalized =
        String(value || "")
            .trim();

    if (
        !normalized ||
        normalized.toLowerCase() === "all"
    ) {
        return "";
    }

    return normalized;
}

/*
 * GET /api/economic-calendar
 *
 * Query:
 * date=YYYY-MM-DD
 * country=US
 * type=macro
 * importance=2
 * status=pending
 * importantOnly=1
 * limit=4
 */
router.get("/", async (req, res) => {
    try {
        const eventDate =
            String(req.query.date || "")
                .trim();

        if (!isValidDate(eventDate)) {
            return res.status(400).json({
                success: false,
                message:
                    "date 参数必须使用 YYYY-MM-DD 格式"
            });
        }

        const country =
            normalizeOptionalValue(
                req.query.country
            ).toUpperCase();

        const eventType =
            normalizeOptionalValue(
                req.query.type
            ).toLowerCase();

        const status =
            normalizeOptionalValue(
                req.query.status
            ).toLowerCase();

        const importance =
            normalizeOptionalValue(
                req.query.importance
            );

        const importantOnly =
            String(
                req.query.importantOnly || ""
            ) === "1";

        const requestedLimit =
            Number(req.query.limit);

        const limit =
            Number.isInteger(requestedLimit) &&
                requestedLimit > 0
                ? Math.min(requestedLimit, 100)
                : 100;

        const conditions = [
            "is_active = 1",
            "event_date = ?"
        ];

        const params = [eventDate];

        if (country) {
            conditions.push(
                "UPPER(country_code) = ?"
            );
            params.push(country);
        }

        if (eventType) {
            conditions.push(
                "LOWER(event_type) = ?"
            );
            params.push(eventType);
        }

        if (status) {
            conditions.push(
                "LOWER(status) = ?"
            );
            params.push(status);
        }

        if (importance) {
            const minimumImportance =
                Number(importance);

            if (
                !Number.isInteger(
                    minimumImportance
                ) ||
                minimumImportance < 1 ||
                minimumImportance > 3
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "importance 参数必须是 1、2 或 3"
                });
            }

            conditions.push(
                "importance >= ?"
            );
            params.push(minimumImportance);
        }

        if (importantOnly) {
            conditions.push(
                "importance >= 2"
            );
        }

        const rows = await queryAll(
            `
        SELECT
          id,
          event_date,
          event_time,
          country_code,
          country_name,
          event_title,
          event_type,
          event_type_name,
          importance,
          previous_value,
          forecast_value,
          actual_value,
          unit,
          status,
          source_name,
          source_url
        FROM economic_events
        WHERE ${conditions.join(" AND ")}
        ORDER BY
          CASE
            WHEN event_time = '全天' THEN 0
            ELSE 1
          END ASC,
          event_time ASC,
          importance DESC,
          id ASC
        LIMIT ?
      `,
            [...params, limit]
        );

        const events = rows.map((row) => ({
            id: row.id,
            date: row.event_date,
            time: row.event_time,
            countryCode: row.country_code,
            countryName: row.country_name,
            title: row.event_title,
            type: row.event_type,
            typeName: row.event_type_name,
            importance:
                Number(row.importance) || 1,
            previous:
                row.previous_value || "--",
            forecast:
                row.forecast_value || "--",
            actual:
                row.actual_value || "--",
            unit: row.unit || "",
            status:
                row.status || "pending",
            sourceName:
                row.source_name || "",
            sourceUrl:
                row.source_url || ""
        }));

        return res.json({
            success: true,
            date: eventDate,
            count: events.length,
            events
        });
    } catch (error) {
        console.error(
            "Get economic calendar error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "读取财经日历失败"
        });
    }
});

module.exports = router;