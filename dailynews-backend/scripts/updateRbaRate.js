const db = require("../db");

const RBA_CASH_RATE_URL =
    "https://www.rba.gov.au/statistics/cash-rate/";

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

function parseRbaDate(value) {
    const cleanedValue =
        stripHtml(value);

    const match =
        cleanedValue.match(
            /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/
        );

    if (!match) {
        return null;
    }

    const monthMap = {
        Jan: 1,
        Feb: 2,
        Mar: 3,
        Apr: 4,
        May: 5,
        Jun: 6,
        Jul: 7,
        Aug: 8,
        Sep: 9,
        Oct: 10,
        Nov: 11,
        Dec: 12,
    };

    const day =
        Number(match[1]);

    const month =
        monthMap[match[2]];

    const year =
        Number(match[3]);

    if (
        !Number.isInteger(day) ||
        !month ||
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

function parseNumericValue(value) {
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

function parseRbaHistory(htmlText) {
    const pageText =
        stripHtml(htmlText);

    const observations = [];

    const recordPattern =
        /(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})\s+([+-]?\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)/g;

    let match;

    while (
        (match =
            recordPattern.exec(
                pageText
            )) !== null
    ) {
        const date =
            parseRbaDate(
                `${match[1]} ${match[2]} ${match[3]}`
            );

        const targetRate =
            Number(match[5]);

        if (
            !date ||
            !Number.isFinite(
                targetRate
            )
        ) {
            continue;
        }

        observations.push({
            date,
            value:
                targetRate,
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
        uniqueObservations.length ===
        0
    ) {
        throw new Error(
            "RBA官方页面没有解析到现金利率数据"
        );
    }

    console.log(
        `已从RBA页面解析到 ${uniqueObservations.length} 条利率记录`
    );

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

function saveRbaRate(data) {
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
      'RBA',
      'AU',
      '澳大利亚',
      '澳大利亚储备银行',
      'RBA_CASH_RATE_TARGET',
      '现金利率目标',

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

      'Reserve Bank of Australia',
      ?,

      '',
      '',

      1,
      6,
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
      sort_order = 6,

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
                    RBA_CASH_RATE_URL,
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

async function updateRbaRate() {
    console.log(
        "开始读取澳大利亚央行官方利率..."
    );

    const response =
        await fetch(
            RBA_CASH_RATE_URL,
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
            `RBA接口请求失败：HTTP ${response.status}`
        );
    }

    const htmlText =
        await response.text();

    const observations =
        parseRbaHistory(
            htmlText
        );

    const currentObservation =
        observations[0];

    const currentValue =
        currentObservation.value;

    const previousObservation =
        observations
            .slice(1)
            .find(function (
                observation
            ) {
                return (
                    Number(
                        observation.value
                    ) !==
                    Number(
                        currentValue
                    )
                );
            }) || null;

    const previousValue =
        previousObservation
            ? previousObservation.value
            : null;

    const direction =
        getDirection(
            currentValue,
            previousValue
        );

    await saveRbaRate({
        currentValue,
        previousValue,
        effectiveDate:
            currentObservation.date,
        direction,
    });

    console.log(
        "澳大利亚央行官方利率更新成功"
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
            "Reserve Bank of Australia",
    });
}

updateRbaRate()
    .catch(function (error) {
        console.error(
            "更新澳大利亚央行利率失败：",
            error.message
        );

        process.exitCode = 1;
    })
    .finally(function () {
        db.close();
    });