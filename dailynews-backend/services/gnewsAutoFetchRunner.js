const {
    importGNews,
} = require("./gnewsService");

const {
    readGNewsAutoFetchConfig,
} = require("./gnewsAutoFetchConfigService");

const {
    createGNewsFetchLog,
    finishGNewsFetchLog,
    markGNewsFetchLogFailed,
} = require("./gnewsFetchLogService");

let isAutoFetchRunning = false;

function getAutoFetchLockStatus() {
    return isAutoFetchRunning;
}

async function runGNewsAutoFetch({
    force = false,
} = {}) {
    if (isAutoFetchRunning) {
        return {
            success: false,
            skipped: true,
            reason: "already_running",
            message:
                "上一轮 GNews 自动抓取尚未结束",
        };
    }

    isAutoFetchRunning = true;

    let fetchLogId = null;

    try {
        const config =
            await readGNewsAutoFetchConfig();

        if (!config.enabled && !force) {
            return {
                success: true,
                skipped: true,
                reason: "disabled",
                message:
                    "GNews 自动抓取当前已关闭",
                config,
            };
        }

        const requestInput = {
            category: config.category,
            lang: config.language,
            country: config.country,
            max: config.max,
            status: config.status,
        };

        try {
            const fetchLog =
                await createGNewsFetchLog({
                    triggerType: "automatic",
                    requestParams: requestInput,
                });

            fetchLogId = fetchLog.id;
        } catch (logError) {
            console.error(
                "Create automatic GNews fetch log error:",
                logError
            );
        }

        const result =
            await importGNews(requestInput);

        const runStatus =
            result.failedCount > 0
                ? "partial"
                : "success";

        if (fetchLogId) {
            try {
                await finishGNewsFetchLog(
                    fetchLogId,
                    {
                        runStatus,
                        receivedCount:
                            result.receivedCount,
                        importedCount:
                            result.importedCount,
                        skippedCount:
                            result.skippedCount,
                        failedCount:
                            result.failedCount,
                    }
                );
            } catch (logError) {
                console.error(
                    "Finish automatic GNews fetch log error:",
                    logError
                );
            }
        }

        return {
            success: true,
            skipped: false,
            runStatus,
            config,
            receivedCount:
                result.receivedCount,
            importedCount:
                result.importedCount,
            skippedCount:
                result.skippedCount,
            failedCount:
                result.failedCount,
        };
    } catch (error) {
        console.error(
            "Run GNews automatic fetch error:",
            error
        );

        if (fetchLogId) {
            try {
                await markGNewsFetchLogFailed(
                    fetchLogId,
                    error
                );
            } catch (logError) {
                console.error(
                    "Fail automatic GNews fetch log error:",
                    logError
                );
            }
        }

        return {
            success: false,
            skipped: false,
            message:
                error?.message ||
                "GNews 自动抓取失败",
        };
    } finally {
        isAutoFetchRunning = false;
    }
}

module.exports = {
    runGNewsAutoFetch,
    getAutoFetchLockStatus,
};