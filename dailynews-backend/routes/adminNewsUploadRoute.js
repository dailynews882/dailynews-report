const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const {
    verifyAdminToken,
} = require("../middleware/adminAuth");

const router = express.Router();

const newsUploadDirectory =
    path.join(
        __dirname,
        "../public/uploads/news"
    );

if (
    !fs.existsSync(
        newsUploadDirectory
    )
) {
    fs.mkdirSync(
        newsUploadDirectory,
        {
            recursive: true,
        }
    );
}

const allowedMimeTypes =
    new Set([
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    ]);

const extensionByMimeType = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
};

const storage =
    multer.diskStorage({
        destination(
            req,
            file,
            callback
        ) {
            callback(
                null,
                newsUploadDirectory
            );
        },

        filename(
            req,
            file,
            callback
        ) {
            const extension =
                extensionByMimeType[
                file.mimetype
                ] ||
                path.extname(
                    file.originalname
                ).toLowerCase();

            const randomPart =
                crypto
                    .randomBytes(6)
                    .toString("hex");

            const filename =
                `news-${Date.now()}-${randomPart}${extension}`;

            callback(
                null,
                filename
            );
        },
    });

const upload =
    multer({
        storage,

        limits: {
            fileSize:
                5 * 1024 * 1024,
        },

        fileFilter(
            req,
            file,
            callback
        ) {
            if (
                !allowedMimeTypes.has(
                    file.mimetype
                )
            ) {
                callback(
                    new Error(
                        "只允许上传 JPG、PNG、WebP 或 GIF 图片。"
                    )
                );

                return;
            }

            callback(
                null,
                true
            );
        },
    });

router.post(
    "/image",
    verifyAdminToken,
    upload.single("image"),
    function (
        req,
        res
    ) {
        if (!req.file) {
            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        "请选择需要上传的新闻图片。",
                });
        }

        const imageUrl =
            `/uploads/news/${req.file.filename}`;

        return res
            .status(201)
            .json({
                success: true,
                message:
                    "新闻图片上传成功。",
                data: {
                    imageUrl,
                    filename:
                        req.file.filename,
                    size:
                        req.file.size,
                    mimeType:
                        req.file.mimetype,
                },
            });
    }
);

router.use(
    function (
        error,
        req,
        res,
        next
    ) {
        if (
            error instanceof
            multer.MulterError
        ) {
            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {
                return res
                    .status(400)
                    .json({
                        success: false,
                        message:
                            "新闻图片不能超过5MB。",
                    });
            }

            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        error.message ||
                        "新闻图片上传失败。",
                });
        }

        if (error) {
            console.error(
                "News image upload error:",
                error
            );

            return res
                .status(400)
                .json({
                    success: false,
                    message:
                        error.message ||
                        "新闻图片上传失败。",
                });
        }

        next();
    }
);

module.exports =
    router;