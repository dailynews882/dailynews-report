const {
    readGNewsAutoFetchConfig,
} = require("./gnewsAutoFetchConfigService");

const {
    runGNewsAutoFetch,
    getAutoFetchLockStatus,
} = require("./gnewsAutoFetchRunner");

const DISABLED_CONFIG_RECHECK_MS =
    60 * 1000;

let schedulerStarted = false;
let schedulerTimer = null;
let nextRunAt = null;
let lastRunAt = null;
let lastResult = null;
let lastError = null;

function clearSchedulerTimer() {
    if (schedulerTimer) {
        clearTimeout(schedulerTimer);
        schedulerTimer = null;
    }

    nextRunAt = null;
}

function getIntervalMilliseconds(
    intervalMinutes
) {
    const parsedMinutes = Number.parseInt(
        intervalMinutes,
        10
    );

    if (
        !Number.isInteger(parsedMinutes) ||
        parsedMinutes <= 0
    ) {
        return 15 * 60 * 1000;
    }

    return parsedMinutes * 60 * 1000;
}

function getGNewsAutoFetchSchedulerStatus() {
    return {
        started: schedulerStarted,
        timerActive: Boolean(
            schedulerTimer
        ),
        runnerLocked:
            getAutoFetchLockStatus(),
        nextRunAt,
        lastRunAt,
        lastResult,
        lastError,
    };
}

function scheduleTimer(
    delayMilliseconds
) {
    clearSchedulerTimer();

    if (!schedulerStarted) {
        return;
    }

    const safeDelay = Math.max(
        Number(delayMilliseconds) || 0,
        0
    );

    nextRunAt = new Date(
        Date.now() + safeDelay
    ).toISOString();

    schedulerTimer = setTimeout(
        handleScheduledRun,
        safeDelay
    );

    /*
     * 调度器不会单独阻止测试脚本退出。
     * 在正式服务器中，Express 本身会保持进程运行。
     */
    if (
        typeof schedulerTimer.unref ===
        "function"
    ) {
        schedulerTimer.unref();
    }
}

async function scheduleFromCurrentConfig({
    runImmediately = false,
} = {}) {
    if (!schedulerStarted) {
        return getGNewsAutoFetchSchedulerStatus();
    }

    clearSchedulerTimer();

    try {
        const config =
            await readGNewsAutoFetchConfig();

        lastError = null;

        if (!config.enabled) {
            scheduleTimer(
                DISABLED_CONFIG_RECHECK_MS
            );

            return {
                ...getGNewsAutoFetchSchedulerStatus(),
                config,
                reason: "disabled",
                message:
                    "GNews 自动抓取已关闭，调度器等待下次检查",
            };
        }

        const delayMilliseconds =
            runImmediately
                ? 0
                : getIntervalMilliseconds(
                    config.intervalMinutes
                );

        scheduleTimer(delayMilliseconds);

        return {
            ...getGNewsAutoFetchSchedulerStatus(),
            config,
            reason: runImmediately
                ? "immediate_run_scheduled"
                : "next_run_scheduled",
            message: runImmediately
                ? "GNews 自动抓取已安排立即执行"
                : "GNews 下一次自动抓取已安排",
        };
    } catch (error) {
        lastError =
            error?.message ||
            "读取 GNews 自动抓取配置失败";

        console.error(
            "Schedule GNews automatic fetch error:",
            error
        );

        scheduleTimer(
            DISABLED_CONFIG_RECHECK_MS
        );

        return {
            ...getGNewsAutoFetchSchedulerStatus(),
            reason: "config_error",
            message: lastError,
        };
    }
}

async function handleScheduledRun() {
    schedulerTimer = null;
    nextRunAt = null;

    if (!schedulerStarted) {
        return;
    }

    try {
        const config =
            await readGNewsAutoFetchConfig();

        if (!config.enabled) {
            lastResult = {
                success: true,
                skipped: true,
                reason: "disabled",
                message:
                    "GNews 自动抓取当前已关闭",
            };

            lastError = null;

            await scheduleFromCurrentConfig();
            return;
        }

        lastRunAt =
            new Date().toISOString();

        const result =
            await runGNewsAutoFetch();

        lastResult = result;
        lastError = result.success
            ? null
            : result.message ||
            "GNews 自动抓取运行失败";
    } catch (error) {
        lastError =
            error?.message ||
            "GNews 自动抓取调度失败";

        lastResult = {
            success: false,
            skipped: false,
            message: lastError,
        };

        console.error(
            "Scheduled GNews automatic fetch error:",
            error
        );
    } finally {
        if (schedulerStarted) {
            await scheduleFromCurrentConfig();
        }
    }
}

async function startGNewsAutoFetchScheduler({
    runImmediately = false,
} = {}) {
    if (schedulerStarted) {
        return {
            ...getGNewsAutoFetchSchedulerStatus(),
            reason: "already_started",
            message:
                "GNews 自动抓取调度器已经启动",
        };
    }

    schedulerStarted = true;

    const result =
        await scheduleFromCurrentConfig({
            runImmediately,
        });

    console.log(
        "[GNews Scheduler] Started",
        {
            reason: result.reason,
            nextRunAt: result.nextRunAt,
        }
    );

    return result;
}

function stopGNewsAutoFetchScheduler() {
    clearSchedulerTimer();
    schedulerStarted = false;

    console.log(
        "[GNews Scheduler] Stopped"
    );

    return getGNewsAutoFetchSchedulerStatus();
}

async function reloadGNewsAutoFetchScheduler({
    runImmediately = false,
} = {}) {
    if (!schedulerStarted) {
        return {
            ...getGNewsAutoFetchSchedulerStatus(),
            reason: "not_started",
            message:
                "GNews 自动抓取调度器尚未启动",
        };
    }

    const result =
        await scheduleFromCurrentConfig({
            runImmediately,
        });

    console.log(
        "[GNews Scheduler] Reloaded",
        {
            reason: result.reason,
            nextRunAt: result.nextRunAt,
        }
    );

    return result;
}

module.exports = {
    startGNewsAutoFetchScheduler,
    stopGNewsAutoFetchScheduler,
    reloadGNewsAutoFetchScheduler,
    getGNewsAutoFetchSchedulerStatus,
};