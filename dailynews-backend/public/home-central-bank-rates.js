document.addEventListener(
    "DOMContentLoaded",
    function () {
        initializeCentralBankRates();
    }
);

function initializeCentralBankRates() {
    const refreshButton =
        document.getElementById(
            "centralBankRefreshButton"
        );

    const statusMessage =
        document.getElementById(
            "centralBankStatusMessage"
        );

    const tableBody =
        document.getElementById(
            "centralBankRatesBody"
        );

    const updatedAt =
        document.getElementById(
            "centralBankUpdatedAt"
        );

    const dataStatus =
        document.getElementById(
            "centralBankDataStatus"
        );

    if (
        !refreshButton ||
        !statusMessage ||
        !tableBody ||
        !updatedAt ||
        !dataStatus
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

    function formatDateTime(value) {
        if (!value) {
            return "--";
        }

        const normalizedValue =
            String(value).includes("T")
                ? String(value)
                : String(value).replace(
                    " ",
                    "T"
                ) + "Z";

        const date =
            new Date(normalizedValue);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return String(value);
        }

        return new Intl.DateTimeFormat(
            "zh-CN",
            {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
            }
        ).format(date);
    }

    function getDirectionClass(
        direction
    ) {
        if (direction === "up") {
            return "is-up";
        }

        if (direction === "down") {
            return "is-down";
        }

        return "is-unchanged";
    }

    function getDirectionSymbol(
        direction
    ) {
        if (direction === "up") {
            return "↑";
        }

        if (direction === "down") {
            return "↓";
        }

        return "—";
    }

    function getShortBankName(item) {
        const shortNameMap = {
            FED: "美联储",
            ECB: "欧洲",
            BOE: "英国",
            BOJ: "日本",
            PBOC: "中国",
            RBA: "澳洲",
            BOC: "加拿大",
            BNM: "马来西亚",
            CBC_TW: "台湾",
        };

        return (
            shortNameMap[item.bankCode] ||
            item.countryName ||
            item.bankName ||
            "—"
        );
    }

    function createValueCell(
        rateData,
        direction,
        showDirection
    ) {
        const cell =
            document.createElement("td");

        const value =
            document.createElement("span");

        value.className =
            "central-bank-value";

        if (
            rateData &&
            rateData.type === "range" &&
            rateData.low !== null &&
            rateData.high !== null
        ) {
            value.classList.add(
                "is-range"
            );

            const lowLine =
                document.createElement("span");

            lowLine.className =
                "central-bank-range-line";

            lowLine.textContent =
                `${Number(
                    rateData.low
                ).toFixed(2)}%`;

            const separator =
                document.createElement("span");

            separator.className =
                "central-bank-range-separator";

            separator.textContent =
                "/";

            const highLine =
                document.createElement("span");

            highLine.className =
                "central-bank-range-line";

            highLine.textContent =
                `${Number(
                    rateData.high
                ).toFixed(2)}%`;

            value.appendChild(
                lowLine
            );

            value.appendChild(
                separator
            );

            value.appendChild(
                highLine
            );
        } else {
            const safeDisplayValue =
                rateData &&
                    rateData.display &&
                    rateData.display !== "—"
                    ? rateData.display
                    : "—";

            value.textContent =
                safeDisplayValue;
        }

        cell.appendChild(value);

        return cell;
    }

    function createBankCell(item) {
        const cell =
            document.createElement("td");

        const bankName =
            document.createElement("strong");

        bankName.textContent =
            getShortBankName(item);

        cell.appendChild(bankName);

        return cell;
    }

    function updateDataStatus(rates) {
        if (
            !Array.isArray(rates) ||
            rates.length === 0
        ) {
            dataStatus.textContent =
                "暂无数据";

            return;
        }

        const officialCount =
            rates.filter(function (item) {
                return (
                    item.status ===
                    "official"
                );
            }).length;

        if (
            officialCount ===
            rates.length
        ) {
            dataStatus.textContent =
                "官方数据";

            return;
        }

        if (officialCount > 0) {
            dataStatus.textContent =
                `部分官方数据 ${officialCount}/${rates.length}`;

            return;
        }

        dataStatus.textContent =
            "演示数据";
    }

    function renderRates(rates) {
        tableBody.replaceChildren();

        if (
            !Array.isArray(rates) ||
            rates.length === 0
        ) {
            const row =
                document.createElement("tr");

            row.className =
                "central-bank-empty-row";

            const cell =
                document.createElement("td");

            cell.colSpan = 5;
            cell.textContent =
                "暂无央行利率数据";

            row.appendChild(cell);
            tableBody.appendChild(row);

            return;
        }

        rates.forEach(function (item) {
            const row =
                document.createElement("tr");

            row.dataset.bankCode =
                item.bankCode || "";

            row.appendChild(
                createBankCell(item)
            );

            row.appendChild(
                createValueCell(
                    item.current,
                    item.direction,
                    true
                )
            );

            row.appendChild(
                createValueCell(
                    item.previous,
                    item.direction,
                    false
                )
            );

            row.appendChild(
                createValueCell(
                    item.forecast,
                    item.direction,
                    false
                )
            );

            row.appendChild(
                createValueCell(
                    item.actual,
                    item.direction,
                    false
                )
            );

            tableBody.appendChild(row);
        });
    }

    async function loadCentralBankRates() {
        if (isLoading) {
            return;
        }

        isLoading = true;
        refreshButton.disabled = true;

        setStatus(
            "正在读取央行利率..."
        );

        try {
            const response =
                await fetch(
                    "/api/central-bank-rates",
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
                    "读取央行利率失败"
                );
            }

            const rates =
                Array.isArray(
                    result.rates
                )
                    ? result.rates
                    : [];

            renderRates(rates);
            updateDataStatus(rates);

            const newestUpdatedAt =
                rates
                    .map(function (item) {
                        return (
                            item.updatedAt ||
                            item.lastCheckedAt ||
                            ""
                        );
                    })
                    .filter(Boolean)
                    .sort()
                    .pop();

            updatedAt.textContent =
                newestUpdatedAt
                    ? `更新时间：${formatDateTime(
                        newestUpdatedAt
                    )}`
                    : "更新时间：--";

            setStatus(
                `已读取 ${rates.length} 家央行`
            );
        } catch (error) {
            console.error(
                "Load central bank rates error:",
                error
            );

            tableBody.replaceChildren();

            const row =
                document.createElement("tr");

            row.className =
                "central-bank-empty-row";

            const cell =
                document.createElement("td");

            cell.colSpan = 5;
            cell.textContent =
                "央行利率加载失败";

            row.appendChild(cell);
            tableBody.appendChild(row);

            updatedAt.textContent =
                "更新时间：--";

            dataStatus.textContent =
                "数据状态异常";

            setStatus(
                error.message ||
                "读取央行利率失败",
                "error"
            );
        } finally {
            isLoading = false;
            refreshButton.disabled = false;
        }
    }

    refreshButton.addEventListener(
        "click",
        function () {
            loadCentralBankRates();
        }
    );

    loadCentralBankRates();
}