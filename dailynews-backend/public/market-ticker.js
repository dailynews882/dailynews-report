const MARKET_TICKER_API =
    "/api/market-tickers";

const MARKET_TICKER_DEMO_DATA = [
    { symbol: "VIX", name: "VIX波动率指数", value: 17.82, decimals: 2, changePercent: -1.76 },
    { symbol: "SPX", name: "标普500指数", value: 6390.42, decimals: 2, changePercent: 0.41 },
    { symbol: "IXIC", name: "纳斯达克综合", value: 21242.70, decimals: 2, changePercent: 0.58 },
    { symbol: "DJI", name: "道琼斯指数", value: 44193.12, decimals: 2, changePercent: 0.18 },
    { symbol: "SSE", name: "上证指数", value: 3633.58, decimals: 2, changePercent: -0.12 },
    { symbol: "SZSE", name: "深证成指", value: 11167.42, decimals: 2, changePercent: 0.36 },
    { symbol: "N225", name: "日经225", value: 40794.86, decimals: 2, changePercent: 0.65 },
    { symbol: "HSI", name: "恒生指数", value: 24910.63, decimals: 2, changePercent: -0.43 },
    { symbol: "FTSE", name: "英国富时100", value: 9124.31, decimals: 2, changePercent: 0.27 },
    { symbol: "DAX", name: "德国DAX", value: 23846.07, decimals: 2, changePercent: -0.22 },
    { symbol: "STI", name: "新加坡海峡时报", value: 4218.56, decimals: 2, changePercent: 0.31 },
    { symbol: "XAU/USD", name: "国际黄金", value: 3378.40, decimals: 2, changePercent: 0.52 },
    { symbol: "WTI", name: "WTI原油", value: 66.82, decimals: 2, changePercent: -0.74 },
    { symbol: "BTC/USD", name: "比特币", value: 116842.35, decimals: 2, changePercent: 1.28 },
    { symbol: "ETH/USD", name: "以太坊", value: 3824.61, decimals: 2, changePercent: 1.64 }
];

let marketTickerRefreshTimer = null;

document.addEventListener(
    "DOMContentLoaded",
    () => {
        loadMarketTickers();

        window.addEventListener(
            "focus",
            () => {
                loadMarketTickers();
            }
        );
    }
);

async function loadMarketTickers() {
    updateMarketTickerHeading(
        "正在更新"
    );

    try {
        const response = await fetch(
            `${MARKET_TICKER_API}?_=${Date.now()}`,
            {
                headers: {
                    Accept: "application/json",
                    "Cache-Control":
                        "no-cache"
                },
                cache: "no-store"
            }
        );

        const result =
            await response.json();

        if (
            !response.ok ||
            !result.success
        ) {
            throw new Error(
                result.message ||
                "读取市场行情失败。"
            );
        }

        const items =
            Array.isArray(result.items)
                ? result.items
                : [];

        if (!items.length) {
            throw new Error(
                "市场行情接口没有返回数据。"
            );
        }

        renderMarketTicker(items);

        updateMarketTickerTime(
            result.updatedAt
        );

        updateMarketTickerHeading(
            result.stale
                ? "缓存行情"
                : "真实行情"
        );

        scheduleMarketTickerRefresh(
            result.refreshMinutes
        );
    } catch (error) {
        console.error(
            "Load market tickers error:",
            error
        );

        renderMarketTicker(
            MARKET_TICKER_DEMO_DATA
        );

        updateMarketTickerTime();

        updateMarketTickerHeading(
            "演示行情"
        );

        scheduleMarketTickerRefresh(
            30
        );
    }
}

function scheduleMarketTickerRefresh(
    refreshMinutes
) {
    if (marketTickerRefreshTimer) {
        window.clearTimeout(
            marketTickerRefreshTimer
        );
    }

    const minutes = Math.max(
        1,
        Number(refreshMinutes) || 30
    );

    marketTickerRefreshTimer =
        window.setTimeout(
            loadMarketTickers,
            minutes * 60 * 1000
        );
}

function updateMarketTickerHeading(
    label
) {
    const heading =
        document.querySelector(
            ".market-ticker-heading"
        );

    if (!heading) {
        return;
    }

    const statusElement =
        heading.querySelector(
            "span:last-child"
        );

    if (statusElement) {
        statusElement.textContent =
            label;
    }
}

function renderMarketTicker(items) {
    const track = document.getElementById(
        "marketTickerTrack"
    );

    if (!track) {
        return;
    }

    const groupHtml = items
        .map(createMarketTickerItem)
        .join("");

    track.innerHTML = `
    <div
      class="market-ticker-group"
      aria-label="全球市场行情第一组"
    >
      ${groupHtml}
    </div>

    <div
      class="market-ticker-group"
      aria-hidden="true"
    >
      ${groupHtml}
    </div>
  `;
}

function createMarketTickerItem(item) {
    const changePercent =
        Number(
            item.changePercent || 0
        );

    const changeClass =
        changePercent > 0
            ? "is-up"
            : changePercent < 0
                ? "is-down"
                : "is-flat";

    const changeArrow =
        changePercent > 0
            ? "▲"
            : changePercent < 0
                ? "▼"
                : "—";

    const formattedChange =
        `${changePercent > 0 ? "+" : ""}` +
        `${changePercent.toFixed(2)}%`;

    return `
    <div
      class="market-ticker-item"
      title="${escapeMarketTickerHtml(
        item.name
    )}"
    >
      <span class="market-ticker-name">
        ${escapeMarketTickerHtml(
        item.name
    )}
      </span>

      <span class="market-ticker-code">
        ${escapeMarketTickerHtml(
        item.symbol
    )}
      </span>

      <strong class="market-ticker-value">
        ${formatMarketTickerValue(
        item.value,
        item.decimals
    )}
      </strong>

      <span
        class="market-ticker-change ${changeClass}"
      >
        ${changeArrow}
        ${formattedChange}
      </span>
    </div>
  `;
}

function formatMarketTickerValue(
    value,
    decimals = 2
) {
    const number = Number(value);

    if (!Number.isFinite(number)) {
        return "--";
    }

    return number.toLocaleString(
        "en-US",
        {
            minimumFractionDigits:
                Number(decimals) || 2,
            maximumFractionDigits:
                Number(decimals) || 2
        }
    );
}

function updateMarketTickerTime(
    updatedAt
) {
    const timeElement =
        document.getElementById(
            "marketTickerUpdatedAt"
        );

    if (!timeElement) {
        return;
    }

    const date =
        updatedAt
            ? new Date(updatedAt)
            : new Date();

    if (
        Number.isNaN(date.getTime())
    ) {
        timeElement.textContent = "--:--:--";
        return;
    }

    timeElement.textContent =
        new Intl.DateTimeFormat(
            "zh-CN",
            {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false
            }
        ).format(date);
}

function escapeMarketTickerHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}