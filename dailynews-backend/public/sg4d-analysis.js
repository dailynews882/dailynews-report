const SG4D_API_BASE = "/api/lottery/sg-4d";

let sg4dDraws = [];
let currentPrizeType = "first";
let currentAnalysisMode = "basic";
let currentQueryMode = "recent";
let preselectRowCount = 5;
const expanded4dDrawNumbers = new Set();
const locked4dWuxingSources = new Map();

let activePreselectRow = 1;
const preselectSelections = new Map();
const wuxingManualSelections = new Set();

const sg4dElements = {
    drawDate: document.getElementById("sg4dAnalysisDrawDate"),
    drawNumber: document.getElementById("sg4dAnalysisDrawNumber"),

    firstPrize: document.getElementById("sg4dLatestFirstPrize"),
    secondPrize: document.getElementById("sg4dLatestSecondPrize"),
    thirdPrize: document.getElementById("sg4dLatestThirdPrize"),

    status: document.getElementById("sg4dAnalysisStatus"),
    limit: document.getElementById("sg4dAnalysisLimit"),
    refreshButton: document.getElementById("sg4dAnalysisRefreshButton"),

    tableBody: document.getElementById("sg4dHistoryTableBody"),

    prizeButtons: document.querySelectorAll(
        ".sg4d-prize-selector-button"
    ),

    modeButtons: document.querySelectorAll(
        ".sg4d-analysis-mode-button"
    ),

    gameSelect: document.getElementById(
        "sg4dAnalysisGameSelect"
    ),

    queryModeButtons: document.querySelectorAll(
        ".sg4d-query-mode-button"
    ),

    recentQueryControls: document.getElementById(
        "sg4dRecentQueryControls"
    ),

    dateRangeControls: document.getElementById(
        "sg4dDateRangeControls"
    ),

    startDate: document.getElementById(
        "sg4dAnalysisStartDate"
    ),

    endDate: document.getElementById(
        "sg4dAnalysisEndDate"
    ),

    dateQueryButton: document.getElementById(
        "sg4dAnalysisDateQueryButton"
    )
};

function normalize4dNumber(value) {
    if (
        value === null ||
        value === undefined
    ) {
        return "----";
    }

    const text = String(value).trim();

    if (!/^\d{1,4}$/.test(text)) {
        return "----";
    }

    return text.padStart(4, "0");
}

function parsePrizeStructure(draw) {
    const prize =
        draw &&
            draw.prize_structure &&
            typeof draw.prize_structure === "object"
            ? draw.prize_structure
            : {};

    return {
        first: normalize4dNumber(
            prize.first
        ),

        second: normalize4dNumber(
            prize.second
        ),

        third: normalize4dNumber(
            prize.third
        ),

        starter: Array.isArray(prize.starter)
            ? prize.starter.map(normalize4dNumber)
            : [],

        consolation: Array.isArray(
            prize.consolation
        )
            ? prize.consolation.map(
                normalize4dNumber
            )
            : []
    };
}

function getSelectedPrizeNumber(draw) {
    const prize = parsePrizeStructure(draw);

    if (currentPrizeType === "second") {
        return prize.second;
    }

    if (currentPrizeType === "third") {
        return prize.third;
    }

    return prize.first;
}

function formatDisplayDate(value) {
    if (!value) {
        return "---- -- --";
    }

    const parts = String(value).split("-");

    if (parts.length !== 3) {
        return value;
    }

    return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

function setStatus(message) {
    if (!sg4dElements.status) {
        return;
    }

    sg4dElements.status.textContent =
        message;
}

function renderLatestDraw() {
    const latest = sg4dDraws[0];

    if (!latest) {
        if (sg4dElements.drawDate) {
            sg4dElements.drawDate.textContent =
                "---- -- --";
        }

        if (sg4dElements.drawNumber) {
            sg4dElements.drawNumber.textContent =
                "----";
        }

        if (sg4dElements.firstPrize) {
            sg4dElements.firstPrize.textContent =
                "----";
        }

        if (sg4dElements.secondPrize) {
            sg4dElements.secondPrize.textContent =
                "----";
        }

        if (sg4dElements.thirdPrize) {
            sg4dElements.thirdPrize.textContent =
                "----";
        }

        return;
    }

    const prize = parsePrizeStructure(latest);

    if (sg4dElements.drawDate) {
        sg4dElements.drawDate.textContent =
            formatDisplayDate(
                latest.draw_date
            );
    }

    if (sg4dElements.drawNumber) {
        sg4dElements.drawNumber.textContent =
            latest.official_draw_number ||
            latest.draw_number ||
            "----";
    }

    if (sg4dElements.firstPrize) {
        sg4dElements.firstPrize.textContent =
            prize.first;
    }

    if (sg4dElements.secondPrize) {
        sg4dElements.secondPrize.textContent =
            prize.second;
    }

    if (sg4dElements.thirdPrize) {
        sg4dElements.thirdPrize.textContent =
            prize.third;
    }
}

function get4dFiveElement(digit) {
    const text = String(digit);

    if (["0", "1", "6"].includes(text)) {
        return "water";
    }

    if (["2", "7"].includes(text)) {
        return "fire";
    }

    if (["3", "8"].includes(text)) {
        return "wood";
    }

    if (["4", "9"].includes(text)) {
        return "metal";
    }

    if (text === "5") {
        return "earth";
    }

    return "";
}


function get4dGeneratedElement(element) {
    const generationMap = {
        wood: "fire",
        fire: "earth",
        earth: "metal",
        metal: "water",
        water: "wood"
    };

    return generationMap[element] || "";
}

function get4dDigitsByElement(element) {
    const digitMap = {
        water: ["0", "1", "6"],
        fire: ["2", "7"],
        wood: ["3", "8"],
        metal: ["4", "9"],
        earth: ["5"]
    };

    return Array.isArray(digitMap[element])
        ? digitMap[element]
        : [];
}

function isFiveElementMode() {
    return (
        currentAnalysisMode === "element" ||
        currentAnalysisMode === "five-element" ||
        currentAnalysisMode === "wuxing"
    );
}


function isPatternMode() {
    return currentAnalysisMode === "pattern";
}

/*
 * Singapore 4D Pattern Engine
 *
 * 设计原则：
 * 1. 千位 / 百位 / 十位 / 个位分别独立识别，绝不跨位置。
 * 2. 历史顺序按“旧 → 新”计算。
 * 3. 参考 TOTO Pattern Engine 的“相对期偏移 + 数字偏移”思想。
 * 4. 一个形态成立后，组成该形态的全部节点一起高亮。
 * 5. 0 与 9 不做循环相邻处理。
 *
 * 第一阶段形态：
 * - 2期：重号、左错位(-1)、右错位(+1)
 * - 3期：3期重号、连续±1、连续±2、山形/V形
 * - 4期：连续±1、ABAB波浪
 * - 5期：连续±1
 */

const SG4D_PATTERN_LIBRARY = [
    {
        id: "P01",
        name: "重号",
        length: 2,
        matcher(values) {
            return values[0] === values[1];
        }
    },
    {
        id: "P03",
        name: "左错位",
        length: 2,
        matcher(values) {
            return values[1] - values[0] === -1;
        }
    },
    {
        id: "P04",
        name: "右错位",
        length: 2,
        matcher(values) {
            return values[1] - values[0] === 1;
        }
    },
    {
        id: "P05",
        name: "3期重号",
        length: 3,
        matcher(values) {
            return (
                values[0] === values[1] &&
                values[1] === values[2]
            );
        }
    },
    {
        id: "P07",
        name: "左斜杠形",
        length: 3,
        matcher(values) {
            return (
                values[1] - values[0] === -1 &&
                values[2] - values[1] === -1
            );
        }
    },
    {
        id: "P08",
        name: "右斜杠形",
        length: 3,
        matcher(values) {
            return (
                values[1] - values[0] === 1 &&
                values[2] - values[1] === 1
            );
        }
    },
    {
        id: "P11",
        name: "V形",
        aliases: ["左山形"],
        length: 3,
        matcher(values) {
            return (
                values[0] === values[2] &&
                values[1] < values[0]
            );
        }
    },
    {
        id: "P12",
        name: "山形",
        aliases: ["右山形"],
        length: 3,
        matcher(values) {
            return (
                values[0] === values[2] &&
                values[1] > values[0]
            );
        }
    },
    {
        id: "P13",
        name: "隔位左斜杠形",
        length: 3,
        matcher(values) {
            return (
                values[1] - values[0] === -2 &&
                values[2] - values[1] === -2
            );
        }
    },
    {
        id: "P14",
        name: "隔位右斜杠形",
        length: 3,
        matcher(values) {
            return (
                values[1] - values[0] === 2 &&
                values[2] - values[1] === 2
            );
        }
    },
    {
        id: "P35",
        name: "4期右斜杠形",
        length: 4,
        matcher(values) {
            return values.every(
                (value, index) =>
                    index === 0 ||
                    value - values[index - 1] === 1
            );
        }
    },
    {
        id: "P36",
        name: "4期左斜杠形",
        length: 4,
        matcher(values) {
            return values.every(
                (value, index) =>
                    index === 0 ||
                    value - values[index - 1] === -1
            );
        }
    },
    {
        id: "P37",
        name: "4期波浪形",
        aliases: ["ABAB形"],
        length: 4,
        matcher(values) {
            return (
                values[0] === values[2] &&
                values[1] === values[3] &&
                values[0] !== values[1]
            );
        }
    },
    {
        id: "P38",
        name: "5期右斜杠形",
        length: 5,
        matcher(values) {
            return values.every(
                (value, index) =>
                    index === 0 ||
                    value - values[index - 1] === 1
            );
        }
    },
    {
        id: "P39",
        name: "5期左斜杠形",
        length: 5,
        matcher(values) {
            return values.every(
                (value, index) =>
                    index === 0 ||
                    value - values[index - 1] === -1
            );
        }
    }
];

function normalize4dPatternDigit(value) {
    const number = Number(value);

    if (
        !Number.isInteger(number) ||
        number < 0 ||
        number > 9
    ) {
        return null;
    }

    return number;
}

function match4dPatternValues(values) {
    if (
        !Array.isArray(values) ||
        values.length < 2
    ) {
        return [];
    }

    const normalizedValues =
        values.map(normalize4dPatternDigit);

    if (
        normalizedValues.some(
            value => value === null
        )
    ) {
        return [];
    }

    return SG4D_PATTERN_LIBRARY.filter(
        pattern =>
            pattern.length === normalizedValues.length &&
            typeof pattern.matcher === "function" &&
            pattern.matcher(normalizedValues)
    );
}

function add4dPatternMatch(
    endpointMap,
    rowIndex,
    position,
    pattern
) {
    const key = `${rowIndex}:${position}`;

    if (!endpointMap.has(key)) {
        endpointMap.set(key, []);
    }

    const matches = endpointMap.get(key);

    if (
        !matches.some(
            item => item.id === pattern.id
        )
    ) {
        matches.push({
            id: pattern.id,
            name: pattern.name,
            aliases: Array.isArray(pattern.aliases)
                ? [...pattern.aliases]
                : []
        });
    }
}

function build4dPatternEndpointMap(historyRows) {
    const endpointMap = new Map();

    if (
        !Array.isArray(historyRows) ||
        historyRows.length < 2
    ) {
        return endpointMap;
    }

    const selectedNumbers = historyRows.map(
        draw => normalize4dNumber(
            getSelectedPrizeNumber(draw)
        )
    );

    /*
     * 先按较长形态识别，再识别较短形态。
     * endpointMap 会自动去重，因此同一个节点可以同时属于多个形态。
     */
    const patternLengths = [5, 4, 3, 2];

    patternLengths.forEach(
        patternLength => {
            if (
                selectedNumbers.length <
                patternLength
            ) {
                return;
            }

            for (
                let startIndex = 0;
                startIndex <=
                selectedNumbers.length -
                patternLength;
                startIndex += 1
            ) {
                const numberWindow =
                    selectedNumbers.slice(
                        startIndex,
                        startIndex + patternLength
                    );

                if (
                    numberWindow.some(
                        number => number === "----"
                    )
                ) {
                    continue;
                }

                for (
                    let position = 0;
                    position < 4;
                    position += 1
                ) {
                    const digitValues =
                        numberWindow.map(
                            number => number[position]
                        );

                    const matchedPatterns =
                        match4dPatternValues(
                            digitValues
                        );

                    if (
                        matchedPatterns.length === 0
                    ) {
                        continue;
                    }

                    matchedPatterns.forEach(
                        pattern => {
                            for (
                                let offset = 0;
                                offset < patternLength;
                                offset += 1
                            ) {
                                add4dPatternMatch(
                                    endpointMap,
                                    startIndex + offset,
                                    position,
                                    pattern
                                );
                            }
                        }
                    );
                }
            }
        }
    );

    return endpointMap;
}

function buildDigitCells(
    number,
    previousNumber = null,
    nextNumber = null,
    patternMatchesByPosition = null
) {
    const normalized =
        normalize4dNumber(number);

    const previousNormalized =
        normalize4dNumber(previousNumber);

    const nextNormalized =
        normalize4dNumber(nextNumber);

    const digits =
        normalized === "----"
            ? ["", "", "", ""]
            : normalized.split("");

    const previousDigits =
        previousNormalized === "----"
            ? ["", "", "", ""]
            : previousNormalized.split("");

    const nextDigits =
        nextNormalized === "----"
            ? ["", "", "", ""]
            : nextNormalized.split("");

    const cells = [];

    for (
        let position = 0;
        position < 4;
        position += 1
    ) {
        const currentDigit =
            digits[position];

        const previousDigit =
            previousDigits[position];

        const nextDigit =
            nextDigits[position];

        const connectsToPrevious =
            currentAnalysisMode === "consecutive" &&
            currentDigit !== "" &&
            previousDigit !== "" &&
            Math.abs(
                Number(currentDigit) -
                Number(previousDigit)
            ) === 1;

        const connectsToNext =
            currentAnalysisMode === "consecutive" &&
            currentDigit !== "" &&
            nextDigit !== "" &&
            Math.abs(
                Number(currentDigit) -
                Number(nextDigit)
            ) === 1;

        const isConsecutiveEndpoint =
            connectsToPrevious ||
            connectsToNext;

        const repeatsPrevious =
            currentAnalysisMode === "repeat" &&
            currentDigit !== "" &&
            previousDigit !== "" &&
            currentDigit === previousDigit;

        const repeatsNext =
            currentAnalysisMode === "repeat" &&
            currentDigit !== "" &&
            nextDigit !== "" &&
            currentDigit === nextDigit;

        const isRepeatEndpoint =
            repeatsPrevious ||
            repeatsNext;

        const patternMatches =
            isPatternMode() &&
                patternMatchesByPosition &&
                Array.isArray(
                    patternMatchesByPosition[position]
                )
                ? patternMatchesByPosition[position]
                : [];

        const isPatternEndpoint =
            patternMatches.length > 0;

        for (
            let digit = 0;
            digit <= 9;
            digit += 1
        ) {
            const isHit =
                currentDigit ===
                String(digit);

            const zoneStartClass =
                digit === 0
                    ? " sg4d-zone-start"
                    : "";

            let hitClass = "";

            if (isHit) {
                hitClass = " hit";

                if (currentAnalysisMode === "consecutive") {
                    hitClass += isConsecutiveEndpoint
                        ? " sg4d-consecutive-hit"
                        : " sg4d-consecutive-normal";
                }

                if (currentAnalysisMode === "repeat") {
                    hitClass += isRepeatEndpoint
                        ? " sg4d-repeat-hit"
                        : " sg4d-repeat-normal";
                }

                if (isFiveElementMode()) {
                    const fiveElement =
                        get4dFiveElement(currentDigit);

                    if (fiveElement) {
                        hitClass +=
                            ` sg4d-wuxing-hit sg4d-wuxing-${fiveElement}`;
                    }
                }

                if (isPatternMode()) {
                    hitClass += isPatternEndpoint
                        ? " sg4d-pattern-hit"
                        : " sg4d-pattern-normal";
                }
            }

            const patternTitle =
                isPatternEndpoint
                    ? ` title="${patternMatches
                        .map(item => item.name)
                        .filter(
                            (name, index, names) =>
                                names.indexOf(name) === index
                        )
                        .join(" / ")}"`
                    : "";

            const numberContent = isHit
                ? `<span class="sg4d-number-ball">${digit}</span>`
                : "";

            cells.push(
                `<td class="sg4d-digit-cell${zoneStartClass}${hitClass}" data-position="${position}" data-digit="${digit}"${patternTitle}>${numberContent}</td>`
            );
        }
    }

    return cells.join("");
}

function calculate4dSum(number) {
    const normalized = normalize4dNumber(number);

    if (normalized === "----") {
        return "--";
    }

    return normalized
        .split("")
        .map(Number)
        .reduce((sum, digit) => sum + digit, 0);
}

function calculate4dOddEven(number) {
    const normalized = normalize4dNumber(number);

    if (normalized === "----") {
        return "--";
    }

    let odd = 0;
    let even = 0;

    normalized
        .split("")
        .map(Number)
        .forEach((digit) => {
            if (digit % 2 === 0) {
                even += 1;
            } else {
                odd += 1;
            }
        });

    return `${odd}:${even}`;
}

function buildPrizeDetailNumbers(numbers) {
    if (
        !Array.isArray(numbers) ||
        numbers.length === 0
    ) {
        return `
            <span class="sg4d-detail-empty">
                暂无数据
            </span>
        `;
    }

    return numbers
        .map(
            (number) => `
                <span class="sg4d-detail-number">
                    ${normalize4dNumber(number)}
                </span>
            `
        )
        .join("");
}

function buildHistoryDetailRow(
    drawNumber,
    prize
) {
    return `
        <tr
            class="sg4d-detail-row"
            data-detail-draw-number="${drawNumber}"
        >
            <td colspan="46">
                <div class="sg4d-detail-grid">
                    <div class="sg4d-detail-group">
                        <strong>
                            Starter Prizes（入围奖）
                        </strong>

                        <div class="sg4d-detail-numbers">
                            ${buildPrizeDetailNumbers(
        prize.starter
    )}
                        </div>
                    </div>

                    <div class="sg4d-detail-group">
                        <strong>
                            Consolation Prizes（安慰奖）
                        </strong>

                        <div class="sg4d-detail-numbers">
                            ${buildPrizeDetailNumbers(
        prize.consolation
    )}
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    `;
}

function renderHistoryTable() {
    if (!sg4dElements.tableBody) {
        return;
    }

    if (!Array.isArray(sg4dDraws)) {
        sg4dDraws = [];
    }

    if (sg4dDraws.length === 0) {
        sg4dElements.tableBody.innerHTML =
            `
            <tr>
                <td colspan="46">
                    暂无 Singapore 4D 历史数据
                </td>
            </tr>
            `;

        return;
    }

    /*
     * API 返回顺序：
     * 最新 → 最旧
     *
     * 走势图显示顺序：
     * 最旧 → 最新
     *
     * 因此这里复制后 reverse，
     * 不修改原始 sg4dDraws 顺序。
     */
    const historyRows =
        [...sg4dDraws].reverse();

    const patternEndpointMap =
        isPatternMode()
            ? build4dPatternEndpointMap(
                historyRows
            )
            : new Map();

    sg4dElements.tableBody.innerHTML =
        historyRows
            .map((draw, rowIndex) => {
                const prize =
                    parsePrizeStructure(draw);

                const drawNumber =
                    String(
                        draw.official_draw_number ||
                        draw.draw_number ||
                        ""
                    );

                const isExpanded =
                    expanded4dDrawNumbers.has(
                        drawNumber
                    );

                const selectedNumber =
                    getSelectedPrizeNumber(
                        draw
                    );

                const previousDraw =
                    rowIndex > 0
                        ? historyRows[rowIndex - 1]
                        : null;

                const previousSelectedNumber =
                    previousDraw
                        ? getSelectedPrizeNumber(
                            previousDraw
                        )
                        : null;

                const nextDraw =
                    rowIndex < historyRows.length - 1
                        ? historyRows[rowIndex + 1]
                        : null;

                const nextSelectedNumber =
                    nextDraw
                        ? getSelectedPrizeNumber(
                            nextDraw
                        )
                        : null;

                const sumValue =
                    calculate4dSum(
                        selectedNumber
                    );

                const oddEvenValue =
                    calculate4dOddEven(
                        selectedNumber
                    );

                const firstActive =
                    currentPrizeType === "first"
                        ? " active"
                        : "";

                const secondActive =
                    currentPrizeType === "second"
                        ? " active"
                        : "";

                const thirdActive =
                    currentPrizeType === "third"
                        ? " active"
                        : "";

                const patternMatchesByPosition =
                    [0, 1, 2, 3].map(
                        position =>
                            patternEndpointMap.get(
                                `${rowIndex}:${position}`
                            ) || []
                    );

                const mainRow = `
                    <tr
                        class="sg4d-history-row"
                        data-draw-number="${drawNumber}"
                    >
                        <td class="sg4d-date-value">
                            ${formatDisplayDate(
                    draw.draw_date
                )}
                        </td>

                        <td class="sg4d-prize-value${firstActive}">
                            ${prize.first}
                        </td>

                        <td class="sg4d-prize-value${secondActive}">
                            ${prize.second}
                        </td>

                        <td class="sg4d-prize-value sg4d-third-prize-value${thirdActive}">
                            <span>
                                ${prize.third}
                            </span>

                            <button
                                type="button"
                                class="sg4d-row-expand-button"
                                data-draw-number="${drawNumber}"
                                aria-expanded="${isExpanded ? "true" : "false"}"
                                aria-label="${isExpanded
                        ? `收起 Draw ${drawNumber} 入围奖和安慰奖`
                        : `展开 Draw ${drawNumber} 入围奖和安慰奖`
                    }"
                                title="${isExpanded
                        ? "收起入围奖和安慰奖"
                        : "查看入围奖和安慰奖"
                    }"
                            >
                                ${isExpanded ? "▲" : "▼"}
                            </button>
                        </td>

                        ${buildDigitCells(
                        selectedNumber,
                        previousSelectedNumber,
                        nextSelectedNumber,
                        patternMatchesByPosition
                    )}

                        <td class="sg4d-stat-value">
                            ${sumValue}
                        </td>

                        <td class="sg4d-stat-value">
                            ${oddEvenValue}
                        </td>
                    </tr>
                `;

                const detailRow =
                    isExpanded
                        ? buildHistoryDetailRow(
                            drawNumber,
                            prize
                        )
                        : "";

                return (
                    mainRow +
                    detailRow
                );
            })
            .join("");

    refresh4dWuxingLockedSourceStyles();
    renderLocked4dWuxingPreselect();

}

function bindHistoryDetailToggle() {
    if (!sg4dElements.tableBody) {
        return;
    }

    sg4dElements.tableBody.addEventListener(
        "click",
        (event) => {
            const button =
                event.target.closest(
                    ".sg4d-row-expand-button"
                );

            if (
                !button ||
                !sg4dElements.tableBody.contains(
                    button
                )
            ) {
                return;
            }

            const drawNumber =
                String(
                    button.dataset.drawNumber ||
                    ""
                ).trim();

            if (!drawNumber) {
                return;
            }

            if (
                expanded4dDrawNumbers.has(
                    drawNumber
                )
            ) {
                expanded4dDrawNumbers.delete(
                    drawNumber
                );
            } else {
                expanded4dDrawNumbers.add(
                    drawNumber
                );
            }

            renderHistoryTable();

            requestAnimationFrame(
                syncPreselectWithHistoryTable
            );
        }
    );
}


function updatePrizeButtons() {
    sg4dElements.prizeButtons.forEach(
        (button) => {
            const prizeType =
                button.dataset.prizeType;

            button.classList.toggle(
                "active",
                prizeType ===
                currentPrizeType
            );
        }
    );
}

function updateModeButtons() {
    sg4dElements.modeButtons.forEach(
        (button) => {
            const mode =
                button.dataset.analysisMode;

            button.classList.toggle(
                "active",
                mode ===
                currentAnalysisMode
            );
        }
    );
}

function bindPrizeSelector() {
    sg4dElements.prizeButtons.forEach(
        (button) => {
            button.addEventListener(
                "click",
                () => {
                    const prizeType =
                        button.dataset.prizeType;

                    if (
                        ![
                            "first",
                            "second",
                            "third"
                        ].includes(prizeType)
                    ) {
                        return;
                    }

                    currentPrizeType =
                        prizeType;

                    updatePrizeButtons();
                    clear4dWuxingPreselectPreview();
                    renderHistoryTable();
                }
            );
        }
    );
}

function bindAnalysisModes() {
    sg4dElements.modeButtons.forEach(
        (button) => {
            button.addEventListener(
                "click",
                () => {
                    const mode =
                        button.dataset.analysisMode;

                    if (!mode) {
                        return;
                    }

                    currentAnalysisMode =
                        mode;

                    updateModeButtons();

                    /*
                     * 已接入：基本走势、连号走势、重号走势、五行走势、形态走势。
                     * 连号：相邻两期同一位置数字相差1。
                     * 重号：相邻两期同一位置数字完全相同。
                     * 五行：水=0/1/6，火=2/7，木=3/8，金=4/9，土=5。
                     * 0与9不作为循环连号处理。
                     * 形态：按千/百/十/个位独立识别2/3/4/5期轨迹。
                     */
                    renderHistoryTable();
                }
            );
        }
    );
}

function bindRefreshButton() {
    if (!sg4dElements.refreshButton) {
        return;
    }

    sg4dElements.refreshButton.addEventListener(
        "click",
        () => {
            loadSingapore4dHistory();
        }
    );
}

function bindLimitSelect() {
    if (!sg4dElements.limit) {
        return;
    }

    sg4dElements.limit.addEventListener(
        "change",
        () => {
            loadSingapore4dHistory();
        }
    );
}

function bindGameSelect() {
    if (!sg4dElements.gameSelect) {
        return;
    }

    sg4dElements.gameSelect.addEventListener(
        "change",
        () => {
            const gameCode =
                sg4dElements.gameSelect.value;

            if (gameCode === "sg-toto") {
                window.location.href =
                    "/lottery-analysis.html";
            }
        }
    );
}

function updateQueryModeUI() {
    sg4dElements.queryModeButtons.forEach(
        (button) => {
            button.classList.toggle(
                "active",
                button.dataset.queryMode ===
                currentQueryMode
            );
        }
    );

    if (sg4dElements.recentQueryControls) {
        sg4dElements.recentQueryControls.hidden =
            currentQueryMode !== "recent";
    }

    if (sg4dElements.dateRangeControls) {
        sg4dElements.dateRangeControls.hidden =
            currentQueryMode !== "date_range";
    }
}

function bindQueryModeButtons() {
    sg4dElements.queryModeButtons.forEach(
        (button) => {
            button.addEventListener(
                "click",
                () => {
                    const mode =
                        button.dataset.queryMode;

                    if (
                        mode !== "recent" &&
                        mode !== "date_range"
                    ) {
                        return;
                    }

                    currentQueryMode = mode;

                    updateQueryModeUI();

                    if (mode === "recent") {
                        loadSingapore4dHistory();
                    }
                }
            );
        }
    );
}

async function loadSingapore4dDateRange() {
    const startDate =
        sg4dElements.startDate
            ? sg4dElements.startDate.value
            : "";

    const endDate =
        sg4dElements.endDate
            ? sg4dElements.endDate.value
            : "";

    if (!startDate || !endDate) {
        setStatus("请选择开始和结束日期");
        return;
    }

    if (startDate > endDate) {
        setStatus("开始日期不能晚于结束日期");
        return;
    }

    setStatus("正在读取");

    try {
        const params =
            new URLSearchParams({
                start_date: startDate,
                end_date: endDate
            });

        const response = await fetch(
            `${SG4D_API_BASE}/history?${params.toString()}`,
            {
                method: "GET",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data && data.message
                    ? data.message
                    : `HTTP ${response.status}`
            );
        }

        if (
            !data ||
            data.success !== true ||
            !Array.isArray(data.draws)
        ) {
            throw new Error(
                "4D 日期范围数据格式不正确"
            );
        }

        sg4dDraws = data.draws;

        renderLatestDraw();
        renderHistoryTable();

        requestAnimationFrame(
            syncPreselectWithHistoryTable
        );

        setStatus(
            `${startDate} 至 ${endDate} · ${sg4dDraws.length} 期`
        );
    } catch (error) {
        console.error(
            "读取 Singapore 4D 日期范围失败：",
            error
        );

        setStatus("读取失败");
    }
}

function bindDateRangeQuery() {
    if (!sg4dElements.dateQueryButton) {
        return;
    }

    sg4dElements.dateQueryButton.addEventListener(
        "click",
        () => {
            loadSingapore4dDateRange();
        }
    );
}

async function loadSingapore4dHistory() {
    const limit =
        Number.parseInt(
            sg4dElements.limit
                ? sg4dElements.limit.value
                : "50",
            10
        ) || 50;

    setStatus("正在读取");

    try {
        const response = await fetch(
            `${SG4D_API_BASE}/history?limit=${limit}`,
            {
                method: "GET",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const data =
            await response.json();

        if (!response.ok) {
            throw new Error(
                data &&
                    data.message
                    ? data.message
                    : `HTTP ${response.status}`
            );
        }

        if (
            !data ||
            data.success !== true ||
            !Array.isArray(data.draws)
        ) {
            throw new Error(
                "4D 历史数据格式不正确"
            );
        }

        sg4dDraws = data.draws;

        renderLatestDraw();
        renderHistoryTable();

        requestAnimationFrame(
            syncPreselectWithHistoryTable
        );

        setStatus(
            `已读取 ${sg4dDraws.length} 期`
        );
    } catch (error) {
        console.error(
            "读取 Singapore 4D 历史数据失败：",
            error
        );

        sg4dDraws = [];

        renderLatestDraw();
        renderHistoryTable();

        requestAnimationFrame(
            syncPreselectWithHistoryTable
        );

        setStatus("读取失败");
    }
}

function initSingapore4dAnalysis() {
    updatePrizeButtons();
    updateModeButtons();

    bindPrizeSelector();
    bindAnalysisModes();
    bindRefreshButton();
    bindLimitSelect();
    bindGameSelect();

    bindQueryModeButtons();
    bindDateRangeQuery();
    bindHistoryDetailToggle();
    bind4dWuxingHoverPreview();
    updateQueryModeUI();

    initializePreselectGrids();

    renderPreselectTableFoot();
    renderPreselectSelections();

    bindPreselectActions();
    bindPreselectSelectionActions();

    loadSingapore4dHistory();
}

document.addEventListener(
    "DOMContentLoaded",
    initSingapore4dAnalysis
);

window.addEventListener(
    "resize",
    () => {
        requestAnimationFrame(
            syncPreselectWithHistoryTable
        );
    }
);

function buildPreselectGrid(gridElement) {
    if (!gridElement) {
        return;
    }

    gridElement.innerHTML = "";

    for (let position = 0; position < 4; position += 1) {
        for (let digit = 0; digit <= 9; digit += 1) {
            const cell =
                document.createElement("span");

            cell.dataset.position =
                String(position);

            cell.dataset.digit =
                String(digit);

            cell.textContent = "";

            gridElement.appendChild(cell);
        }
    }
}

function initializePreselectGrids() {
    const wuxingGrid =
        document.getElementById(
            "sg4dWuxingPreselectGrid"
        );

    buildPreselectGrid(wuxingGrid);

    document
        .querySelectorAll(
            "[data-preselect-grid]"
        )
        .forEach((gridElement) => {
            buildPreselectGrid(
                gridElement
            );
        });
}

function renderPreselectTableFoot() {
    const tableFoot =
        document.getElementById(
            "sg4dPreselectTableFoot"
        );

    if (!tableFoot) {
        return;
    }

    const buildDigitCells = () => {
        let html = "";

        for (let index = 0; index < 40; index += 1) {
            const position =
                Math.floor(index / 10);

            const digit =
                index % 10;

            const isZoneStart =
                digit === 0;

            html += `
                <td
                    class="sg4d-preselect-table-cell${isZoneStart
                    ? " sg4d-zone-start"
                    : ""
                }"
                    data-preselect-position="${position}"
                    data-preselect-digit="${digit}"
                ></td>
            `;
        }

        return html;
    };

    let html = `
        <tr class="sg4d-preselect-table-row sg4d-preselect-table-wuxing-row">
            <td colspan="4" class="sg4d-preselect-table-label sg4d-preselect-table-wuxing-label">
                五行预选
            </td>

            ${buildDigitCells()}
        </tr>
    `;

    for (
        let row = 1;
        row <= preselectRowCount;
        row += 1
    ) {
        html += `
            <tr class="sg4d-preselect-table-row" data-table-preselect-row="${row}">
                <td colspan="4" class="sg4d-preselect-table-label">
                    <div class="sg4d-preselect-table-label-inner">
                        <span>
                            预选 ${row}
                        </span>

                        <div class="sg4d-preselect-actions">
                            <button
                                type="button"
                                class="sg4d-preselect-action"
                                data-preselect-action="add"
                                aria-label="增加预选行"
                            >
                                +
                            </button>

                            <button
                                type="button"
                                class="sg4d-preselect-action"
                                data-preselect-action="remove"
                                aria-label="删除预选行"
                            >
                                −
                            </button>
                        </div>
                    </div>
                </td>

                ${buildDigitCells()}
            </tr>
        `;
    }

    tableFoot.innerHTML = html;
}



function clear4dWuxingPreselectPreview() {
    document
        .querySelectorAll(
            ".sg4d-preselect-table-wuxing-row .sg4d-preselect-table-cell"
        )
        .forEach(cell => {
            cell.classList.remove(
                "sg4d-wuxing-preselect-active"
            );
            cell.innerHTML = "";
        });
}

function get4dWuxingCandidateDigits(sourceDigit) {
    const sourceElement =
        get4dFiveElement(sourceDigit);

    const generatedElement =
        get4dGeneratedElement(sourceElement);

    return get4dDigitsByElement(
        generatedElement
    );
}

function buildLocked4dWuxingCandidates() {
    const result = [
        new Set(),
        new Set(),
        new Set(),
        new Set()
    ];

    locked4dWuxingSources.forEach(
        source => {
            get4dWuxingCandidateDigits(
                source.digit
            ).forEach(
                digit => {
                    result[
                        source.position
                    ].add(digit);
                }
            );
        }
    );

    return result;
}

function render4dWuxingCandidateSets(
    candidatesByPosition
) {
    clear4dWuxingPreselectPreview();

    if (isFiveElementMode()) {
        candidatesByPosition.forEach(
            (digits, position) => {
                digits.forEach(
                    digit => {
                        const cell =
                            document.querySelector(
                                `.sg4d-preselect-table-wuxing-row .sg4d-preselect-table-cell[data-preselect-position="${position}"][data-preselect-digit="${digit}"]`
                            );

                        if (!cell) {
                            return;
                        }

                        cell.classList.add(
                            "sg4d-wuxing-preselect-active"
                        );

                        cell.innerHTML =
                            `<span class="sg4d-wuxing-preselect-ball">${digit}</span>`;
                    }
                );
            }
        );
    }

    wuxingManualSelections.forEach(
        key => {
            const [
                positionText,
                digit
            ] = key.split(":");

            const position =
                Number.parseInt(
                    positionText,
                    10
                );

            const cell =
                document.querySelector(
                    `.sg4d-preselect-table-wuxing-row .sg4d-preselect-table-cell[data-preselect-position="${position}"][data-preselect-digit="${digit}"]`
                );

            if (!cell) {
                return;
            }

            cell.classList.add(
                "sg4d-wuxing-manual-selected"
            );

            cell.innerHTML =
                `<span class="sg4d-wuxing-manual-ball">${digit}</span>`;
        }
    );
}

function renderLocked4dWuxingPreselect() {
    const candidatesByPosition =
        isFiveElementMode()
            ? buildLocked4dWuxingCandidates()
            : [
                new Set(),
                new Set(),
                new Set(),
                new Set()
            ];

    render4dWuxingCandidateSets(
        candidatesByPosition
    );
}

function render4dWuxingPreselectPreview(
    position,
    sourceDigit
) {
    if (!isFiveElementMode()) {
        clear4dWuxingPreselectPreview();
        return;
    }

    const result =
        buildLocked4dWuxingCandidates();

    get4dWuxingCandidateDigits(
        sourceDigit
    ).forEach(
        digit => {
            result[position].add(digit);
        }
    );

    render4dWuxingCandidateSets(result);
}

function get4dWuxingSourceKey(cell) {
    const row = cell.closest(
        "tr.sg4d-history-row"
    );

    if (!row) {
        return "";
    }

    const rows = Array.from(
        sg4dElements.tableBody.querySelectorAll(
            "tr.sg4d-history-row"
        )
    );

    const rowIndex = rows.indexOf(row);
    const position = Number.parseInt(
        cell.dataset.position,
        10
    );
    const digit = String(
        cell.dataset.digit || ""
    );

    if (
        rowIndex < 0 ||
        !Number.isInteger(position) ||
        position < 0 ||
        position > 3 ||
        !/^\d$/.test(digit)
    ) {
        return "";
    }

    return `${rowIndex}:${position}:${digit}`;
}

function refresh4dWuxingLockedSourceStyles() {
    if (!sg4dElements.tableBody) {
        return;
    }

    sg4dElements.tableBody
        .querySelectorAll(
            ".sg4d-digit-cell.hit"
        )
        .forEach(
            cell => {
                const key =
                    get4dWuxingSourceKey(cell);

                cell.classList.toggle(
                    "sg4d-wuxing-source-locked",
                    Boolean(
                        key &&
                        locked4dWuxingSources.has(
                            key
                        )
                    )
                );
            }
        );
}

function bind4dWuxingHoverPreview() {
    if (!sg4dElements.tableBody) {
        return;
    }

    sg4dElements.tableBody.addEventListener(
        "mouseover",
        event => {
            if (!isFiveElementMode()) {
                return;
            }

            const cell =
                event.target.closest(
                    ".sg4d-digit-cell.hit"
                );

            if (!cell) {
                return;
            }

            const position =
                Number.parseInt(
                    cell.dataset.position,
                    10
                );
            const digit =
                String(
                    cell.dataset.digit || ""
                );

            if (
                !Number.isInteger(position) ||
                position < 0 ||
                position > 3 ||
                !/^\d$/.test(digit)
            ) {
                return;
            }

            render4dWuxingPreselectPreview(
                position,
                digit
            );
        }
    );

    sg4dElements.tableBody.addEventListener(
        "mouseout",
        event => {
            if (!isFiveElementMode()) {
                return;
            }

            const cell =
                event.target.closest(
                    ".sg4d-digit-cell.hit"
                );

            if (!cell) {
                return;
            }

            if (
                event.relatedTarget &&
                cell.contains(
                    event.relatedTarget
                )
            ) {
                return;
            }

            renderLocked4dWuxingPreselect();
        }
    );

    sg4dElements.tableBody.addEventListener(
        "click",
        event => {
            if (!isFiveElementMode()) {
                return;
            }

            const cell =
                event.target.closest(
                    ".sg4d-digit-cell.hit"
                );

            if (!cell) {
                return;
            }

            const key =
                get4dWuxingSourceKey(cell);

            if (!key) {
                return;
            }

            if (
                locked4dWuxingSources.has(key)
            ) {
                locked4dWuxingSources.delete(
                    key
                );
            } else {
                locked4dWuxingSources.set(
                    key,
                    {
                        position:
                            Number.parseInt(
                                cell.dataset.position,
                                10
                            ),
                        digit:
                            String(
                                cell.dataset.digit
                            )
                    }
                );
            }

            refresh4dWuxingLockedSourceStyles();
            renderLocked4dWuxingPreselect();
        }
    );
}


function getPreselectRowSet(rowNumber) {
    if (!preselectSelections.has(rowNumber)) {
        preselectSelections.set(
            rowNumber,
            new Set()
        );
    }

    return preselectSelections.get(
        rowNumber
    );
}

function buildPreselectSelectionKey(
    position,
    digit
) {
    return `${position}:${digit}`;
}

function renderPreselectSelections() {
    const tableFoot =
        document.getElementById(
            "sg4dPreselectTableFoot"
        );

    if (!tableFoot) {
        return;
    }

    tableFoot
        .querySelectorAll(
            "[data-table-preselect-row]"
        )
        .forEach(row => {
            const rowNumber =
                Number.parseInt(
                    row.dataset.tablePreselectRow,
                    10
                );

            row.classList.toggle(
                "sg4d-preselect-row-active",
                rowNumber === activePreselectRow
            );

            const rowSet =
                getPreselectRowSet(
                    rowNumber
                );

            row
                .querySelectorAll(
                    ".sg4d-preselect-table-cell"
                )
                .forEach(cell => {
                    const position =
                        Number.parseInt(
                            cell.dataset.preselectPosition,
                            10
                        );

                    const digit =
                        String(
                            cell.dataset.preselectDigit || ""
                        );

                    const key =
                        buildPreselectSelectionKey(
                            position,
                            digit
                        );

                    const selected =
                        rowSet.has(key);

                    cell.classList.toggle(
                        "sg4d-preselect-selected",
                        selected
                    );

                    cell.innerHTML = selected
                        ? `<span class="sg4d-preselect-selected-ball">${digit}</span>`
                        : "";
                });
        });
}

function setActivePreselectRow(rowNumber) {
    if (
        !Number.isInteger(rowNumber) ||
        rowNumber < 1 ||
        rowNumber > preselectRowCount
    ) {
        return;
    }

    activePreselectRow = rowNumber;

    renderPreselectSelections();
}

function toggleActivePreselectDigit(
    position,
    digit
) {
    if (
        !Number.isInteger(position) ||
        position < 0 ||
        position > 3 ||
        !/^\d$/.test(String(digit))
    ) {
        return;
    }

    const rowSet =
        getPreselectRowSet(
            activePreselectRow
        );

    const key =
        buildPreselectSelectionKey(
            position,
            String(digit)
        );

    if (rowSet.has(key)) {
        rowSet.delete(key);
    } else {
        rowSet.add(key);
    }

    renderPreselectSelections();
}


function toggleWuxingManualSelection(
    position,
    digit
) {
    if (
        !Number.isInteger(position) ||
        position < 0 ||
        position > 3 ||
        !/^\d$/.test(String(digit))
    ) {
        return;
    }

    const key =
        buildPreselectSelectionKey(
            position,
            String(digit)
        );

    if (
        wuxingManualSelections.has(key)
    ) {
        wuxingManualSelections.delete(key);
    } else {
        wuxingManualSelections.add(key);
    }

    renderLocked4dWuxingPreselect();
}

function bindPreselectSelectionActions() {
    const tableFoot =
        document.getElementById(
            "sg4dPreselectTableFoot"
        );

    if (!tableFoot) {
        return;
    }

    tableFoot.addEventListener(
        "click",
        event => {
            if (
                event.target.closest(
                    ".sg4d-preselect-action"
                )
            ) {
                return;
            }

            const preselectRow =
                event.target.closest(
                    "[data-table-preselect-row]"
                );

            if (preselectRow) {
                const rowNumber =
                    Number.parseInt(
                        preselectRow.dataset.tablePreselectRow,
                        10
                    );

                const label =
                    event.target.closest(
                        ".sg4d-preselect-table-label"
                    );

                if (label) {
                    setActivePreselectRow(
                        rowNumber
                    );
                    return;
                }

                const preselectCell =
                    event.target.closest(
                        ".sg4d-preselect-table-cell"
                    );

                if (preselectCell) {
                    setActivePreselectRow(
                        rowNumber
                    );

                    toggleActivePreselectDigit(
                        Number.parseInt(
                            preselectCell.dataset.preselectPosition,
                            10
                        ),
                        String(
                            preselectCell.dataset.preselectDigit || ""
                        )
                    );
                }

                return;
            }

            const wuxingCell =
                event.target.closest(
                    ".sg4d-preselect-table-wuxing-row .sg4d-preselect-table-cell"
                );

            if (!wuxingCell) {
                return;
            }

            toggleWuxingManualSelection(
                Number.parseInt(
                    wuxingCell.dataset.preselectPosition,
                    10
                ),
                String(
                    wuxingCell.dataset.preselectDigit || ""
                )
            );
        }
    );
}

function bindPreselectActions() {
    const tableFoot =
        document.getElementById(
            "sg4dPreselectTableFoot"
        );

    if (!tableFoot) {
        return;
    }

    tableFoot.addEventListener(
        "click",
        event => {
            const button =
                event.target.closest(
                    ".sg4d-preselect-action"
                );

            if (
                !button ||
                !tableFoot.contains(button)
            ) {
                return;
            }

            const action =
                button.dataset.preselectAction;

            if (action === "add") {
                if (preselectRowCount >= 10) {
                    return;
                }

                preselectRowCount += 1;
            } else if (action === "remove") {
                if (preselectRowCount <= 1) {
                    return;
                }

                preselectSelections.delete(
                    preselectRowCount
                );

                preselectRowCount -= 1;

                if (
                    activePreselectRow >
                    preselectRowCount
                ) {
                    activePreselectRow =
                        preselectRowCount;
                }
            } else {
                return;
            }

            renderPreselectTableFoot();
            renderPreselectSelections();
            renderLocked4dWuxingPreselect();

            requestAnimationFrame(
                syncPreselectWithHistoryTable
            );
        }
    );
}

function syncPreselectWithHistoryTable() {
    const table =
        document.querySelector(
            ".sg4d-history-table"
        );

    const digitHeaders =
        Array.from(
            document.querySelectorAll(
                ".sg4d-history-table thead tr:nth-child(2) th"
            )
        );

    if (
        !table ||
        digitHeaders.length !== 40
    ) {
        return;
    }

    const tableRect =
        table.getBoundingClientRect();

    const headerRects =
        digitHeaders.map(
            (header) =>
                header.getBoundingClientRect()
        );

    const firstDigitLeft =
        headerRects[0].left;

    const lastDigitRight =
        headerRects[
            headerRects.length - 1
        ].right;

    const leftWidth =
        firstDigitLeft -
        tableRect.left;

    const totalDigitWidth =
        lastDigitRight -
        firstDigitLeft;

    const columnWidths =
        headerRects.map(
            (rect, index) => {
                if (
                    index <
                    headerRects.length - 1
                ) {
                    return (
                        headerRects[index + 1].left -
                        rect.left
                    );
                }

                return (
                    lastDigitRight -
                    rect.left
                );
            }
        );

    const gridTemplate =
        columnWidths
            .map(
                (width) =>
                    `${width}px`
            )
            .join(" ");

    document
        .querySelectorAll(
            ".sg4d-preselect-row"
        )
        .forEach((row) => {
            row.style.gridTemplateColumns =
                `${leftWidth}px ${totalDigitWidth}px`;
        });

    document
        .querySelectorAll(
            ".sg4d-preselect-grid"
        )
        .forEach((grid) => {
            grid.style.width =
                `${totalDigitWidth}px`;

            grid.style.minWidth =
                `${totalDigitWidth}px`;

            grid.style.maxWidth =
                `${totalDigitWidth}px`;

            grid.style.gridTemplateColumns =
                gridTemplate;
        });
}