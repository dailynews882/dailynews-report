const express = require("express");
const db = require("../db");
const {
    verifyAdminToken
} = require("../middleware/adminAuth");

const router = express.Router();

function queryAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(
            sql,
            params,
            (error, rows) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(rows || []);
            }
        );
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
            console.error(
                "Get news categories error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "读取新闻分类失败。"
            });
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
            console.error(
                "Get news countries error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "读取新闻国家失败。"
            });
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
            console.error(
                "Get admin news categories error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "读取全部新闻分类失败。"
            });
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
            console.error(
                "Get admin news countries error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "读取全部新闻国家失败。"
            });
        }
    }
);

module.exports = router;