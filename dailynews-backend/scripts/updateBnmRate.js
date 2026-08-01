const db = require("../db");

const BNM_OPR_URL =
    "https://financialmarkets.bnm.gov.my/data-download-opr";

const BNM_SOURCE_URL =
    "https://financialmarkets.bnm.gov.my/data-download-opr";

/*
 * BNM官方历史显示：
 * 当前2.75%之前的不同档位为3.00%。
 *
 * 此值只用于第一次正式接入。
 * 以后利率发生变化时，会自动使用数据库中的旧正式当前值。
 */
const INITIAL_PREVIOUS_RATE =
    3.0;

function decodeHtml(value) {
    return String(value || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&#39;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&#x2F;/gi, "/");
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

function convertDateToIso(
    day,
    month,
    year
) {
    const monthMap = {
        jan: 1,
        january: 1,
        feb: 2,
        february: 2,
        mar: 3,
        march: 3,
        apr: 4,
        april: 4,
        may: 5,
        jun: 6,
        june: 6,
        jul: 7,
        july: 7,
        aug: 8,
        august: 8,
        sep: 9,
        sept: 9,
        september: 9,
        oct: 10,
        october: 10,
        nov: 11,
        november: 11,
        dec: 12,
        december: 12,
    };

    const numericDay =
        Number(day);

    const numericMonth =
        monthMap[
        String(month || "")
            .toLowerCase()
        ];

    const numericYear =
        Number(year);

    if (
        !Number.isInteger(
            numericDay
        ) ||
        !numericMonth ||
        !Number.isInteger(
            numericYear
        )
    ) {
        return null;
    }

    return [
        numericYear,
        String(numericMonth).padStart(
            2,
            "0"
        ),
        String(numericDay).padStart(
            2,
            "0"
        ),
    ].join("-");
}

function parseBnmCurrentRate(
    htmlText
) {
    const pageText =
        stripHtml(htmlText);

    const patterns = [
        /OVERNIGHT\s+POLICY\s+RATE\s+(\d+(?:\.\d+)?)\s*%\s+as\s+at\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i,

        /Overnight\s+Policy\s+Rate\s+(\d+(?:\.\d+)?)\s*%\s+as\s+at\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i,

        /OPR[\s\S]{0,120}?(\d+(?:\.\d+)?)\s*%[\s\S]{0,80}?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i,
    ];

    for (
        const pattern of patterns
    ) {
        const match =
            pageText.match(pattern);

        if (!match) {
            continue;
        }

        const rate =
            Number(match[1]);

        const effectiveDate =
            convertDateToIso(
                match[2],
                match[3],
                match[4]
            );

        if (
            Number.isFinite(rate)
        ) {
            return {
                value: rate,
                date:
                    effectiveDate,
            };
        }
    }

    /*
     * 备用方式：
     * 从页面表格记录中寻找最新的
     * DD/MM/YYYY + 利率。
     */
    const tablePattern =
        /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d+(?:\.\d+)?)/g;

    const observations = [];

    let tableMatch;

    while (
        (tableMatch =
            tablePattern.exec(
                pageText
            )) !== null
    ) {
        const day =
            Number(tableMatch[1]);

        const month =
            Number(tableMatch[2]);

        const year =
            Number(tableMatch[3]);

        const rate =
            Number(tableMatch[4]);

        if (
            !Number.isInteger(day) ||
            !Number.isInteger(month) ||
            !Number.isInteger(year) ||
            !Number.isFinite(rate)
        ) {
            continue;
        }

        const date = [
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

        observations.push({
            date,
            value: rate,
        });
    }

    observations.sort(
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
        observations.length > 0
    ) {
        return observations[0];
    }

    throw new Error(
        "BNM官方页面没有解析到OPR数据"
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

function readExistingBnmRate() {
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
                ["BNM"],
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

function saveBnmRate(data) {
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
      'BNM',
      'MY',
      '马来西亚',
      '马来西亚国家银行',
      'BNM_OPR',
      '隔夜政策利率',

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

      'Bank Negara Malaysia',
      ?,

      '',
      '',

      1,
      8,
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
      sort_order = 8,

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
                    BNM_SOURCE_URL,
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

async function updateBnmRate() {
    console.log(
        "开始读取马来西亚央行官方利率..."
    );

    const existingRate =
        await readExistingBnmRate();

    const response =
        await fetch(
            BNM_OPR_URL,
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
            `BNM请求失败：HTTP ${response.status}`
        );
    }

    const htmlText =
        await response.text();

    const currentObservation =
        parseBnmCurrentRate(
            htmlText
        );

    const currentValue =
        Number(
            currentObservation.value
        );

    let previousValue =
        INITIAL_PREVIOUS_RATE;

    /*
     * 已经是正式数据，而且利率发生变化：
     * 将数据库中的旧当前值保存为新的上次值。
     */
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
        /*
         * 当前值没有变化：
         * 保留原来的上次不同值。
         */
        previousValue =
            Number(
                existingRate.previous_value
            );
    }

    const effectiveDate =
        currentObservation.date ||
        existingRate?.effective_date ||
        null;

    const direction =
        getDirection(
            currentValue,
            previousValue
        );

    await saveBnmRate({
        currentValue,
        previousValue,
        effectiveDate,
        direction,
    });

    console.log(
        "马来西亚央行官方利率更新成功"
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
            "Bank Negara Malaysia",
    });
}

updateBnmRate()
    .catch(function (error) {
        console.error(
            "更新马来西亚央行利率失败：",
            error.message
        );

        process.exitCode = 1;
    })
    .finally(function () {
        db.close();
    });