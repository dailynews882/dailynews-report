const SINGAPORE_POOLS_TOTO_RESULT_URL =
    "https://www.singaporepools.com.sg/en/product/sr/Pages/toto_results.aspx";

const REQUEST_TIMEOUT_MS = 60000;

const MAX_RETRIES = 3;

const RETRY_DELAYS_MS = [
    3000,
    6000,
    12000
];

function sleep(milliseconds) {
    return new Promise(
        (resolve) => {
            setTimeout(
                resolve,
                milliseconds
            );
        }
    );
}

function buildSingaporePoolsDrawUrl(
    officialDrawNumber
) {
    const drawNumber =
        String(
            officialDrawNumber || ""
        ).trim();

    if (
        !/^\d+$/.test(drawNumber)
    ) {
        throw new Error(
            "Singapore TOTO Draw No. 必须是数字。"
        );
    }

    const encodedParameter =
        Buffer.from(
            `DrawNumber=${drawNumber}`,
            "utf8"
        ).toString("base64");

    return (
        `${SINGAPORE_POOLS_TOTO_RESULT_URL}` +
        `?sppl=${encodeURIComponent(
            encodedParameter
        )}`
    );
}

function decodeHtmlEntities(value) {
    return String(value || "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&#160;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">");
}

function stripHtml(value) {
    return decodeHtmlEntities(
        String(value || "")
            .replace(
                /<script\b[^>]*>[\s\S]*?<\/script>/gi,
                " "
            )
            .replace(
                /<style\b[^>]*>[\s\S]*?<\/style>/gi,
                " "
            )
            .replace(
                /<br\s*\/?>/gi,
                "\n"
            )
            .replace(
                /<\/(?:div|p|li|tr|td|th|h1|h2|h3|h4|section)>/gi,
                "\n"
            )
            .replace(
                /<[^>]+>/g,
                " "
            )
    )
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n[ \t]+/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
}

function normalizeMoney(value) {
    const text =
        String(value || "")
            .replace(/\s+/g, " ")
            .trim();

    if (
        !text ||
        text === "-"
    ) {
        return null;
    }

    const numeric =
        text.replace(
            /[^0-9.]/g,
            ""
        );

    if (!numeric) {
        return null;
    }

    const amount =
        Number(numeric);

    return Number.isFinite(amount)
        ? amount
        : null;
}

function normalizeWinningShares(value) {
    const text =
        String(value || "")
            .replace(/,/g, "")
            .replace(/\s+/g, "")
            .trim();

    if (
        !text ||
        text === "-"
    ) {
        return null;
    }

    const number =
        Number.parseInt(
            text,
            10
        );

    return Number.isInteger(number)
        ? number
        : null;
}

function parseSingaporeDate(
    value
) {
    const text =
        String(value || "")
            .replace(/\s+/g, " ")
            .trim();

    const match =
        text.match(
            /(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s+(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/i
        );

    if (!match) {
        return null;
    }

    const monthMap = {
        jan: "01",
        feb: "02",
        mar: "03",
        apr: "04",
        may: "05",
        jun: "06",
        jul: "07",
        aug: "08",
        sep: "09",
        oct: "10",
        nov: "11",
        dec: "12"
    };

    const day =
        String(match[1])
            .padStart(2, "0");

    const month =
        monthMap[
        String(match[2])
            .toLowerCase()
        ];

    const year =
        match[3];

    if (!month) {
        return null;
    }

    return `${year}-${month}-${day}`;
}

function extractDrawNumber(text) {
    const match =
        text.match(
            /Draw\s*No\.?\s*[:.]?\s*(\d+)/i
        );

    return match
        ? match[1]
        : "";
}

function extractDrawDate(text) {
    const drawNoPosition =
        text.search(
            /Draw\s*No\.?/i
        );

    const candidate =
        drawNoPosition >= 0
            ? text.slice(
                Math.max(
                    0,
                    drawNoPosition - 80
                ),
                drawNoPosition
            )
            : text.slice(0, 250);

    return parseSingaporeDate(
        candidate
    );
}

function extractWinningNumbers(text) {
    const match =
        text.match(
            /Winning\s+Numbers?\s+([\s\S]*?)Additional\s+Number/i
        );

    if (!match) {
        return [];
    }

    const numbers =
        match[1]
            .match(/\b\d{1,2}\b/g);

    if (!numbers) {
        return [];
    }

    return numbers
        .map(Number)
        .filter(
            (number) =>
                Number.isInteger(number) &&
                number >= 1 &&
                number <= 49
        )
        .slice(0, 6);
}

function extractAdditionalNumber(text) {
    const match =
        text.match(
            /Additional\s+Number\s+(\d{1,2})/i
        );

    if (!match) {
        return null;
    }

    const number =
        Number(match[1]);

    if (
        !Number.isInteger(number) ||
        number < 1 ||
        number > 49
    ) {
        return null;
    }

    return number;
}

function extractGroup1Prize(text) {
    const match =
        text.match(
            /Group\s+1\s+Prize\s+\$?\s*([\d,]+(?:\.\d+)?)/i
        );

    return match
        ? normalizeMoney(
            match[1]
        )
        : null;
}

function extractPrizeStructure(text) {
    const groups = [];

    const tableStart =
        text.search(
            /Prize\s+Group\s+Share\s+Amount\s+(?:No\.\s+of\s+)?Winning\s+Shares/i
        );

    if (tableStart < 0) {
        return groups;
    }

    const tableText =
        text.slice(
            tableStart,
            tableStart + 2500
        );

    for (
        let groupNumber = 1;
        groupNumber <= 7;
        groupNumber += 1
    ) {
        const currentPattern =
            new RegExp(
                `Group\\s+${groupNumber}\\s+([\\s\\S]*?)` +
                (
                    groupNumber < 7
                        ? `(?=Group\\s+${groupNumber + 1}\\b)`
                        : `(?=Multiple\\s+iTOTO|A\\s+winning\\s+ticket|$)`
                ),
                "i"
            );

        const match =
            tableText.match(
                currentPattern
            );

        if (!match) {
            continue;
        }

        const block =
            String(
                match[1] || ""
            )
                .replace(/\s+/g, " ")
                .trim();

        let shareAmount = null;
        let winningShares = null;

        const moneyMatch =
            block.match(
                /(?:S?\$)\s*([\d,]+(?:\.\d+)?)/i
            );

        if (moneyMatch) {
            shareAmount =
                normalizeMoney(
                    moneyMatch[1]
                );
        }

        const remainder =
            moneyMatch
                ? block.slice(
                    moneyMatch.index +
                    moneyMatch[0].length
                )
                : block;

        const shareMatch =
            remainder.match(
                /(?:^|\s)([\d,]+)(?:\s|$)/
            );

        if (shareMatch) {
            winningShares =
                normalizeWinningShares(
                    shareMatch[1]
                );
        }

        groups.push({
            group:
                groupNumber,

            share_amount:
                shareAmount,

            winning_shares:
                winningShares
        });
    }

    return groups;
}

function validateParsedResult(
    result,
    requestedDrawNumber
) {
    if (
        !result.official_draw_number
    ) {
        throw new Error(
            "无法从 Singapore Pools 页面识别官方 Draw No."
        );
    }

    if (
        String(
            result.official_draw_number
        ) !==
        String(
            requestedDrawNumber
        )
    ) {
        throw new Error(
            `官方 Draw No. 与请求不一致：` +
            `请求 ${requestedDrawNumber}，` +
            `页面返回 ${result.official_draw_number}`
        );
    }

    if (
        !result.draw_date
    ) {
        throw new Error(
            "无法识别开奖日期。"
        );
    }

    if (
        result.main_numbers.length !== 6
    ) {
        throw new Error(
            `开奖号码识别失败：当前识别到 ` +
            `${result.main_numbers.length} 个主号码。`
        );
    }

    if (
        result.special_number === null
    ) {
        throw new Error(
            "无法识别 Additional Number。"
        );
    }
}

async function fetchSingaporeTotoPage(
    url,
    requestLabel
) {
    let lastError = null;

    for (
        let attempt = 0;
        attempt <= MAX_RETRIES;
        attempt += 1
    ) {
        const controller =
            new AbortController();

        const timeout =
            setTimeout(
                () => {
                    controller.abort();
                },
                REQUEST_TIMEOUT_MS
            );

        try {
            console.log(
                `[Singapore TOTO] ${requestLabel}，` +
                `第 ${attempt + 1} 次尝试`
            );

            const response =
                await fetch(
                    url,
                    {
                        method: "GET",

                        headers: {
                            Accept:
                                "text/html,application/xhtml+xml",

                            "Accept-Language":
                                "en-SG,en;q=0.9",

                            "Cache-Control":
                                "no-cache",

                            "User-Agent":
                                "Mozilla/5.0 " +
                                "(Windows NT 10.0; Win64; x64) " +
                                "AppleWebKit/537.36 " +
                                "(KHTML, like Gecko) " +
                                "Chrome/151.0.0.0 Safari/537.36"
                        },

                        redirect:
                            "follow",

                        signal:
                            controller.signal
                    }
                );

            if (
                response.status === 429 ||
                response.status === 502 ||
                response.status === 503 ||
                response.status === 504
            ) {
                throw new Error(
                    `RETRYABLE_HTTP_${response.status}`
                );
            }

            if (!response.ok) {
                throw new Error(
                    `Singapore Pools HTTP ${response.status}`
                );
            }

            const html =
                await response.text();

            if (
                !html ||
                html.length < 500
            ) {
                throw new Error(
                    "Singapore Pools 返回内容为空或异常。"
                );
            }

            return html;
        } catch (error) {
            lastError = error;

            const isAbort =
                error &&
                error.name === "AbortError";

            const errorMessage =
                String(
                    error?.message || ""
                );

            const isRetryableHttp =
                errorMessage.startsWith(
                    "RETRYABLE_HTTP_"
                );

            const isFetchFailure =
                errorMessage.includes(
                    "fetch failed"
                );

            const canRetry =
                attempt < MAX_RETRIES &&
                (
                    isAbort ||
                    isRetryableHttp ||
                    isFetchFailure
                );

            if (!canRetry) {
                if (isAbort) {
                    throw new Error(
                        "连接 Singapore Pools 超时。"
                    );
                }

                if (isRetryableHttp) {
                    const status =
                        errorMessage.replace(
                            "RETRYABLE_HTTP_",
                            ""
                        );

                    throw new Error(
                        `Singapore Pools HTTP ${status}`
                    );
                }

                throw error;
            }

            const delay =
                RETRY_DELAYS_MS[
                attempt
                ] || 12000;

            let reason =
                errorMessage;

            if (isAbort) {
                reason =
                    "连接超时";
            }

            if (isRetryableHttp) {
                reason =
                    errorMessage.replace(
                        "RETRYABLE_HTTP_",
                        "HTTP "
                    );
            }

            console.warn(
                `[Singapore TOTO] 第 ${attempt + 1} 次请求失败：` +
                `${reason}。` +
                `${delay / 1000} 秒后自动重试。`
            );

            await sleep(
                delay
            );
        } finally {
            clearTimeout(
                timeout
            );
        }
    }

    throw (
        lastError ||
        new Error(
            "Singapore Pools 请求失败。"
        )
    );
}

function buildParsedResult(
    text,
    sourceUrl
) {
    const group1Prize =
        extractGroup1Prize(
            text
        );

    const prizeGroups =
        extractPrizeStructure(
            text
        );

    /*
     * Singapore Pools 页面部分期次的
     * Prize Structure 第一组可能不会重复显示金额。
     * 如果 Group 1 表格金额为空，
     * 使用页面单独解析出的 Group 1 Prize 补齐。
     */
    if (
        prizeGroups.length > 0 &&
        prizeGroups[0].group === 1 &&
        prizeGroups[0].share_amount === null &&
        group1Prize !== null
    ) {
        prizeGroups[0].share_amount =
            group1Prize;
    }

    return {
        game_code:
            "sg-toto",

        official_draw_number:
            extractDrawNumber(
                text
            ),

        draw_date:
            extractDrawDate(
                text
            ),

        main_numbers:
            extractWinningNumbers(
                text
            ),

        special_number:
            extractAdditionalNumber(
                text
            ),

        group1_prize:
            group1Prize,

        prize_structure: {
            groups:
                prizeGroups
        },

        source_name:
            "Singapore Pools",

        source_url:
            sourceUrl,

        fetched_at:
            new Date()
                .toISOString()
    };
}

async function fetchSingaporeTotoResult(
    officialDrawNumber
) {
    const drawNumber =
        String(
            officialDrawNumber || ""
        ).trim();

    if (
        !/^\d+$/.test(
            drawNumber
        )
    ) {
        throw new Error(
            "Singapore TOTO Draw No. 必须是数字。"
        );
    }

    const url =
        buildSingaporePoolsDrawUrl(
            drawNumber
        );

    const html =
        await fetchSingaporeTotoPage(
            url,
            `请求 Draw ${drawNumber}`
        );

    const text =
        stripHtml(
            html
        );

    const result =
        buildParsedResult(
            text,
            url
        );

    validateParsedResult(
        result,
        drawNumber
    );

    console.log(
        `[Singapore TOTO] Draw ${drawNumber} 获取成功`
    );

    return result;
}

/*
 * ==========================================
 * 自动读取 Singapore Pools 当前最新一期
 * ==========================================
 *
 * 不需要管理员提前知道 Draw No.
 *
 * 工作流程：
 *
 * Singapore Pools TOTO Results 首页
 *          ↓
 * 解析页面当前 Draw No.
 *          ↓
 * 再使用正式 Draw URL 读取该期
 *          ↓
 * 使用现有严格校验逻辑确认开奖结果
 */
async function fetchLatestSingaporeTotoResult() {
    console.log(
        "[Singapore TOTO] 正在识别官网最新一期..."
    );

    /*
     * 不传 sppl 参数，
     * 访问 Singapore Pools TOTO Results 主页面。
     *
     * 正常情况下页面首先展示当前最新一期。
     */
    const latestPageHtml =
        await fetchSingaporeTotoPage(
            SINGAPORE_POOLS_TOTO_RESULT_URL,
            "请求最新开奖结果页面"
        );

    const latestPageText =
        stripHtml(
            latestPageHtml
        );

    const latestDrawNumber =
        extractDrawNumber(
            latestPageText
        );

    if (
        !latestDrawNumber ||
        !/^\d+$/.test(
            String(
                latestDrawNumber
            )
        )
    ) {
        throw new Error(
            "无法从 Singapore Pools 最新结果页面识别 Draw No."
        );
    }

    console.log(
        `[Singapore TOTO] 官网当前最新 Draw No.：${latestDrawNumber}`
    );

    /*
     * 不直接相信首页解析出来的其他字段。
     *
     * 找到最新 Draw No. 后，
     * 再走我们已经验证成功的指定期抓取函数。
     *
     * 这样 4209、4210 已经通过测试的严格校验逻辑
     * 会继续得到保留。
     */
    const result =
        await fetchSingaporeTotoResult(
            latestDrawNumber
        );

    console.log(
        `[Singapore TOTO] 最新一期 ${latestDrawNumber} 读取完成`
    );

    return result;
}

module.exports = {
    buildSingaporePoolsDrawUrl,
    fetchSingaporeTotoResult,
    fetchLatestSingaporeTotoResult
};