const db = require("../db");

const PBOC_LPR_HISTORY_URL =
    "https://www.bankofchina.com/fimarkets/lilv/fd32/201310/t20131031_2591219.html";

const PBOC_OFFICIAL_INFO_URL =
    "https://www.pbc.gov.cn/en/3688229/3688335/3730276/3883798/19e15ae1-4.html";

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
            /(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/
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
            .replace(/％/g, "%")
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

function parsePbocLprHistory(
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

        if (cells.length < 3) {
            continue;
        }

        const date =
            normalizeDate(
                cells[0]
            );

        const oneYearRate =
            parseRate(
                cells[1]
            );

        const fiveYearRate =
            parseRate(
                cells[2]
            );

        if (
            !date ||
            oneYearRate === null
        ) {
            continue;
        }

        observations.push({
            date,
            value:
                oneYearRate,
            fiveYearValue:
                fiveYearRate,
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
            "LPR历史页面没有解析到有效数据"
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

function findCurrentEffectiveDate(
    observations,
    currentValue
) {
    let effectiveDate = null;

    for (
        let index =
            observations.length - 1;
        index >= 0;
        index -= 1
    ) {
        const observation =
            observations[index];

        if (
            Number(
                observation.value
            ) !==
            Number(currentValue)
        ) {
            break;
        }

        effectiveDate =
            observation.date;
    }

    return effectiveDate;
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

function savePbocRate(data) {
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
      'PBOC',
      'CN',
      '中国',
      '中国人民银行',
      'PBOC_LPR_1Y',
      '一年期LPR',

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

      'PBOC-authorized NIFC LPR',
      ?,

      '',
      '',

      1,
      5,
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
      sort_order = 5,

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
                    PBOC_OFFICIAL_INFO_URL,
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

async function updatePbocRate() {
    console.log(
        "开始读取中国人民银行授权公布的LPR数据..."
    );

    const response =
        await fetch(
            PBOC_LPR_HISTORY_URL,
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
            `LPR历史页面请求失败：HTTP ${response.status}`
        );
    }

    const htmlText =
        await response.text();

    const observations =
        parsePbocLprHistory(
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

    const effectiveDate =
        findCurrentEffectiveDate(
            observations,
            currentValue
        );

    const direction =
        getDirection(
            currentValue,
            previousValue
        );

    await savePbocRate({
        currentValue,
        previousValue,
        effectiveDate,
        direction,
    });

    console.log(
        `已读取 ${observations.length} 条LPR历史记录`
    );

    console.log(
        "中国人民银行LPR数据更新成功"
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
        effectiveDate,
        latestObservationDate:
            currentObservation.date,
        latestFiveYearValue:
            currentObservation.fiveYearValue,
        direction,
        source:
            "PBOC-authorized NIFC LPR",
    });
}

updatePbocRate()
    .catch(function (error) {
        console.error(
            "更新中国人民银行LPR失败：",
            error.message
        );

        process.exitCode = 1;
    })
    .finally(function () {
        db.close();
    });