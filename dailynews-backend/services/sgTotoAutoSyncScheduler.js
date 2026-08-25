const {
    syncLatestSingaporeTotoDraw
} = require(
    "./sgTotoSyncService"
);

/*
 * ==========================================
 * Singapore TOTO 自动同步调度器
 * ==========================================
 *
 * 开奖日：
 * Monday / Thursday
 *
 * 自动检查时间：
 * 18:30 - 23:30
 * Singapore Time
 *
 * 检查间隔：
 * 每 10 分钟
 *
 * 说明：
 * 1. 服务器启动时先检查一次最新期开奖。
 * 2. 开奖日晚上自动检查 Singapore Pools。
 * 3. 如果发现新一期，自动写入数据库。
 * 4. 如果奖金数据暂未完整，继续检查。
 * 5. 当天最新期开奖及奖金全部完整后，
 *    当天不再重复访问官网。
 */

const SINGAPORE_TIME_ZONE =
    "Asia/Singapore";

const CHECK_INTERVAL_MS =
    10 * 60 * 1000;

const START_HOUR =
    18;

const START_MINUTE =
    30;

const END_HOUR =
    23;

const END_MINUTE =
    30;

const DRAW_WEEKDAYS =
    new Set([
        "Mon",
        "Thu"
    ]);

let schedulerTimer =
    null;

let isSyncRunning =
    false;

let lastRunAt =
    null;

let lastResult =
    null;

let lastError =
    null;

let completedSingaporeDate =
    null;

let completedDrawNumber =
    null;


/*
 * ==========================================
 * 获取新加坡当前日期时间
 * ==========================================
 */

function getSingaporeDateTime() {
    const formatter =
        new Intl.DateTimeFormat(
            "en-CA",
            {
                timeZone:
                    SINGAPORE_TIME_ZONE,

                year:
                    "numeric",

                month:
                    "2-digit",

                day:
                    "2-digit",

                weekday:
                    "short",

                hour:
                    "2-digit",

                minute:
                    "2-digit",

                second:
                    "2-digit",

                hourCycle:
                    "h23"
            }
        );

    const parts =
        formatter.formatToParts(
            new Date()
        );

    const values = {};

    parts.forEach(
        part => {
            if (
                part.type !==
                "literal"
            ) {
                values[
                    part.type
                ] = part.value;
            }
        }
    );

    const year =
        values.year;

    const month =
        values.month;

    const day =
        values.day;

    const hour =
        Number(
            values.hour
        );

    const minute =
        Number(
            values.minute
        );

    const second =
        Number(
            values.second
        );

    const weekday =
        values.weekday;

    return {
        year,
        month,
        day,
        hour,
        minute,
        second,
        weekday,

        date:
            `${year}-${month}-${day}`,

        time:
            `${String(hour).padStart(
                2,
                "0"
            )}:${String(
                minute
            ).padStart(
                2,
                "0"
            )}:${String(
                second
            ).padStart(
                2,
                "0"
            )}`
    };
}


/*
 * ==========================================
 * 判断是否是 Singapore TOTO 开奖日
 * ==========================================
 */

function isSingaporeTotoDrawDay(
    singaporeNow
) {
    return DRAW_WEEKDAYS.has(
        singaporeNow.weekday
    );
}


/*
 * ==========================================
 * 判断是否处于自动检查时间窗口
 * ==========================================
 */

function isInsideSyncWindow(
    singaporeNow
) {
    const currentMinutes =
        singaporeNow.hour * 60 +
        singaporeNow.minute;

    const startMinutes =
        START_HOUR * 60 +
        START_MINUTE;

    const endMinutes =
        END_HOUR * 60 +
        END_MINUTE;

    return (
        currentMinutes >=
        startMinutes &&
        currentMinutes <=
        endMinutes
    );
}


/*
 * ==========================================
 * 判断今天是否已经完成
 * ==========================================
 */

function isTodayCompleted(
    singaporeNow
) {
    return (
        completedSingaporeDate ===
        singaporeNow.date &&
        Boolean(
            completedDrawNumber
        )
    );
}


/*
 * ==========================================
 * 重置跨日状态
 * ==========================================
 */

function resetCompletedStateIfNeeded(
    singaporeNow
) {
    if (
        completedSingaporeDate &&
        completedSingaporeDate !==
        singaporeNow.date
    ) {
        completedSingaporeDate =
            null;

        completedDrawNumber =
            null;
    }
}


/*
 * ==========================================
 * 执行一次最新期开奖同步
 * ==========================================
 */

async function runSingaporeTotoAutoSync(
    options = {}
) {
    const {
        force = false,
        reason = "scheduled"
    } = options;

    const singaporeNow =
        getSingaporeDateTime();

    resetCompletedStateIfNeeded(
        singaporeNow
    );

    if (
        isSyncRunning
    ) {
        return {
            success: false,
            skipped: true,
            reason:
                "sync_already_running",
            message:
                "Singapore TOTO 同步正在执行中"
        };
    }

    if (
        !force
    ) {
        if (
            !isSingaporeTotoDrawDay(
                singaporeNow
            )
        ) {
            return {
                success: true,
                skipped: true,
                reason:
                    "not_draw_day",
                message:
                    "今天不是 Singapore TOTO 开奖日"
            };
        }

        if (
            !isInsideSyncWindow(
                singaporeNow
            )
        ) {
            return {
                success: true,
                skipped: true,
                reason:
                    "outside_sync_window",
                message:
                    "当前不在 Singapore TOTO 自动同步时间窗口"
            };
        }

        if (
            isTodayCompleted(
                singaporeNow
            )
        ) {
            return {
                success: true,
                skipped: true,
                reason:
                    "today_completed",
                message:
                    `今日 Draw ${completedDrawNumber} 已完整同步`
            };
        }
    }

    isSyncRunning =
        true;

    lastRunAt =
        new Date().toISOString();

    lastError =
        null;

    try {
        console.log(
            `[Singapore TOTO Scheduler] 开始同步`
        );

        console.log(
            `[Singapore TOTO Scheduler] 原因：${reason}`
        );

        console.log(
            `[Singapore TOTO Scheduler] 新加坡时间：` +
            `${singaporeNow.date} ${singaporeNow.time}`
        );

        const result =
            await syncLatestSingaporeTotoDraw();

        lastResult =
            result;

        /*
         * 只有：
         *
         * 1. 官网开奖日期就是今天
         * 2. 奖金数据已经完整
         *
         * 才标记今天任务完成。
         *
         * 这样开奖日晚上如果官网仍然显示上一期，
         * 调度器不会错误地停止后续检查。
         */

        if (
            result &&
            result.draw_date ===
            singaporeNow.date &&
            result.prize_complete ===
            true
        ) {
            completedSingaporeDate =
                singaporeNow.date;

            completedDrawNumber =
                String(
                    result.official_draw_number ||
                    ""
                );

            console.log(
                `[Singapore TOTO Scheduler] ` +
                `今日 Draw ${completedDrawNumber} ` +
                `开奖及奖金数据已完整`
            );
        } else if (
            result &&
            result.draw_date ===
            singaporeNow.date &&
            result.prize_complete ===
            false
        ) {
            console.log(
                `[Singapore TOTO Scheduler] ` +
                `Draw ${result.official_draw_number} ` +
                `开奖号码已取得，奖金数据暂未完整，` +
                `稍后继续检查`
            );
        } else if (
            result
        ) {
            console.log(
                `[Singapore TOTO Scheduler] ` +
                `官网当前最新 Draw ${result.official_draw_number}，` +
                `开奖日期 ${result.draw_date}，` +
                `尚未发现今天的新期开奖`
            );
        }

        return {
            success: true,
            skipped: false,
            reason,
            singapore_time:
                `${singaporeNow.date} ${singaporeNow.time}`,
            result
        };
    } catch (
    error
    ) {
        lastError =
            error.message ||
            String(error);

        console.error(
            "[Singapore TOTO Scheduler] 自动同步失败：",
            error
        );

        return {
            success: false,
            skipped: false,
            reason,
            singapore_time:
                `${singaporeNow.date} ${singaporeNow.time}`,
            message:
                lastError
        };
    } finally {
        isSyncRunning =
            false;
    }
}


/*
 * ==========================================
 * 定时器每次检查入口
 * ==========================================
 */

async function schedulerTick() {
    try {
        const result =
            await runSingaporeTotoAutoSync({
                force: false,
                reason:
                    "scheduled_check"
            });

        if (
            result &&
            !result.skipped
        ) {
            console.log(
                "[Singapore TOTO Scheduler] 本次自动检查完成"
            );
        }
    } catch (
    error
    ) {
        console.error(
            "[Singapore TOTO Scheduler] Tick error:",
            error
        );
    }
}


/*
 * ==========================================
 * 启动自动同步调度器
 * ==========================================
 */

function startSingaporeTotoAutoSyncScheduler() {
    if (
        schedulerTimer
    ) {
        return {
            success: true,
            started: false,
            message:
                "Singapore TOTO 自动同步调度器已经运行"
        };
    }

    console.log(
        "[Singapore TOTO Scheduler] 自动同步调度器启动"
    );

    console.log(
        "[Singapore TOTO Scheduler] 开奖日：Monday / Thursday"
    );

    console.log(
        "[Singapore TOTO Scheduler] 自动检查窗口：18:30 - 23:30 Singapore Time"
    );

    console.log(
        "[Singapore TOTO Scheduler] 检查间隔：10 分钟"
    );

    /*
     * 服务器启动后延迟 5 秒进行一次补漏检查。
     *
     * force = true
     *
     * 即使不是开奖时间，也检查一次官网最新一期。
     *
     * 这样服务器如果曾经宕机，
     * 重启后能够自动补回遗漏的最新期开奖。
     */

    setTimeout(
        () => {
            runSingaporeTotoAutoSync({
                force: true,
                reason:
                    "server_startup_catchup"
            }).catch(
                error => {
                    console.error(
                        "[Singapore TOTO Scheduler] Startup catch-up error:",
                        error
                    );
                }
            );
        },
        5000
    );

    schedulerTimer =
        setInterval(
            schedulerTick,
            CHECK_INTERVAL_MS
        );

    return {
        success: true,
        started: true,
        message:
            "Singapore TOTO 自动同步调度器启动成功"
    };
}


/*
 * ==========================================
 * 停止自动同步调度器
 * ==========================================
 */

function stopSingaporeTotoAutoSyncScheduler() {
    if (
        !schedulerTimer
    ) {
        return {
            success: true,
            stopped: false,
            message:
                "Singapore TOTO 自动同步调度器当前未运行"
        };
    }

    clearInterval(
        schedulerTimer
    );

    schedulerTimer =
        null;

    console.log(
        "[Singapore TOTO Scheduler] 自动同步调度器已停止"
    );

    return {
        success: true,
        stopped: true,
        message:
            "Singapore TOTO 自动同步调度器已停止"
    };
}


/*
 * ==========================================
 * 获取自动同步状态
 * ==========================================
 */

function getSingaporeTotoAutoSyncSchedulerStatus() {
    const singaporeNow =
        getSingaporeDateTime();

    resetCompletedStateIfNeeded(
        singaporeNow
    );

    return {
        running:
            Boolean(
                schedulerTimer
            ),

        sync_running:
            isSyncRunning,

        singapore_time:
            `${singaporeNow.date} ${singaporeNow.time}`,

        draw_day:
            isSingaporeTotoDrawDay(
                singaporeNow
            ),

        inside_sync_window:
            isInsideSyncWindow(
                singaporeNow
            ),

        check_interval_minutes:
            CHECK_INTERVAL_MS /
            60 /
            1000,

        sync_window:
            "18:30-23:30",

        completed_date:
            completedSingaporeDate,

        completed_draw_number:
            completedDrawNumber,

        last_run_at:
            lastRunAt,

        last_result:
            lastResult,

        last_error:
            lastError
    };
}


module.exports = {
    startSingaporeTotoAutoSyncScheduler,
    stopSingaporeTotoAutoSyncScheduler,
    getSingaporeTotoAutoSyncSchedulerStatus,
    runSingaporeTotoAutoSync
};