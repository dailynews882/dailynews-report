const SG4D_API_BASE = "/api/lottery/sg-4d";

let sg4dDraws = [];
let currentPrizeType = "first";
let currentAnalysisMode = "basic";
let currentQueryMode = "recent";

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

function buildDigitCells(number) {
    const normalized =
        normalize4dNumber(number);

    const digits =
        normalized === "----"
            ? ["", "", "", ""]
            : normalized.split("");

    const cells = [];

    for (
        let position = 0;
        position < 4;
        position += 1
    ) {
        const currentDigit =
            digits[position];

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

            const hitClass =
                isHit
                    ? " hit"
                    : "";

            cells.push(
                `<td class="sg4d-digit-cell${zoneStartClass}${hitClass}">${isHit ? digit : ""
                }</td>`
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

    sg4dElements.tableBody.innerHTML =
        historyRows
            .map((draw) => {
                const prize =
                    parsePrizeStructure(draw);

                const selectedNumber =
                    getSelectedPrizeNumber(
                        draw
                    );

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

                return `
                    <tr
                        class="sg4d-history-row"
                        data-draw-number="${draw.official_draw_number ||
                    draw.draw_number ||
                    ""
                    }"
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

                        <td class="sg4d-prize-value${thirdActive}">
                            ${prize.third}
                        </td>

                        ${buildDigitCells(
                        selectedNumber
                    )}

                        <td class="sg4d-stat-value">
                            ${sumValue}
                        </td>

                        <td class="sg4d-stat-value">
                            ${oddEvenValue}
                        </td>
                    </tr>
                `;
            })
            .join("");
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
                     * 第一阶段只完成基本走势。
                     * 其他模式暂时保留按钮状态，
                     * 后续逐个接入功能。
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
    updateQueryModeUI();

    initializePreselectGrids();

    renderPreselectTableFoot();

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
            const isZoneStart =
                index === 0 ||
                index === 10 ||
                index === 20 ||
                index === 30;

            html += `
                <td class="sg4d-preselect-table-cell${isZoneStart
                    ? " sg4d-zone-start"
                    : ""
                }"></td>
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

    for (let row = 1; row <= 5; row += 1) {
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
                                aria-label="增加预选行"
                            >
                                +
                            </button>

                            <button
                                type="button"
                                class="sg4d-preselect-action"
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