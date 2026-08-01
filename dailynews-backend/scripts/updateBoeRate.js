const db = require("../db");

const BOE_HISTORY_URL =
    "https://www.bankofengland.co.uk/boeapps/database/Bank-Rate.asp";

function stripHtml(value) {
    return String(value || "")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/\s+/g, " ")
        .trim();
}

function parseBoeDate(value) {
    const cleanedValue =
        stripHtml(value);

    const match =
        cleanedValue.match(
            /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})/
        );

    if (!match) {
        return null;
    }

    const day =
        Number(match[1]);

    const monthNames = {
        Jan: 0,
        Feb: 1,
        Mar: 2,
        Apr: 3,
        May: 4,
        Jun: 5,
        Jul: 6,
        Aug: 7,
        Sep: 8,
        Oct: 9,
        Nov: 10,
        Dec: 11,
    };

    const month =
        monthNames[match[2]];

    let year =
        Number(match[3]);

    if (year < 100) {
        year =
            year >= 50
                ? 1900 + year
                : 2000 + year;
    }

    if (
        !Number.isInteger(day) ||
        month === undefined ||
        !Number.isInteger(year)
    ) {
        return null;
    }

    const date =
        new Date(
            Date.UTC(
                year,
                month,
                day
            )
        );

    if (
        Number.isNaN(
            date.getTime()
        )
    ) {
        return null;
    }

    return date
        .toISOString()
        .slice(0, 10);
}

function parseBoeHistory(htmlText) {
    const html =
        String(htmlText || "");

    const observations = [];

    const rowPattern =
        /<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi;

    let match;

    while (
        (match =
            rowPattern.exec(html)) !==
        null
    ) {
        const date =
            parseBoeDate(
                match[1]
            );

        const rateText =
            stripHtml(
                match[2]
            );

        const rate =
            Number(
                rateText.replace(
                    /[^0-9.-]/g,
                    ""
                )
            );

        if (
            !date ||
            !Number.isFinite(rate)
        ) {
            continue;
        }

        observations.push({
            date,
            value: rate,
        });
    }

    const uniqueObservations =
        observations.filter(
            function (
                observation,
                index,
                items
            ) {
                return (
                    items.findIndex(
                        function (item) {
                            return (
                                item.date ===
                                observation.date &&
                                item.value ===
                                observation.value
                            );
                        }
                    ) === index
                );
            }
        );

    uniqueObservations.sort(
        function (
            first,
            second
        ) {
            return String(
                second.date
            ).localeCompare(
                String(first.date)
            );
        }
    );

    if (
        uniqueObservations.length <
        1
    ) {
        throw new Error(
            "英国央行页面没有解析到有效利率"
        );
    }

    return uniqueObservations;
}

function getDirection(
    currentValue,
    previousValue
) {
    if (
        previousValue === null ||
        previousValue === undefined
    ) {
        return "unchanged";
    }

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

async function updateBoeRate() {
    console.log(
        "开始读取英国央行官方利率..."
    );

    const response =
        await fetch(
            BOE_HISTORY_URL,
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
            `英国央行请求失败：HTTP ${response.status}`
        );
    }

    const htmlText =
        await response.text();

    const observations =
        parseBoeHistory(
            htmlText
        );

    const currentObservation =
        observations[0];

    const previousObservation =
        observations.length >= 2
            ? observations[1]
            : null;

    const currentValue =
        currentObservation.value;

    const previousValue =
        previousObservation
            ? previousObservation.value
            : null;

    const direction =
        getDirection(
            currentValue,
            previousValue
        );

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
      'BOE',
      'GB',
      '英国',
      '英国央行',
      'BOE_BANK_RATE',
      '银行利率',

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

      'Bank of England',
      ?,

      '',
      '',

      1,
      3,
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
      sort_order = 3,

      last_checked_at =
        CURRENT_TIMESTAMP,

      updated_at =
        CURRENT_TIMESTAMP
  `;

    await new Promise(
        function (
            resolve,
            reject
        ) {
            db.run(
                sql,
                [
                    currentValue,
                    previousValue,
                    currentValue,
                    currentObservation.date,
                    direction,
                    BOE_HISTORY_URL,
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

    console.log(
        "英国央行官方利率更新成功"
    );

    console.log({
        currentValue,
        previousValue,
        previousEffectiveDate:
            previousObservation
                ? previousObservation.date
                : null,
        actualValue:
            currentValue,
        forecastValue: null,
        effectiveDate:
            currentObservation.date,
        direction,
        source:
            "Bank of England",
    });
}

updateBoeRate()
    .catch(function (error) {
        console.error(
            "更新英国央行利率失败：",
            error.message
        );

        process.exitCode = 1;
    })
    .finally(function () {
        db.close();
    });