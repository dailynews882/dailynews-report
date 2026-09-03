const SINGAPORE_POOLS_4D_RESULT_URL =
    "https://www.singaporepools.com.sg/en/product/pages/4d_results.aspx";

const REQUEST_TIMEOUT_MS = 60000;

const MAX_RETRIES = 3;

const RETRY_DELAYS_MS = [
    3000,
    6000,
    12000
];


/*
 * ==========================================
 * 基础工具
 * ==========================================
 */

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


function buildSingaporePools4dDrawUrl(
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
            "Singapore 4D Draw No. 必须是数字。"
        );
    }

    const encodedParameter =
        Buffer.from(
            `DrawNumber=${drawNumber}`,
            "utf8"
        ).toString("base64");

    return (
        `${SINGAPORE_POOLS_4D_RESULT_URL}` +
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


/*
 * ==========================================
 * 日期
 * ==========================================
 */

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


/*
 * ==========================================
 * Draw No.
 * ==========================================
 */

function extractDrawNumber(
    text
) {
    const match =
        String(text || "").match(
            /Draw\s*No\.?\s*[:.]?\s*(\d+)/i
        );

    return match
        ? match[1]
        : "";
}


/*
 * ==========================================
 * 开奖日期
 * ==========================================
 */

function extractDrawDate(
    text
) {
    const drawNoPosition =
        String(text || "").search(
            /Draw\s*No\.?/i
        );

    const candidate =
        drawNoPosition >= 0
            ? String(text).slice(
                Math.max(
                    0,
                    drawNoPosition - 120
                ),
                drawNoPosition
            )
            : String(text).slice(
                0,
                300
            );

    return parseSingaporeDate(
        candidate
    );
}


/*
 * ==========================================
 * 4D号码标准化
 *
 * 非常重要：
 *
 * 0379 必须保留为 "0379"
 * 不能变成数字 379
 * ==========================================
 */

function normalize4dNumber(
    value
) {
    const text =
        String(
            value ?? ""
        ).trim();

    if (
        !/^\d{1,4}$/.test(text)
    ) {
        return null;
    }

    return text.padStart(
        4,
        "0"
    );
}


/*
 * ==========================================
 * 一奖 / 二奖 / 三奖
 * ==========================================
 */

function extractPrizeNumber(
    text,
    prizeLabel
) {
    const escapedLabel =
        String(prizeLabel)
            .replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
            );

    const pattern =
        new RegExp(
            `${escapedLabel}\\s+Prize\\s+(\\d{1,4})`,
            "i"
        );

    const match =
        String(text || "").match(
            pattern
        );

    if (!match) {
        return null;
    }

    return normalize4dNumber(
        match[1]
    );
}


/*
 * ==========================================
 * Starter Prizes 入围奖
 * ==========================================
 */

function extractStarterPrizes(
    text
) {
    const match =
        String(text || "").match(
            /Starter\s+Prizes?\s+([\s\S]*?)Consolation\s+Prizes?/i
        );

    if (!match) {
        return [];
    }

    const numbers =
        String(
            match[1] || ""
        ).match(
            /\b\d{4}\b/g
        );

    if (!numbers) {
        return [];
    }

    return numbers
        .map(
            normalize4dNumber
        )
        .filter(Boolean)
        .slice(
            0,
            10
        );
}


/*
 * ==========================================
 * Consolation Prizes 安慰奖
 * ==========================================
 */

function extractConsolationPrizes(
    text
) {
    const match =
        String(text || "").match(
            /Consolation\s+Prizes?\s+([\s\S]*?)(?=Prizes?\s+not\s+claimed|Calculate\s+Prize|4D\s+万字票|$)/i
        );

    if (!match) {
        return [];
    }

    const numbers =
        String(
            match[1] || ""
        ).match(
            /\b\d{4}\b/g
        );

    if (!numbers) {
        return [];
    }

    return numbers
        .map(
            normalize4dNumber
        )
        .filter(Boolean)
        .slice(
            0,
            10
        );
}


/*
 * ==========================================
 * 结果校验
 * ==========================================
 */

function validateParsedResult(
    result,
    requestedDrawNumber
) {
    if (
        !result.official_draw_number
    ) {
        throw new Error(
            "无法从 Singapore Pools 页面识别官方 4D Draw No."
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
            "无法识别 Singapore 4D 开奖日期。"
        );
    }

    if (
        !result.first_prize
    ) {
        throw new Error(
            "无法识别 Singapore 4D 一等奖。"
        );
    }

    if (
        !result.second_prize
    ) {
        throw new Error(
            "无法识别 Singapore 4D 二等奖。"
        );
    }

    if (
        !result.third_prize
    ) {
        throw new Error(
            "无法识别 Singapore 4D 三等奖。"
        );
    }

    if (
        result.starter_prizes.length !== 10
    ) {
        throw new Error(
            `Singapore 4D 入围奖识别失败：` +
            `当前识别到 ${result.starter_prizes.length} 个。`
        );
    }

    if (
        result.consolation_prizes.length !== 10
    ) {
        throw new Error(
            `Singapore 4D 安慰奖识别失败：` +
            `当前识别到 ${result.consolation_prizes.length} 个。`
        );
    }
}


/*
 * ==========================================
 * 请求 Singapore Pools
 * ==========================================
 */

async function fetchSingapore4dPage(
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
                `[Singapore 4D] ${requestLabel}，` +
                `第 ${attempt + 1} 次尝试`
            );

            const response =
                await fetch(
                    url,
                    {
                        method:
                            "GET",

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

            if (
                !response.ok
            ) {
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
        } catch (
        error
        ) {
            lastError =
                error;

            const isAbort =
                error &&
                error.name ===
                "AbortError";

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

            if (
                !canRetry
            ) {
                if (
                    isAbort
                ) {
                    throw new Error(
                        "连接 Singapore Pools 超时。"
                    );
                }

                if (
                    isRetryableHttp
                ) {
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

            console.warn(
                `[Singapore 4D] 第 ${attempt + 1} 次请求失败。` +
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
            "Singapore Pools 4D 请求失败。"
        )
    );
}


/*
 * ==========================================
 * 构建标准4D数据
 * ==========================================
 */

function buildParsedResult(
    text,
    sourceUrl
) {
    const firstPrize =
        extractPrizeNumber(
            text,
            "1st"
        );

    const secondPrize =
        extractPrizeNumber(
            text,
            "2nd"
        );

    const thirdPrize =
        extractPrizeNumber(
            text,
            "3rd"
        );

    const starterPrizes =
        extractStarterPrizes(
            text
        );

    const consolationPrizes =
        extractConsolationPrizes(
            text
        );

    return {
        game_code:
            "sg-4d",

        official_draw_number:
            extractDrawNumber(
                text
            ),

        draw_date:
            extractDrawDate(
                text
            ),

        first_prize:
            firstPrize,

        second_prize:
            secondPrize,

        third_prize:
            thirdPrize,

        starter_prizes:
            starterPrizes,

        consolation_prizes:
            consolationPrizes,

        /*
         * 与 lottery_draws 当前结构兼容：
         *
         * main_numbers 保存前三大奖。
         *
         * 注意全部是字符串。
         */
        main_numbers: [
            firstPrize,
            secondPrize,
            thirdPrize
        ],

        special_numbers:
            [],

        prize_structure: {
            first:
                firstPrize,

            second:
                secondPrize,

            third:
                thirdPrize,

            starter:
                starterPrizes,

            consolation:
                consolationPrizes
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


/*
 * ==========================================
 * 指定 Draw No. 获取4D开奖结果
 * ==========================================
 */

async function fetchSingapore4dResult(
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
            "Singapore 4D Draw No. 必须是数字。"
        );
    }

    const url =
        buildSingaporePools4dDrawUrl(
            drawNumber
        );

    const html =
        await fetchSingapore4dPage(
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
        `[Singapore 4D] Draw ${drawNumber} 获取成功`
    );

    return result;
}


/*
 * ==========================================
 * 自动读取当前最新一期4D
 * ==========================================
 */

async function fetchLatestSingapore4dResult() {
    console.log(
        "[Singapore 4D] 正在读取官网最新一期..."
    );

    const latestResultsUrl =
        "https://www.singaporepools.com.sg/" +
        "DataFileArchive/Lottery/Output/" +
        "fourd_result_top_draws_en.html";

    const html =
        await fetchSingapore4dPage(
            latestResultsUrl,
            "请求官方4D最新开奖数据文件"
        );

    /*
     * Singapore Pools 的 fourd_result_top_draws_en.html
     * 会同时包含最近多期开奖。
     *
     * 最新一期位于文件最前面。
     *
     * 因此只截取：
     * 第一个 Draw No.
     * 到第二个 Draw No. 之前的内容。
     */
    const firstDrawMatch =
        html.match(
            /<th[^>]*class=['"]drawNumber['"][^>]*>\s*Draw\s*No\.?\s*(\d+)\s*<\/th>/i
        );

    if (
        !firstDrawMatch
    ) {
        throw new Error(
            "无法从 Singapore Pools 官方4D数据文件识别最新 Draw No."
        );
    }

    const latestDrawNumber =
        firstDrawMatch[1];

    const firstDrawPosition =
        firstDrawMatch.index;

    const remainingHtml =
        html.slice(
            firstDrawPosition +
            firstDrawMatch[0].length
        );

    const secondDrawMatch =
        remainingHtml.match(
            /<th[^>]*class=['"]drawNumber['"][^>]*>\s*Draw\s*No\.?\s*\d+\s*<\/th>/i
        );

    const latestDrawHtml =
        secondDrawMatch
            ? html.slice(
                0,
                firstDrawPosition +
                firstDrawMatch[0].length +
                secondDrawMatch.index
            )
            : html;

    const latestDrawText =
        stripHtml(
            latestDrawHtml
        );

    const result =
        buildParsedResult(
            latestDrawText,
            latestResultsUrl
        );

    validateParsedResult(
        result,
        latestDrawNumber
    );

    console.log(
        `[Singapore 4D] 官网当前最新 Draw No.：${latestDrawNumber}`
    );

    console.log(
        `[Singapore 4D] 最新一期 ${latestDrawNumber} 读取完成`
    );

    return result;
}


module.exports = {
    buildSingaporePools4dDrawUrl,
    fetchSingapore4dResult,
    fetchLatestSingapore4dResult
};