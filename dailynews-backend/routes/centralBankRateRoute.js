const express = require("express");
const db = require("../db");

const router = express.Router();

function formatRateValue(row, prefix) {
    const singleValue = row[`${prefix}_value`];
    const lowValue = row[`${prefix}_low`];
    const highValue = row[`${prefix}_high`];

    if (
        lowValue !== null &&
        lowValue !== undefined &&
        highValue !== null &&
        highValue !== undefined
    ) {
        return {
            type: "range",
            value: null,
            low: Number(lowValue),
            high: Number(highValue),
            display: `${Number(lowValue).toFixed(2)}–${Number(
                highValue
            ).toFixed(2)}%`,
        };
    }

    if (
        singleValue !== null &&
        singleValue !== undefined
    ) {
        return {
            type: "single",
            value: Number(singleValue),
            low: null,
            high: null,
            display: `${Number(singleValue).toFixed(2)}%`,
        };
    }

    return {
        type: "empty",
        value: null,
        low: null,
        high: null,
        display: "—",
    };
}

router.get("/", (req, res) => {
    const sql = `
    SELECT
      id,
      bank_code,
      country_code,
      country_name,
      bank_name,
      rate_code,
      rate_name,

      current_value,
      current_low,
      current_high,

      previous_value,
      previous_low,
      previous_high,

      forecast_value,
      forecast_low,
      forecast_high,

      actual_value,
      actual_low,
      actual_high,

      unit,
      decision_time,
      effective_date,
      next_decision_time,

      direction,
      status,

      official_source_name,
      official_source_url,

      forecast_source_name,
      forecast_source_url,

      sort_order,
      last_checked_at,
      updated_at
    FROM central_bank_rates
    WHERE is_active = 1
    ORDER BY sort_order ASC, id ASC
  `;

    db.all(sql, [], (error, rows) => {
        if (error) {
            console.error(
                "Read central bank rates error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "读取全球央行利率失败",
            });
        }

        const rates = rows.map((row) => ({
            id: row.id,
            bankCode: row.bank_code,
            countryCode: row.country_code,
            countryName: row.country_name,
            bankName: row.bank_name,
            rateCode: row.rate_code,
            rateName: row.rate_name,

            current: formatRateValue(
                row,
                "current"
            ),

            previous: formatRateValue(
                row,
                "previous"
            ),

            forecast: formatRateValue(
                row,
                "forecast"
            ),

            actual: formatRateValue(
                row,
                "actual"
            ),

            unit: row.unit,
            direction: row.direction,
            status: row.status,

            decisionTime: row.decision_time,
            effectiveDate: row.effective_date,
            nextDecisionTime:
                row.next_decision_time,

            officialSource: {
                name:
                    row.official_source_name ||
                    "",
                url:
                    row.official_source_url ||
                    "",
            },

            forecastSource: {
                name:
                    row.forecast_source_name ||
                    "",
                url:
                    row.forecast_source_url ||
                    "",
            },

            sortOrder: row.sort_order,
            lastCheckedAt:
                row.last_checked_at,
            updatedAt: row.updated_at,
        }));

        return res.json({
            success: true,
            count: rates.length,
            rates,
        });
    });
});

module.exports = router;