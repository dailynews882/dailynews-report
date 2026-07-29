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
        try {
            const requestInput = {
                ...req.query,
                ...(req.body || {})
            };

            const result =
                await importGNews(requestInput);

            return res.json({
                success: true,
                message: "GNews import completed",
                filters: result.filters,
                receivedCount: result.receivedCount,
                importedCount: result.importedCount,
                skippedCount: result.skippedCount,
                failedCount: result.failedCount,
                imported: result.imported,
                skipped: result.skipped,
                failed: result.failed
            });
        } catch (error) {
            console.error(
                "GNews import error:",
                error
            );

            return res
                .status(getErrorStatusCode(error))
                .json({
                    success: false,
                    message: getErrorMessage(
                        error,
                        "Failed to import GNews articles"
                    )
                });
        }
    }
);

module.exports = router;