const db = require("../db");

const BOC_SERIES_CODE =
    "V39079";

const BOC_API_URL =
    "https://www.bankofcanada.ca/valet/observations/V39079/json?recent=400";

const BOC_SOURCE_URL =
    "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/";

function parseBocObservations(
    responseData
) {
    const rawObservations =
        Array.isArray(
            responseData?.observations
        )
            ? responseData.observations
            : [];

    const observations =
        rawObservations
            .map(function (item) {
                const date =
                    String(
                        item?.d || ""
                    ).trim();

                const value =
                    Number(
                        item?.[
                            BOC_SERIES_CODE
                        ]?.v
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
            "加拿大央行接口没有返回有效利率数据"
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

function saveBocRate(data) {
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
      'BOC',
      'CA',
      '加拿大',
      '加拿大央行',
      'BOC_OVERNIGHT_TARGET',
      '隔夜利率目标',

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

      'Bank of Canada',
      ?,

      '',
      '',

      1,
      7,
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
      sort_order = 7,

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
                    BOC_SOURCE_URL,
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

async function updateBocRate() {
    console.log(
        "开始读取加拿大央行官方利率..."
    );

    const response =
        await fetch(
            BOC_API_URL,
            {
                method: "GET",
                headers: {
                    Accept:
                        "application/json",
                    "User-Agent":
                        "DailyNewsReport/1.0",
                },
            }
        );

    if (!response.ok) {
        throw new Error(
            `加拿大央行接口请求失败：HTTP ${response.status}`
        );
    }

    const responseData =
        await response.json();

    const observations =
        parseBocObservations(
            responseData
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

    await saveBocRate({
        currentValue,
        previousValue,
        effectiveDate,
        direction,
    });

    console.log(
        `已从加拿大央行读取 ${observations.length} 条记录`
    );

    console.log(
        "加拿大央行官方利率更新成功"
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
        direction,
        source:
            "Bank of Canada",
    });
}

updateBocRate()
    .catch(function (error) {
        console.error(
            "更新加拿大央行利率失败：",
            error.message
        );

        process.exitCode = 1;
    })
    .finally(function () {
        db.close();
    });