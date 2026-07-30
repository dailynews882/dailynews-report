const db = require("../db");

const {
    resolveFilters,
} = require("./gnewsService");

const GNEWS_AUTO_FETCH_SETTING_KEY =
    "gnews_auto_fetch_config";

const DEFAULT_GNEWS_AUTO_FETCH_CONFIG =
    Object.freeze({
        enabled: false,
        intervalMinutes: 15,
        max: 25,
        category: "general",
        language: "en",
        country: "sg",
        status: "published",
    });

const ALLOWED_AUTO_FETCH_INTERVALS =
    new Set([
        5,
        10,
        15,
        30,
        60,
    ]);

const ALLOWED_AUTO_FETCH_MAX_VALUES =
    new Set([
        3,
        5,
        10,
        15,
        20,
        25,
    ]);

const ALLOWED_AUTO_FETCH_STATUSES =
    new Set([
        "published",
        "pending",
    ]);

function dbGet(sql, parameters = []) {
    return new Promise(function (
        resolve,
        reject
    ) {
        db.get(
            sql,
            parameters,
            function handleResult(error, row) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(row || null);
            }
        );
    });
}

function dbRun(sql, parameters = []) {
    return new Promise(function (
        resolve,
        reject
    ) {
        db.run(
            sql,
            parameters,
            function handleResult(error) {
                if (error) {
                    reject(error);
                    return;
                }

                resolve({
                    id: this.lastID,
                    changes: this.changes,
                });
            }
        );
    });
}

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

function validateGNewsAutoFetchConfig(
    input
) {
    if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input)
    ) {
        const error = new Error(
            "自动抓取配置格式不正确"
        );

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

    const intervalMinutes =
        Number.parseInt(
            input.intervalMinutes,
            10
        );

    if (
        !Number.isInteger(intervalMinutes) ||
        !ALLOWED_AUTO_FETCH_INTERVALS.has(
            intervalMinutes
        )
    ) {
        const error = new Error(
            "抓取间隔只能是 5、10、15、30 或 60 分钟"
        );

        error.statusCode = 400;
        throw error;
    }

    const max = Number.parseInt(
        input.max,
        10
    );

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
        normalizeConfigText(
            input.category
        );

    const requestedLanguage =
        normalizeConfigText(
            input.language
        );

    const requestedCountry =
        normalizeConfigText(
            input.country
        );

    if (!requestedCategory) {
        const error = new Error(
            "请选择新闻分类"
        );

        error.statusCode = 400;
        throw error;
    }

    if (!requestedLanguage) {
        const error = new Error(
            "请选择新闻语言"
        );

        error.statusCode = 400;
        throw error;
    }

    if (!requestedCountry) {
        const error = new Error(
            "请选择国家或地区"
        );

        error.statusCode = 400;
        throw error;
    }

    const resolvedFilters =
        resolveFilters({
            category: requestedCategory,
            lang: requestedLanguage,
            country: requestedCountry,
            max,
        });

    if (
        resolvedFilters.category !==
        requestedCategory
    ) {
        const error = new Error(
            "不支持该新闻分类"
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        resolvedFilters.lang !==
        requestedLanguage
    ) {
        const error = new Error(
            "不支持该新闻语言"
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        resolvedFilters.country !==
        requestedCountry
    ) {
        const error = new Error(
            "不支持该国家或地区"
        );

        error.statusCode = 400;
        throw error;
    }

    const status = normalizeConfigText(
        input.status
    );

    if (
        !ALLOWED_AUTO_FETCH_STATUSES.has(
            status
        )
    ) {
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
        category:
            resolvedFilters.category,
        language:
            resolvedFilters.lang,
        country:
            resolvedFilters.country,
        status,
    };
}

async function getSavedSettingValue() {
    const row = await dbGet(
        `
      SELECT setting_value
      FROM site_settings
      WHERE setting_key = ?
      LIMIT 1
    `,
        [
            GNEWS_AUTO_FETCH_SETTING_KEY,
        ]
    );

    return row
        ? row.setting_value
        : null;
}

async function readGNewsAutoFetchConfig() {
    const savedValue =
        await getSavedSettingValue();

    if (!savedValue) {
        return getDefaultGNewsAutoFetchConfig();
    }

    try {
        const parsedConfig =
            JSON.parse(savedValue);

        return {
            ...getDefaultGNewsAutoFetchConfig(),
            ...validateGNewsAutoFetchConfig(
                parsedConfig
            ),
        };
    } catch (error) {
        console.error(
            "Read GNews auto-fetch config error:",
            error
        );

        return getDefaultGNewsAutoFetchConfig();
    }
}

async function saveGNewsAutoFetchConfig(
    input
) {
    const config =
        validateGNewsAutoFetchConfig(input);

    await dbRun(
        `
      INSERT INTO site_settings (
        setting_key,
        setting_value,
        updated_at
      )
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(setting_key)
      DO UPDATE SET
        setting_value =
          excluded.setting_value,
        updated_at =
          CURRENT_TIMESTAMP
    `,
        [
            GNEWS_AUTO_FETCH_SETTING_KEY,
            JSON.stringify(config),
        ]
    );

    return config;
}

module.exports = {
    GNEWS_AUTO_FETCH_SETTING_KEY,
    getDefaultGNewsAutoFetchConfig,
    validateGNewsAutoFetchConfig,
    readGNewsAutoFetchConfig,
    saveGNewsAutoFetchConfig,
};