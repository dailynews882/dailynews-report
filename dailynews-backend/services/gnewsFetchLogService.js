const db = require("../db");

const ALLOWED_TRIGGER_TYPES = new Set([
    "manual",
    "automatic",
]);

const ALLOWED_RUN_STATUSES = new Set([
    "running",
    "success",
    "partial",
    "failed",
    "skipped",
]);

function dbRun(sql, parameters = []) {
    return new Promise(function (resolve, reject) {
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

function dbGet(sql, parameters = []) {
    return new Promise(function (resolve, reject) {
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

function normalizeTriggerType(value) {
    const normalizedValue = String(
        value || "automatic"
    )
        .trim()
        .toLowerCase();

    return ALLOWED_TRIGGER_TYPES.has(
        normalizedValue
    )
        ? normalizedValue
        : "automatic";
}

function normalizeRunStatus(value) {
    const normalizedValue = String(
        value || "running"
    )
        .trim()
        .toLowerCase();

    return ALLOWED_RUN_STATUSES.has(
        normalizedValue
    )
        ? normalizedValue
        : "failed";
}

function normalizeCount(value) {
    const parsedValue = Number.parseInt(
        value,
        10
    );

    if (
        !Number.isInteger(parsedValue) ||
        parsedValue < 0
    ) {
        return 0;
    }

    return parsedValue;
}

function normalizeStatistics({
    receivedCount = 0,
    importedCount = 0,
    skippedCount = 0,
    failedCount = 0,
} = {}) {
    const normalizedStatistics = {
        receivedCount:
            normalizeCount(receivedCount),

        importedCount:
            normalizeCount(importedCount),

        skippedCount:
            normalizeCount(skippedCount),

        failedCount:
            normalizeCount(failedCount),
    };

    const processedCount =
        normalizedStatistics.importedCount +
        normalizedStatistics.skippedCount +
        normalizedStatistics.failedCount;

    if (
        processedCount >
        normalizedStatistics.receivedCount
    ) {
        throw new Error(
            "GNews fetch statistics are inconsistent: " +
            "imported, skipped and failed counts cannot " +
            "exceed received count"
        );
    }

    return normalizedStatistics;
}

function normalizeErrorMessage(value) {
    if (!value) {
        return null;
    }

    return String(value)
        .trim()
        .slice(0, 2000);
}

function serializeRequestParams(value) {
    if (!value) {
        return null;
    }

    try {
        return JSON.stringify(value);
    } catch (error) {
        return JSON.stringify({
            serializationError:
                "Unable to serialize request parameters",
        });
    }
}

async function createGNewsFetchLog({
    triggerType = "automatic",
    requestParams = null,
} = {}) {
    const result = await dbRun(
        `
      INSERT INTO gnews_fetch_logs (
        trigger_type,
        run_status,
        request_params,
        received_count,
        imported_count,
        skipped_count,
        failed_count,
        started_at,
        created_at
      )
      VALUES (
        ?,
        'running',
        ?,
        0,
        0,
        0,
        0,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `,
        [
            normalizeTriggerType(triggerType),
            serializeRequestParams(requestParams),
        ]
    );

    return {
        id: result.id,
        triggerType:
            normalizeTriggerType(triggerType),
        runStatus: "running",
    };
}

async function finishGNewsFetchLog(
    logId,
    {
        runStatus = "success",
        receivedCount = 0,
        importedCount = 0,
        skippedCount = 0,
        failedCount = 0,
        errorMessage = null,
    } = {}
) {
    const parsedLogId = Number.parseInt(
        logId,
        10
    );

    if (
        !Number.isInteger(parsedLogId) ||
        parsedLogId <= 0
    ) {
        throw new Error(
            "Invalid GNews fetch log ID"
        );
    }

    const statistics = normalizeStatistics({
        receivedCount,
        importedCount,
        skippedCount,
        failedCount,
    });

    const result = await dbRun(
        `
      UPDATE gnews_fetch_logs
      SET
        run_status = ?,
        received_count = ?,
        imported_count = ?,
        skipped_count = ?,
        failed_count = ?,
        error_message = ?,
        finished_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
        [
            normalizeRunStatus(runStatus),
            statistics.receivedCount,
            statistics.importedCount,
            statistics.skippedCount,
            statistics.failedCount,
            normalizeErrorMessage(errorMessage),
            parsedLogId,
        ]
    );

    if (!result.changes) {
        throw new Error(
            "GNews fetch log not found"
        );
    }

    return getGNewsFetchLogById(
        parsedLogId
    );
}

async function markGNewsFetchLogFailed(
    logId,
    error,
    statistics = {}
) {
    return finishGNewsFetchLog(logId, {
        runStatus: "failed",
        receivedCount:
            statistics.receivedCount,
        importedCount:
            statistics.importedCount,
        skippedCount:
            statistics.skippedCount,
        failedCount:
            statistics.failedCount,
        errorMessage:
            error?.message ||
            error ||
            "Unknown GNews fetch error",
    });
}

async function getGNewsFetchLogById(logId) {
    const parsedLogId = Number.parseInt(
        logId,
        10
    );

    if (
        !Number.isInteger(parsedLogId) ||
        parsedLogId <= 0
    ) {
        return null;
    }

    return dbGet(
        `
      SELECT
        id,
        trigger_type,
        run_status,
        request_params,
        received_count,
        imported_count,
        skipped_count,
        failed_count,
        error_message,
        started_at,
        finished_at,
        created_at
      FROM gnews_fetch_logs
      WHERE id = ?
      LIMIT 1
    `,
        [parsedLogId]
    );
}

module.exports = {
    createGNewsFetchLog,
    finishGNewsFetchLog,
    markGNewsFetchLogFailed,
    getGNewsFetchLogById,
};