const {
    fetchSingaporeTotoResult
} = require(
    "./services/sgTotoResultService"
);

async function main() {
    try {
        const result =
            await fetchSingaporeTotoResult(
                "4193"
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
            "Singapore TOTO 测试失败：",
            error.message
        );

        process.exit(1);
    }
}

main();