const {
    syncLatestSingaporeTotoDraw
} = require(
    "./services/sgTotoSyncService"
);

async function main() {
    try {
        console.log(
            "开始测试：自动同步 Singapore TOTO 最新一期..."
        );

        const result =
            await syncLatestSingaporeTotoDraw();

        console.log("");
        console.log(
            "===== 自动同步结果 ====="
        );

        console.log(
            JSON.stringify(
                result,
                null,
                2
            )
        );

        console.log("");
        console.log(
            `操作类型：${result.action}`
        );

        console.log(
            `Draw No.：${result.official_draw_number}`
        );

        console.log(
            `开奖日期：${result.draw_date}`
        );

        console.log(
            `奖金数据完整：${result.prize_complete}`
        );

        console.log(
            `数据状态：${result.source_status}`
        );
    } catch (error) {
        console.error("");
        console.error(
            "自动同步测试失败：",
            error.message
        );

        process.exitCode = 1;
    }
}

main();