const express = require("express");
const db = require("../db");
const {
    verifyAdminToken
} = require("../middleware/adminAuth");

const router = express.Router();

function queryAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows || []);
        });
    });
}

function queryOne(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row || null);
        });
    });
}

function runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                lastID: this.lastID,
                changes: this.changes
            });
        });
    });
}

function normalizeText(value) {
    return String(value ?? "").trim();
}

function normalizeCode(value) {
    return normalizeText(value).toLowerCase();
}

function normalizeInteger(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeBooleanInteger(value, fallback = 0) {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    return (
        value === true ||
        value === 1 ||
        value === "1" ||
        value === "true"
    )
        ? 1
        : 0;
}

function isValidCategoryCode(value) {
    return /^[a-z0-9][a-z0-9-]{1,49}$/.test(value);
}

function isValidCountryCode(value) {
    return /^[a-z]{2}$/.test(value);
}

function sendDatabaseError(res, error, fallbackMessage) {
    console.error(fallbackMessage, error);

    if (
        String(error?.message || "").includes(
            "UNIQUE constraint failed"
        )
    ) {
        return res.status(409).json({
            success: false,
            message: "代码已经存在，请使用其他代码。"
        });
    }

    return res.status(500).json({
        success: false,
        message: fallbackMessage
    });
}

/*
 * =====================================
 * 公开读取已启用的新闻分类
 * GET /api/news-metadata/categories
 * =====================================
 */
router.get(
    "/categories",
    async (req, res) => {
        try {
            const categories = await queryAll(
                `
          SELECT
            id,
            category_code,
            category_name,
            category_name_en,
            sort_order,
            show_in_home_nav
          FROM news_categories
          WHERE is_active = 1
          ORDER BY
            sort_order ASC,
            id ASC
        `
            );

            return res.json({
                success: true,
                categories
            });
        } catch (error) {
            return sendDatabaseError(
                res,
                error,
                "读取新闻分类失败。"
            );
        }
    }
);

/*
 * =====================================
 * 公开读取已启用的国家
 * GET /api/news-metadata/countries
 * =====================================
 */
router.get(
    "/countries",
    async (req, res) => {
        try {
            const countries = await queryAll(
                `
          SELECT
            id,
            country_code,
            country_name,
            country_name_en,
            region,
            sort_order,
            show_in_home_menu
          FROM news_countries
          WHERE is_active = 1
          ORDER BY
            sort_order ASC,
            id ASC
        `
            );

            return res.json({
                success: true,
                countries
            });
        } catch (error) {
            return sendDatabaseError(
                res,
                error,
                "读取新闻国家失败。"
            );
        }
    }
);

/*
 * =====================================
 * 管理员读取全部新闻分类
 * GET /api/news-metadata/admin/categories
 * =====================================
 */
router.get(
    "/admin/categories",
    verifyAdminToken,
    async (req, res) => {
        try {
            const categories = await queryAll(
                `
          SELECT
            id,
            category_code,
            category_name,
            category_name_en,
            sort_order,
            is_active,
            show_in_home_nav,
            created_at,
            updated_at
          FROM news_categories
          ORDER BY
            sort_order ASC,
            id ASC
        `
            );

            return res.json({
                success: true,
                categories
            });
        } catch (error) {
            return sendDatabaseError(
                res,
                error,
                "读取全部新闻分类失败。"
            );
        }
    }
);

router.post(
    "/admin/categories",
    verifyAdminToken,
    async (req, res) => {
        const categoryCode = normalizeCode(req.body.category_code);
        const categoryName = normalizeText(req.body.category_name);
        const categoryNameEn = normalizeText(req.body.category_name_en);
        const sortOrder = normalizeInteger(req.body.sort_order, 0);
        const isActive = normalizeBooleanInteger(req.body.is_active, 1);
        const showInHomeNav = normalizeBooleanInteger(
            req.body.show_in_home_nav,
            1
        );

        if (!isValidCategoryCode(categoryCode)) {
            return res.status(400).json({
                success: false,
                message: "分类代码必须为2至50位小写字母、数字或短横线。"
            });
        }

        if (!categoryName) {
            return res.status(400).json({
                success: false,
                message: "请输入分类中文名称。"
            });
        }

        try {
            const result = await runSql(
                `
          INSERT INTO news_categories (
            category_code,
            category_name,
            category_name_en,
            sort_order,
            is_active,
            show_in_home_nav,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
                [
                    categoryCode,
                    categoryName,
                    categoryNameEn,
                    sortOrder,
                    isActive,
                    showInHomeNav
                ]
            );

            const category = await queryOne(
                "SELECT * FROM news_categories WHERE id = ?",
                [result.lastID]
            );

            return res.status(201).json({
                success: true,
                message: "新闻分类新增成功。",
                category
            });
        } catch (error) {
            return sendDatabaseError(res, error, "新增新闻分类失败。");
        }
    }
);

router.put(
    "/admin/categories/:id",
    verifyAdminToken,
    async (req, res) => {
        const id = normalizeInteger(req.params.id, 0);
        const categoryCode = normalizeCode(req.body.category_code);
        const categoryName = normalizeText(req.body.category_name);
        const categoryNameEn = normalizeText(req.body.category_name_en);
        const sortOrder = normalizeInteger(req.body.sort_order, 0);
        const isActive = normalizeBooleanInteger(req.body.is_active, 1);
        const showInHomeNav = normalizeBooleanInteger(
            req.body.show_in_home_nav,
            1
        );

        if (id <= 0) {
            return res.status(400).json({
                success: false,
                message: "分类ID无效。"
            });
        }

        if (!isValidCategoryCode(categoryCode)) {
            return res.status(400).json({
                success: false,
                message: "分类代码必须为2至50位小写字母、数字或短横线。"
            });
        }

        if (!categoryName) {
            return res.status(400).json({
                success: false,
                message: "请输入分类中文名称。"
            });
        }

        try {
            const oldCategory = await queryOne(
                "SELECT * FROM news_categories WHERE id = ?",
                [id]
            );

            if (!oldCategory) {
                return res.status(404).json({
                    success: false,
                    message: "新闻分类不存在。"
                });
            }

            await runSql(
                `
          UPDATE news_categories
          SET
            category_code = ?,
            category_name = ?,
            category_name_en = ?,
            sort_order = ?,
            is_active = ?,
            show_in_home_nav = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
                [
                    categoryCode,
                    categoryName,
                    categoryNameEn,
                    sortOrder,
                    isActive,
                    showInHomeNav,
                    id
                ]
            );

            if (oldCategory.category_code !== categoryCode) {
                await runSql(
                    `
            UPDATE news
            SET
              category = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE category = ?
          `,
                    [categoryCode, oldCategory.category_code]
                );
            }

            const category = await queryOne(
                "SELECT * FROM news_categories WHERE id = ?",
                [id]
            );

            return res.json({
                success: true,
                message: "新闻分类更新成功。",
                category
            });
        } catch (error) {
            return sendDatabaseError(res, error, "更新新闻分类失败。");
        }
    }
);

router.delete(
    "/admin/categories/:id",
    verifyAdminToken,
    async (req, res) => {
        const id = normalizeInteger(req.params.id, 0);

        if (id <= 0) {
            return res.status(400).json({
                success: false,
                message: "分类ID无效。"
            });
        }

        try {
            const category = await queryOne(
                "SELECT * FROM news_categories WHERE id = ?",
                [id]
            );

            if (!category) {
                return res.status(404).json({
                    success: false,
                    message: "新闻分类不存在。"
                });
            }

            const usage = await queryOne(
                "SELECT COUNT(*) AS total FROM news WHERE category = ?",
                [category.category_code]
            );

            if (Number(usage?.total || 0) > 0) {
                return res.status(409).json({
                    success: false,
                    message: "该分类已被新闻使用，不能删除。请改为停用。"
                });
            }

            await runSql(
                "DELETE FROM news_categories WHERE id = ?",
                [id]
            );

            return res.json({
                success: true,
                message: "新闻分类删除成功。"
            });
        } catch (error) {
            return sendDatabaseError(res, error, "删除新闻分类失败。");
        }
    }
);

/*
 * =====================================
 * 管理员读取全部国家
 * GET /api/news-metadata/admin/countries
 * =====================================
 */
router.get(
    "/admin/countries",
    verifyAdminToken,
    async (req, res) => {
        try {
            const countries = await queryAll(
                `
          SELECT
            id,
            country_code,
            country_name,
            country_name_en,
            region,
            sort_order,
            is_active,
            show_in_home_menu,
            created_at,
            updated_at
          FROM news_countries
          ORDER BY
            sort_order ASC,
            id ASC
        `
            );

            return res.json({
                success: true,
                countries
            });
        } catch (error) {
            return sendDatabaseError(
                res,
                error,
                "读取全部新闻国家失败。"
            );
        }
    }
);

router.post(
    "/admin/countries",
    verifyAdminToken,
    async (req, res) => {
        const countryCode = normalizeCode(req.body.country_code);
        const countryName = normalizeText(req.body.country_name);
        const countryNameEn = normalizeText(req.body.country_name_en);
        const region = normalizeText(req.body.region);
        const sortOrder = normalizeInteger(req.body.sort_order, 0);
        const isActive = normalizeBooleanInteger(req.body.is_active, 1);
        const showInHomeMenu = normalizeBooleanInteger(
            req.body.show_in_home_menu,
            1
        );

        if (!isValidCountryCode(countryCode)) {
            return res.status(400).json({
                success: false,
                message: "国家代码必须是两位小写英文字母，例如 sg、us、cn。"
            });
        }

        if (!countryName) {
            return res.status(400).json({
                success: false,
                message: "请输入国家中文名称。"
            });
        }

        try {
            const result = await runSql(
                `
          INSERT INTO news_countries (
            country_code,
            country_name,
            country_name_en,
            region,
            sort_order,
            is_active,
            show_in_home_menu,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
                [
                    countryCode,
                    countryName,
                    countryNameEn,
                    region,
                    sortOrder,
                    isActive,
                    showInHomeMenu
                ]
            );

            const country = await queryOne(
                "SELECT * FROM news_countries WHERE id = ?",
                [result.lastID]
            );

            return res.status(201).json({
                success: true,
                message: "国家新增成功。",
                country
            });
        } catch (error) {
            return sendDatabaseError(res, error, "新增国家失败。");
        }
    }
);

router.put(
    "/admin/countries/:id",
    verifyAdminToken,
    async (req, res) => {
        const id = normalizeInteger(req.params.id, 0);
        const countryCode = normalizeCode(req.body.country_code);
        const countryName = normalizeText(req.body.country_name);
        const countryNameEn = normalizeText(req.body.country_name_en);
        const region = normalizeText(req.body.region);
        const sortOrder = normalizeInteger(req.body.sort_order, 0);
        const isActive = normalizeBooleanInteger(req.body.is_active, 1);
        const showInHomeMenu = normalizeBooleanInteger(
            req.body.show_in_home_menu,
            1
        );

        if (id <= 0) {
            return res.status(400).json({
                success: false,
                message: "国家ID无效。"
            });
        }

        if (!isValidCountryCode(countryCode)) {
            return res.status(400).json({
                success: false,
                message: "国家代码必须是两位小写英文字母，例如 sg、us、cn。"
            });
        }

        if (!countryName) {
            return res.status(400).json({
                success: false,
                message: "请输入国家中文名称。"
            });
        }

        try {
            const oldCountry = await queryOne(
                "SELECT * FROM news_countries WHERE id = ?",
                [id]
            );

            if (!oldCountry) {
                return res.status(404).json({
                    success: false,
                    message: "国家不存在。"
                });
            }

            await runSql(
                `
          UPDATE news_countries
          SET
            country_code = ?,
            country_name = ?,
            country_name_en = ?,
            region = ?,
            sort_order = ?,
            is_active = ?,
            show_in_home_menu = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
                [
                    countryCode,
                    countryName,
                    countryNameEn,
                    region,
                    sortOrder,
                    isActive,
                    showInHomeMenu,
                    id
                ]
            );

            if (oldCountry.country_code !== countryCode) {
                await runSql(
                    `
            UPDATE news
            SET
              country_code = ?,
              country_name = ?,
              region = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE country_code = ?
          `,
                    [
                        countryCode,
                        countryName,
                        region,
                        oldCountry.country_code
                    ]
                );
            } else {
                await runSql(
                    `
            UPDATE news
            SET
              country_name = ?,
              region = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE country_code = ?
          `,
                    [countryName, region, countryCode]
                );
            }

            const country = await queryOne(
                "SELECT * FROM news_countries WHERE id = ?",
                [id]
            );

            return res.json({
                success: true,
                message: "国家更新成功。",
                country
            });
        } catch (error) {
            return sendDatabaseError(res, error, "更新国家失败。");
        }
    }
);

router.delete(
    "/admin/countries/:id",
    verifyAdminToken,
    async (req, res) => {
        const id = normalizeInteger(req.params.id, 0);

        if (id <= 0) {
            return res.status(400).json({
                success: false,
                message: "国家ID无效。"
            });
        }

        try {
            const country = await queryOne(
                "SELECT * FROM news_countries WHERE id = ?",
                [id]
            );

            if (!country) {
                return res.status(404).json({
                    success: false,
                    message: "国家不存在。"
                });
            }

            const usage = await queryOne(
                "SELECT COUNT(*) AS total FROM news WHERE country_code = ?",
                [country.country_code]
            );

            if (Number(usage?.total || 0) > 0) {
                return res.status(409).json({
                    success: false,
                    message: "该国家已被新闻使用，不能删除。请改为停用。"
                });
            }

            await runSql(
                "DELETE FROM news_countries WHERE id = ?",
                [id]
            );

            return res.json({
                success: true,
                message: "国家删除成功。"
            });
        } catch (error) {
            return sendDatabaseError(res, error, "删除国家失败。");
        }
    }
);

module.exports = router;
