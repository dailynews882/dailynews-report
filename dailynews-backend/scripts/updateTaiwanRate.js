const db = require("../db");

const TAIWAN_RATE_URL =
    "https://www.cbc.gov.tw/en/lp-695-2.html";

function decodeHtml(value) {
    return String(value || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}

function stripHtml(value) {
    return decodeHtml(value)
        .replace(
            /<script[\s\S]*?<\/script>/gi,
            " "
        )
        .replace(
            /<style[\s\S]*?<\/style>/gi,
            " "
        )
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function normalizeDate(value) {
    const cleanedValue =
        stripHtml(value);

    const match =
        cleanedValue.match(
            /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/
        );

    if (!match) {
        return null;
    }

    const year =
        Number(match[1]);

    const month =
        Number(match[2]);

    const day =
        Number(match[3]);

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day)
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

function parseRate(value) {
    const cleanedValue =
        stripHtml(value)
            .replace(/,/g, "")
            .replace(/[^0-9.+-]/g, "");

    if (!cleanedValue) {
        return null;
    }

    const numberValue =
        Number(cleanedValue);

    return Number.isFinite(
        numberValue
    )
        ? numberValue
        : null;
}

function parseTaiwanRateHistory(
    htmlText
) {
    const html =
        String(htmlText || "");

    const observations = [];

    const rowPattern =
        /<tr[^>]*>([\s\S]*?)<\/tr>/gi;

    let rowMatch;

    while (
        (rowMatch =
            rowPattern.exec(html)) !==
        null
    ) {
        const rowHtml =
            rowMatch[1];

        const cells = [];

        const cellPattern =
            /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

        let cellMatch;

        while (
            (cellMatch =
                cellPattern.exec(
                    rowHtml
                )) !== null
        ) {
            cells.push(
                cellMatch[1]
            );
        }

        if (cells.length < 2) {
            continue;
        }

        const date =
            normalizeDate(
                cells[0]
            );

        const discountRate =
            parseRate(
                cells[1]
            );

        if (
            !date ||
            discountRate === null
        ) {
            continue;
        }

        observations.push({
            date,
            value:
                discountRate,
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
                first.date
            ).localeCompare(
                String(second.date)
            );
        }
    );

    if (
        uniqueObservations.length ===
        0
    ) {
        throw new Error(
            "台湾央行页面没有解析到重贴现率数据"
        );
    }

    return uniqueObservations;
}

function findPreviousObservation(
    observations,
    currentValue
) {
    return (
        observations
            .slice(0, -1)
            .reverse()
            .find(function (
                observation
            ) {
                return (
                    Number(
                        observation.value
                    ) !==
                    Number(currentValue)
                );
            }) || null
    );
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

function saveTaiwanRate(data) {
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
      'CBC_TW',
      'TW',
      '台湾',
      '台湾中央银行',
      'CBC_TW_DISCOUNT_RATE',
      '重贴现率',

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

      'Central Bank of the Republic of China (Taiwan)',
      ?,

      '',
      '',

      1,
      9,
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
      sort_order = 9,

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
                    TAIWAN_RATE_URL,
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

async function updateTaiwanRate() {
    console.log(
        "开始读取台湾央行官方重贴现率..."
    );

    const response =
        await fetch(
            TAIWAN_RATE_URL,
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
            `台湾央行页面请求失败：HTTP ${response.status}`
        );
    }

    const htmlText =
        await response.text();

    const observations =
        parseTaiwanRateHistory(
            htmlText
        );

    const currentObservation =
        observations[
        observations.length - 1
        ];

    const currentValue =
        currentObservation.value;

    const previousObservation =
        findPreviousObservation(
            observations,
            currentValue
        );

    const previousValue =
        previousObservation
            ? previousObservation.value
            : null;

    const direction =
        getDirection(
            currentValue,
            previousValue
        );

    await saveTaiwanRate({
        currentValue,
        previousValue,
        effectiveDate:
            currentObservation.date,
        direction,
    });

    console.log(
        `已读取 ${observations.length} 条台湾央行利率记录`
    );

    console.log(
        "台湾央行官方重贴现率更新成功"
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
            "Central Bank of the Republic of China (Taiwan)",
    });
}

updateTaiwanRate()
    .catch(function (error) {
        console.error(
            "更新台湾央行重贴现率失败：",
            error.message
        );

        process.exitCode = 1;
    })
    .finally(function () {
        db.close();
    });