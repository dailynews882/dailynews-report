const db = require("../db");

const DEFAULT_DAILY_REQUEST_LIMIT = 950;

function dbGet(sql, parameters = []) {
    return new Promise(function (
        resolve,
        reject
    ) {
        db.get(
            sql,
            parameters,
            function handleResult(error, row) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(row || null);
            }
        );
    });
}

function dbRun(sql, parameters = []) {
    return new Promise(function (
        resolve,
        reject
    ) {
        db.run(
            sql,
            parameters,
            function handleResult(error) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve({
                    id: this.lastID,
                    changes: this.changes,
                });
            }
        );
    });
}

function getUtcUsageDate() {
    return new Date()
        .toISOString()
        .slice(0, 10);
}

function normalizeDailyLimit(value) {
    const parsedValue = Number.parseInt(
        value,
        10
    );

    if (
        !Number.isInteger(parsedValue) ||
        parsedValue <= 0
    ) {
        return DEFAULT_DAILY_REQUEST_LIMIT;
    }

    return parsedValue;
}

async function getGNewsApiUsage(
    usageDate = getUtcUsageDate()
) {
    const row = await dbGet(
        `
      SELECT
        id,
        usage_date,
        request_count,
        success_count,
        failed_count,
        last_status_code,
        last_error,
        first_requested_at,
        last_requested_at,
        created_at,
        updated_at
      FROM gnews_api_usage
      WHERE usage_date = ?
      LIMIT 1
    `,
        [usageDate]
    );

    if (row) {
        return row;
    }

    return {
        id: null,
        usage_date: usageDate,
        request_count: 0,
        success_count: 0,
        failed_count: 0,
        last_status_code: null,
        last_error: null,
        first_requested_at: null,
        last_requested_at: null,
        created_at: null,
        updated_at: null,
    };
}

async function reserveGNewsApiRequest({
    usageDate = getUtcUsageDate(),
    dailyLimit =
    DEFAULT_DAILY_REQUEST_LIMIT,
} = {}) {
    const normalizedLimit =
        normalizeDailyLimit(dailyLimit);

    await dbRun(
        `
      INSERT INTO gnews_api_usage (
        usage_date,
        request_count,
        success_count,
        failed_count,
        first_requested_at,
        last_requested_at,
        created_at,
        updated_at
      )
      VALUES (
        ?,
        0,
        0,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT(usage_date)
      DO NOTHING
    `,
        [usageDate]
    );

    const updateResult = await dbRun(
        `
      UPDATE gnews_api_usage
      SET
        request_count =
          request_count + 1,
        first_requested_at =
          COALESCE(
            first_requested_at,
            CURRENT_TIMESTAMP
          ),
        last_requested_at =
          CURRENT_TIMESTAMP,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE usage_date = ?
        AND request_count < ?
    `,
        [
            usageDate,
            normalizedLimit,
        ]
    );

    if (updateResult.changes !== 1) {
        const usage =
            await getGNewsApiUsage(
                usageDate
            );

        const limitError = new Error(
            `GNews API daily request limit reached: ` +
            `${usage.request_count}/${normalizedLimit}`
        );

        limitError.name =
            "GNewsApiQuotaError";

        limitError.statusCode = 429;
        limitError.usage = usage;
        limitError.dailyLimit =
            normalizedLimit;

        throw limitError;
    }

    const usage =
        await getGNewsApiUsage(
            usageDate
        );

    return {
        reserved: true,
        usageDate,
        dailyLimit:
            normalizedLimit,
        usage,
        remaining:
            Math.max(
                normalizedLimit -
                usage.request_count,
                0
            ),
    };
}

async function markGNewsApiRequestSuccess({
    usageDate = getUtcUsageDate(),
    statusCode = 200,
} = {}) {
    await dbRun(
        `
      UPDATE gnews_api_usage
      SET
        success_count =
          success_count + 1,
        last_status_code = ?,
        last_error = NULL,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE usage_date = ?
    `,
        [
            Number.parseInt(
                statusCode,
                10
            ) || 200,
            usageDate,
        ]
    );

    return getGNewsApiUsage(
        usageDate
    );
}

async function markGNewsApiRequestFailed({
    usageDate = getUtcUsageDate(),
    statusCode = null,
    errorMessage = null,
} = {}) {
    await dbRun(
        `
      UPDATE gnews_api_usage
      SET
        failed_count =
          failed_count + 1,
        last_status_code = ?,
        last_error = ?,
        updated_at =
          CURRENT_TIMESTAMP
      WHERE usage_date = ?
    `,
        [
            Number.isInteger(
                Number.parseInt(
                    statusCode,
                    10
                )
            )
                ? Number.parseInt(
                    statusCode,
                    10
                )
                : null,

            errorMessage
                ? String(errorMessage)
                    .trim()
                    .slice(0, 500)
                : null,

            usageDate,
        ]
    );

    return getGNewsApiUsage(
        usageDate
    );
}

module.exports = {
    DEFAULT_DAILY_REQUEST_LIMIT,
    getUtcUsageDate,
    getGNewsApiUsage,
    reserveGNewsApiRequest,
    markGNewsApiRequestSuccess,
    markGNewsApiRequestFailed,
};