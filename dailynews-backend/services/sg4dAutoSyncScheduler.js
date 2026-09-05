const {
    syncLatestSingapore4dDraw
} = require(
    "./sg4dSyncService"
);


/*
 * ==========================================
 * Singapore 4D 自动同步调度器
 * ==========================================
 *
 * 开奖日：
 * Wednesday / Saturday / Sunday
 *
 * 自动检查窗口：
 * 19:00 - 22:00
 * Singapore Time
 *
 * 实际抓取时间：
 * 19:00
 * 19:15
 * 19:30
 * ...
 * 22:00
 *
 * 说明：
 * 1. 服务器启动时先执行一次最新期补漏检查。
 * 2. 开奖日19:00开始检查 Singapore Pools。
 * 3. 每15分钟检查一次。
 * 4. 只有完整23个中奖号码才会写入数据库。
 * 5. 当天完整同步成功后，当天停止继续访问官网。
 * 6. 到22:00仍未成功，则结束当天自动检查。
 * 7. 后台手动同步功能继续保留。
 */


const SINGAPORE_TIME_ZONE =
    "Asia/Singapore";

const CHECK_INTERVAL_MINUTES =
    15;

/*
 * 调度器本身每60秒检查一次当前时钟，
 * 只有分钟正好为 00 / 15 / 30 / 45 时
 * 才真正访问 Singapore Pools。
 *
 * 这样不会因为服务器启动时间不同而产生时间漂移。
 */
const HEARTBEAT_INTERVAL_MS =
    60 * 1000;

const START_HOUR =
    19;

const START_MINUTE =
    0;

const END_HOUR =
    22;

const END_MINUTE =
    0;

const DRAW_WEEKDAYS =
    new Set([
        "Wed",
        "Sat",
        "Sun"
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
 * 防止同一分钟重复执行。
 *
 * 例如：
 * 2026-09-05 19:15
 */
let lastScheduledSlot =
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
        (part) => {
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
 * 是否为 Singapore 4D 开奖日
 * ==========================================
 */

function isSingapore4dDrawDay(
    singaporeNow
) {
    return DRAW_WEEKDAYS.has(
        singaporeNow.weekday
    );
}


/*
 * ==========================================
 * 是否处于自动同步时间窗口
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
 * 当前时间是否为15分钟抓取节点
 * ==========================================
 */

function isScheduledMinute(
    singaporeNow
) {
    return (
        singaporeNow.minute %
        CHECK_INTERVAL_MINUTES ===
        0
    );
}


/*
 * ==========================================
 * 今天是否已经完成
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
 * 跨日后重置状态
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

    if (
        lastScheduledSlot &&
        !lastScheduledSlot.startsWith(
            singaporeNow.date
        )
    ) {
        lastScheduledSlot =
            null;
    }
}


/*
 * ==========================================
 * 执行一次最新4D同步
 * ==========================================
 */

async function runSingapore4dAutoSync(
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

    if (isSyncRunning) {
        return {
            success: false,
            skipped: true,
            reason:
                "sync_already_running",
            message:
                "Singapore 4D 同步正在执行中"
        };
    }

    if (!force) {
        if (
            !isSingapore4dDrawDay(
                singaporeNow
            )
        ) {
            return {
                success: true,
                skipped: true,
                reason:
                    "not_draw_day",
                message:
                    "今天不是 Singapore 4D 开奖日"
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
                    "当前不在 Singapore 4D 自动同步时间窗口"
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
            "[Singapore 4D Scheduler] 开始同步"
        );

        console.log(
            `[Singapore 4D Scheduler] 原因：${reason}`
        );

        console.log(
            "[Singapore 4D Scheduler] 新加坡时间：" +
            `${singaporeNow.date} ${singaporeNow.time}`
        );

        const result =
            await syncLatestSingapore4dDraw();

        lastResult =
            result;

        /*
         * 只有：
         *
         * 1. 官方开奖结果日期就是今天
         * 2. 23个中奖号码结构完整
         *
         * 才标记当天自动同步完成。
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
                "[Singapore 4D Scheduler] " +
                `今日 Draw ${completedDrawNumber} ` +
                "23个中奖号码已完整同步"
            );
        } else if (result) {
            console.log(
                "[Singapore 4D Scheduler] " +
                `官网当前最新 Draw ${result.official_draw_number}，` +
                `开奖日期 ${result.draw_date}，` +
                "尚未发现今天完整的新期开奖"
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
    } catch (error) {
        lastError =
            error.message ||
            String(error);

        console.error(
            "[Singapore 4D Scheduler] 自动同步失败：",
            error
        );

        /*
         * 注意：
         * 不完整开奖结果也会进入这里。
         *
         * 不把当天标记为完成，
         * 下一次15分钟节点会自动继续尝试。
         */

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
 * Scheduler Heartbeat
 * ==========================================
 */

async function schedulerTick() {
    try {
        const singaporeNow =
            getSingaporeDateTime();

        resetCompletedStateIfNeeded(
            singaporeNow
        );

        if (
            !isSingapore4dDrawDay(
                singaporeNow
            )
        ) {
            return;
        }

        if (
            !isInsideSyncWindow(
                singaporeNow
            )
        ) {
            return;
        }

        if (
            isTodayCompleted(
                singaporeNow
            )
        ) {
            return;
        }

        if (
            !isScheduledMinute(
                singaporeNow
            )
        ) {
            return;
        }

        const scheduledSlot =
            `${singaporeNow.date} ` +
            `${String(
                singaporeNow.hour
            ).padStart(
                2,
                "0"
            )}:` +
            `${String(
                singaporeNow.minute
            ).padStart(
                2,
                "0"
            )}`;

        /*
         * Heartbeat每60秒运行一次，
         * 防止同一15分钟节点被重复执行。
         */
        if (
            lastScheduledSlot ===
            scheduledSlot
        ) {
            return;
        }

        lastScheduledSlot =
            scheduledSlot;

        const result =
            await runSingapore4dAutoSync({
                force: false,
                reason:
                    "scheduled_check"
            });

        if (
            result &&
            !result.skipped
        ) {
            console.log(
                "[Singapore 4D Scheduler] 本次自动检查完成"
            );
        }
    } catch (error) {
        console.error(
            "[Singapore 4D Scheduler] Tick error:",
            error
        );
    }
}


/*
 * ==========================================
 * 启动自动同步调度器
 * ==========================================
 */

function startSingapore4dAutoSyncScheduler() {
    if (schedulerTimer) {
        return {
            success: true,
            started: false,
            message:
                "Singapore 4D 自动同步调度器已经运行"
        };
    }

    console.log(
        "[Singapore 4D Scheduler] 自动同步调度器启动"
    );

    console.log(
        "[Singapore 4D Scheduler] 开奖日：Wednesday / Saturday / Sunday"
    );

    console.log(
        "[Singapore 4D Scheduler] 自动检查窗口：19:00 - 22:00 Singapore Time"
    );

    console.log(
        "[Singapore 4D Scheduler] 抓取时间：每15分钟一次"
    );

    /*
     * 服务器启动后延迟8秒执行一次补漏。
     *
     * force=true：
     * 即使服务器不是在开奖时间启动，
     * 仍然检查一次官网当前最新期。
     *
     * 数据库同步本身具备幂等处理，
     * 已存在Draw不会重复新增。
     */
    setTimeout(
        () => {
            runSingapore4dAutoSync({
                force: true,
                reason:
                    "server_startup_catchup"
            }).catch(
                (error) => {
                    console.error(
                        "[Singapore 4D Scheduler] Startup catch-up error:",
                        error
                    );
                }
            );
        },
        8000
    );

    /*
     * 每60秒检查一次时钟，
     * 真正访问官网仍然只会发生在：
     *
     * 19:00 / 19:15 / 19:30 ...
     */
    schedulerTimer =
        setInterval(
            schedulerTick,
            HEARTBEAT_INTERVAL_MS
        );

    return {
        success: true,
        started: true,
        message:
            "Singapore 4D 自动同步调度器启动成功"
    };
}


/*
 * ==========================================
 * 停止自动同步调度器
 * ==========================================
 */

function stopSingapore4dAutoSyncScheduler() {
    if (!schedulerTimer) {
        return {
            success: true,
            stopped: false,
            message:
                "Singapore 4D 自动同步调度器当前未运行"
        };
    }

    clearInterval(
        schedulerTimer
    );

    schedulerTimer =
        null;

    console.log(
        "[Singapore 4D Scheduler] 自动同步调度器已停止"
    );

    return {
        success: true,
        stopped: true,
        message:
            "Singapore 4D 自动同步调度器已停止"
    };
}


/*
 * ==========================================
 * 获取自动同步状态
 * ==========================================
 */

function getSingapore4dAutoSyncSchedulerStatus() {
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
            isSingapore4dDrawDay(
                singaporeNow
            ),

        inside_sync_window:
            isInsideSyncWindow(
                singaporeNow
            ),

        scheduled_minute:
            isScheduledMinute(
                singaporeNow
            ),

        check_interval_minutes:
            CHECK_INTERVAL_MINUTES,

        sync_window:
            "19:00-22:00",

        draw_weekdays: [
            "Wed",
            "Sat",
            "Sun"
        ],

        completed_date:
            completedSingaporeDate,

        completed_draw_number:
            completedDrawNumber,

        last_scheduled_slot:
            lastScheduledSlot,

        last_run_at:
            lastRunAt,

        last_result:
            lastResult,

        last_error:
            lastError
    };
}


module.exports = {
    startSingapore4dAutoSyncScheduler,
    stopSingapore4dAutoSyncScheduler,
    getSingapore4dAutoSyncSchedulerStatus,
    runSingapore4dAutoSync
};