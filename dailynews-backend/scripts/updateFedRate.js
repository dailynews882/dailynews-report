const db = require("../db");

const FED_CSV_URL =
    "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFEDTARL,DFEDTARU";

const FED_SOURCE_URL =
    "https://fred.stlouisfed.org/graph/?id=DFEDTARL,DFEDTARU";

function splitCsvLine(line) {
    const values = [];
    let currentValue = "";
    let insideQuotes = false;

    for (
        let index = 0;
        index < line.length;
        index += 1
    ) {
        const character =
            line[index];

        const nextCharacter =
            line[index + 1];

        if (
            character === '"' &&
            insideQuotes &&
            nextCharacter === '"'
        ) {
            currentValue += '"';
            index += 1;
            continue;
        }

        if (character === '"') {
            insideQuotes =
                !insideQuotes;

            continue;
        }

        if (
            character === "," &&
            !insideQuotes
        ) {
            values.push(
                currentValue.trim()
            );

            currentValue = "";
            continue;
        }

        currentValue +=
            character;
    }

    values.push(
        currentValue.trim()
    );

    return values;
}

function parseFedCsv(csvText) {
    const lines =
        String(csvText || "")
            .split(/\r?\n/)
            .map(function (line) {
                return line.trim();
            })
            .filter(Boolean);

    if (lines.length < 2) {
        throw new Error(
            "美联储官方序列没有返回有效数据"
        );
    }

    const headers =
        splitCsvLine(lines[0]);

    const dateIndex =
        headers.findIndex(
            function (header) {
                return (
                    header ===
                    "DATE" ||
                    header ===
                    "observation_date"
                );
            }
        );

    const lowerIndex =
        headers.indexOf(
            "DFEDTARL"
        );

    const upperIndex =
        headers.indexOf(
            "DFEDTARU"
        );

    if (
        dateIndex === -1 ||
        lowerIndex === -1 ||
        upperIndex === -1
    ) {
        throw new Error(
            "美联储数据缺少日期、下限或上限字段"
        );
    }

    const observations =
        lines
            .slice(1)
            .map(function (line) {
                const columns =
                    splitCsvLine(line);

                const date =
                    String(
                        columns[dateIndex] ||
                        ""
                    ).trim();

                const lowerText =
                    String(
                        columns[lowerIndex] ||
                        ""
                    ).trim();

                const upperText =
                    String(
                        columns[upperIndex] ||
                        ""
                    ).trim();

                if (
                    !date ||
                    !lowerText ||
                    !upperText ||
                    lowerText === "." ||
                    upperText === "."
                ) {
                    return null;
                }

                const low =
                    Number(lowerText);

                const high =
                    Number(upperText);

                if (
                    !Number.isFinite(low) ||
                    !Number.isFinite(high)
                ) {
                    return null;
                }

                return {
                    date,
                    low,
                    high,
                };
            })
            .filter(Boolean)
            .sort(function (
                first,
                second
            ) {
                return String(
                    first.date
                ).localeCompare(
                    String(second.date)
                );
            });

    if (
        observations.length ===
        0
    ) {
        throw new Error(
            "美联储官方序列没有可用利率记录"
        );
    }

    return observations;
}

function isSameRange(
    observation,
    targetRange
) {
    return (
        Number(
            observation.low
        ) ===
        Number(
            targetRange.low
        ) &&
        Number(
            observation.high
        ) ===
        Number(
            targetRange.high
        )
    );
}

function findPreviousRange(
    observations,
    currentRange
) {
    return (
        observations
            .slice(0, -1)
            .reverse()
            .find(function (
                observation
            ) {
                return !isSameRange(
                    observation,
                    currentRange
                );
            }) || null
    );
}

function findCurrentEffectiveDate(
    observations,
    currentRange
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
            !isSameRange(
                observation,
                currentRange
            )
        ) {
            break;
        }

        effectiveDate =
            observation.date;
    }

    return effectiveDate;
}

function getDirection(
    currentRange,
    previousRange
) {
    if (!previousRange) {
        return "unchanged";
    }

    const currentMidpoint =
        (
            Number(
                currentRange.low
            ) +
            Number(
                currentRange.high
            )
        ) / 2;

    const previousMidpoint =
        (
            Number(
                previousRange.low
            ) +
            Number(
                previousRange.high
            )
        ) / 2;

    if (
        currentMidpoint >
        previousMidpoint
    ) {
        return "up";
    }

    if (
        currentMidpoint <
        previousMidpoint
    ) {
        return "down";
    }

    return "unchanged";
}

function saveFedRate(data) {
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
      'FED',
      'US',
      '美国',
      '美联储',
      'FED_FUNDS_TARGET_RANGE',
      '联邦基金目标利率区间',

      NULL,
      ?,
      ?,

      NULL,
      ?,
      ?,

      NULL,
      NULL,
      NULL,

      NULL,
      ?,
      ?,

      '%',
      ?,
      ?,
      'official',

      'Federal Reserve Board via FRED',
      ?,

      '',
      '',

      1,
      1,
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

      current_value = NULL,

      current_low =
        excluded.current_low,

      current_high =
        excluded.current_high,

      previous_value = NULL,

      previous_low =
        excluded.previous_low,

      previous_high =
        excluded.previous_high,

      forecast_value = NULL,
      forecast_low = NULL,
      forecast_high = NULL,

      actual_value = NULL,

      actual_low =
        excluded.actual_low,

      actual_high =
        excluded.actual_high,

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
      sort_order = 1,

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
                    data.currentLow,
                    data.currentHigh,

                    data.previousLow,
                    data.previousHigh,

                    data.currentLow,
                    data.currentHigh,

                    data.effectiveDate,
                    data.direction,
                    FED_SOURCE_URL,
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

async function updateFedRate() {
    console.log(
        "开始读取美联储官方目标利率区间..."
    );

    const response =
        await fetch(
            FED_CSV_URL,
            {
                method: "GET",
                headers: {
                    Accept:
                        "text/csv",
                    "User-Agent":
                        "DailyNewsReport/1.0",
                },
            }
        );

    if (!response.ok) {
        throw new Error(
            `美联储数据请求失败：HTTP ${response.status}`
        );
    }

    const csvText =
        await response.text();

    const observations =
        parseFedCsv(
            csvText
        );

    const currentRange =
        observations[
        observations.length - 1
        ];

    const previousRange =
        findPreviousRange(
            observations,
            currentRange
        );

    if (!previousRange) {
        throw new Error(
            "没有找到美联储上一次不同的目标利率区间"
        );
    }

    const effectiveDate =
        findCurrentEffectiveDate(
            observations,
            currentRange
        );

    const direction =
        getDirection(
            currentRange,
            previousRange
        );

    await saveFedRate({
        currentLow:
            currentRange.low,

        currentHigh:
            currentRange.high,

        previousLow:
            previousRange.low,

        previousHigh:
            previousRange.high,

        effectiveDate,
        direction,
    });

    console.log(
        `已从美联储官方序列读取 ${observations.length} 条记录`
    );

    console.log(
        "美联储官方目标利率区间更新成功"
    );

    console.log({
        currentLow:
            currentRange.low,

        currentHigh:
            currentRange.high,

        previousLow:
            previousRange.low,

        previousHigh:
            previousRange.high,

        previousEffectiveDate:
            previousRange.date,

        actualLow:
            currentRange.low,

        actualHigh:
            currentRange.high,

        forecastLow: null,
        forecastHigh: null,

        effectiveDate,

        latestObservationDate:
            currentRange.date,

        direction,

        source:
            "Federal Reserve Board via FRED",
    });
}

updateFedRate()
    .catch(function (error) {
        console.error(
            "更新美联储利率失败：",
            error.message
        );

        process.exitCode = 1;
    })
    .finally(function () {
        db.close();
    });