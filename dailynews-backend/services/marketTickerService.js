const API_BASE_URL =
    "https://api.twelvedata.com";

const REQUEST_TIMEOUT_MS = 20000;

/*
 * Twelve Data Basic测试方案：
 * 每分钟最多8 credits。
 *
 * 当前首页行情栏使用15个真实可访问品种，
 * 分成两批请求：
 *
 * 第一批8个：立即获取
 * 第二批7个：65秒后后台获取
 *
 * 两批结果自动合并到缓存。
 * 完整缓存最低30分钟，避免频繁消耗额度。
 */
const CONFIGURED_REFRESH_MINUTES =
    Number(
        process.env
            .MARKET_TICKER_REFRESH_MINUTES
    ) || 30;

const EFFECTIVE_REFRESH_MINUTES =
    Math.max(
        30,
        CONFIGURED_REFRESH_MINUTES
    );

const INITIAL_FOLLOWUP_MINUTES = 2;

const CACHE_TTL_MS =
    EFFECTIVE_REFRESH_MINUTES *
    60 *
    1000;

const SECOND_BATCH_DELAY_MS =
    65 * 1000;

const MARKET_INSTRUMENTS = [
    // ===== 第一批：8个 =====
    {
        symbol: "VOO",
        providerSymbol: "VOO",
        name: "标普500 ETF",
        decimals: 2,
        batch: 1
    },
    {
        symbol: "QQQ",
        providerSymbol: "QQQ",
        name: "纳斯达克100 ETF",
        decimals: 2,
        batch: 1
    },
    {
        symbol: "DIA",
        providerSymbol: "DIA",
        name: "道琼斯 ETF",
        decimals: 2,
        batch: 1
    },
    {
        symbol: "IWM",
        providerSymbol: "IWM",
        name: "罗素2000 ETF",
        decimals: 2,
        batch: 1
    },
    {
        symbol: "ASHR",
        providerSymbol: "ASHR",
        name: "中国A股 ETF",
        decimals: 2,
        batch: 1
    },
    {
        symbol: "EWH",
        providerSymbol: "EWH",
        name: "香港市场 ETF",
        decimals: 2,
        batch: 1
    },
    {
        symbol: "BTC/USD",
        providerSymbol: "BTC/USD",
        name: "比特币",
        decimals: 2,
        batch: 1
    },
    {
        symbol: "ETH/USD",
        providerSymbol: "ETH/USD",
        name: "以太坊",
        decimals: 2,
        batch: 1
    },

    // ===== 第二批：7个 =====
    {
        symbol: "NTETF",
        providerSymbol: "NTETF",
        name: "日经225 ETF",
        decimals: 2,
        batch: 2
    },
    {
        symbol: "EWS",
        providerSymbol: "EWS",
        name: "新加坡市场 ETF",
        decimals: 2,
        batch: 2
    },
    {
        symbol: "EWU",
        providerSymbol: "EWU",
        name: "英国市场 ETF",
        decimals: 2,
        batch: 2
    },
    {
        symbol: "DAX",
        providerSymbol: "DAX",
        name: "德国DAX ETF",
        decimals: 2,
        batch: 2
    },
    {
        symbol: "GLD",
        providerSymbol: "GLD",
        name: "黄金 ETF",
        decimals: 2,
        batch: 2
    },
    {
        symbol: "SLV",
        providerSymbol: "SLV",
        name: "白银 ETF",
        decimals: 2,
        batch: 2
    },
    {
        symbol: "USO",
        providerSymbol: "USO",
        name: "原油基金",
        decimals: 2,
        batch: 2
    }
];

const FIRST_BATCH =
    MARKET_INSTRUMENTS.filter(
        (item) => item.batch === 1
    );

const SECOND_BATCH =
    MARKET_INSTRUMENTS.filter(
        (item) => item.batch === 2
    );

let marketTickerCache = {
    items: [],
    updatedAt: null,
    expiresAt: 0,
    source: null,
    stale: false,
    errors: [],
    batchTwoPending: false
};

let activeFirstBatchPromise = null;
let activeSecondBatchPromise = null;
let secondBatchTimer = null;

function toFiniteNumber(value) {
    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}

function getApiKey() {
    return String(
        process.env.TWELVE_DATA_API_KEY ||
        ""
    ).trim();
}

function buildQuoteUrl(instruments) {
    const providerSymbols =
        instruments.map(
            (item) => item.providerSymbol
        ).join(",");

    const url = new URL(
        `${API_BASE_URL}/quote`
    );

    url.searchParams.set(
        "symbol",
        providerSymbols
    );

    return url;
}

function normalizeQuote(
    instrument,
    quote
) {
    if (
        !quote ||
        quote.status === "error"
    ) {
        return null;
    }

    const price =
        toFiniteNumber(
            quote.close ??
            quote.price
        );

    if (price === null) {
        return null;
    }

    const change =
        toFiniteNumber(
            quote.change
        );

    const percentChange =
        toFiniteNumber(
            quote.percent_change
        );

    return {
        symbol: instrument.symbol,
        providerSymbol:
            instrument.providerSymbol,
        name: instrument.name,
        value: price,
        decimals:
            instrument.decimals,
        change:
            change === null
                ? 0
                : change,
        changePercent:
            percentChange === null
                ? 0
                : percentChange,
        currency:
            quote.currency || "",
        exchange:
            quote.exchange || "",
        datetime:
            quote.datetime || null,
        timestamp:
            toFiniteNumber(
                quote.timestamp
            )
    };
}

function findQuoteInResponse(
    payload,
    providerSymbol
) {
    if (!payload) {
        return null;
    }

    if (
        payload.symbol &&
        String(
            payload.symbol
        ).toUpperCase() ===
        providerSymbol.toUpperCase()
    ) {
        return payload;
    }

    if (
        Object.prototype
            .hasOwnProperty.call(
                payload,
                providerSymbol
            )
    ) {
        return payload[
            providerSymbol
        ];
    }

    const matchedKey =
        Object.keys(
            payload
        ).find(
            (key) =>
                key.toUpperCase() ===
                providerSymbol.toUpperCase()
        );

    return matchedKey
        ? payload[matchedKey]
        : null;
}

async function requestQuotes(
    instruments
) {
    const apiKey =
        getApiKey();

    if (!apiKey) {
        throw new Error(
            "TWELVE_DATA_API_KEY尚未配置。"
        );
    }

    if (
        !Array.isArray(
            instruments
        ) ||
        !instruments.length
    ) {
        throw new Error(
            "没有可请求的行情品种。"
        );
    }

    const controller =
        new AbortController();

    const timeoutId =
        setTimeout(
            () =>
                controller.abort(),
            REQUEST_TIMEOUT_MS
        );

    try {
        const response =
            await fetch(
                buildQuoteUrl(
                    instruments
                ),
                {
                    headers: {
                        Accept:
                            "application/json",
                        Authorization:
                            `apikey ${apiKey}`
                    },
                    signal:
                        controller.signal
                }
            );

        const payload =
            await response.json();

        if (
            !response.ok ||
            payload.status ===
            "error"
        ) {
            throw new Error(
                payload.message ||
                `Twelve Data请求失败：${response.status}`
            );
        }

        return payload;
    } catch (error) {
        if (
            error.name ===
            "AbortError"
        ) {
            throw new Error(
                "Twelve Data行情请求超时。"
            );
        }

        throw error;
    } finally {
        clearTimeout(
            timeoutId
        );
    }
}

function normalizeBatch(
    instruments,
    payload
) {
    const items = [];
    const errors = [];

    instruments.forEach(
        (instrument) => {
            const rawQuote =
                findQuoteInResponse(
                    payload,
                    instrument
                        .providerSymbol
                );

            const normalized =
                normalizeQuote(
                    instrument,
                    rawQuote
                );

            if (normalized) {
                items.push(
                    normalized
                );
                return;
            }

            const providerMessage =
                rawQuote &&
                    rawQuote.message
                    ? rawQuote.message
                    : "该品种没有返回可用价格。";

            errors.push({
                symbol:
                    instrument.symbol,
                providerSymbol:
                    instrument
                        .providerSymbol,
                message:
                    providerMessage
            });
        }
    );

    return {
        items,
        errors
    };
}

function mergeMarketItems(
    existingItems,
    newItems
) {
    const itemMap =
        new Map();

    [
        ...existingItems,
        ...newItems
    ].forEach(
        (item) => {
            if (
                item &&
                item.symbol
            ) {
                itemMap.set(
                    item.symbol,
                    item
                );
            }
        }
    );

    return MARKET_INSTRUMENTS
        .map(
            (instrument) =>
                itemMap.get(
                    instrument.symbol
                )
        )
        .filter(Boolean);
}

function buildResult() {
    return {
        ...marketTickerCache,
        refreshMinutes:
            marketTickerCache
                .batchTwoPending
                ? INITIAL_FOLLOWUP_MINUTES
                : EFFECTIVE_REFRESH_MINUTES,
        configuredRefreshMinutes:
            CONFIGURED_REFRESH_MINUTES
    };
}

function scheduleSecondBatch() {
    if (
        secondBatchTimer ||
        activeSecondBatchPromise
    ) {
        return;
    }

    marketTickerCache = {
        ...marketTickerCache,
        batchTwoPending: true
    };

    secondBatchTimer =
        setTimeout(
            () => {
                secondBatchTimer =
                    null;

                refreshSecondBatch()
                    .catch(
                        (error) => {
                            console.error(
                                "[Market Ticker] Second batch error:",
                                error
                            );
                        }
                    );
            },
            SECOND_BATCH_DELAY_MS
        );
}

async function refreshSecondBatch() {
    if (
        activeSecondBatchPromise
    ) {
        return activeSecondBatchPromise;
    }

    activeSecondBatchPromise =
        (async () => {
            try {
                const payload =
                    await requestQuotes(
                        SECOND_BATCH
                    );

                const {
                    items,
                    errors
                } =
                    normalizeBatch(
                        SECOND_BATCH,
                        payload
                    );

                if (!items.length) {
                    throw new Error(
                        "第二批行情没有返回任何可用数据。"
                    );
                }

                const now =
                    Date.now();

                marketTickerCache = {
                    ...marketTickerCache,
                    items:
                        mergeMarketItems(
                            marketTickerCache
                                .items,
                            items
                        ),
                    updatedAt:
                        new Date(
                            now
                        ).toISOString(),
                    expiresAt:
                        now +
                        CACHE_TTL_MS,
                    source:
                        "twelvedata",
                    stale: false,
                    errors: [
                        ...marketTickerCache
                            .errors.filter(
                                (item) =>
                                    !SECOND_BATCH.some(
                                        (instrument) =>
                                            instrument.symbol ===
                                            item.symbol
                                    )
                            ),
                        ...errors
                    ],
                    batchTwoPending:
                        false
                };

                console.log(
                    "[Market Ticker] Second batch completed:",
                    {
                        received:
                            items.length,
                        total:
                            marketTickerCache
                                .items.length
                    }
                );

                return buildResult();
            } catch (error) {
                marketTickerCache = {
                    ...marketTickerCache,
                    stale:
                        marketTickerCache
                            .items.length > 0,
                    batchTwoPending:
                        false,
                    errors: [
                        ...marketTickerCache
                            .errors,
                        {
                            symbol:
                                "BATCH_2",
                            providerSymbol:
                                "",
                            message:
                                error.message
                        }
                    ]
                };

                if (
                    marketTickerCache
                        .items.length
                ) {
                    return buildResult();
                }

                throw error;
            } finally {
                activeSecondBatchPromise =
                    null;
            }
        })();

    return activeSecondBatchPromise;
}

async function refreshMarketTickers() {
    if (
        activeFirstBatchPromise
    ) {
        return activeFirstBatchPromise;
    }

    activeFirstBatchPromise =
        (async () => {
            try {
                const payload =
                    await requestQuotes(
                        FIRST_BATCH
                    );

                const {
                    items,
                    errors
                } =
                    normalizeBatch(
                        FIRST_BATCH,
                        payload
                    );

                if (!items.length) {
                    throw new Error(
                        "第一批行情没有返回任何可用数据。"
                    );
                }

                const now =
                    Date.now();

                marketTickerCache = {
                    ...marketTickerCache,
                    items:
                        mergeMarketItems(
                            marketTickerCache
                                .items,
                            items
                        ),
                    updatedAt:
                        new Date(
                            now
                        ).toISOString(),
                    expiresAt:
                        now +
                        CACHE_TTL_MS,
                    source:
                        "twelvedata",
                    stale: false,
                    errors: [
                        ...marketTickerCache
                            .errors.filter(
                                (item) =>
                                    !FIRST_BATCH.some(
                                        (instrument) =>
                                            instrument.symbol ===
                                            item.symbol
                                    )
                            ),
                        ...errors
                    ],
                    batchTwoPending:
                        true
                };

                scheduleSecondBatch();

                console.log(
                    "[Market Ticker] First batch completed:",
                    {
                        received:
                            items.length,
                        total:
                            marketTickerCache
                                .items.length,
                        secondBatchIn:
                            `${SECOND_BATCH_DELAY_MS / 1000}s`
                    }
                );

                return buildResult();
            } catch (error) {
                if (
                    marketTickerCache
                        .items.length
                ) {
                    marketTickerCache = {
                        ...marketTickerCache,
                        stale: true,
                        errors: [
                            ...marketTickerCache
                                .errors,
                            {
                                symbol:
                                    "BATCH_1",
                                providerSymbol:
                                    "",
                                message:
                                    error.message
                            }
                        ]
                    };

                    return buildResult();
                }

                throw error;
            } finally {
                activeFirstBatchPromise =
                    null;
            }
        })();

    return activeFirstBatchPromise;
}

async function getMarketTickers(
    options = {}
) {
    const forceRefresh =
        Boolean(
            options.forceRefresh
        );

    const cacheIsFresh =
        marketTickerCache
            .items.length &&
        Date.now() <
        marketTickerCache
            .expiresAt;

    if (
        !forceRefresh &&
        cacheIsFresh
    ) {
        return buildResult();
    }

    return refreshMarketTickers();
}

function getMarketTickerConfig() {
    return {
        provider:
            process.env
                .MARKET_TICKER_PROVIDER ||
            "twelvedata",
        configuredRefreshMinutes:
            CONFIGURED_REFRESH_MINUTES,
        effectiveRefreshMinutes:
            EFFECTIVE_REFRESH_MINUTES,
        initialFollowupMinutes:
            INITIAL_FOLLOWUP_MINUTES,
        firstBatchCount:
            FIRST_BATCH.length,
        secondBatchCount:
            SECOND_BATCH.length,
        secondBatchDelaySeconds:
            SECOND_BATCH_DELAY_MS /
            1000,
        instrumentCount:
            MARKET_INSTRUMENTS.length
    };
}

module.exports = {
    getMarketTickers,
    refreshMarketTickers,
    getMarketTickerConfig
};