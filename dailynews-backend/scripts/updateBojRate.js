const db = require("../db");

const BOJ_HOME_URL =
    "https://www.boj.or.jp/en/";

const INITIAL_PREVIOUS_RATE =
    0.75;

function stripHtml(value) {
    return String(value || "")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/\s+/g, " ")
        .trim();
}

function parseCurrentRate(htmlText) {
    const text =
        stripHtml(htmlText);

    const patterns = [
        /uncollateralized overnight call rate[\s\S]{0,240}?around\s+(-?\d+(?:\.\d+)?)\s*percent/i,
        /remain at around\s+(-?\d+(?:\.\d+)?)\s*percent/i,
        /guideline[\s\S]{0,300}?around\s+(-?\d+(?:\.\d+)?)\s*percent/i,
    ];

    for (
        const pattern of patterns
    ) {
        const match =
            text.match(pattern);

        if (!match) {
            continue;
        }

        const rate =
            Number(match[1]);

        if (
            Number.isFinite(rate)
        ) {
            return rate;
        }
    }

    throw new Error(
        "日本央行官网没有解析到当前政策利率"
    );
}

function parseEffectiveDate(
    htmlText
) {
    const text =
        stripHtml(htmlText);

    const monthNames = {
        January: 1,
        February: 2,
        March: 3,
        April: 4,
        May: 5,
        June: 6,
        July: 7,
        August: 8,
        September: 9,
        October: 10,
        November: 11,
        December: 12,
    };

    const match =
        text.match(
            /Interest Rate Applied to the Complementary Deposit Facility[\s\S]{0,160}?since\s+([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i
        );

    if (!match) {
        return null;
    }

    const month =
        monthNames[match[1]];

    const day =
        Number(match[2]);

    const year =
        Number(match[3]);

    if (
        !month ||
        !Number.isInteger(day) ||
        !Number.isInteger(year)
    ) {
        return null;
    }

    return [
        year,
        String(month).padStart(
            2,
            "0"
        ),
        String(day).padStart(
            2,
            "0"
        ),
    ].join("-");
}

function getDirection(
    currentValue,
    previousValue
) {
    if (
        currentValue >
        previousValue
    ) {
        return "up";
    }

    if (
        currentValue <
        previousValue
    ) {
        return "down";
    }

    return "unchanged";
}

function readExistingBojRate() {
    return new Promise(
        function (
            resolve,
            reject
        ) {
            db.get(
                `
          SELECT
            current_value,
            previous_value,
            effective_date,
            status
          FROM central_bank_rates
          WHERE bank_code = ?
        `,
                ["BOJ"],
                function (
                    error,
                    row
                ) {
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

function saveBojRate(data) {
    const sql = `
    INSERT INTO central_bank_rates (
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
      effective_date,
      direction,
      status,

      official_source_name,
      official_source_url,

      forecast_source_name,
      forecast_source_url,

      is_active,
      sort_order,
      last_checked_at,
      updated_at
    )
    VALUES (
      'BOJ',
      'JP',
      '日本',
      '日本央行',
      'BOJ_POLICY_RATE',
      '无担保隔夜拆借利率目标',

      ?,
      NULL,
      NULL,

      ?,
      NULL,
      NULL,

      NULL,
      NULL,
      NULL,

      ?,
      NULL,
      NULL,

      '%',
      ?,
      ?,
      'official',

      'Bank of Japan',
      ?,

      '',
      '',

      1,
      4,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT(bank_code)
    DO UPDATE SET
      country_code =
        excluded.country_code,

      country_name =
        excluded.country_name,

      bank_name =
        excluded.bank_name,

      rate_code =
        excluded.rate_code,

      rate_name =
        excluded.rate_name,

      current_value =
        excluded.current_value,

      current_low = NULL,
      current_high = NULL,

      previous_value =
        excluded.previous_value,

      previous_low = NULL,
      previous_high = NULL,

      forecast_value = NULL,
      forecast_low = NULL,
      forecast_high = NULL,

      actual_value =
        excluded.actual_value,

      actual_low = NULL,
      actual_high = NULL,

      unit =
        excluded.unit,

      effective_date =
        excluded.effective_date,

      direction =
        excluded.direction,

      status = 'official',

      official_source_name =
        excluded.official_source_name,

      official_source_url =
        excluded.official_source_url,

      forecast_source_name = '',
      forecast_source_url = '',

      is_active = 1,
      sort_order = 4,

      last_checked_at =
        CURRENT_TIMESTAMP,

      updated_at =
        CURRENT_TIMESTAMP
  `;

    return new Promise(
        function (
            resolve,
            reject
        ) {
            db.run(
                sql,
                [
                    data.currentValue,
                    data.previousValue,
                    data.currentValue,
                    data.effectiveDate,
                    data.direction,
                    BOJ_HOME_URL,
                ],
                function (error) {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve();
                }
            );
        }
    );
}

async function updateBojRate() {
    console.log(
        "开始读取日本央行官方利率..."
    );

    const existingRate =
        await readExistingBojRate();

    const response =
        await fetch(
            BOJ_HOME_URL,
            {
                method: "GET",
                headers: {
                    Accept:
                        "text/html,application/xhtml+xml",
                    "User-Agent":
                        "DailyNewsReport/1.0",
                },
            }
        );

    if (!response.ok) {
        throw new Error(
            `日本央行请求失败：HTTP ${response.status}`
        );
    }

    const htmlText =
        await response.text();

    const currentValue =
        parseCurrentRate(
            htmlText
        );

    const parsedEffectiveDate =
        parseEffectiveDate(
            htmlText
        );

    let previousValue =
        INITIAL_PREVIOUS_RATE;

    if (
        existingRate &&
        existingRate.status ===
        "official" &&
        Number.isFinite(
            Number(
                existingRate.current_value
            )
        ) &&
        Number(
            existingRate.current_value
        ) !== currentValue
    ) {
        previousValue =
            Number(
                existingRate.current_value
            );
    } else if (
        existingRate &&
        existingRate.status ===
        "official" &&
        Number.isFinite(
            Number(
                existingRate.previous_value
            )
        )
    ) {
        previousValue =
            Number(
                existingRate.previous_value
            );
    }

    const effectiveDate =
        parsedEffectiveDate ||
        existingRate?.effective_date ||
        null;

    const direction =
        getDirection(
            currentValue,
            previousValue
        );

    await saveBojRate({
        currentValue,
        previousValue,
        effectiveDate,
        direction,
    });

    console.log(
        "日本央行官方利率更新成功"
    );

    console.log({
        currentValue,
        previousValue,
        actualValue:
            currentValue,
        forecastValue: null,
        effectiveDate,
        direction,
        source:
            "Bank of Japan",
    });
}

updateBojRate()
    .catch(function (error) {
        console.error(
            "更新日本央行利率失败：",
            error.message
        );

        process.exitCode = 1;
    })
    .finally(function () {
        db.close();
    });