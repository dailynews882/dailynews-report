const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { verifyAdminToken } = require("../middleware/adminAuth");

const router = express.Router();

const uploadDirectory = path.join(
    __dirname,
    "..",
    "public",
    "uploads",
    "site"
);

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, {
        recursive: true
    });
}

const allowedMimeTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp"
]);

const allowedExtensions = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp"
]);

const storage = multer.diskStorage({
    destination(req, file, callback) {
        callback(null, uploadDirectory);
    },

    filename(req, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();
        const fileName = `site-logo-${Date.now()}${extension}`;

        callback(null, fileName);
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 2 * 1024 * 1024,
        files: 1
    },

    fileFilter(req, file, callback) {
        const extension = path.extname(file.originalname).toLowerCase();

        if (
            !allowedMimeTypes.has(file.mimetype) ||
            !allowedExtensions.has(extension)
        ) {
            return callback(
                new Error("只允许上传 PNG、JPG、JPEG 或 WebP 图片。")
            );
        }

        callback(null, true);
    }
});

function getSetting(settingKey) {
    return new Promise((resolve, reject) => {
        db.get(
            `
        SELECT setting_value
        FROM site_settings
        WHERE setting_key = ?
        LIMIT 1
      `,
            [settingKey],
            (error, row) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(row ? row.setting_value : null);
            }
        );
    });
}

function saveSetting(settingKey, settingValue) {
    return new Promise((resolve, reject) => {
        db.run(
            `
        INSERT INTO site_settings (
          setting_key,
          setting_value,
          updated_at
        )
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(setting_key)
        DO UPDATE SET
          setting_value = excluded.setting_value,
          updated_at = CURRENT_TIMESTAMP
      `,
            [settingKey, settingValue],
            function (error) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            }
        );
    });
}

function deleteSetting(settingKey) {
    return new Promise((resolve, reject) => {
        db.run(
            `
        DELETE FROM site_settings
        WHERE setting_key = ?
      `,
            [settingKey],
            function (error) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve();
            }
        );
    });
}

function removeUploadedLogo(logoUrl) {
    if (
        !logoUrl ||
        !logoUrl.startsWith("/uploads/site/site-logo-")
    ) {
        return;
    }

    const fileName = path.basename(logoUrl);
    const filePath = path.join(uploadDirectory, fileName);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
}

router.get("/logo", async (req, res) => {
    try {
        const logoUrl = await getSetting("site_logo_url");

        return res.json({
            success: true,
            logoUrl: logoUrl || null
        });
    } catch (error) {
        console.error("Get site logo error:", error);

        return res.status(500).json({
            success: false,
            message: "读取网站 LOGO 失败。"
        });
    }
});

router.post(
    "/logo",

    (req, res, next) => {
        console.log("[LOGO] POST request reached Express");
        console.log(
            "[LOGO] Content-Type:",
            req.headers["content-type"]
        );
        console.log(
            "[LOGO] Content-Length:",
            req.headers["content-length"]
        );
        next();
    },

    (req, res, next) => {
        console.log("[LOGO] Starting admin authentication");

        verifyAdminToken(req, res, () => {
            console.log("[LOGO] Admin authentication passed");
            next();
        });
    },

    (req, res, next) => {
        console.log("[LOGO] Starting multer parsing");

        upload.single("logo")(req, res, (error) => {
            console.log("[LOGO] Multer callback executed");

            if (error) {
                console.error(
                    "[LOGO] Multer error:",
                    error
                );

                if (error instanceof multer.MulterError) {
                    if (error.code === "LIMIT_FILE_SIZE") {
                        return res.status(400).json({
                            success: false,
                            message: "LOGO 图片不能超过 2MB。"
                        });
                    }

                    return res.status(400).json({
                        success: false,
                        message: `上传失败：${error.message}`
                    });
                }

                return res.status(400).json({
                    success: false,
                    message: error.message || "上传 LOGO 失败。"
                });
            }

            console.log(
                "[LOGO] Multer file:",
                req.file
                    ? req.file.filename
                    : "No file"
            );

            next();
        });
    },

    async (req, res) => {
        console.log("[LOGO] Upload handler started");

        if (!req.file) {
            console.log("[LOGO] No uploaded file");

            return res.status(400).json({
                success: false,
                message: "请选择需要上传的 LOGO 图片。"
            });
        }

        console.log("[LOGO] File saved:", req.file.filename);

        const logoUrl = `/uploads/site/${req.file.filename}`;

        try {
            console.log("[LOGO] Reading old setting");

            const oldLogoUrl = await getSetting("site_logo_url");

            console.log("[LOGO] Old setting read:", oldLogoUrl);
            console.log("[LOGO] Saving new setting:", logoUrl);

            await saveSetting("site_logo_url", logoUrl);

            console.log("[LOGO] New setting saved");

            if (oldLogoUrl && oldLogoUrl !== logoUrl) {
                removeUploadedLogo(oldLogoUrl);
            }

            return res.json({
                success: true,
                message: "网站 LOGO 上传成功。",
                logoUrl
            });
        } catch (error) {
            console.error("Upload site logo error:", error);

            removeUploadedLogo(logoUrl);

            return res.status(500).json({
                success: false,
                message: "保存网站 LOGO 失败。"
            });
        }
    }
);

router.delete(
    "/logo",
    verifyAdminToken,
    async (req, res) => {
        try {
            const oldLogoUrl = await getSetting("site_logo_url");

            await deleteSetting("site_logo_url");
            removeUploadedLogo(oldLogoUrl);

            return res.json({
                success: true,
                message: "已经恢复默认 LOGO。",
                logoUrl: null
            });
        } catch (error) {
            console.error("Reset site logo error:", error);

            return res.status(500).json({
                success: false,
                message: "恢复默认 LOGO 失败。"
            });
        }
    }
);

module.exports = router;