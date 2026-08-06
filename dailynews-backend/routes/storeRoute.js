const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const db = require("../db");
const { verifyAdminToken } = require("../middleware/adminAuth");

const router = express.Router();

const storeUploadDirectory = path.join(
    __dirname,
    "..",
    "public",
    "uploads",
    "store"
);

if (!fs.existsSync(storeUploadDirectory)) {
    fs.mkdirSync(storeUploadDirectory, {
        recursive: true
    });
}

const allowedImageMimeTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/webp"
]);

const allowedImageExtensions = new Set([
    ".png",
    ".jpg",
    ".jpeg",
    ".webp"
]);

const storage = multer.diskStorage({
    destination(req, file, callback) {
        callback(null, storeUploadDirectory);
    },

    filename(req, file, callback) {
        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        const fileName =
            `store-${Date.now()}-${Math.random()
                .toString(36)
                .slice(2, 9)}${extension}`;

        callback(null, fileName);
    }
});

const uploadStoreImages = multer({
    storage,

    limits: {
        fileSize: 3 * 1024 * 1024,
        files: 10
    },

    fileFilter(req, file, callback) {
        const extension = path
            .extname(file.originalname)
            .toLowerCase();

        if (
            !allowedImageMimeTypes.has(file.mimetype) ||
            !allowedImageExtensions.has(extension)
        ) {
            return callback(
                new Error(
                    "只允许上传 PNG、JPG、JPEG 或 WebP 图片。"
                )
            );
        }

        callback(null, true);
    }
});

function all(sql, params = []) {
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

function get(sql, params = []) {
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

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                id: this.lastID,
                changes: this.changes
            });
        });
    });
}

function normalizeProductPayload(body = {}) {
    const productCode = String(
        body.product_code || ""
    )
        .trim()
        .toLowerCase();

    const productName = String(
        body.product_name || ""
    ).trim();

    const productType = String(
        body.product_type || "ebook"
    ).trim();

    const description = String(
        body.description || ""
    ).trim();

    const price = Number(body.price);

    const currency = String(
        body.currency || "SGD"
    )
        .trim()
        .toUpperCase();

    const coverUrl = String(
        body.cover_url || ""
    ).trim();

    const accessUrl = String(
        body.access_url || ""
    ).trim();

    const status = String(
        body.status || "draft"
    ).trim();

    const isFeatured =
        Number(body.is_featured) ? 1 : 0;

    const sortOrder =
        Number(body.sort_order) || 0;

    if (!productCode) {
        throw new Error("请输入商品代码。");
    }

    if (
        !/^[a-z0-9][a-z0-9-]*$/.test(
            productCode
        )
    ) {
        throw new Error(
            "商品代码只能使用小写字母、数字和短横线。"
        );
    }

    if (!productName) {
        throw new Error("请输入商品名称。");
    }

    if (
        !Number.isFinite(price) ||
        price < 0
    ) {
        throw new Error("商品价格格式不正确。");
    }

    const allowedTypes = new Set([
        "ebook",
        "report",
        "video",
        "membership"
    ]);

    if (!allowedTypes.has(productType)) {
        throw new Error("商品类型不正确。");
    }

    const allowedStatuses = new Set([
        "draft",
        "published",
        "unpublished"
    ]);

    if (!allowedStatuses.has(status)) {
        throw new Error("商品状态不正确。");
    }

    return {
        productCode,
        productName,
        productType,
        description,
        price,
        currency,
        coverUrl,
        accessUrl,
        status,
        isFeatured,
        sortOrder
    };
}

async function getProductImages(productId) {
    return all(
        `
      SELECT
        id,
        product_id,
        image_type,
        image_url,
        sort_order,
        created_at
      FROM store_product_images
      WHERE product_id = ?
      ORDER BY
        CASE image_type
          WHEN 'cover' THEN 1
          ELSE 2
        END,
        sort_order ASC,
        id ASC
    `,
        [productId]
    );
}

async function attachImagesToProducts(products) {
    if (!products.length) {
        return products;
    }

    const productIds = products.map(
        (product) => product.id
    );

    const placeholders = productIds
        .map(() => "?")
        .join(",");

    const images = await all(
        `
      SELECT
        id,
        product_id,
        image_type,
        image_url,
        sort_order
      FROM store_product_images
      WHERE product_id IN (${placeholders})
      ORDER BY
        product_id ASC,
        CASE image_type
          WHEN 'cover' THEN 1
          ELSE 2
        END,
        sort_order ASC,
        id ASC
    `,
        productIds
    );

    const imageMap = new Map();

    images.forEach((image) => {
        if (!imageMap.has(image.product_id)) {
            imageMap.set(image.product_id, []);
        }

        imageMap.get(image.product_id).push(image);
    });

    return products.map((product) => {
        const productImages =
            imageMap.get(product.id) || [];

        const coverImages = productImages.filter(
            (image) => image.image_type === "cover"
        );

        const detailImages = productImages.filter(
            (image) => image.image_type === "detail"
        );

        return {
            ...product,
            images: productImages,
            cover_images: coverImages,
            detail_images: detailImages,
            primary_cover_url:
                coverImages[0]?.image_url ||
                product.cover_url ||
                ""
        };
    });
}

function removeStoredImage(imageUrl) {
    if (
        !imageUrl ||
        !imageUrl.startsWith("/uploads/store/")
    ) {
        return;
    }

    const filePath = path.join(
        __dirname,
        "..",
        "public",
        imageUrl.replace(/^\/+/, "")
    );

    fs.unlink(filePath, () => { });
}

router.get("/", async (req, res) => {
    try {
        const type = String(
            req.query.type || "all"
        ).trim();

        const conditions = [
            "status = 'published'"
        ];

        const params = [];

        if (type !== "all") {
            conditions.push("product_type = ?");
            params.push(type);
        }

        const products = await all(
            `
        SELECT
          id,
          product_code,
          product_name,
          product_type,
          description,
          price,
          currency,
          cover_url,
          access_url,
          status,
          is_featured,
          sort_order
        FROM store_products
        WHERE ${conditions.join(" AND ")}
        ORDER BY
          is_featured DESC,
          sort_order ASC,
          id ASC
      `,
            params
        );

        const productsWithImages =
            await attachImagesToProducts(products);

        return res.json({
            success: true,
            products: productsWithImages
        });
    } catch (error) {
        console.error(
            "Get store products error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "读取商城商品失败。"
        });
    }
});

router.get("/:id", async (req, res, next) => {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return next();
    }

    try {
        const product = await get(
            `
        SELECT
          id,
          product_code,
          product_name,
          product_type,
          description,
          price,
          currency,
          cover_url,
          access_url,
          status,
          is_featured,
          sort_order
        FROM store_products
        WHERE id = ?
          AND status = 'published'
        LIMIT 1
      `,
            [id]
        );

        if (!product) {
            return res.status(404).json({
                success: false,
                message: "商品不存在或尚未上架。"
            });
        }

        const [productWithImages] =
            await attachImagesToProducts([product]);

        return res.json({
            success: true,
            product: productWithImages
        });
    } catch (error) {
        console.error(
            "Get store product detail error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "读取商品详情失败。"
        });
    }
});

router.get(
    "/admin/list",
    verifyAdminToken,
    async (req, res) => {
        try {
            const products = await all(`
        SELECT *
        FROM store_products
        ORDER BY sort_order ASC, id ASC
      `);

            const productsWithImages =
                await attachImagesToProducts(products);

            return res.json({
                success: true,
                products: productsWithImages
            });
        } catch (error) {
            console.error(
                "Get admin store products error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "读取后台商品列表失败。"
            });
        }
    }
);

router.post(
    "/admin",
    verifyAdminToken,
    async (req, res) => {
        try {
            const product =
                normalizeProductPayload(req.body);

            const result = await run(
                `
          INSERT INTO store_products (
            product_code,
            product_name,
            product_type,
            description,
            price,
            currency,
            cover_url,
            access_url,
            status,
            is_featured,
            sort_order
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
                [
                    product.productCode,
                    product.productName,
                    product.productType,
                    product.description,
                    product.price,
                    product.currency,
                    product.coverUrl,
                    product.accessUrl,
                    product.status,
                    product.isFeatured,
                    product.sortOrder
                ]
            );

            return res.status(201).json({
                success: true,
                message: "商品新增成功。",
                id: result.id
            });
        } catch (error) {
            console.error(
                "Create store product error:",
                error
            );

            return res.status(
                String(error.message).includes("UNIQUE")
                    ? 409
                    : 400
            ).json({
                success: false,
                message: String(error.message).includes(
                    "UNIQUE"
                )
                    ? "商品代码已经存在。"
                    : error.message
            });
        }
    }
);

router.put(
    "/admin/:id",
    verifyAdminToken,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "商品ID不正确。"
                });
            }

            const existing = await get(
                "SELECT id FROM store_products WHERE id = ?",
                [id]
            );

            if (!existing) {
                return res.status(404).json({
                    success: false,
                    message: "商品不存在。"
                });
            }

            const product =
                normalizeProductPayload(req.body);

            await run(
                `
          UPDATE store_products
          SET
            product_code = ?,
            product_name = ?,
            product_type = ?,
            description = ?,
            price = ?,
            currency = ?,
            cover_url = ?,
            access_url = ?,
            status = ?,
            is_featured = ?,
            sort_order = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
                [
                    product.productCode,
                    product.productName,
                    product.productType,
                    product.description,
                    product.price,
                    product.currency,
                    product.coverUrl,
                    product.accessUrl,
                    product.status,
                    product.isFeatured,
                    product.sortOrder,
                    id
                ]
            );

            return res.json({
                success: true,
                message: "商品更新成功。"
            });
        } catch (error) {
            console.error(
                "Update store product error:",
                error
            );

            return res.status(
                String(error.message).includes("UNIQUE")
                    ? 409
                    : 400
            ).json({
                success: false,
                message: String(error.message).includes(
                    "UNIQUE"
                )
                    ? "商品代码已经存在。"
                    : error.message
            });
        }
    }
);

router.post(
    "/admin/:id/images",
    verifyAdminToken,
    uploadStoreImages.array("images", 10),
    async (req, res) => {
        const productId = Number(req.params.id);
        const imageType = String(
            req.body.image_type || ""
        ).trim();

        try {
            if (
                !Number.isInteger(productId) ||
                productId <= 0
            ) {
                throw new Error("商品ID不正确。");
            }

            if (
                imageType !== "cover" &&
                imageType !== "detail"
            ) {
                throw new Error("图片类型不正确。");
            }

            const files = Array.isArray(req.files)
                ? req.files
                : [];

            if (!files.length) {
                throw new Error("请选择需要上传的图片。");
            }

            const product = await get(
                "SELECT id FROM store_products WHERE id = ?",
                [productId]
            );

            if (!product) {
                throw new Error("商品不存在。");
            }

            const currentCountRow = await get(
                `
          SELECT COUNT(*) AS count
          FROM store_product_images
          WHERE product_id = ?
            AND image_type = ?
        `,
                [productId, imageType]
            );

            const currentCount =
                Number(currentCountRow?.count) || 0;

            const maximum =
                imageType === "cover" ? 4 : 10;

            if (
                currentCount + files.length >
                maximum
            ) {
                files.forEach((file) => {
                    fs.unlink(file.path, () => { });
                });

                throw new Error(
                    imageType === "cover"
                        ? "商品封面图最多只能上传4张。"
                        : "商品详情图最多只能上传10张。"
                );
            }

            let nextSortOrder = currentCount;

            for (const file of files) {
                nextSortOrder += 1;

                await run(
                    `
            INSERT INTO store_product_images (
              product_id,
              image_type,
              image_url,
              sort_order
            )
            VALUES (?, ?, ?, ?)
          `,
                    [
                        productId,
                        imageType,
                        `/uploads/store/${file.filename}`,
                        nextSortOrder
                    ]
                );
            }

            const images =
                await getProductImages(productId);

            return res.json({
                success: true,
                message: "商品图片上传成功。",
                images
            });
        } catch (error) {
            console.error(
                "Upload store images error:",
                error
            );

            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
    }
);

router.put(
    "/admin/:productId/images/:imageId/order",
    verifyAdminToken,
    async (req, res) => {
        try {
            const productId = Number(
                req.params.productId
            );

            const imageId = Number(
                req.params.imageId
            );

            const direction = String(
                req.body.direction || ""
            ).trim();

            if (
                !["up", "down"].includes(direction)
            ) {
                return res.status(400).json({
                    success: false,
                    message: "排序方向不正确。"
                });
            }

            const image = await get(
                `
          SELECT *
          FROM store_product_images
          WHERE id = ?
            AND product_id = ?
        `,
                [imageId, productId]
            );

            if (!image) {
                return res.status(404).json({
                    success: false,
                    message: "商品图片不存在。"
                });
            }

            const comparison =
                direction === "up" ? "<" : ">";

            const ordering =
                direction === "up" ? "DESC" : "ASC";

            const neighbour = await get(
                `
          SELECT *
          FROM store_product_images
          WHERE product_id = ?
            AND image_type = ?
            AND sort_order ${comparison} ?
          ORDER BY sort_order ${ordering}, id ${ordering}
          LIMIT 1
        `,
                [
                    productId,
                    image.image_type,
                    image.sort_order
                ]
            );

            if (!neighbour) {
                return res.json({
                    success: true,
                    message: "图片已经位于当前方向的边界。"
                });
            }

            await run(
                `
          UPDATE store_product_images
          SET sort_order = ?
          WHERE id = ?
        `,
                [neighbour.sort_order, image.id]
            );

            await run(
                `
          UPDATE store_product_images
          SET sort_order = ?
          WHERE id = ?
        `,
                [image.sort_order, neighbour.id]
            );

            return res.json({
                success: true,
                message: "图片顺序已更新。"
            });
        } catch (error) {
            console.error(
                "Reorder store image error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "调整图片顺序失败。"
            });
        }
    }
);

router.delete(
    "/admin/:productId/images/:imageId",
    verifyAdminToken,
    async (req, res) => {
        try {
            const productId = Number(
                req.params.productId
            );

            const imageId = Number(
                req.params.imageId
            );

            const image = await get(
                `
          SELECT *
          FROM store_product_images
          WHERE id = ?
            AND product_id = ?
        `,
                [imageId, productId]
            );

            if (!image) {
                return res.status(404).json({
                    success: false,
                    message: "商品图片不存在。"
                });
            }

            await run(
                `
          DELETE FROM store_product_images
          WHERE id = ?
            AND product_id = ?
        `,
                [imageId, productId]
            );

            removeStoredImage(image.image_url);

            return res.json({
                success: true,
                message: "商品图片已删除。"
            });
        } catch (error) {
            console.error(
                "Delete store image error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "删除商品图片失败。"
            });
        }
    }
);

router.delete(
    "/admin/:id",
    verifyAdminToken,
    async (req, res) => {
        try {
            const id = Number(req.params.id);

            if (
                !Number.isInteger(id) ||
                id <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message: "商品ID不正确。"
                });
            }

            const images =
                await getProductImages(id);

            const result = await run(
                "DELETE FROM store_products WHERE id = ?",
                [id]
            );

            if (!result.changes) {
                return res.status(404).json({
                    success: false,
                    message: "商品不存在。"
                });
            }

            images.forEach((image) => {
                removeStoredImage(image.image_url);
            });

            return res.json({
                success: true,
                message: "商品删除成功。"
            });
        } catch (error) {
            console.error(
                "Delete store product error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "删除商品失败。"
            });
        }
    }
);

module.exports = router;