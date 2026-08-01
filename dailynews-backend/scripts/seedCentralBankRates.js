const db = require("../db");

const demoRates = [
    {
        bank_code: "FED",
        country_code: "US",
        country_name: "美国",
        bank_name: "美联储",
        rate_code: "FED_FUNDS_TARGET",
        rate_name: "联邦基金目标利率",
        current_value: null,
        current_low: 4.25,
        current_high: 4.5,
        previous_value: null,
        previous_low: 4.5,
        previous_high: 4.75,
        forecast_value: null,
        forecast_low: 4.25,
        forecast_high: 4.5,
        actual_value: null,
        actual_low: 4.25,
        actual_high: 4.5,
        direction: "down",
        sort_order: 1,
    },
    {
        bank_code: "ECB",
        country_code: "EU",
        country_name: "欧元区",
        bank_name: "欧洲央行",
        rate_code: "ECB_DEPOSIT_RATE",
        rate_name: "存款便利利率",
        current_value: 2.0,
        previous_value: 2.25,
        forecast_value: 2.0,
        actual_value: 2.0,
        direction: "down",
        sort_order: 2,
    },
    {
        bank_code: "BOE",
        country_code: "GB",
        country_name: "英国",
        bank_name: "英国央行",
        rate_code: "BOE_BANK_RATE",
        rate_name: "银行利率",
        current_value: 4.25,
        previous_value: 4.5,
        forecast_value: 4.25,
        actual_value: 4.25,
        direction: "down",
        sort_order: 3,
    },
    {
        bank_code: "BOJ",
        country_code: "JP",
        country_name: "日本",
        bank_name: "日本央行",
        rate_code: "BOJ_POLICY_RATE",
        rate_name: "政策利率",
        current_value: 0.5,
        previous_value: 0.25,
        forecast_value: 0.5,
        actual_value: 0.5,
        direction: "up",
        sort_order: 4,
    },
    {
        bank_code: "PBOC",
        country_code: "CN",
        country_name: "中国",
        bank_name: "中国人民银行",
        rate_code: "PBOC_LPR_1Y",
        rate_name: "一年期LPR",
        current_value: 3.1,
        previous_value: 3.1,
        forecast_value: 3.1,
        actual_value: 3.1,
        direction: "unchanged",
        sort_order: 5,
    },
    {
        bank_code: "RBA",
        country_code: "AU",
        country_name: "澳大利亚",
        bank_name: "澳洲联储",
        rate_code: "RBA_CASH_RATE",
        rate_name: "现金利率",
        current_value: 3.85,
        previous_value: 4.1,
        forecast_value: 3.85,
        actual_value: 3.85,
        direction: "down",
        sort_order: 6,
    },
    {
        bank_code: "BOC",
        country_code: "CA",
        country_name: "加拿大",
        bank_name: "加拿大央行",
        rate_code: "BOC_POLICY_RATE",
        rate_name: "隔夜目标利率",
        current_value: 2.75,
        previous_value: 3.0,
        forecast_value: 2.75,
        actual_value: 2.75,
        direction: "down",
        sort_order: 7,
    },
    {
        bank_code: "BNM",
        country_code: "MY",
        country_name: "马来西亚",
        bank_name: "马来西亚国家银行",
        rate_code: "BNM_OPR",
        rate_name: "隔夜政策利率",
        current_value: 3.0,
        previous_value: 3.0,
        forecast_value: 3.0,
        actual_value: 3.0,
        direction: "unchanged",
        sort_order: 8,
    },
];

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
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?, ?,
    ?, ?,
    ?, ?,
    ?, ?,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT(bank_code)
  DO UPDATE SET
    country_code = excluded.country_code,
    country_name = excluded.country_name,
    bank_name = excluded.bank_name,
    rate_code = excluded.rate_code,
    rate_name = excluded.rate_name,

    current_value = excluded.current_value,
    current_low = excluded.current_low,
    current_high = excluded.current_high,

    previous_value = excluded.previous_value,
    previous_low = excluded.previous_low,
    previous_high = excluded.previous_high,

    forecast_value = excluded.forecast_value,
    forecast_low = excluded.forecast_low,
    forecast_high = excluded.forecast_high,

    actual_value = excluded.actual_value,
    actual_low = excluded.actual_low,
    actual_high = excluded.actual_high,

    unit = excluded.unit,
    direction = excluded.direction,
    status = excluded.status,

    official_source_name = excluded.official_source_name,
    official_source_url = excluded.official_source_url,

    forecast_source_name = excluded.forecast_source_name,
    forecast_source_url = excluded.forecast_source_url,

    is_active = excluded.is_active,
    sort_order = excluded.sort_order,
    last_checked_at = CURRENT_TIMESTAMP,
    updated_at = CURRENT_TIMESTAMP
`;

db.serialize(() => {
    const statement = db.prepare(sql);

    demoRates.forEach((item) => {
        statement.run(
            item.bank_code,
            item.country_code,
            item.country_name,
            item.bank_name,
            item.rate_code,
            item.rate_name,

            item.current_value ?? null,
            item.current_low ?? null,
            item.current_high ?? null,

            item.previous_value ?? null,
            item.previous_low ?? null,
            item.previous_high ?? null,

            item.forecast_value ?? null,
            item.forecast_low ?? null,
            item.forecast_high ?? null,

            item.actual_value ?? null,
            item.actual_low ?? null,
            item.actual_high ?? null,

            "%",
            item.direction,
            "demo",

            "演示数据，待接入央行官方来源",
            "",

            "演示预测，待接入授权数据源",
            "",

            1,
            item.sort_order,
            (runError) => {
                if (runError) {
                    console.error(
                        `写入 ${item.bank_code} 失败：`,
                        runError.message
                    );

                    return;
                }

                console.log(
                    `已写入央行演示数据：${item.bank_code} ${item.bank_name}`
                );
            }
        );
    });

    statement.finalize((finalizeError) => {
        if (finalizeError) {
            console.error(
                "结束央行数据写入失败：",
                finalizeError.message
            );

            db.close();

            return;
        }

        db.all(
            `
        SELECT
          bank_code,
          country_name,
          bank_name,
          current_value,
          current_low,
          current_high,
          previous_value,
          forecast_value,
          actual_value,
          direction,
          status,
          sort_order
        FROM central_bank_rates
        ORDER BY sort_order ASC
      `,
            [],
            (queryError, rows) => {
                if (queryError) {
                    console.error(
                        "读取央行演示数据失败：",
                        queryError.message
                    );
                } else {
                    console.table(rows);
                }

                db.close();
            }
        );
    });
});