document.addEventListener("DOMContentLoaded", () => {
    const statusElement =
        document.getElementById("homeLotteryStatus");

    const drawNumberElement =
        document.getElementById(
            "homeLotteryDrawNumber"
        );

    const dateElement =
        document.getElementById(
            "homeLotteryDrawDate"
        );

    const mainNumbersElement =
        document.getElementById(
            "homeLotteryMainNumbers"
        );

    const specialNumberElement =
        document.getElementById(
            "homeLotterySpecialNumber"
        );

    const prizePlaceholderElement =
        document.getElementById(
            "homeLotteryPrizePlaceholder"
        );

    const trendButton =
        document.getElementById(
            "homeLotteryTrendButton"
        );

    const historyButton =
        document.getElementById(
            "homeLotteryHistoryButton"
        );

    const aiButton =
        document.getElementById(
            "homeLotteryAiButton"
        );

    const gameSelect =
        document.getElementById(
            "homeLotteryGameSelect"
        );

    function formatNumber(number) {
        return String(number).padStart(2, "0");
    }

    function formatDate(dateString) {
        if (!dateString) {
            return "--";
        }

        const parts =
            String(dateString).split("-");

        if (parts.length !== 3) {
            return dateString;
        }

        return `${parts[0]}-${parts[1]}-${parts[2]}`;
    }

    function formatMoney(value) {
        const number =
            Number(value);

        if (!Number.isFinite(number)) {
            return "-";
        }

        return (
            "S$ " +
            number.toLocaleString("en-SG")
        );
    }

    function formatWinningShares(value) {
        const number =
            Number(value);

        if (!Number.isFinite(number)) {
            return "-";
        }

        return number.toLocaleString("en-SG");
    }

    function renderMainNumbers(numbers) {
        if (!mainNumbersElement) {
            return;
        }

        mainNumbersElement.innerHTML = "";

        numbers.forEach((number) => {
            const item =
                document.createElement("span");

            item.className =
                "home-lottery-number";

            item.textContent =
                formatNumber(number);

            mainNumbersElement.appendChild(
                item
            );
        });
    }

    function renderPrizeStructure(
        prizeStructure
    ) {
        if (!prizePlaceholderElement) {
            return;
        }

        const groups =
            Array.isArray(
                prizeStructure?.groups
            )
                ? prizeStructure.groups
                : [];

        if (!groups.length) {
            prizePlaceholderElement.innerHTML =
                "奖金数据暂未提供";

            return;
        }

        let tableHtml = `
            <div class="home-lottery-prize-table">
                <div class="home-lottery-prize-row home-lottery-prize-head">
                    <span>Prize Group</span>
                    <span>Share Amount</span>
                    <span>Winning Shares</span>
                </div>
        `;

        groups.forEach((group) => {
            tableHtml += `
                <div class="home-lottery-prize-row">
                    <span>
                        Group ${group.group}
                    </span>

                    <span>
                        ${formatMoney(
                group.share_amount
            )}
                    </span>

                    <span>
                        ${formatWinningShares(
                group.winning_shares
            )}
                    </span>
                </div>
            `;
        });

        tableHtml += `
            </div>
        `;

        prizePlaceholderElement.innerHTML =
            tableHtml;
    }

    async function loadLatestLottery() {
        try {
            if (statusElement) {
                statusElement.textContent =
                    "正在读取";
            }

            const selectedGame =
                gameSelect?.value ||
                "sg-toto";

            const response =
                await fetch(
                    `/api/lottery/${selectedGame}/latest`,
                    {
                        headers: {
                            Accept:
                                "application/json"
                        },
                        cache:
                            "no-store"
                    }
                );

            if (!response.ok) {
                throw new Error(
                    `HTTP ${response.status}`
                );
            }

            const data =
                await response.json();

            if (
                !data.success ||
                !data.draw
            ) {
                throw new Error(
                    "开奖结果数据无效"
                );
            }

            const draw =
                data.draw;

            const mainNumbers =
                Array.isArray(
                    draw.main_numbers
                )
                    ? draw.main_numbers
                    : [];

            const specialNumbers =
                Array.isArray(
                    draw.special_numbers
                )
                    ? draw.special_numbers
                    : [];

            renderMainNumbers(
                mainNumbers
            );

            if (drawNumberElement) {
                drawNumberElement.textContent =
                    draw.official_draw_number ||
                    "--";
            }

            if (dateElement) {
                dateElement.textContent =
                    formatDate(
                        draw.draw_date
                    );
            }

            if (specialNumberElement) {
                specialNumberElement.textContent =
                    specialNumbers.length
                        ? formatNumber(
                            specialNumbers[0]
                        )
                        : "--";
            }

            renderPrizeStructure(
                draw.prize_structure
            );

            if (statusElement) {
                statusElement.textContent =
                    "已更新";
            }
        } catch (error) {
            console.error(
                "读取彩票最新开奖失败：",
                error
            );

            if (statusElement) {
                statusElement.textContent =
                    "读取失败";
            }

            if (drawNumberElement) {
                drawNumberElement.textContent =
                    "--";
            }

            if (prizePlaceholderElement) {
                prizePlaceholderElement.innerHTML =
                    "奖金数据读取失败";
            }
        }
    }

    if (gameSelect) {
        gameSelect.addEventListener(
            "change",
            loadLatestLottery
        );
    }

    if (trendButton) {
        trendButton.addEventListener(
            "click",
            () => {
                const selectedGame =
                    gameSelect?.value ||
                    "sg-toto";

                window.location.href =
                    `/lottery-analysis.html?game=${encodeURIComponent(
                        selectedGame
                    )}`;
            }
        );
    }

    if (historyButton) {
        historyButton.addEventListener(
            "click",
            () => {
                const selectedGame =
                    gameSelect?.value ||
                    "sg-toto";

                window.location.href =
                    `/lottery-history.html?game=${encodeURIComponent(
                        selectedGame
                    )}`;
            }
        );
    }

    if (aiButton) {
        aiButton.addEventListener(
            "click",
            () => {
                const selectedGame =
                    gameSelect?.value ||
                    "sg-toto";

                window.location.href =
                    `/lottery-analysis.html?game=${encodeURIComponent(
                        selectedGame
                    )}&mode=ai`;
            }
        );
    }

    loadLatestLottery();
});