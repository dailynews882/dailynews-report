const db = require("../db");

const ECB_API_URL =
    "https://data-api.ecb.europa.eu/service/data/FM/D.U2.EUR.4F.KR.DFR.LEV?lastNObservations=400&format=csvdata";

function splitCsvLine(line) {
    const values = [];
    let currentValue = "";
    let insideQuotes = false;

    for (
        let index = 0;
        index < line.length;
        index += 1
    ) {
        const character = line[index];
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
            insideQuotes = !insideQuotes;
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

        currentValue += character;
    }

    values.push(
        currentValue.trim()
    );

    return values;
}

function parseEcbCsv(csvText) {
    const lines = String(csvText || "")
        .split(/\r?\n/)
        .map(function (line) {
            return line.trim();
        })
        .filter(Boolean);

    if (lines.length < 2) {
        throw new Error(
            "ECB接口没有返回有效数据"
        );
    }

    const headers =
        splitCsvLine(lines[0]);

    const timeIndex =
        headers.indexOf(
            "TIME_PERIOD"
        );

    const valueIndex =
        headers.indexOf(
            "OBS_VALUE"
        );

    if (
        timeIndex === -1 ||
        valueIndex === -1
    ) {
        throw new Error(
            "ECB数据缺少 TIME_PERIOD 或 OBS_VALUE 字段"
        );
    }

    const observations = lines
        .slice(1)
        .map(function (line) {
            const columns =
                splitCsvLine(line);

            const date =
                columns[timeIndex];

            const value =
                Number(
                    columns[valueIndex]
                );

            if (
                !date ||
                !Number.isFinite(value)
            ) {
                return null;
            }

            return {
                date,
                value,
            };
        })
        .filter(Boolean)
        .sort(function (first, second) {
            return String(
                first.date
            ).localeCompare(
                String(second.date)
            );
        });

    if (observations.length === 0) {
        throw new Error(
            "ECB接口没有可用利率记录"
        );
    }

    return observations;
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

async function updateEcbRate() {
    console.log(
        "开始读取欧洲央行官方利率..."
    );

    const response =
        await fetch(
            ECB_API_URL,
            {
                method: "GET",
                headers: {
                    Accept: "text/csv",
                    "User-Agent":
                        "DailyNewsReport/1.0",
                },
            }
        );

    if (!response.ok) {
        throw new Error(
            `ECB接口请求失败：HTTP ${response.status}`
        );
    }

    const csvText =
        await response.text();

    const observations =
        parseEcbCsv(csvText);

    const currentObservation =
        observations[
        observations.length - 1
        ];

    const currentValue =
        currentObservation.value;

    const previousObservation =
        observations
            .slice(0, -1)
            .reverse()
            .find(function (observation) {
                return (
                    Number(observation.value) !==
                    Number(currentValue)
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
      'ECB',
      'EU',
      '欧元区',
      '欧洲央行',
      'ECB_DEPOSIT_RATE',
      '存款便利利率',

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

      'European Central Bank',
      ?,

      '',
      '',

      1,
      2,
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
      sort_order = 2,

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
                    ECB_API_URL,
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
        "欧洲央行官方利率更新成功"
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
    });
}

updateEcbRate()
    .catch(function (error) {
        console.error(
            "更新欧洲央行利率失败：",
            error.message
        );

        process.exitCode = 1;
    })
    .finally(function () {
        db.close();
    });