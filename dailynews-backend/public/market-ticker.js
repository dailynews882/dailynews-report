const MARKET_TICKER_DEMO_DATA = [
    {
        symbol: "VIX",
        name: "VIX波动率指数",
        value: 17.82,
        decimals: 2,
        changePercent: -1.76
    },
    {
        symbol: "SPX",
        name: "标普500指数",
        value: 6390.42,
        decimals: 2,
        changePercent: 0.41
    },
    {
        symbol: "IXIC",
        name: "纳斯达克综合",
        value: 21242.70,
        decimals: 2,
        changePercent: 0.58
    },
    {
        symbol: "DJI",
        name: "道琼斯指数",
        value: 44193.12,
        decimals: 2,
        changePercent: 0.18
    },
    {
        symbol: "SSE",
        name: "上证指数",
        value: 3633.58,
        decimals: 2,
        changePercent: -0.12
    },
    {
        symbol: "SZSE",
        name: "深证成指",
        value: 11167.42,
        decimals: 2,
        changePercent: 0.36
    },
    {
        symbol: "N225",
        name: "日经225",
        value: 40794.86,
        decimals: 2,
        changePercent: 0.65
    },
    {
        symbol: "HSI",
        name: "恒生指数",
        value: 24910.63,
        decimals: 2,
        changePercent: -0.43
    },
    {
        symbol: "FTSE",
        name: "英国富时100",
        value: 9124.31,
        decimals: 2,
        changePercent: 0.27
    },
    {
        symbol: "DAX",
        name: "德国DAX",
        value: 23846.07,
        decimals: 2,
        changePercent: -0.22
    },
    {
        symbol: "STI",
        name: "新加坡海峡时报",
        value: 4218.56,
        decimals: 2,
        changePercent: 0.31
    },
    {
        symbol: "XAU/USD",
        name: "国际黄金",
        value: 3378.40,
        decimals: 2,
        changePercent: 0.52
    },
    {
        symbol: "WTI",
        name: "WTI原油",
        value: 66.82,
        decimals: 2,
        changePercent: -0.74
    },
    {
        symbol: "BTC/USD",
        name: "比特币",
        value: 116842.35,
        decimals: 2,
        changePercent: 1.28
    },
    {
        symbol: "ETH/USD",
        name: "以太坊",
        value: 3824.61,
        decimals: 2,
        changePercent: 1.64
    }
];

document.addEventListener(
    "DOMContentLoaded",
    () => {
        renderMarketTicker(
            MARKET_TICKER_DEMO_DATA
        );

        updateMarketTickerTime();

        window.setInterval(
            updateMarketTickerTime,
            1000
        );
    }
);

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
    const changeClass =
        item.changePercent > 0
            ? "is-up"
            : item.changePercent < 0
                ? "is-down"
                : "is-flat";

    const changeArrow =
        item.changePercent > 0
            ? "▲"
            : item.changePercent < 0
                ? "▼"
                : "—";

    const formattedChange =
        `${item.changePercent > 0 ? "+" : ""}` +
        `${item.changePercent.toFixed(2)}%`;

    return `
      <div
        class="market-ticker-item"
        title="${escapeMarketTickerHtml(
        item.name
    )}（第一阶段演示数据）"
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
    return Number(value).toLocaleString(
        "en-US",
        {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }
    );
}

function updateMarketTickerTime() {
    const timeElement =
        document.getElementById(
            "marketTickerUpdatedAt"
        );

    if (!timeElement) {
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
        ).format(new Date());
}

function escapeMarketTickerHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}