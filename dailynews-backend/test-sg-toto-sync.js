const {
    syncSingaporeTotoDraw
} = require(
    "./services/sgTotoSyncService"
);

async function main() {
    try {
        const result =
            await syncSingaporeTotoDraw(
                "4210"
            );

        console.log(
            JSON.stringify(
                result,
                null,
                2
            )
        );

        process.exitCode = 0;
    } catch (error) {
        console.error(
            "Singapore TOTO 同步测试失败：",
            error.message
        );

        process.exitCode = 1;
    }
}

main();