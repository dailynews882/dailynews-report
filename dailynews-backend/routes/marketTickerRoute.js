const express = require("express");

const {
    getMarketTickers,
    getMarketTickerConfig
} = require(
    "../services/marketTickerService"
);

const router = express.Router();

router.get("/", async (req, res) => {
    try {
        const forceRefresh =
            String(
                req.query.refresh || ""
            ).toLowerCase() === "true";

        const result =
            await getMarketTickers({
                forceRefresh
            });

        res.set(
            "Cache-Control",
            "no-store, no-cache, must-revalidate"
        );

        return res.json({
            success: true,
            provider: result.source,
            source:
                result.stale
                    ? "stale-cache"
                    : "live-cache",
            stale:
                Boolean(result.stale),
            updatedAt:
                result.updatedAt,
            refreshMinutes:
                result.refreshMinutes,
            configuredRefreshMinutes:
                result.configuredRefreshMinutes,
            count:
                result.items.length,
            items:
                result.items,
            warnings:
                result.errors
        });
    } catch (error) {
        console.error(
            "Get market tickers error:",
            error
        );

        const config =
            getMarketTickerConfig();

        return res.status(503).json({
            success: false,
            message:
                error.message ||
                "读取全球市场行情失败。",
            provider:
                config.provider,
            refreshMinutes:
                config.effectiveRefreshMinutes
        });
    }
});

module.exports = router;