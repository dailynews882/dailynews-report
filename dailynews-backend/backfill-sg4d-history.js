const fs = require("fs");
const path = require("path");

const {
    syncSingapore4dDraw
} = require("./services/sg4dSyncService");

/*
 * ==========================================================
 * Singapore 4D 历史开奖批量回填工具 V2
 * ==========================================================
 *
 * 使用方法：
 *
 * node backfill-sg4d-history.js 5530 5480
 *
 * 第一个参数：开始 Draw No.
 * 第二个参数：结束 Draw No.
 *
 * 主要功能：
 *
 * 1. 批量回填历史期开奖
 * 2. 自动断点记录
 * 3. 中断后自动继续
 * 4. 失败期号单独保存
 * 5. 数据质量异常单独保存
 * 6. 单期失败不会中断整个批次
 *
 * 注意：
 *
 * 所有运行记录保存在：
 *
 * backfill-reports/sg4d/
 *
 * 这些属于运行时文件，不需要提交 GitHub。
 */

const REQUEST_DELAY_MS = 1200;

const REPORT_DIR = path.join(
    __dirname,
    "backfill-reports",
    "sg4d"
);

const PROGRESS_FILE = path.join(
    REPORT_DIR,
    "progress.json"
);

const FAILURE_FILE = path.join(
    REPORT_DIR,
    "failures.json"
);

const QUALITY_FILE = path.join(
    REPORT_DIR,
    "quality-warnings.json"
);

function ensureReportDirectory() {
    if (
        !fs.existsSync(REPORT_DIR)
    ) {
        fs.mkdirSync(
            REPORT_DIR,
            {
                recursive: true
            }
        );
    }
}

function sleep(ms) {
    return new Promise(
        (resolve) => {
            setTimeout(
                resolve,
                ms
            );
        }
    );
}

function parseDrawNumber(value) {
    const number =
        Number.parseInt(
            value,
            10
        );

    if (
        !Number.isInteger(number) ||
        number <= 0
    ) {
        return null;
    }

    return number;
}

function readJsonFile(
    filePath,
    fallbackValue
) {
    try {
        if (
            !fs.existsSync(
                filePath
            )
        ) {
            return fallbackValue;
        }

        const raw =
            fs.readFileSync(
                filePath,
                "utf8"
            );

        if (
            !raw.trim()
        ) {
            return fallbackValue;
        }

        return JSON.parse(
            raw
        );
    } catch (
    error
    ) {
        console.warn(
            `[Singapore 4D] 无法读取记录文件 ${path.basename(filePath)}：${error.message}`
        );

        return fallbackValue;
    }
}

function writeJsonFile(
    filePath,
    data
) {
    ensureReportDirectory();

    fs.writeFileSync(
        filePath,
        JSON.stringify(
            data,
            null,
            2
        ),
        "utf8"
    );
}

function loadProgress() {
    return readJsonFile(
        PROGRESS_FILE,
        null
    );
}

function saveProgress(data) {
    writeJsonFile(
        PROGRESS_FILE,
        {
            ...data,
            updated_at:
                new Date()
                    .toISOString()
        }
    );
}

function loadFailures() {
    const data =
        readJsonFile(
            FAILURE_FILE,
            []
        );

    return Array.isArray(data)
        ? data
        : [];
}

function saveFailures(data) {
    writeJsonFile(
        FAILURE_FILE,
        data
    );
}

function loadQualityWarnings() {
    const data =
        readJsonFile(
            QUALITY_FILE,
            []
        );

    return Array.isArray(data)
        ? data
        : [];
}

function saveQualityWarnings(
    data
) {
    writeJsonFile(
        QUALITY_FILE,
        data
    );
}

function normalize4dNumber(
    value
) {
    if (
        value === null ||
        value === undefined
    ) {
        return null;
    }

    const text =
        String(value).trim();

    if (
        !/^\d{1,4}$/.test(
            text
        )
    ) {
        return null;
    }

    return text.padStart(
        4,
        "0"
    );
}

function extractPrizeStructure(
    result
) {
    if (
        !result ||
        typeof result !==
        "object"
    ) {
        return null;
    }

    if (
        result.prize_structure &&
        typeof result.prize_structure ===
        "object"
    ) {
        return result.prize_structure;
    }

    if (
        result.result &&
        result.result.prize_structure &&
        typeof result.result.prize_structure ===
        "object"
    ) {
        return result.result
            .prize_structure;
    }

    const first =
        result.first_prize ||
        result.first;

    const second =
        result.second_prize ||
        result.second;

    const third =
        result.third_prize ||
        result.third;

    const starter =
        result.starter_prizes ||
        result.starter;

    const consolation =
        result.consolation_prizes ||
        result.consolation;

    if (
        first ||
        second ||
        third ||
        starter ||
        consolation
    ) {
        return {
            first,
            second,
            third,
            starter,
            consolation
        };
    }

    return null;
}

function findDuplicateNumbers(
    prizeStructure
) {
    if (
        !prizeStructure
    ) {
        return [];
    }

    const allNumbers = [];

    const pushNumber = (
        category,
        value
    ) => {
        const normalized =
            normalize4dNumber(
                value
            );

        if (
            normalized
        ) {
            allNumbers.push({
                category,
                number:
                    normalized
            });
        }
    };

    pushNumber(
        "first",
        prizeStructure.first
    );

    pushNumber(
        "second",
        prizeStructure.second
    );

    pushNumber(
        "third",
        prizeStructure.third
    );

    if (
        Array.isArray(
            prizeStructure.starter
        )
    ) {
        for (
            const number of
            prizeStructure.starter
        ) {
            pushNumber(
                "starter",
                number
            );
        }
    }

    if (
        Array.isArray(
            prizeStructure.consolation
        )
    ) {
        for (
            const number of
            prizeStructure.consolation
        ) {
            pushNumber(
                "consolation",
                number
            );
        }
    }

    const numberMap =
        new Map();

    for (
        const item of
        allNumbers
    ) {
        if (
            !numberMap.has(
                item.number
            )
        ) {
            numberMap.set(
                item.number,
                []
            );
        }

        numberMap
            .get(
                item.number
            )
            .push(
                item.category
            );
    }

    const duplicates = [];

    for (
        const [
            number,
            categories
        ] of
        numberMap.entries()
    ) {
        if (
            categories.length >
            1
        ) {
            duplicates.push({
                number,
                categories
            });
        }
    }

    return duplicates;
}

function inspectPrizeStructure(
    drawNo,
    result
) {
    const prizeStructure =
        extractPrizeStructure(
            result
        );

    if (
        !prizeStructure
    ) {
        return [];
    }

    const warnings = [];

    const first =
        normalize4dNumber(
            prizeStructure.first
        );

    const second =
        normalize4dNumber(
            prizeStructure.second
        );

    const third =
        normalize4dNumber(
            prizeStructure.third
        );

    if (
        !first
    ) {
        warnings.push(
            "一等奖号码缺失或格式异常"
        );
    }

    if (
        !second
    ) {
        warnings.push(
            "二等奖号码缺失或格式异常"
        );
    }

    if (
        !third
    ) {
        warnings.push(
            "三等奖号码缺失或格式异常"
        );
    }

    const starter =
        Array.isArray(
            prizeStructure.starter
        )
            ? prizeStructure.starter
            : [];

    const consolation =
        Array.isArray(
            prizeStructure.consolation
        )
            ? prizeStructure.consolation
            : [];

    if (
        starter.length !==
        10
    ) {
        warnings.push(
            `Starter 数量异常：${starter.length}`
        );
    }

    if (
        consolation.length !==
        10
    ) {
        warnings.push(
            `Consolation 数量异常：${consolation.length}`
        );
    }

    starter.forEach(
        (
            number,
            index
        ) => {
            if (
                !normalize4dNumber(
                    number
                )
            ) {
                warnings.push(
                    `Starter 第 ${index + 1} 个号码格式异常：${number}`
                );
            }
        }
    );

    consolation.forEach(
        (
            number,
            index
        ) => {
            if (
                !normalize4dNumber(
                    number
                )
            ) {
                warnings.push(
                    `Consolation 第 ${index + 1} 个号码格式异常：${number}`
                );
            }
        }
    );

    const duplicates =
        findDuplicateNumbers(
            prizeStructure
        );

    for (
        const duplicate of
        duplicates
    ) {
        warnings.push(
            `发现重复号码 ${duplicate.number}，出现位置：${duplicate.categories.join(", ")}`
        );
    }

    if (
        warnings.length ===
        0
    ) {
        return [];
    }

    return [
        {
            draw_number:
                String(drawNo),
            warnings,
            detected_at:
                new Date()
                    .toISOString()
        }
    ];
}

function removeFailureForDraw(
    failures,
    drawNo
) {
    return failures.filter(
        (item) =>
            String(
                item.draw_number
            ) !==
            String(
                drawNo
            )
    );
}

function removeQualityWarningForDraw(
    warnings,
    drawNo
) {
    return warnings.filter(
        (item) =>
            String(
                item.draw_number
            ) !==
            String(
                drawNo
            )
    );
}

function resolveStartingDraw(
    start,
    end
) {
    const progress =
        loadProgress();

    if (
        !progress
    ) {
        return {
            draw:
                start,
            resumed:
                false
        };
    }

    const sameRange =
        Number(
            progress.requested_start_draw
        ) === start &&
        Number(
            progress.requested_end_draw
        ) === end;

    const unfinished =
        progress.status ===
        "running";

    const nextDraw =
        parseDrawNumber(
            progress.next_draw
        );

    const nextDrawValid =
        nextDraw !== null &&
        nextDraw <= start &&
        nextDraw >= end;

    if (
        sameRange &&
        unfinished &&
        nextDrawValid
    ) {
        return {
            draw:
                nextDraw,
            resumed:
                true
        };
    }

    return {
        draw:
            start,
        resumed:
            false
    };
}

async function backfillSingapore4dHistory(
    startDraw,
    endDraw
) {
    ensureReportDirectory();

    const start =
        parseDrawNumber(
            startDraw
        );

    const end =
        parseDrawNumber(
            endDraw
        );

    if (
        start === null ||
        end === null
    ) {
        throw new Error(
            "Draw No. 必须是大于 0 的整数"
        );
    }

    if (
        start <
        end
    ) {
        throw new Error(
            "开始 Draw No. 必须大于或等于结束 Draw No."
        );
    }

    const requestedTotal =
        start -
        end +
        1;

    const resumeInfo =
        resolveStartingDraw(
            start,
            end
        );

    const actualStart =
        resumeInfo.draw;

    const actualTotal =
        actualStart -
        end +
        1;

    let inserted = 0;
    let updated = 0;
    let failed = 0;
    let qualityWarningCount = 0;

    let failures =
        loadFailures();

    let qualityWarnings =
        loadQualityWarnings();

    console.log("");
    console.log(
        "=========================================="
    );
    console.log(
        "Singapore 4D 历史数据回填开始"
    );
    console.log(
        "=========================================="
    );
    console.log(
        `请求范围：Draw ${start} → Draw ${end}`
    );

    if (
        resumeInfo.resumed
    ) {
        console.log(
            `检测到未完成任务，自动从 Draw ${actualStart} 继续`
        );
    } else {
        console.log(
            `本次从 Draw ${actualStart} 开始`
        );
    }

    console.log(
        `请求总期数：${requestedTotal}`
    );
    console.log(
        `本次待处理：${actualTotal}`
    );
    console.log(
        `请求间隔：${REQUEST_DELAY_MS}ms`
    );
    console.log(
        `记录目录：${REPORT_DIR}`
    );
    console.log(
        "=========================================="
    );
    console.log("");

    saveProgress({
        status:
            "running",
        requested_start_draw:
            start,
        requested_end_draw:
            end,
        current_draw:
            actualStart,
        next_draw:
            actualStart,
        started_at:
            new Date()
                .toISOString()
    });

    let processed = 0;

    for (
        let drawNo =
            actualStart;
        drawNo >=
        end;
        drawNo -= 1
    ) {
        processed += 1;

        console.log(
            `[${processed}/${actualTotal}] 正在处理 Draw ${drawNo}`
        );

        saveProgress({
            status:
                "running",
            requested_start_draw:
                start,
            requested_end_draw:
                end,
            current_draw:
                drawNo,
            next_draw:
                drawNo,
            processed_this_run:
                processed,
            remaining_this_run:
                actualTotal -
                processed +
                1
        });

        try {
            const result =
                await syncSingapore4dDraw(
                    String(
                        drawNo
                    )
                );

            failures =
                removeFailureForDraw(
                    failures,
                    drawNo
                );

            qualityWarnings =
                removeQualityWarningForDraw(
                    qualityWarnings,
                    drawNo
                );

            if (
                result.action ===
                "inserted"
            ) {
                inserted += 1;

                console.log(
                    `✓ Draw ${drawNo} 新增成功`
                );
            } else if (
                result.action ===
                "updated"
            ) {
                updated += 1;

                console.log(
                    `✓ Draw ${drawNo} 已存在，校验并更新成功`
                );
            } else {
                console.log(
                    `✓ Draw ${drawNo} 处理完成：${result.action || "unknown"}`
                );
            }

            const currentWarnings =
                inspectPrizeStructure(
                    drawNo,
                    result
                );

            if (
                currentWarnings.length >
                0
            ) {
                qualityWarningCount +=
                    currentWarnings.length;

                qualityWarnings.push(
                    ...currentWarnings
                );

                console.warn(
                    `⚠ Draw ${drawNo} 发现数据质量警告`
                );

                for (
                    const warning of
                    currentWarnings[0]
                        .warnings
                ) {
                    console.warn(
                        `  - ${warning}`
                    );
                }
            }
        } catch (
        error
        ) {
            failed += 1;

            failures =
                removeFailureForDraw(
                    failures,
                    drawNo
                );

            failures.push({
                draw_number:
                    String(
                        drawNo
                    ),
                message:
                    error.message ||
                    String(
                        error
                    ),
                failed_at:
                    new Date()
                        .toISOString()
            });

            console.error(
                `✗ Draw ${drawNo} 处理失败：${error.message || error}`
            );
        }

        saveFailures(
            failures
        );

        saveQualityWarnings(
            qualityWarnings
        );

        const nextDraw =
            drawNo -
            1;

        saveProgress({
            status:
                nextDraw >= end
                    ? "running"
                    : "completed",
            requested_start_draw:
                start,
            requested_end_draw:
                end,
            current_draw:
                drawNo,
            next_draw:
                nextDraw >= end
                    ? nextDraw
                    : null,
            processed_this_run:
                processed,
            remaining_this_run:
                Math.max(
                    actualTotal -
                    processed,
                    0
                ),
            inserted_this_run:
                inserted,
            updated_this_run:
                updated,
            failed_this_run:
                failed,
            quality_warnings_this_run:
                qualityWarningCount
        });

        if (
            drawNo >
            end
        ) {
            await sleep(
                REQUEST_DELAY_MS
            );
        }
    }

    saveProgress({
        status:
            "completed",
        requested_start_draw:
            start,
        requested_end_draw:
            end,
        current_draw:
            end,
        next_draw:
            null,
        processed_this_run:
            processed,
        inserted_this_run:
            inserted,
        updated_this_run:
            updated,
        failed_this_run:
            failed,
        quality_warnings_this_run:
            qualityWarningCount,
        completed_at:
            new Date()
                .toISOString()
    });

    console.log("");
    console.log(
        "=========================================="
    );
    console.log(
        "Singapore 4D 历史数据回填完成"
    );
    console.log(
        "=========================================="
    );
    console.log(
        `本次处理：${processed}`
    );
    console.log(
        `新增：${inserted}`
    );
    console.log(
        `更新：${updated}`
    );
    console.log(
        `失败：${failed}`
    );
    console.log(
        `质量警告：${qualityWarningCount}`
    );

    if (
        failures.length >
        0
    ) {
        console.log("");
        console.log(
            `当前失败清单共 ${failures.length} 期：`
        );

        for (
            const item of
            failures
        ) {
            console.log(
                `- Draw ${item.draw_number}: ${item.message}`
            );
        }

        console.log(
            `失败清单：${FAILURE_FILE}`
        );
    }

    if (
        qualityWarnings.length >
        0
    ) {
        console.log("");
        console.log(
            `当前质量异常清单共 ${qualityWarnings.length} 期`
        );
        console.log(
            `质量异常文件：${QUALITY_FILE}`
        );
    }

    console.log("");
    console.log(
        `断点记录：${PROGRESS_FILE}`
    );
    console.log(
        "=========================================="
    );
    console.log("");

    return {
        success:
            failed === 0,
        requested_start_draw:
            start,
        requested_end_draw:
            end,
        actual_start_draw:
            actualStart,
        processed,
        inserted,
        updated,
        failed,
        quality_warnings:
            qualityWarningCount,
        failures
    };
}

async function main() {
    const startDraw =
        process.argv[2];

    const endDraw =
        process.argv[3];

    if (
        !startDraw ||
        !endDraw
    ) {
        console.error("");
        console.error(
            "缺少 Draw No. 参数"
        );
        console.error("");
        console.error(
            "正确使用方法："
        );
        console.error(
            "node backfill-sg4d-history.js 5530 5480"
        );
        console.error("");

        process.exitCode = 1;
        return;
    }

    try {
        const result =
            await backfillSingapore4dHistory(
                startDraw,
                endDraw
            );

        if (
            !result.success
        ) {
            process.exitCode = 2;
        }
    } catch (
    error
    ) {
        console.error(
            "Singapore 4D 历史回填失败：",
            error.message ||
            error
        );

        process.exitCode = 1;
    }
}

if (
    require.main ===
    module
) {
    main();
}

module.exports = {
    backfillSingapore4dHistory
};