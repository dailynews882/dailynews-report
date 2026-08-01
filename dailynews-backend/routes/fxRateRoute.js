const express = require("express");

const router = express.Router();

const FX_API_BASE =
    "https://api.frankfurter.dev/v2";

const DEFAULT_BASE_CURRENCY = "SGD";

const SUPPORTED_BASE_CURRENCIES = [
    "SGD",
    "USD",
    "CNY",
    "EUR",
    "GBP",
    "JPY",
    "MYR",
    "AUD",
    "CAD",
    "HKD",
];

const DEFAULT_QUOTE_CURRENCIES = [
    "SGD",
    "USD",
    "CNY",
    "EUR",
    "GBP",
    "JPY",
    "MYR",
    "AUD",
    "CAD",
    "HKD",
];

const CURRENCY_NAMES = {
    SGD: "新加坡元",
    USD: "美元",
    CNY: "人民币",
    EUR: "欧元",
    GBP: "英镑",
    JPY: "日元",
    MYR: "马来西亚林吉特",
    AUD: "澳大利亚元",
    CAD: "加拿大元",
    HKD: "港币",
};

const CACHE_DURATION_MS =
    60 * 60 * 1000;

const rateCache = new Map();

function normalizeCurrencyCode(value) {
    return String(value || "")
        .trim()
        .toUpperCase();
}

function getCacheKey(
    baseCurrency,
    quoteCurrencies
) {
    return (
        `${baseCurrency}:` +
        quoteCurrencies.join(",")
    );
}

function getCachedRates(cacheKey) {
    const cachedItem =
        rateCache.get(cacheKey);

    if (!cachedItem) {
        return null;
    }

    const cacheAge =
        Date.now() -
        cachedItem.cachedAt;

    if (
        cacheAge >
        CACHE_DURATION_MS
    ) {
        rateCache.delete(cacheKey);
        return null;
    }

    return cachedItem.data;
}

function saveCachedRates(
    cacheKey,
    data
) {
    rateCache.set(cacheKey, {
        cachedAt: Date.now(),
        data,
    });
}

async function fetchLatestRates(
    baseCurrency,
    quoteCurrencies
) {
    const controller =
        new AbortController();

    const timeout =
        setTimeout(function () {
            controller.abort();
        }, 10000);

    try {
        const query =
            new URLSearchParams({
                base: baseCurrency,
                quotes:
                    quoteCurrencies.join(","),
            });

        const response =
            await fetch(
                `${FX_API_BASE}/rates?${query.toString()}`,
                {
                    method: "GET",
                    headers: {
                        Accept:
                            "application/json",
                    },
                    signal:
                        controller.signal,
                }
            );

        if (!response.ok) {
            throw new Error(
                `汇率数据源返回错误：${response.status}`
            );
        }

        const result =
            await response.json();

        if (!Array.isArray(result)) {
            throw new Error(
                "汇率数据格式不正确"
            );
        }

        return result;
    } finally {
        clearTimeout(timeout);
    }
}

router.get("/", async function (
    req,
    res
) {
    try {
        const requestedBase =
            normalizeCurrencyCode(
                req.query.base
            ) ||
            DEFAULT_BASE_CURRENCY;

        if (
            !SUPPORTED_BASE_CURRENCIES.includes(
                requestedBase
            )
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "暂不支持该基准货币",
                supportedCurrencies:
                    SUPPORTED_BASE_CURRENCIES,
            });
        }

        const quoteCurrencies =
            DEFAULT_QUOTE_CURRENCIES.filter(
                function (currencyCode) {
                    return (
                        currencyCode !==
                        requestedBase
                    );
                }
            );

        const cacheKey =
            getCacheKey(
                requestedBase,
                quoteCurrencies
            );

        const cachedData =
            getCachedRates(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                cached: true,
                ...cachedData,
            });
        }

        const externalRates =
            await fetchLatestRates(
                requestedBase,
                quoteCurrencies
            );

        const rates =
            externalRates
                .map(function (item) {
                    const quoteCurrency =
                        normalizeCurrencyCode(
                            item.quote
                        );

                    const rate =
                        Number(item.rate);

                    return {
                        base:
                            normalizeCurrencyCode(
                                item.base
                            ),
                        code:
                            quoteCurrency,
                        name:
                            CURRENCY_NAMES[
                            quoteCurrency
                            ] ||
                            quoteCurrency,
                        rate:
                            Number.isFinite(rate)
                                ? rate
                                : null,
                        date:
                            String(
                                item.date || ""
                            ),
                    };
                })
                .filter(function (item) {
                    return (
                        item.code &&
                        Number.isFinite(
                            item.rate
                        )
                    );
                });

        const responseData = {
            base: {
                code:
                    requestedBase,
                name:
                    CURRENCY_NAMES[
                    requestedBase
                    ] ||
                    requestedBase,
            },
            rates,
            source:
                "Frankfurter",
            fetchedAt:
                new Date().toISOString(),
        };

        saveCachedRates(
            cacheKey,
            responseData
        );

        return res.json({
            success: true,
            cached: false,
            ...responseData,
        });
    } catch (error) {
        console.error(
            "Load FX rates error:",
            error
        );

        const isTimeout =
            error &&
            error.name ===
            "AbortError";

        return res.status(502).json({
            success: false,
            message:
                isTimeout
                    ? "汇率数据源连接超时"
                    : "读取最新汇率失败",
        });
    }
});

router.get(
    "/currencies",
    function (req, res) {
        const currencies =
            SUPPORTED_BASE_CURRENCIES.map(
                function (code) {
                    return {
                        code,
                        name:
                            CURRENCY_NAMES[
                            code
                            ] ||
                            code,
                    };
                }
            );

        return res.json({
            success: true,
            data: currencies,
        });
    }
);

module.exports = router;