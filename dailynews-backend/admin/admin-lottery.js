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