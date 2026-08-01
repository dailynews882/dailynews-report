document.addEventListener(
    "DOMContentLoaded",
    function () {
        initializeHomeFxRates();
    }
);

function initializeHomeFxRates() {
    const baseCurrencySelect =
        document.getElementById(
            "fxBaseCurrency"
        );

    const refreshButton =
        document.getElementById(
            "fxRefreshButton"
        );

    const statusMessage =
        document.getElementById(
            "fxStatusMessage"
        );

    const ratesList =
        document.getElementById(
            "fxRatesList"
        );

    const rateDate =
        document.getElementById(
            "fxRateDate"
        );

    if (
        !baseCurrencySelect ||
        !refreshButton ||
        !statusMessage ||
        !ratesList ||
        !rateDate
    ) {
        return;
    }

    let isLoading = false;

    function setStatus(
        message,
        type = "normal"
    ) {
        statusMessage.textContent =
            String(message || "");

        statusMessage.classList.toggle(
            "is-error",
            type === "error"
        );
    }

    function formatRate(value) {
        const rate =
            Number(value);

        if (!Number.isFinite(rate)) {
            return "--";
        }

        if (rate >= 100) {
            return rate.toFixed(2);
        }

        if (rate >= 10) {
            return rate.toFixed(3);
        }

        if (rate >= 1) {
            return rate.toFixed(4);
        }

        return rate.toFixed(5);
    }

    function escapeHtml(value) {
        return String(value || "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function renderRates(
        baseCurrency,
        rates
    ) {
        if (
            !Array.isArray(rates) ||
            rates.length === 0
        ) {
            ratesList.innerHTML =
                '<div class="fx-rate-item">' +
                '<span class="fx-rate-name">' +
                "暂无汇率数据" +
                "</span>" +
                "</div>";

            return;
        }

        ratesList.innerHTML =
            rates
                .map(function (item) {
                    const code =
                        escapeHtml(
                            item.code
                        );

                    const name =
                        escapeHtml(
                            item.name
                        );

                    const formattedRate =
                        formatRate(
                            item.rate
                        );

                    return (
                        '<div class="fx-rate-item">' +
                        '<div class="fx-rate-currency">' +
                        '<span class="fx-rate-code">' +
                        code +
                        "</span>" +
                        '<span class="fx-rate-name">' +
                        name +
                        "</span>" +
                        "</div>" +
                        '<strong class="fx-rate-value">' +
                        formattedRate +
                        "</strong>" +
                        "</div>"
                    );
                })
                .join("");

        ratesList.setAttribute(
            "aria-label",
            `1 ${baseCurrency} 对其他货币的参考汇率`
        );
    }

    async function loadRates() {
        if (isLoading) {
            return;
        }

        isLoading = true;
        refreshButton.disabled = true;

        const baseCurrency =
            String(
                baseCurrencySelect.value ||
                "SGD"
            ).toUpperCase();

        setStatus(
            "正在读取最新汇率..."
        );

        try {
            const response =
                await fetch(
                    `/api/fx-rates?base=` +
                    encodeURIComponent(
                        baseCurrency
                    ),
                    {
                        method: "GET",
                        headers: {
                            Accept:
                                "application/json",
                        },
                        cache: "no-store",
                    }
                );

            const result =
                await response
                    .json()
                    .catch(function () {
                        return {};
                    });

            if (
                !response.ok ||
                !result.success
            ) {
                throw new Error(
                    result.message ||
                    "读取汇率失败"
                );
            }

            const rates =
                Array.isArray(
                    result.rates
                )
                    ? result.rates
                    : [];

            renderRates(
                baseCurrency,
                rates
            );

            const firstRateDate =
                rates.length > 0
                    ? String(
                        rates[0].date ||
                        ""
                    )
                    : "";

            rateDate.textContent =
                firstRateDate
                    ? `数据日期：${firstRateDate}`
                    : "数据日期：--";

            setStatus(
                `1 ${baseCurrency} 可兑换`
            );
        } catch (error) {
            console.error(
                "Load homepage FX rates error:",
                error
            );

            ratesList.innerHTML = "";

            rateDate.textContent =
                "数据日期：--";

            setStatus(
                error.message ||
                "读取汇率失败",
                "error"
            );
        } finally {
            isLoading = false;
            refreshButton.disabled = false;
        }
    }

    baseCurrencySelect.addEventListener(
        "change",
        function () {
            loadRates();
        }
    );

    refreshButton.addEventListener(
        "click",
        function () {
            loadRates();
        }
    );

    loadRates();
}