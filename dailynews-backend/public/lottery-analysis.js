document.addEventListener(
    "DOMContentLoaded",
    () => {

        const statusElement =
            document.getElementById(
                "lotteryAnalysisStatus"
            );

        const drawDateElement =
            document.getElementById(
                "lotteryAnalysisDrawDate"
            );

        const latestNumbersElement =
            document.getElementById(
                "lotteryAnalysisLatestNumbers"
            );

        const historyTableBody =
            document.getElementById(
                "lotteryHistoryTableBody"
            );

        const numberMatrixElement =
            document.getElementById(
                "lotteryNumberMatrix"
            );

        const limitSelect =
            document.getElementById(
                "lotteryAnalysisLimit"
            );

        const refreshButton =
            document.getElementById(
                "lotteryAnalysisRefreshButton"
            );

        const gameSelect =
            document.getElementById(
                "lotteryAnalysisGameSelect"
            );

        const analysisModeTabs =
            document.getElementById(
                "lotteryAnalysisModeTabs"
            );

        let currentAnalysisMode =
            "basic";

        let latestLoadedDraws =
            [];

        function formatNumber(
            number
        ) {
            return String(number)
                .padStart(2, "0");
        }

        function formatDate(
            date
        ) {
            if (!date) {
                return "--";
            }

            return String(date);
        }

        function normalizeNumbers(
            numbers
        ) {
            if (!Array.isArray(numbers)) {
                return [];
            }

            return numbers
                .map(Number)
                .filter(
                    number =>
                        Number.isInteger(number)
                );
        }

        function getZoneIndex(
            number
        ) {
            if (
                number < 1 ||
                number > 49
            ) {
                return -1;
            }

            return Math.floor(
                (number - 1) / 7
            );
        }

        function calculateZoneRatio(
            mainNumbers
        ) {
            const zones =
                [0, 0, 0, 0, 0, 0, 0];

            const numbers =
                normalizeNumbers(
                    mainNumbers
                );

            numbers.forEach(
                number => {
                    const zoneIndex =
                        getZoneIndex(
                            number
                        );

                    if (
                        zoneIndex >= 0
                    ) {
                        zones[
                            zoneIndex
                        ] += 1;
                    }
                }
            );

            return zones.join(":");
        }

        function calculateSum(
            mainNumbers
        ) {
            return normalizeNumbers(
                mainNumbers
            ).reduce(
                (total, number) =>
                    total + number,
                0
            );
        }

        function calculateOddEvenRatio(
            mainNumbers
        ) {
            const numbers =
                normalizeNumbers(
                    mainNumbers
                );

            let oddCount = 0;
            let evenCount = 0;

            numbers.forEach(
                number => {
                    if (
                        number % 2 === 0
                    ) {
                        evenCount += 1;
                    } else {
                        oddCount += 1;
                    }
                }
            );

            return `${oddCount}:${evenCount}`;
        }

        function renderLatestDraw(
            draw
        ) {
            if (!draw) {
                return;
            }

            if (
                drawDateElement
            ) {
                drawDateElement.textContent =
                    formatDate(
                        draw.draw_date
                    );
            }

            if (
                !latestNumbersElement
            ) {
                return;
            }

            latestNumbersElement.innerHTML =
                "";

            const mainNumbers =
                normalizeNumbers(
                    draw.main_numbers
                );

            const specialNumbers =
                normalizeNumbers(
                    draw.special_numbers
                );

            mainNumbers.forEach(
                number => {
                    const ball =
                        document.createElement(
                            "span"
                        );

                    ball.className =
                        "lottery-ball";

                    ball.textContent =
                        formatNumber(
                            number
                        );

                    latestNumbersElement
                        .appendChild(
                            ball
                        );
                }
            );

            function calculateOddEvenRatio(
                mainNumbers
            ) {
                const numbers =
                    normalizeNumbers(
                        mainNumbers
                    );

                let oddCount = 0;
                let evenCount = 0;

                numbers.forEach(
                    number => {
                        if (
                            number % 2 === 0
                        ) {
                            evenCount += 1;
                        } else {
                            oddCount += 1;
                        }
                    }
                );

                return `${oddCount}:${evenCount}`;
            }

            specialNumbers.forEach(
                number => {
                    const ball =
                        document.createElement(
                            "span"
                        );

                    ball.className =
                        "lottery-ball lottery-ball-special";

                    ball.textContent =
                        formatNumber(
                            number
                        );

                    latestNumbersElement
                        .appendChild(
                            ball
                        );
                }
            );
        }

        function calculateBigSmallRatio(
            mainNumbers
        ) {
            const numbers =
                normalizeNumbers(
                    mainNumbers
                );

            let bigCount = 0;
            let smallCount = 0;

            numbers.forEach(
                number => {
                    if (
                        number >= 25
                    ) {
                        bigCount += 1;
                    } else {
                        smallCount += 1;
                    }
                }
            );

            return `${bigCount}:${smallCount}`;
        }

        function calculateSpan(
            mainNumbers
        ) {
            const numbers =
                normalizeNumbers(
                    mainNumbers
                );

            if (
                numbers.length === 0
            ) {
                return 0;
            }

            const minNumber =
                Math.min(
                    ...numbers
                );

            const maxNumber =
                Math.max(
                    ...numbers
                );

            return maxNumber - minNumber;
        }

        function buildRepeatStreakMap(
            draws
        ) {
            const chronologicalDraws =
                [...draws].reverse();

            const repeatStreakMap =
                new Map();

            for (
                let number = 1;
                number <= 49;
                number += 1
            ) {
                let streakStart = null;
                let streakLength = 0;

                chronologicalDraws.forEach(
                    (draw, drawIndex) => {
                        const mainNumbers =
                            normalizeNumbers(
                                draw.main_numbers
                            );

                        const hasNumber =
                            mainNumbers.includes(
                                number
                            );

                        if (
                            hasNumber
                        ) {
                            if (
                                streakStart === null
                            ) {
                                streakStart =
                                    drawIndex;
                            }

                            streakLength += 1;
                        } else {
                            if (
                                streakLength >= 2
                            ) {
                                for (
                                    let index =
                                        streakStart;
                                    index <
                                    streakStart +
                                    streakLength;
                                    index += 1
                                ) {
                                    repeatStreakMap.set(
                                        `${index}:${number}`,
                                        streakLength
                                    );
                                }
                            }

                            streakStart = null;
                            streakLength = 0;
                        }
                    }
                );

                if (
                    streakLength >= 2
                ) {
                    for (
                        let index =
                            streakStart;
                        index <
                        streakStart +
                        streakLength;
                        index += 1
                    ) {
                        repeatStreakMap.set(
                            `${index}:${number}`,
                            streakLength
                        );
                    }
                }
            }

            return repeatStreakMap;
        }

        function buildConsecutiveSet(
            mainNumbers
        ) {
            const numbers =
                normalizeNumbers(
                    mainNumbers
                ).sort(
                    (a, b) => a - b
                );

            const consecutiveSet =
                new Set();

            let group =
                [];

            numbers.forEach(
                (number, index) => {
                    if (
                        index === 0 ||
                        number ===
                        numbers[index - 1] + 1
                    ) {
                        group.push(
                            number
                        );
                    } else {
                        if (
                            group.length >= 2
                        ) {
                            group.forEach(
                                item =>
                                    consecutiveSet.add(
                                        item
                                    )
                            );
                        }

                        group = [
                            number
                        ];
                    }
                }
            );

            if (
                group.length >= 2
            ) {
                group.forEach(
                    item =>
                        consecutiveSet.add(
                            item
                        )
                );
            }

            return consecutiveSet;
        }

        function buildConsecutiveTrendMap(
            draws
        ) {
            const chronologicalDraws =
                [...draws].reverse();

            const trendMap =
                new Map();

            function addTrend(
                drawIndex,
                number,
                type,
                length
            ) {
                const key =
                    `${drawIndex}:${number}`;

                if (
                    !trendMap.has(key)
                ) {
                    trendMap.set(
                        key,
                        {
                            horizontal: false,
                            diagonalLeft: false,
                            diagonalRight: false,
                            maxLength: 0
                        }
                    );
                }

                const item =
                    trendMap.get(key);

                if (
                    type === "horizontal"
                ) {
                    item.horizontal = true;
                }

                if (
                    type === "diagonalLeft"
                ) {
                    item.diagonalLeft = true;
                }

                if (
                    type === "diagonalRight"
                ) {
                    item.diagonalRight = true;
                }

                item.maxLength =
                    Math.max(
                        item.maxLength,
                        length
                    );
            }

            chronologicalDraws.forEach(
                (draw, drawIndex) => {
                    const mainNumbers =
                        normalizeNumbers(
                            draw.main_numbers
                        ).sort(
                            (a, b) => a - b
                        );

                    let group = [];

                    mainNumbers.forEach(
                        (number, index) => {
                            if (
                                index === 0 ||
                                number ===
                                mainNumbers[
                                index - 1
                                ] + 1
                            ) {
                                group.push(
                                    number
                                );
                            } else {
                                if (
                                    group.length >= 2
                                ) {
                                    group.forEach(
                                        item =>
                                            addTrend(
                                                drawIndex,
                                                item,
                                                "horizontal",
                                                group.length
                                            )
                                    );
                                }

                                group = [
                                    number
                                ];
                            }
                        }
                    );

                    if (
                        group.length >= 2
                    ) {
                        group.forEach(
                            item =>
                                addTrend(
                                    drawIndex,
                                    item,
                                    "horizontal",
                                    group.length
                                )
                        );
                    }
                }
            );

            for (
                let startDrawIndex = 0;
                startDrawIndex <
                chronologicalDraws.length;
                startDrawIndex += 1
            ) {
                const startNumbers =
                    normalizeNumbers(
                        chronologicalDraws[
                            startDrawIndex
                        ].main_numbers
                    );

                startNumbers.forEach(
                    startNumber => {
                        const rightChain = [
                            {
                                drawIndex:
                                    startDrawIndex,
                                number:
                                    startNumber
                            }
                        ];

                        let nextNumber =
                            startNumber + 1;

                        for (
                            let drawIndex =
                                startDrawIndex + 1;
                            drawIndex <
                            chronologicalDraws.length;
                            drawIndex += 1
                        ) {
                            const numbers =
                                normalizeNumbers(
                                    chronologicalDraws[
                                        drawIndex
                                    ].main_numbers
                                );

                            if (
                                numbers.includes(
                                    nextNumber
                                )
                            ) {
                                rightChain.push({
                                    drawIndex,
                                    number:
                                        nextNumber
                                });

                                nextNumber += 1;
                            } else {
                                break;
                            }
                        }

                        if (
                            rightChain.length >= 2
                        ) {
                            rightChain.forEach(
                                node =>
                                    addTrend(
                                        node.drawIndex,
                                        node.number,
                                        "diagonalRight",
                                        rightChain.length
                                    )
                            );
                        }

                        const leftChain = [
                            {
                                drawIndex:
                                    startDrawIndex,
                                number:
                                    startNumber
                            }
                        ];

                        nextNumber =
                            startNumber - 1;

                        for (
                            let drawIndex =
                                startDrawIndex + 1;
                            drawIndex <
                            chronologicalDraws.length;
                            drawIndex += 1
                        ) {
                            const numbers =
                                normalizeNumbers(
                                    chronologicalDraws[
                                        drawIndex
                                    ].main_numbers
                                );

                            if (
                                numbers.includes(
                                    nextNumber
                                )
                            ) {
                                leftChain.push({
                                    drawIndex,
                                    number:
                                        nextNumber
                                });

                                nextNumber -= 1;
                            } else {
                                break;
                            }
                        }

                        if (
                            leftChain.length >= 2
                        ) {
                            leftChain.forEach(
                                node =>
                                    addTrend(
                                        node.drawIndex,
                                        node.number,
                                        "diagonalLeft",
                                        leftChain.length
                                    )
                            );
                        }
                    }
                );
            }

            return trendMap;
        }

        function renderHistoryTable(
            draws
        ) {
            if (
                !historyTableBody
            ) {
                return;
            }

            historyTableBody.innerHTML =
                "";

            if (!draws.length) {
                historyTableBody.innerHTML =
                    `
                    <tr>
                        <td colspan="54">
                            暂无开奖历史
                        </td>
                    </tr>
                    `;

                return;
            }

            const chronologicalDraws =
                [...draws].reverse();

            const repeatStreakMap =
                buildRepeatStreakMap(
                    draws
                );

            const consecutiveTrendMap =
                buildConsecutiveTrendMap(
                    draws
                );

            const patternNodeMap =
                new Map();

            if (
                Array.isArray(
                    window.patternMatches
                )
            ) {
                window.patternMatches.forEach(
                    patternResult => {
                        if (
                            !patternResult ||
                            !Array.isArray(
                                patternResult.matches
                            )
                        ) {
                            return;
                        }

                        patternResult.matches.forEach(
                            match => {
                                if (
                                    !Array.isArray(
                                        match.matchedNodes
                                    )
                                ) {
                                    return;
                                }

                                match.matchedNodes.forEach(
                                    node => {
                                        const key =
                                            `${node.drawIndex}:${node.number}`;

                                        if (
                                            !patternNodeMap.has(
                                                key
                                            )
                                        ) {
                                            patternNodeMap.set(
                                                key,
                                                []
                                            );
                                        }

                                        patternNodeMap.get(
                                            key
                                        ).push({
                                            patternId:
                                                match.patternId,
                                            patternName:
                                                match.patternName
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }

            chronologicalDraws.forEach(
                (draw, drawIndex) => {

                    const mainNumbers =
                        normalizeNumbers(
                            draw.main_numbers
                        );

                    const specialNumbers =
                        normalizeNumbers(
                            draw.special_numbers
                        );

                    const mainSet =
                        new Set(
                            mainNumbers
                        );

                    const specialSet =
                        new Set(
                            specialNumbers
                        );

                    const previousDraw =
                        drawIndex > 0
                            ? chronologicalDraws[
                            drawIndex - 1
                            ]
                            : null;

                    const previousMainNumbers =
                        previousDraw
                            ? normalizeNumbers(
                                previousDraw.main_numbers
                            )
                            : [];

                    const previousMainSet =
                        new Set(
                            previousMainNumbers
                        );

                    const repeatNumbers =
                        mainNumbers.filter(
                            number =>
                                previousMainSet.has(
                                    number
                                )
                        );

                    const repeatSet =
                        new Set(
                            repeatNumbers
                        );

                    const row =
                        document.createElement(
                            "tr"
                        );

                    const mainNumbersHtml =
                        mainNumbers
                            .map(
                                number =>
                                    `
                                    <span class="history-number">
                                        ${formatNumber(number)}
                                    </span>
                                    `
                            )
                            .join("");

                    const specialSummaryHtml =
                        specialNumbers
                            .map(
                                number =>
                                    `
                                    <span class="history-number history-number-special">
                                        ${formatNumber(number)}
                                    </span>
                                    `
                            )
                            .join("");

                    const zoneRatio =
                        calculateZoneRatio(
                            mainNumbers
                        );
                    const sum =
                        calculateSum(
                            mainNumbers
                        );
                    const oddEvenRatio =
                        calculateOddEvenRatio(
                            mainNumbers
                        );
                    const bigSmallRatio =
                        calculateBigSmallRatio(
                            mainNumbers
                        );
                    const span =
                        calculateSpan(
                            mainNumbers
                        );
                    let matrixCellsHtml =
                        "";

                    for (
                        let number = 1;
                        number <= 49;
                        number += 1
                    ) {
                        let cellClass =
                            "history-matrix-cell";

                        let numberClass =
                            "history-matrix-number history-matrix-miss";

                        if (
                            mainSet.has(number)
                        ) {
                            cellClass +=
                                " is-main";

                            const repeatStreakLength =
                                repeatStreakMap.get(
                                    `${drawIndex}:${number}`
                                ) || 0;

                            const consecutiveTrend =
                                consecutiveTrendMap.get(
                                    `${drawIndex}:${number}`
                                );
                            const patternNodeInfo =
                                patternNodeMap.get(
                                    `${drawIndex}:${number}`
                                ) || [];

                            if (
                                currentAnalysisMode === "pattern" &&
                                patternNodeInfo.length > 0
                            ) {
                                cellClass +=
                                    " is-pattern";

                                numberClass =
                                    "history-matrix-number history-matrix-pattern";
                            } else if (
                                currentAnalysisMode === "consecutive" &&
                                consecutiveTrend
                            ) {
                                cellClass +=
                                    " is-consecutive";

                                numberClass =
                                    "history-matrix-number history-matrix-consecutive";
                            } else if (
                                currentAnalysisMode === "repeat" &&
                                repeatStreakLength >= 2
                            ) {
                                cellClass +=
                                    " is-repeat";

                                numberClass =
                                    "history-matrix-number history-matrix-repeat";
                            } else {
                                numberClass =
                                    "history-matrix-number history-matrix-main";
                            }
                        } else if (
                            specialSet.has(number)
                        ) {
                            cellClass +=
                                " is-special";

                            numberClass =
                                "history-matrix-number history-matrix-special";
                        }

                        if (
                            number === 1 ||
                            number === 8 ||
                            number === 15 ||
                            number === 22 ||
                            number === 29 ||
                            number === 36 ||
                            number === 43
                        ) {
                            cellClass +=
                                " matrix-zone-start";
                        }

                        matrixCellsHtml +=
                            `
                            <td class="${cellClass}">
                                <span class="${numberClass}">
                                    ${formatNumber(number)}
                                </span>
                            </td>
                            `;
                    }

                    row.innerHTML =
                        `

                        <td class="history-fixed-column history-date-column">
                            ${formatDate(
                            draw.draw_date
                        )}
                        </td>

                        <td class="history-fixed-column history-summary-column">
                            <div class="history-number-list">
                                ${mainNumbersHtml}

                                ${specialSummaryHtml}
                            </div>
                        </td>

                        ${matrixCellsHtml}

                        <td class="history-zone-ratio-column">
                            <strong class="history-zone-ratio">
                                ${zoneRatio}
                            </strong>
                        </td>
                        <td class="history-sum-column">
                        <strong class="history-sum">
                            ${sum}
                        </strong>
                    </td>
                    <td class="history-odd-even-column">
                    <strong class="history-odd-even">
                        ${oddEvenRatio}
                    </strong>
                </td>
                <td class="history-big-small-column">
                    <strong class="history-big-small">
                        ${bigSmallRatio}
                    </strong>
                </td>
                <td class="history-span-column">
                    <strong class="history-span">
                        ${span}
                    </strong>
                </td>
                        `;

                    historyTableBody
                        .appendChild(
                            row
                        );
                }
            );
        }

        function renderNumberMatrix(
            draws
        ) {
            if (
                !numberMatrixElement
            ) {
                return;
            }

            if (!draws.length) {
                numberMatrixElement.textContent =
                    "暂无走势图数据";

                return;
            }

            numberMatrixElement.innerHTML =
                "";

            const table =
                document.createElement(
                    "table"
                );

            table.className =
                "lottery-matrix-table";

            const thead =
                document.createElement(
                    "thead"
                );

            const headerRow =
                document.createElement(
                    "tr"
                );

            const dateHeader =
                document.createElement(
                    "th"
                );

            dateHeader.textContent =
                "开奖日期";

            headerRow.appendChild(
                dateHeader
            );

            for (
                let number = 1;
                number <= 49;
                number += 1
            ) {
                const th =
                    document.createElement(
                        "th"
                    );

                th.textContent =
                    formatNumber(
                        number
                    );

                headerRow.appendChild(
                    th
                );
            }

            thead.appendChild(
                headerRow
            );

            table.appendChild(
                thead
            );

            const tbody =
                document.createElement(
                    "tbody"
                );

            const chronologicalDraws =
                [...draws]
                    .reverse();

            chronologicalDraws.forEach(
                draw => {

                    const mainNumbers =
                        normalizeNumbers(
                            draw.main_numbers
                        );

                    const specialNumbers =
                        normalizeNumbers(
                            draw.special_numbers
                        );

                    const mainSet =
                        new Set(
                            mainNumbers
                        );

                    const specialSet =
                        new Set(
                            specialNumbers
                        );

                    const row =
                        document.createElement(
                            "tr"
                        );

                    const dateCell =
                        document.createElement(
                            "td"
                        );

                    dateCell.className =
                        "matrix-date-cell";

                    dateCell.textContent =
                        formatDate(
                            draw.draw_date
                        );

                    row.appendChild(
                        dateCell
                    );

                    for (
                        let number = 1;
                        number <= 49;
                        number += 1
                    ) {
                        const cell =
                            document.createElement(
                                "td"
                            );

                        cell.className =
                            "matrix-number-cell";

                        cell.dataset.number =
                            formatNumber(
                                number
                            );

                        if (
                            mainSet.has(
                                number
                            )
                        ) {
                            cell.classList.add(
                                "is-main-hit"
                            );

                            cell.textContent =
                                formatNumber(
                                    number
                                );
                        } else if (
                            specialSet.has(
                                number
                            )
                        ) {
                            cell.classList.add(
                                "is-special-hit"
                            );

                            cell.textContent =
                                formatNumber(
                                    number
                                );
                        } else {
                            cell.classList.add(
                                "is-miss"
                            );

                            cell.textContent =
                                formatNumber(
                                    number
                                );
                        }

                        row.appendChild(
                            cell
                        );
                    }

                    tbody.appendChild(
                        row
                    );
                }
            );

            table.appendChild(
                tbody
            );

            numberMatrixElement
                .appendChild(
                    table
                );
        }

        async function loadLotteryAnalysis() {

            const selectedGame =
                gameSelect?.value ||
                "sg-toto";

            const limit =
                Number(
                    limitSelect?.value
                ) || 50;

            if (
                statusElement
            ) {
                statusElement.textContent =
                    "正在读取";
            }

            try {

                const response =
                    await fetch(
                        `/api/lottery/${encodeURIComponent(
                            selectedGame
                        )}/history?limit=${limit}`,
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

                const result =
                    await response.json();

                if (
                    !result.success
                ) {
                    throw new Error(
                        result.message ||
                        "读取开奖历史失败"
                    );
                }

                const draws =
                    Array.isArray(
                        result.draws
                    )
                        ? result.draws
                        : [];

                latestLoadedDraws =
                    draws;

                if (!draws.length) {
                    throw new Error(
                        "暂无开奖历史数据"
                    );
                }

                const patternEngine =
                    window.LotteryPatternEngine;

                if (
                    patternEngine
                ) {
                    const drawNodes =
                        patternEngine.createDrawNodes(
                            draws
                        );

                    const patternLibrary =
                        patternEngine.getPatternLibrary();

                    const patternMatches =
                        patternLibrary.map(
                            pattern => ({
                                pattern,
                                matches:
                                    patternEngine.findPatternMatches(
                                        drawNodes,
                                        pattern
                                    )
                            })
                        );

                    window.lotteryDraws = draws;
                    window.patternMatches = patternMatches;

                    console.log(
                        "Lottery Pattern Matches:",
                        patternMatches
                    );
                }

                renderLatestDraw(
                    draws[0]
                );

                renderHistoryTable(
                    draws
                );

                renderNumberMatrix(
                    draws
                );

                if (
                    statusElement
                ) {
                    statusElement.textContent =
                        `已读取 ${draws.length} 期`;
                }

            } catch (error) {

                console.error(
                    "加载彩票走势失败：",
                    error
                );

                if (
                    statusElement
                ) {
                    statusElement.textContent =
                        "读取失败";
                }

                if (
                    historyTableBody
                ) {
                    historyTableBody.innerHTML =
                        `
                        <tr>
                            <td colspan="5">
                                ${error.message}
                            </td>
                        </tr>
                        `;
                }

                if (
                    numberMatrixElement
                ) {
                    numberMatrixElement.textContent =
                        error.message;
                }
            }
        }

        function setAnalysisMode(
            mode
        ) {
            currentAnalysisMode =
                mode || "basic";

            if (
                !analysisModeTabs
            ) {
                return;
            }

            const buttons =
                analysisModeTabs.querySelectorAll(
                    ".lottery-analysis-mode-button"
                );

            buttons.forEach(
                button => {
                    const buttonMode =
                        button.dataset.analysisMode;

                    button.classList.toggle(
                        "active",
                        buttonMode ===
                        currentAnalysisMode
                    );
                }
            );

            console.log(
                "Lottery analysis mode:",
                currentAnalysisMode
            );

            if (
                latestLoadedDraws.length
            ) {
                renderHistoryTable(
                    latestLoadedDraws
                );
            }
        }

        if (
            analysisModeTabs
        ) {
            analysisModeTabs.addEventListener(
                "click",
                event => {
                    const button =
                        event.target.closest(
                            ".lottery-analysis-mode-button"
                        );

                    if (
                        !button
                    ) {
                        return;
                    }

                    const mode =
                        button.dataset.analysisMode;

                    setAnalysisMode(
                        mode
                    );
                }
            );
        }

        if (
            refreshButton
        ) {
            refreshButton.addEventListener(
                "click",
                loadLotteryAnalysis
            );
        }

        if (
            limitSelect
        ) {
            limitSelect.addEventListener(
                "change",
                loadLotteryAnalysis
            );
        }

        if (
            gameSelect
        ) {
            gameSelect.addEventListener(
                "change",
                loadLotteryAnalysis
            );
        }

        setAnalysisMode(
            "basic"
        );

        loadLotteryAnalysis();
    }
);