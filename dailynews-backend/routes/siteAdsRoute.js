const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const db = require("../db");
const {
    verifyAdminToken,
} = require("../middleware/adminAuth");

const router = express.Router();

const adsUploadDirectory = path.join(
    __dirname,
    "..",
    "public",
    "uploads",
    "ads"
);

fs.mkdirSync(adsUploadDirectory, {
    recursive: true,
});

const allowedMimeTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp",
]);

const allowedExtensions = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
]);

const storage = multer.diskStorage({
    destination(req, file, callback) {
        callback(null, adsUploadDirectory);
    },

    filename(req, file, callback) {
        const originalExtension =
            path.extname(file.originalname).toLowerCase();

        const safeExtension =
            allowedExtensions.has(originalExtension)
                ? originalExtension
                : ".jpg";

        const uniqueName = [
            "site-ad",
            Date.now(),
            crypto.randomBytes(5).toString("hex"),
        ].join("-");

        callback(
            null,
            `${uniqueName}${safeExtension}`
        );
    },
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024,
    },

    fileFilter(req, file, callback) {
        const extension =
            path.extname(file.originalname).toLowerCase();

        if (
            !allowedMimeTypes.has(file.mimetype) ||
            !allowedExtensions.has(extension)
        ) {
            const uploadError = new Error(
                "广告图片仅支持PNG、JPG、JPEG和WebP格式"
            );

            uploadError.statusCode = 400;
            callback(uploadError);
            return;
        }

        callback(null, true);
    },
});

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeBoolean(value) {
    return (
        value === true ||
        value === 1 ||
        value === "1" ||
        value === "true" ||
        value === "on"
    );
}

function normalizeSortOrder(value) {
    const parsedValue =
        Number.parseInt(value, 10);

    if (
        !Number.isInteger(parsedValue) ||
        parsedValue < 1 ||
        parsedValue > 5
    ) {
        return 1;
    }

    return parsedValue;
}

function isAllowedTargetUrl(value) {
    const targetUrl = normalizeText(value);

    if (!targetUrl) {
        return false;
    }

    if (targetUrl.startsWith("/")) {
        return true;
    }

    try {
        const parsedUrl = new URL(targetUrl);

        return (
            parsedUrl.protocol === "http:" ||
            parsedUrl.protocol === "https:"
        );
    } catch (error) {
        return false;
    }
}

function getPublicImageUrl(fileName) {
    return `/uploads/ads/${fileName}`;
}

function getImageFilePath(imageUrl) {
    const normalizedUrl =
        normalizeText(imageUrl);

    if (
        !normalizedUrl.startsWith(
            "/uploads/ads/"
        )
    ) {
        return null;
    }

    const fileName =
        path.basename(normalizedUrl);

    return path.join(
        adsUploadDirectory,
        fileName
    );
}

function removeUploadedFile(filePath) {
    if (!filePath) {
        return;
    }

    fs.unlink(filePath, (error) => {
        if (
            error &&
            error.code !== "ENOENT"
        ) {
            console.error(
                "Delete advertisement image error:",
                error.message
            );
        }
    });
}

function removeImageByUrl(imageUrl) {
    const filePath =
        getImageFilePath(imageUrl);

    removeUploadedFile(filePath);
}

function handleUpload(
    request,
    response,
    next
) {
    upload.single("image")(
        request,
        response,
        function (error) {
            if (!error) {
                next();
                return;
            }

            if (
                error instanceof
                multer.MulterError
            ) {
                if (
                    error.code ===
                    "LIMIT_FILE_SIZE"
                ) {
                    return response
                        .status(400)
                        .json({
                            success: false,
                            message:
                                "广告图片不能超过5MB",
                        });
                }

                return response
                    .status(400)
                    .json({
                        success: false,
                        message:
                            "广告图片上传失败",
                    });
            }

            return response
                .status(
                    Number(error.statusCode) ||
                    400
                )
                .json({
                    success: false,
                    message:
                        error.message ||
                        "广告图片上传失败",
                });
        }
    );
}

/*
 * 首页公开读取启用的广告。
 * 最多返回5张。
 */
router.get("/", (req, res) => {
    const sql = `
    SELECT
      id,
      title,
      content,
      image_url,
      target_url,
      sort_order,
      is_active,
      open_new_tab,
      created_at,
      updated_at
    FROM site_ads
    WHERE is_active = 1
    ORDER BY
      sort_order ASC,
      id ASC
    LIMIT 5
  `;

    db.all(sql, [], (error, rows) => {
        if (error) {
            console.error(
                "Get public site ads error:",
                error.message
            );

            return res.status(500).json({
                success: false,
                message: "读取首页广告失败",
            });
        }

        return res.json({
            success: true,
            data: rows,
        });
    });
});

/*
 * 管理员读取全部广告。
 */
router.get(
    "/admin",
    verifyAdminToken,
    (req, res) => {
        const sql = `
        SELECT
        id,
        title,
        content,
        image_url,
        target_url,
        sort_order,
        is_active,
        open_new_tab,
        created_at,
        updated_at
      FROM site_ads
      ORDER BY
        sort_order ASC,
        id ASC
    `;

        db.all(sql, [], (error, rows) => {
            if (error) {
                console.error(
                    "Get admin site ads error:",
                    error.message
                );

                return res
                    .status(500)
                    .json({
                        success: false,
                        message:
                            "读取广告列表失败",
                    });
            }

            return res.json({
                success: true,
                data: rows,
            });
        });
    }
);

/*
 * 管理员新增广告。
 */
router.post(
    "/admin",
    verifyAdminToken,
    handleUpload,
    (req, res) => {
        const title =
            normalizeText(req.body.title);

        const content =
            normalizeText(req.body.content);

        const targetUrl =
            normalizeText(
                req.body.target_url
            );

        const sortOrder =
            normalizeSortOrder(
                req.body.sort_order
            );

        const isActive =
            normalizeBoolean(
                req.body.is_active
            )
                ? 1
                : 0;

        const openNewTab =
            normalizeBoolean(
                req.body.open_new_tab
            )
                ? 1
                : 0;

        if (!title) {
            removeUploadedFile(
                req.file?.path
            );

            return res.status(400).json({
                success: false,
                message: "请输入广告标题",
            });
        }

        if (
            !isAllowedTargetUrl(
                targetUrl
            )
        ) {
            removeUploadedFile(
                req.file?.path
            );

            return res.status(400).json({
                success: false,
                message:
                    "请输入正确的站内路径或HTTP/HTTPS链接",
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "请选择广告图片",
            });
        }

        const imageUrl =
            getPublicImageUrl(
                req.file.filename
            );

        const sql = `
        INSERT INTO site_ads (
            title,
            content,
            image_url,
            target_url,
            sort_order,
            is_active,
            open_new_tab
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

        const values = [
            title,
            content,
            imageUrl,
            targetUrl,
            sortOrder,
            isActive,
            openNewTab,
        ];

        db.run(
            sql,
            values,
            function (error) {
                if (error) {
                    removeUploadedFile(
                        req.file.path
                    );

                    console.error(
                        "Create site ad error:",
                        error.message
                    );

                    return res
                        .status(500)
                        .json({
                            success: false,
                            message:
                                "新增广告失败",
                        });
                }

                return res.json({
                    success: true,
                    message:
                        "广告上传成功",
                    data: {
                        id: this.lastID,
                        title,
                        content,
                        image_url: imageUrl,
                        target_url: targetUrl,
                        sort_order: sortOrder,
                        is_active: isActive,
                        open_new_tab:
                            openNewTab,
                    },
                });
            }
        );
    }
);

/*
 * 管理员修改广告。
 * image字段可选；未上传新图时保留原图片。
 */
router.put(
    "/admin/:id",
    verifyAdminToken,
    handleUpload,
    (req, res) => {
        const { id } = req.params;

        const title =
            normalizeText(req.body.title);

        const content =
            normalizeText(req.body.content);

        const targetUrl =
            normalizeText(
                req.body.target_url
            );

        const sortOrder =
            normalizeSortOrder(
                req.body.sort_order
            );

        const isActive =
            normalizeBoolean(
                req.body.is_active
            )
                ? 1
                : 0;

        const openNewTab =
            normalizeBoolean(
                req.body.open_new_tab
            )
                ? 1
                : 0;

        if (!title) {
            removeUploadedFile(
                req.file?.path
            );

            return res.status(400).json({
                success: false,
                message: "请输入广告标题",
            });
        }

        if (
            !isAllowedTargetUrl(
                targetUrl
            )
        ) {
            removeUploadedFile(
                req.file?.path
            );

            return res.status(400).json({
                success: false,
                message:
                    "请输入正确的站内路径或HTTP/HTTPS链接",
            });
        }

        db.get(
            `
        SELECT *
        FROM site_ads
        WHERE id = ?
      `,
            [id],
            (findError, existingAd) => {
                if (findError) {
                    removeUploadedFile(
                        req.file?.path
                    );

                    return res
                        .status(500)
                        .json({
                            success: false,
                            message:
                                "读取广告失败",
                        });
                }

                if (!existingAd) {
                    removeUploadedFile(
                        req.file?.path
                    );

                    return res
                        .status(404)
                        .json({
                            success: false,
                            message:
                                "广告不存在",
                        });
                }

                const imageUrl =
                    req.file
                        ? getPublicImageUrl(
                            req.file.filename
                        )
                        : existingAd.image_url;

                const sql = `
                UPDATE site_ads
                SET
                  title = ?,
                  content = ?,
                  image_url = ?,
                  target_url = ?,
                  sort_order = ?,
                  is_active = ?,
                  open_new_tab = ?,
                  updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
        `;

                const values = [
                    title,
                    content,
                    imageUrl,
                    targetUrl,
                    sortOrder,
                    isActive,
                    openNewTab,
                    id,
                ];

                db.run(
                    sql,
                    values,
                    function (updateError) {
                        if (updateError) {
                            removeUploadedFile(
                                req.file?.path
                            );

                            console.error(
                                "Update site ad error:",
                                updateError.message
                            );

                            return res
                                .status(500)
                                .json({
                                    success: false,
                                    message:
                                        "修改广告失败",
                                });
                        }

                        if (req.file) {
                            removeImageByUrl(
                                existingAd.image_url
                            );
                        }

                        return res.json({
                            success: true,
                            message:
                                "广告修改成功",
                        });
                    }
                );
            }
        );
    }
);

/*
 * 管理员启用或停用广告。
 */
router.patch(
    "/admin/:id/status",
    verifyAdminToken,
    (req, res) => {
        const { id } = req.params;

        const isActive =
            normalizeBoolean(
                req.body.is_active
            )
                ? 1
                : 0;

        db.run(
            `
        UPDATE site_ads
        SET
          is_active = ?,
          updated_at =
            CURRENT_TIMESTAMP
        WHERE id = ?
      `,
            [isActive, id],
            function (error) {
                if (error) {
                    console.error(
                        "Update site ad status error:",
                        error.message
                    );

                    return res
                        .status(500)
                        .json({
                            success: false,
                            message:
                                "修改广告状态失败",
                        });
                }

                if (this.changes === 0) {
                    return res
                        .status(404)
                        .json({
                            success: false,
                            message:
                                "广告不存在",
                        });
                }

                return res.json({
                    success: true,
                    message: isActive
                        ? "广告已启用"
                        : "广告已停用",
                });
            }
        );
    }
);

/*
 * 管理员删除广告。
 */
router.delete(
    "/admin/:id",
    verifyAdminToken,
    (req, res) => {
        const { id } = req.params;

        db.get(
            `
        SELECT image_url
        FROM site_ads
        WHERE id = ?
      `,
            [id],
            (findError, ad) => {
                if (findError) {
                    return res
                        .status(500)
                        .json({
                            success: false,
                            message:
                                "读取广告失败",
                        });
                }

                if (!ad) {
                    return res
                        .status(404)
                        .json({
                            success: false,
                            message:
                                "广告不存在",
                        });
                }

                db.run(
                    `
            DELETE FROM site_ads
            WHERE id = ?
          `,
                    [id],
                    function (deleteError) {
                        if (deleteError) {
                            console.error(
                                "Delete site ad error:",
                                deleteError.message
                            );

                            return res
                                .status(500)
                                .json({
                                    success: false,
                                    message:
                                        "删除广告失败",
                                });
                        }

                        removeImageByUrl(
                            ad.image_url
                        );

                        return res.json({
                            success: true,
                            message:
                                "广告删除成功",
                        });
                    }
                );
            }
        );
    }
);

module.exports = router;