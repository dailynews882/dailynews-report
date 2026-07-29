const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { resolveFilters } = require("../services/gnewsService");
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

const GNEWS_AUTO_FETCH_SETTING_KEY = "gnews_auto_fetch_config";

const DEFAULT_GNEWS_AUTO_FETCH_CONFIG = Object.freeze({
    enabled: false,
    intervalMinutes: 15,
    max: 25,
    category: "general",
    language: "en",
    country: "sg",
    status: "published",
});

const ALLOWED_AUTO_FETCH_INTERVALS = new Set([
    5,
    10,
    15,
    30,
    60,
]);

const ALLOWED_AUTO_FETCH_MAX_VALUES = new Set([
    3,
    5,
    10,
    15,
    20,
    25,
]);

const ALLOWED_AUTO_FETCH_STATUSES = new Set([
    "published",
    "pending",
]);

function getDefaultGNewsAutoFetchConfig() {
    return {
        ...DEFAULT_GNEWS_AUTO_FETCH_CONFIG,
    };
}

function normalizeConfigText(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase();
}

function validateGNewsAutoFetchConfig(input) {
    if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input)
    ) {
        const error = new Error("自动抓取配置格式不正确");
        error.statusCode = 400;
        throw error;
    }

    if (typeof input.enabled !== "boolean") {
        const error = new Error(
            "enabled 必须是 true 或 false"
        );
        error.statusCode = 400;
        throw error;
    }

    const intervalMinutes = Number.parseInt(
        input.intervalMinutes,
        10
    );

    if (
        !Number.isInteger(intervalMinutes) ||
        !ALLOWED_AUTO_FETCH_INTERVALS.has(intervalMinutes)
    ) {
        const error = new Error(
            "抓取间隔只能是 5、10、15、30 或 60 分钟"
        );
        error.statusCode = 400;
        throw error;
    }

    const max = Number.parseInt(input.max, 10);

    if (
        !Number.isInteger(max) ||
        !ALLOWED_AUTO_FETCH_MAX_VALUES.has(max)
    ) {
        const error = new Error(
            "每次获取数量只能是 3、5、10、15、20 或 25"
        );
        error.statusCode = 400;
        throw error;
    }

    const requestedCategory =
        normalizeConfigText(input.category);

    const requestedLanguage =
        normalizeConfigText(input.language);

    const requestedCountry =
        normalizeConfigText(input.country);

    if (!requestedCategory) {
        const error = new Error("请选择新闻分类");
        error.statusCode = 400;
        throw error;
    }

    if (!requestedLanguage) {
        const error = new Error("请选择新闻语言");
        error.statusCode = 400;
        throw error;
    }

    if (!requestedCountry) {
        const error = new Error("请选择国家或地区");
        error.statusCode = 400;
        throw error;
    }

    const resolvedFilters = resolveFilters({
        category: requestedCategory,
        lang: requestedLanguage,
        country: requestedCountry,
        max,
    });

    if (resolvedFilters.category !== requestedCategory) {
        const error = new Error("不支持该新闻分类");
        error.statusCode = 400;
        throw error;
    }

    if (resolvedFilters.lang !== requestedLanguage) {
        const error = new Error("不支持该新闻语言");
        error.statusCode = 400;
        throw error;
    }

    if (resolvedFilters.country !== requestedCountry) {
        const error = new Error("不支持该国家或地区");
        error.statusCode = 400;
        throw error;
    }

    const status = normalizeConfigText(input.status);

    if (!ALLOWED_AUTO_FETCH_STATUSES.has(status)) {
        const error = new Error(
            "发布模式只能是 published 或 pending"
        );
        error.statusCode = 400;
        throw error;
    }

    return {
        enabled: input.enabled,
        intervalMinutes,
        max,
        category: resolvedFilters.category,
        language: resolvedFilters.lang,
        country: resolvedFilters.country,
        status,
    };
}

async function readGNewsAutoFetchConfig() {
    const savedValue = await getSetting(
        GNEWS_AUTO_FETCH_SETTING_KEY
    );

    if (!savedValue) {
        return getDefaultGNewsAutoFetchConfig();
    }

    try {
        const parsedConfig = JSON.parse(savedValue);

        return {
            ...getDefaultGNewsAutoFetchConfig(),
            ...validateGNewsAutoFetchConfig(parsedConfig),
        };
    } catch (error) {
        console.error(
            "Read GNews auto-fetch config error:",
            error
        );

        return getDefaultGNewsAutoFetchConfig();
    }
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

router.get(
    "/gnews-auto-fetch",
    verifyAdminToken,
    async (req, res) => {
        try {
            const config =
                await readGNewsAutoFetchConfig();

            return res.json({
                success: true,
                config,
            });
        } catch (error) {
            console.error(
                "Get GNews auto-fetch config error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "读取自动抓取配置失败",
            });
        }
    }
);

router.put(
    "/gnews-auto-fetch",
    verifyAdminToken,
    async (req, res) => {
        try {
            const config =
                validateGNewsAutoFetchConfig(req.body);

            await saveSetting(
                GNEWS_AUTO_FETCH_SETTING_KEY,
                JSON.stringify(config)
            );

            return res.json({
                success: true,
                message: "自动抓取配置保存成功",
                config,
            });
        } catch (error) {
            console.error(
                "Save GNews auto-fetch config error:",
                error
            );

            return res
                .status(error.statusCode || 500)
                .json({
                    success: false,
                    message:
                        error.message ||
                        "保存自动抓取配置失败",
                });
        }
    }
);

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