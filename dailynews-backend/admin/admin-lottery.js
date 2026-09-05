document.addEventListener(
    "DOMContentLoaded",
    () => {
        const latestStatusElement =
            document.getElementById(
                "lotteryLatestStatus"
            );

        const manualForm =
            document.getElementById(
                "lotteryManualForm"
            );

        const manualMessage =
            document.getElementById(
                "lotteryManualMessage"
            );

        const syncButton =
            document.getElementById(
                "lotterySyncButton"
            );

        const syncMessage =
            document.getElementById(
                "lotterySyncMessage"
            );

        function formatNumber(
            number
        ) {
            return String(
                number
            ).padStart(
                2,
                "0"
            );
        }

        function getAdminToken() {
            return (
                localStorage.getItem(
                    "adminToken"
                ) ||
                sessionStorage.getItem(
                    "adminToken"
                ) ||
                ""
            );
        }

        async function loadLatestLottery() {
            if (
                !latestStatusElement
            ) {
                return;
            }

            latestStatusElement.textContent =
                "正在读取最新开奖数据...";

            try {
                const response =
                    await fetch(
                        "/api/lottery/sg-toto/latest",
                        {
                            headers: {
                                Accept:
                                    "application/json"
                            },

                            cache:
                                "no-store"
                        }
                    );

                if (
                    !response.ok
                ) {
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
                        data.message ||
                        "最新开奖数据无效"
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

                const mainNumbersText =
                    mainNumbers
                        .map(
                            formatNumber
                        )
                        .join(
                            " "
                        );

                const specialNumberText =
                    specialNumbers.length
                        ? formatNumber(
                            specialNumbers[0]
                        )
                        : "--";

                const prizeStructure =
                    draw.prize_structure &&
                        typeof draw.prize_structure === "object"
                        ? draw.prize_structure
                        : {};

                const prizeGroups =
                    Array.isArray(
                        prizeStructure.groups
                    )
                        ? prizeStructure.groups
                        : [];

                let prizeTableHtml = "";

                if (
                    prizeGroups.length
                ) {
                    prizeTableHtml = `
                        <div class="admin-lottery-prize-card">
                            <div class="admin-lottery-prize-title">
                                <span>
                                    Prize Structure
                                </span>

                                <strong>
                                    中奖情况
                                </strong>
                            </div>

                            <div class="admin-lottery-prize-table-wrap">
                                <table class="admin-lottery-prize-table">
                                    <thead>
                                        <tr>
                                            <th>
                                                Prize Group
                                            </th>

                                            <th>
                                                Share Amount
                                            </th>

                                            <th>
                                                Winning Shares
                                            </th>
                                        </tr>
                                    </thead>

                                    <tbody>
                                        ${prizeGroups
                            .map(
                                (
                                    group,
                                    index
                                ) => `
                                                        <tr>
                                                            <td>
                                                                <strong>
                                                                    Group ${group.group ||
                                    index + 1
                                    }
                                                                </strong>
                                                            </td>

                                                            <td class="admin-lottery-prize-amount">
                                                                ${group.share_amount !== undefined &&
                                        group.share_amount !== null
                                        ? `S$ ${Number(
                                            group.share_amount
                                        ).toLocaleString()}`
                                        : "--"
                                    }
                                                            </td>

                                                            <td>
                                                                ${group.winning_shares !== undefined &&
                                        group.winning_shares !== null
                                        ? Number(
                                            group.winning_shares
                                        ).toLocaleString()
                                        : "--"
                                    }
                                                            </td>
                                                        </tr>
                                                    `
                            )
                            .join("")
                        }
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                }

                latestStatusElement.innerHTML = `
                    <div>
                        <strong>
                            Singapore TOTO
                        </strong>
                    </div>

                    <div>
                        Draw No.：
                        ${draw.official_draw_number ||
                    draw.draw_number ||
                    "--"
                    }
                    </div>

                    <div>
                        开奖日期：
                        ${draw.draw_date ||
                    "--"
                    }
                    </div>

                    <div>
                        主号码：
                        ${mainNumbersText ||
                    "--"
                    }
                    </div>

                    <div>
                        额外号：
                        ${specialNumberText}
                    </div>

                    <div>
                        数据来源：
                        ${draw.source_name ||
                    "--"
                    }
                    </div>

                    ${prizeTableHtml}
                `;
            } catch (
            error
            ) {
                console.error(
                    "Load latest lottery error:",
                    error
                );

                latestStatusElement.textContent =
                    `读取失败：${error.message}`;
            }
        }

        if (
            manualForm
        ) {
            manualForm.addEventListener(
                "submit",
                async event => {
                    event.preventDefault();

                    const gameCode =
                        document.getElementById(
                            "lotteryGameCode"
                        )?.value ||
                        "sg-toto";

                    const drawNumber =
                        document.getElementById(
                            "lotteryDrawNumber"
                        )?.value.trim();

                    const drawDate =
                        document.getElementById(
                            "lotteryDrawDate"
                        )?.value;

                    const mainNumbers = [
                        "mainNumber1",
                        "mainNumber2",
                        "mainNumber3",
                        "mainNumber4",
                        "mainNumber5",
                        "mainNumber6"
                    ].map(
                        id =>
                            document.getElementById(
                                id
                            )?.value
                    );

                    const specialNumber =
                        document.getElementById(
                            "specialNumber"
                        )?.value;

                    if (
                        manualMessage
                    ) {
                        manualMessage.textContent =
                            "正在保存...";
                    }

                    try {
                        const token =
                            getAdminToken();

                        if (
                            !token
                        ) {
                            throw new Error(
                                "管理员登录状态已失效，请重新登录"
                            );
                        }

                        const response =
                            await fetch(
                                "/api/admin/lottery/manual",
                                {
                                    method:
                                        "POST",

                                    headers: {
                                        "Content-Type":
                                            "application/json",

                                        Authorization:
                                            `Bearer ${token}`
                                    },

                                    body:
                                        JSON.stringify({
                                            game_code:
                                                gameCode,

                                            draw_number:
                                                drawNumber,

                                            draw_date:
                                                drawDate,

                                            main_numbers:
                                                mainNumbers,

                                            special_number:
                                                specialNumber
                                        })
                                }
                            );

                        const data =
                            await response.json();

                        if (
                            !response.ok ||
                            !data.success
                        ) {
                            throw new Error(
                                data.message ||
                                "保存开奖记录失败"
                            );
                        }

                        if (
                            manualMessage
                        ) {
                            manualMessage.textContent =
                                data.message ||
                                "开奖记录保存成功";
                        }

                        manualForm.reset();

                        await loadLatestLottery();
                    } catch (
                    error
                    ) {
                        console.error(
                            "Manual lottery save error:",
                            error
                        );

                        if (
                            manualMessage
                        ) {
                            manualMessage.textContent =
                                error.message;
                        }
                    }
                }
            );
        }

        if (
            syncButton
        ) {
            syncButton.addEventListener(
                "click",
                async () => {
                    const originalButtonText =
                        syncButton.textContent;

                    syncButton.disabled =
                        true;

                    syncButton.textContent =
                        "正在同步...";

                    if (
                        syncMessage
                    ) {
                        syncMessage.textContent =
                            "正在连接 Singapore Pools，请稍候...";
                    }

                    try {
                        const token =
                            getAdminToken();

                        if (
                            !token
                        ) {
                            throw new Error(
                                "管理员登录状态已失效，请重新登录"
                            );
                        }

                        const response =
                            await fetch(
                                "/api/admin/lottery/sync",
                                {
                                    method:
                                        "POST",

                                    headers: {
                                        Accept:
                                            "application/json",

                                        "Content-Type":
                                            "application/json",

                                        Authorization:
                                            `Bearer ${token}`
                                    },

                                    body:
                                        JSON.stringify({})
                                }
                            );

                        let data = {};

                        try {
                            data =
                                await response.json();
                        } catch (
                        parseError
                        ) {
                            throw new Error(
                                `服务器返回数据格式异常，HTTP ${response.status}`
                            );
                        }

                        if (
                            !response.ok ||
                            !data.success
                        ) {
                            throw new Error(
                                data.message ||
                                "同步最新期开奖失败"
                            );
                        }

                        const result =
                            data.result ||
                            {};

                        let resultText =
                            data.message ||
                            "最新期开奖同步完成";

                        if (
                            result.official_draw_number
                        ) {
                            resultText +=
                                `｜Draw No. ${result.official_draw_number}`;
                        }

                        if (
                            result.draw_date
                        ) {
                            resultText +=
                                `｜${result.draw_date}`;
                        }

                        if (
                            result.action ===
                            "inserted"
                        ) {
                            resultText +=
                                "｜已新增";
                        } else if (
                            result.action ===
                            "updated"
                        ) {
                            resultText +=
                                "｜已校验并更新";
                        }

                        if (
                            result.prize_complete ===
                            true
                        ) {
                            resultText +=
                                "｜奖金数据完整";
                        } else if (
                            result.prize_complete ===
                            false
                        ) {
                            resultText +=
                                "｜奖金数据等待官网更新";
                        }

                        if (
                            syncMessage
                        ) {
                            syncMessage.textContent =
                                resultText;
                        }

                        await loadLatestLottery();
                    } catch (
                    error
                    ) {
                        console.error(
                            "Sync latest lottery error:",
                            error
                        );

                        if (
                            syncMessage
                        ) {
                            syncMessage.textContent =
                                `同步失败：${error.message}`;
                        }
                    } finally {
                        syncButton.disabled =
                            false;

                        syncButton.textContent =
                            originalButtonText;
                    }
                }
            );
        }

        loadLatestLottery();
    }
);

/*
 * ============================================================
 * Singapore 4D 后台管理（第一阶段）
 * 功能：
 * 1. TOTO / 4D 后台面板切换
 * 2. 读取 4D 最新开奖
 * 3. 同步 4D 官网最新一期
 * 4. 读取 4D 历史开奖记录
 *
 * 说明：
 * - 不修改现有 TOTO 逻辑
 * - 指定 Draw 同步、手工新增/修正将在下一阶段接入后端 API
 * ============================================================
 */

document.addEventListener("DOMContentLoaded", () => {
    const gameSelector =
        document.getElementById("adminLotteryGameSelector");

    const totoPanel =
        document.getElementById("lotteryTotoPanel");

    const fourDPanel =
        document.getElementById("lottery4dPanel");

    const fourDLatestStatus =
        document.getElementById("lottery4dLatestStatus");

    const fourDSyncLatestButton =
        document.getElementById("lottery4dSyncLatestButton");

    const fourDSyncLatestMessage =
        document.getElementById("lottery4dSyncLatestMessage");

    const fourDHistoryList =
        document.getElementById("lottery4dHistoryList");

    function getAdminToken4D() {
        return (
            localStorage.getItem("adminToken") ||
            sessionStorage.getItem("adminToken") ||
            ""
        );
    }

    function normalize4DNumber(value) {
        const text = String(
            value === undefined || value === null
                ? ""
                : value
        ).trim();

        if (!text) {
            return "----";
        }

        return text.padStart(4, "0").slice(-4);
    }

    function getPrizeStructure(draw) {
        return (
            draw &&
                draw.prize_structure &&
                typeof draw.prize_structure === "object"
                ? draw.prize_structure
                : {}
        );
    }

    function getTopPrizeValue(prizeStructure, key, fallbackKey) {
        const value =
            prizeStructure[key] ??
            prizeStructure[fallbackKey];

        if (
            Array.isArray(value)
        ) {
            return value.length
                ? normalize4DNumber(value[0])
                : "----";
        }

        return normalize4DNumber(value);
    }

    function getPrizeArray(prizeStructure, keys) {
        for (const key of keys) {
            if (
                Array.isArray(prizeStructure[key])
            ) {
                return prizeStructure[key].map(
                    normalize4DNumber
                );
            }
        }

        return [];
    }

    function extract4DPrizeData(draw) {
        const prizeStructure =
            getPrizeStructure(draw);

        let firstPrize =
            getTopPrizeValue(
                prizeStructure,
                "first_prize",
                "first"
            );

        let secondPrize =
            getTopPrizeValue(
                prizeStructure,
                "second_prize",
                "second"
            );

        let thirdPrize =
            getTopPrizeValue(
                prizeStructure,
                "third_prize",
                "third"
            );

        let starterPrizes =
            getPrizeArray(
                prizeStructure,
                [
                    "starter_prizes",
                    "starter",
                    "starters"
                ]
            );

        let consolationPrizes =
            getPrizeArray(
                prizeStructure,
                [
                    "consolation_prizes",
                    "consolation",
                    "consolations"
                ]
            );

        const mainNumbers =
            Array.isArray(draw?.main_numbers)
                ? draw.main_numbers.map(
                    normalize4DNumber
                )
                : [];

        if (
            firstPrize === "----" &&
            mainNumbers.length >= 1
        ) {
            firstPrize = mainNumbers[0];
        }

        if (
            secondPrize === "----" &&
            mainNumbers.length >= 2
        ) {
            secondPrize = mainNumbers[1];
        }

        if (
            thirdPrize === "----" &&
            mainNumbers.length >= 3
        ) {
            thirdPrize = mainNumbers[2];
        }

        return {
            firstPrize,
            secondPrize,
            thirdPrize,
            starterPrizes,
            consolationPrizes
        };
    }

    function renderNumberGroup(
        title,
        numbers
    ) {
        const safeNumbers =
            Array.isArray(numbers)
                ? numbers
                : [];

        return `
            <div style="margin-top:14px;">
                <strong>${title}</strong>
                <div style="
                    display:flex;
                    flex-wrap:wrap;
                    gap:8px;
                    margin-top:8px;
                ">
                    ${safeNumbers.length
                ? safeNumbers
                    .map(
                        number => `
                                        <span style="
                                            display:inline-block;
                                            padding:6px 10px;
                                            border:1px solid rgba(255,255,255,.18);
                                            border-radius:6px;
                                        ">
                                            ${normalize4DNumber(number)}
                                        </span>
                                    `
                    )
                    .join("")
                : "<span>暂无数据</span>"
            }
                </div>
            </div>
        `;
    }

    function render4DDraw(draw) {
        if (!draw) {
            return "暂无 Singapore 4D 开奖数据";
        }

        const {
            firstPrize,
            secondPrize,
            thirdPrize,
            starterPrizes,
            consolationPrizes
        } = extract4DPrizeData(draw);

        return `
            <div>
                <div>
                    <strong>Singapore 4D</strong>
                </div>

                <div style="margin-top:8px;">
                    Draw No.：
                    ${draw.official_draw_number ||
            draw.draw_number ||
            "--"
            }
                </div>

                <div>
                    开奖日期：
                    ${draw.draw_date || "--"}
                </div>

                <div style="margin-top:12px;">
                    <strong>1st Prize：</strong>
                    ${firstPrize}
                </div>

                <div>
                    <strong>2nd Prize：</strong>
                    ${secondPrize}
                </div>

                <div>
                    <strong>3rd Prize：</strong>
                    ${thirdPrize}
                </div>

                ${renderNumberGroup(
                "Starter Prizes",
                starterPrizes
            )}

                ${renderNumberGroup(
                "Consolation Prizes",
                consolationPrizes
            )}

                <div style="margin-top:14px;">
                    数据来源：
                    ${draw.source_name || "--"}
                </div>

                <div>
                    数据状态：
                    ${draw.source_status || "--"}
                </div>
            </div>
        `;
    }

    async function loadLatest4D() {
        if (!fourDLatestStatus) {
            return;
        }

        fourDLatestStatus.textContent =
            "正在读取 Singapore 4D 最新开奖数据...";

        try {
            const response =
                await fetch(
                    "/api/lottery/sg-4d/latest",
                    {
                        headers: {
                            Accept:
                                "application/json"
                        },
                        cache:
                            "no-store"
                    }
                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success ||
                !data.draw
            ) {
                throw new Error(
                    data.message ||
                    "读取 Singapore 4D 最新开奖失败"
                );
            }

            fourDLatestStatus.innerHTML =
                render4DDraw(data.draw);
        } catch (error) {
            console.error(
                "Load latest Singapore 4D error:",
                error
            );

            fourDLatestStatus.textContent =
                `读取失败：${error.message}`;
        }
    }

    async function load4DHistory() {
        if (!fourDHistoryList) {
            return;
        }

        fourDHistoryList.textContent =
            "正在读取 Singapore 4D 历史开奖记录...";

        try {
            const response =
                await fetch(
                    "/api/lottery/sg-4d/history?limit=20",
                    {
                        headers: {
                            Accept:
                                "application/json"
                        },
                        cache:
                            "no-store"
                    }
                );

            const data =
                await response.json();

            if (
                !response.ok ||
                !data.success
            ) {
                throw new Error(
                    data.message ||
                    "读取 Singapore 4D 历史记录失败"
                );
            }

            const draws =
                Array.isArray(data.draws)
                    ? data.draws
                    : Array.isArray(data.history)
                        ? data.history
                        : Array.isArray(data.results)
                            ? data.results
                            : [];

            if (!draws.length) {
                fourDHistoryList.textContent =
                    "暂无 Singapore 4D 历史开奖记录";
                return;
            }

            fourDHistoryList.innerHTML =
                draws
                    .map(
                        draw => {
                            const prizeData =
                                extract4DPrizeData(
                                    draw
                                );

                            return `
                                <div style="
                                    padding:12px 0;
                                    border-bottom:1px solid rgba(255,255,255,.12);
                                ">
                                    <div>
                                        <strong>
                                            Draw ${draw.official_draw_number ||
                                draw.draw_number ||
                                "--"
                                }
                                        </strong>
                                        &nbsp;
                                        ${draw.draw_date || "--"}
                                    </div>

                                    <div style="margin-top:6px;">
                                        1st：
                                        ${prizeData.firstPrize}
                                        &nbsp;&nbsp;
                                        2nd：
                                        ${prizeData.secondPrize}
                                        &nbsp;&nbsp;
                                        3rd：
                                        ${prizeData.thirdPrize}
                                    </div>
                                </div>
                            `;
                        }
                    )
                    .join("");
        } catch (error) {
            console.error(
                "Load Singapore 4D history error:",
                error
            );

            fourDHistoryList.textContent =
                `读取失败：${error.message}`;
        }
    }

    window.loadLatestSingapore4DAdmin =
        loadLatest4D;

    window.loadSingapore4DHistoryAdmin =
        load4DHistory;

    async function syncLatest4D() {
        if (!fourDSyncLatestButton) {
            return;
        }

        const originalText =
            fourDSyncLatestButton.textContent;

        fourDSyncLatestButton.disabled =
            true;

        fourDSyncLatestButton.textContent =
            "正在同步...";

        if (fourDSyncLatestMessage) {
            fourDSyncLatestMessage.textContent =
                "正在连接 Singapore Pools，请稍候...";
        }

        try {
            const token =
                getAdminToken4D();

            if (!token) {
                throw new Error(
                    "管理员登录状态已失效，请重新登录"
                );
            }

            const response =
                await fetch(
                    "/api/admin/lottery/sync-4d",
                    {
                        method:
                            "POST",

                        headers: {
                            Accept:
                                "application/json",

                            "Content-Type":
                                "application/json",

                            Authorization:
                                `Bearer ${token}`
                        },

                        body:
                            JSON.stringify({})
                    }
                );

            let data = {};

            try {
                data =
                    await response.json();
            } catch (parseError) {
                throw new Error(
                    `服务器返回数据格式异常，HTTP ${response.status}`
                );
            }

            if (
                !response.ok ||
                !data.success
            ) {
                throw new Error(
                    data.message ||
                    "同步 Singapore 4D 最新开奖失败"
                );
            }

            const result =
                data.result || {};

            let resultText =
                data.message ||
                "Singapore 4D 最新开奖同步完成";

            const drawNumber =
                result.official_draw_number ||
                result.draw_number;

            if (drawNumber) {
                resultText +=
                    ` | Draw No. ${drawNumber}`;
            }

            if (result.draw_date) {
                resultText +=
                    ` | ${result.draw_date}`;
            }

            if (
                result.action ===
                "inserted"
            ) {
                resultText +=
                    " | 已新增";
            } else if (
                result.action ===
                "updated"
            ) {
                resultText +=
                    " | 已校验并更新";
            }

            if (
                result.prize_complete ===
                true
            ) {
                resultText +=
                    " | 23个中奖号码完整";
            }

            if (fourDSyncLatestMessage) {
                fourDSyncLatestMessage.textContent =
                    resultText;
            }

            await Promise.all([
                loadLatest4D(),
                load4DHistory()
            ]);
        } catch (error) {
            console.error(
                "Sync latest Singapore 4D error:",
                error
            );

            if (fourDSyncLatestMessage) {
                fourDSyncLatestMessage.textContent =
                    `同步失败：${error.message}`;
            }
        } finally {
            fourDSyncLatestButton.disabled =
                false;

            fourDSyncLatestButton.textContent =
                originalText;
        }
    }

    function switchLotteryPanel() {
        const gameCode =
            gameSelector?.value ||
            "sg-toto";

        const is4D =
            gameCode === "sg-4d";

        if (totoPanel) {
            totoPanel.hidden =
                is4D;
        }

        if (fourDPanel) {
            fourDPanel.hidden =
                !is4D;
        }

        if (is4D) {
            loadLatest4D();
            load4DHistory();
        }
    }

    if (gameSelector) {
        gameSelector.addEventListener(
            "change",
            switchLotteryPanel
        );
    }

    if (fourDSyncLatestButton) {
        fourDSyncLatestButton.addEventListener(
            "click",
            syncLatest4D
        );
    }

    switchLotteryPanel();
});

/*
 * ============================================================
 * Singapore 4D · 指定 Draw No. 官方同步
 * ============================================================
 */
document.addEventListener("DOMContentLoaded", () => {
    const drawInput =
        document.getElementById(
            "lottery4dSyncDrawNumber"
        );

    const syncDrawButton =
        document.getElementById(
            "lottery4dSyncDrawButton"
        );

    const syncDrawMessage =
        document.getElementById(
            "lottery4dSyncDrawMessage"
        );

    function getAdminTokenFor4DDraw() {
        return (
            localStorage.getItem(
                "adminToken"
            ) ||
            sessionStorage.getItem(
                "adminToken"
            ) ||
            ""
        );
    }

    if (
        !drawInput ||
        !syncDrawButton
    ) {
        return;
    }

    syncDrawButton.addEventListener(
        "click",
        async () => {
            const drawNumber =
                drawInput.value.trim();

            if (
                !/^\d{4}$/.test(
                    drawNumber
                )
            ) {
                if (syncDrawMessage) {
                    syncDrawMessage.textContent =
                        "请输入正确的4位 Draw No.";
                }

                drawInput.focus();
                return;
            }

            const originalText =
                syncDrawButton.textContent;

            syncDrawButton.disabled =
                true;

            syncDrawButton.textContent =
                "正在同步...";

            if (syncDrawMessage) {
                syncDrawMessage.textContent =
                    `正在读取 Singapore Pools Draw ${drawNumber}...`;
            }

            try {
                const token =
                    getAdminTokenFor4DDraw();

                if (!token) {
                    throw new Error(
                        "管理员登录状态已失效，请重新登录"
                    );
                }

                const response =
                    await fetch(
                        "/api/admin/lottery/sync-4d-draw",
                        {
                            method:
                                "POST",

                            headers: {
                                Accept:
                                    "application/json",

                                "Content-Type":
                                    "application/json",

                                Authorization:
                                    `Bearer ${token}`
                            },

                            body:
                                JSON.stringify({
                                    draw_number:
                                        drawNumber
                                })
                        }
                    );

                let data = {};

                try {
                    data =
                        await response.json();
                } catch (
                parseError
                ) {
                    throw new Error(
                        `服务器返回数据格式异常，HTTP ${response.status}`
                    );
                }

                if (
                    !response.ok ||
                    !data.success
                ) {
                    throw new Error(
                        data.message ||
                        "指定 Draw 同步失败"
                    );
                }

                if (syncDrawMessage) {
                    syncDrawMessage.textContent =
                        data.message ||
                        `Draw ${drawNumber} 同步完成`;
                }

                if (
                    typeof window.loadLatestSingapore4DAdmin ===
                    "function"
                ) {
                    await window.loadLatestSingapore4DAdmin();
                }

                if (
                    typeof window.loadSingapore4DHistoryAdmin ===
                    "function"
                ) {
                    await window.loadSingapore4DHistoryAdmin();
                }
            } catch (
            error
            ) {
                console.error(
                    "Sync specified Singapore 4D draw error:",
                    error
                );

                if (syncDrawMessage) {
                    syncDrawMessage.textContent =
                        `同步失败：${error.message}`;
                }
            } finally {
                syncDrawButton.disabled =
                    false;

                syncDrawButton.textContent =
                    originalText;
            }
        }
    );
});

/*
 * ============================================================
 * Singapore 4D · 手工新增 / 修正开奖记录
 * POST /api/admin/lottery/manual-4d
 * ============================================================
 */
document.addEventListener("DOMContentLoaded", () => {
    const manualForm =
        document.getElementById(
            "lottery4dManualForm"
        );

    const manualMessage =
        document.getElementById(
            "lottery4dManualMessage"
        );

    const submitButton =
        document.getElementById(
            "lottery4dManualSubmitButton"
        );

    if (!manualForm) {
        return;
    }

    function getAdminTokenFor4DManual() {
        return (
            localStorage.getItem(
                "adminToken"
            ) ||
            sessionStorage.getItem(
                "adminToken"
            ) ||
            ""
        );
    }

    function getFieldValue(id) {
        return String(
            document.getElementById(id)?.value || ""
        ).trim();
    }

    function collectPrizeNumbers(prefix) {
        const values = [];

        for (
            let index = 1;
            index <= 10;
            index += 1
        ) {
            values.push(
                getFieldValue(
                    `${prefix}${index}`
                )
            );
        }

        return values;
    }

    function isValid4DNumber(value) {
        return /^\d{4}$/.test(value);
    }

    manualForm.addEventListener(
        "submit",
        async event => {
            event.preventDefault();

            const drawNumber =
                getFieldValue(
                    "lottery4dDrawNumber"
                );

            const drawDate =
                getFieldValue(
                    "lottery4dDrawDate"
                );

            const firstPrize =
                getFieldValue(
                    "lottery4dFirstPrize"
                );

            const secondPrize =
                getFieldValue(
                    "lottery4dSecondPrize"
                );

            const thirdPrize =
                getFieldValue(
                    "lottery4dThirdPrize"
                );

            const starterPrizes =
                collectPrizeNumbers(
                    "lottery4dStarter"
                );

            const consolationPrizes =
                collectPrizeNumbers(
                    "lottery4dConsolation"
                );

            if (
                !/^\d{4}$/.test(
                    drawNumber
                )
            ) {
                if (manualMessage) {
                    manualMessage.textContent =
                        "Draw No. 必须是4位数字";
                }

                document
                    .getElementById(
                        "lottery4dDrawNumber"
                    )
                    ?.focus();

                return;
            }

            if (!drawDate) {
                if (manualMessage) {
                    manualMessage.textContent =
                        "请选择开奖日期";
                }

                document
                    .getElementById(
                        "lottery4dDrawDate"
                    )
                    ?.focus();

                return;
            }

            const topPrizes = [
                firstPrize,
                secondPrize,
                thirdPrize
            ];

            const invalidTopIndex =
                topPrizes.findIndex(
                    value =>
                        !isValid4DNumber(
                            value
                        )
                );

            if (
                invalidTopIndex !== -1
            ) {
                if (manualMessage) {
                    manualMessage.textContent =
                        "1st / 2nd / 3rd Prize 必须全部输入4位数字";
                }

                const topIds = [
                    "lottery4dFirstPrize",
                    "lottery4dSecondPrize",
                    "lottery4dThirdPrize"
                ];

                document
                    .getElementById(
                        topIds[
                        invalidTopIndex
                        ]
                    )
                    ?.focus();

                return;
            }

            const invalidStarterIndex =
                starterPrizes.findIndex(
                    value =>
                        !isValid4DNumber(
                            value
                        )
                );

            if (
                invalidStarterIndex !== -1
            ) {
                if (manualMessage) {
                    manualMessage.textContent =
                        "Starter Prizes 必须完整输入10个4位号码";
                }

                document
                    .getElementById(
                        `lottery4dStarter${invalidStarterIndex + 1}`
                    )
                    ?.focus();

                return;
            }

            const invalidConsolationIndex =
                consolationPrizes.findIndex(
                    value =>
                        !isValid4DNumber(
                            value
                        )
                );

            if (
                invalidConsolationIndex !== -1
            ) {
                if (manualMessage) {
                    manualMessage.textContent =
                        "Consolation Prizes 必须完整输入10个4位号码";
                }

                document
                    .getElementById(
                        `lottery4dConsolation${invalidConsolationIndex + 1}`
                    )
                    ?.focus();

                return;
            }

            const originalButtonText =
                submitButton
                    ? submitButton.textContent
                    : "";

            if (submitButton) {
                submitButton.disabled =
                    true;

                submitButton.textContent =
                    "正在保存...";
            }

            if (manualMessage) {
                manualMessage.textContent =
                    `正在保存 Singapore 4D Draw ${drawNumber}...`;
            }

            try {
                const token =
                    getAdminTokenFor4DManual();

                if (!token) {
                    throw new Error(
                        "管理员登录状态已失效，请重新登录"
                    );
                }

                const response =
                    await fetch(
                        "/api/admin/lottery/manual-4d",
                        {
                            method:
                                "POST",

                            headers: {
                                Accept:
                                    "application/json",

                                "Content-Type":
                                    "application/json",

                                Authorization:
                                    `Bearer ${token}`
                            },

                            body:
                                JSON.stringify({
                                    draw_number:
                                        drawNumber,

                                    draw_date:
                                        drawDate,

                                    first_prize:
                                        firstPrize,

                                    second_prize:
                                        secondPrize,

                                    third_prize:
                                        thirdPrize,

                                    starter_prizes:
                                        starterPrizes,

                                    consolation_prizes:
                                        consolationPrizes
                                })
                        }
                    );

                let data = {};

                try {
                    data =
                        await response.json();
                } catch (
                parseError
                ) {
                    throw new Error(
                        `服务器返回数据格式异常，HTTP ${response.status}`
                    );
                }

                if (
                    !response.ok ||
                    !data.success
                ) {
                    throw new Error(
                        data.message ||
                        "保存 / 修正 Singapore 4D 开奖数据失败"
                    );
                }

                if (manualMessage) {
                    manualMessage.textContent =
                        data.message ||
                        `Singapore 4D Draw ${drawNumber} 已保存`;
                }

                manualForm.reset();

                if (
                    typeof window.loadLatestSingapore4DAdmin ===
                    "function"
                ) {
                    await window.loadLatestSingapore4DAdmin();
                }

                if (
                    typeof window.loadSingapore4DHistoryAdmin ===
                    "function"
                ) {
                    await window.loadSingapore4DHistoryAdmin();
                }
            } catch (
            error
            ) {
                console.error(
                    "Manual Singapore 4D save error:",
                    error
                );

                if (manualMessage) {
                    manualMessage.textContent =
                        `保存失败：${error.message}`;
                }
            } finally {
                if (submitButton) {
                    submitButton.disabled =
                        false;

                    submitButton.textContent =
                        originalButtonText;
                }
            }
        }
    );
});