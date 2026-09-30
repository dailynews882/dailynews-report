const {
    fetchLatestSingaporeTotoResult
} = require(
    "./services/sgTotoResultService"
);

async function main() {
    try {
        console.log(
            "正在自动识别 Singapore Pools 最新一期..."
        );

        const result =
            await fetchLatestSingaporeTotoResult();

        console.log(
            JSON.stringify(
                result,
                null,
                2
            )
        );

        console.log("");
        console.log(
            "自动识别完成："
        );
        console.log(
            `Draw No.: ${result.official_draw_number}`
        );
        console.log(
            `开奖日期: ${result.draw_date}`
        );
    } catch (error) {
        console.error(
            "自动识别最新一期失败:",
            error.message
        );

        process.exitCode = 1;
    }
}

main();