const {
    fetchSingaporeTotoResult
} = require(
    "./services/sgTotoResultService"
);

async function main() {
    try {
        console.log(
            "正在读取 Singapore Pools Draw No. 4209..."
        );

        const result =
            await fetchSingaporeTotoResult(
                "4209"
            );

        console.log(
            JSON.stringify(
                result,
                null,
                2
            )
        );
    } catch (error) {
        console.error(
            "读取官方开奖失败:",
            error.message
        );

        process.exitCode = 1;
    }
}

main();