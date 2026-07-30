const express = require("express");
const {
    verifyAdminToken
} = require("../middleware/adminAuth");

const {
    previewGNews,
    importGNews,
    getErrorStatusCode,
    getErrorMessage
} = require("../services/gnewsService");

const {
    createGNewsFetchLog,
    finishGNewsFetchLog,
    markGNewsFetchLogFailed,
} = require("../services/gnewsFetchLogService");

const router = express.Router();

router.get(
    "/preview",
    verifyAdminToken,
    async function (req, res) {
        try {
            const result = await previewGNews(req.query);

            return res.json({
                success: true,
                filters: result.filters,
                totalArticles: result.totalArticles,
                previewCount: result.articles.length,
                data: result.articles
            });
        } catch (error) {
            console.error(
                "GNews preview error:",
                error
            );

            return res
                .status(getErrorStatusCode(error))
                .json({
                    success: false,
                    message: getErrorMessage(
                        error,
                        "Failed to preview GNews articles"
                    )
                });
        }
    }
);

router.post(
    "/import",
    verifyAdminToken,
    async function (req, res) {
        const requestInput = {
            ...(req.query || {}),
            ...(req.body || {}),
        };

        let fetchLogId = null;

        try {
            try {
                const fetchLog =
                    await createGNewsFetchLog({
                        triggerType: "manual",
                        requestParams: requestInput,
                    });

                fetchLogId = fetchLog.id;
            } catch (logError) {
                console.error(
                    "Create manual GNews fetch log error:",
                    logError
                );
            }

            const result =
                await importGNews(requestInput);

            if (fetchLogId) {
                try {
                    await finishGNewsFetchLog(
                        fetchLogId,
                        {
                            runStatus:
                                result.failedCount > 0
                                    ? "partial"
                                    : "success",

                            receivedCount:
                                result.receivedCount,

                            importedCount:
                                result.importedCount,

                            skippedCount:
                                result.skippedCount,

                            failedCount:
                                result.failedCount,
                        }
                    );
                } catch (logError) {
                    console.error(
                        "Finish manual GNews fetch log error:",
                        logError
                    );
                }
            }

            return res.json({
                success: true,
                message: "GNews import completed",
                filters: result.filters,
                receivedCount:
                    result.receivedCount,
                importedCount:
                    result.importedCount,
                skippedCount:
                    result.skippedCount,
                failedCount:
                    result.failedCount,
                imported: result.imported,
                skipped: result.skipped,
                failed: result.failed,
            });
        } catch (error) {
            console.error(
                "GNews import error:",
                error
            );

            if (fetchLogId) {
                try {
                    await markGNewsFetchLogFailed(
                        fetchLogId,
                        error
                    );
                } catch (logError) {
                    console.error(
                        "Fail manual GNews fetch log error:",
                        logError
                    );
                }
            }

            return res
                .status(getErrorStatusCode(error))
                .json({
                    success: false,
                    message: getErrorMessage(
                        error,
                        "Failed to import GNews articles"
                    ),
                });
        }
    }
);

module.exports = router;