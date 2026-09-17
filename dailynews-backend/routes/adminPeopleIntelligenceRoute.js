const express = require("express");
const db = require("../db");

const {
    verifyAdminToken
} = require("../middleware/adminAuth");

const router = express.Router();


/* =========================================================
   Helpers
========================================================= */

function normalizeText(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}


function buildPersonSlug(nameEn) {
    const base = normalizeText(nameEn)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const safeBase =
        base || "person";

    return `${safeBase}-${Date.now()}`;
}


function getPersonById(id, callback) {
    db.get(
        `
      SELECT *
      FROM pi_people
      WHERE id = ?
    `,
        [id],
        callback
    );
}


function buildOrganizationSlug(nameEn) {
    const base = normalizeText(nameEn)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const safeBase =
        base || "organization";

    return `${safeBase}-${Date.now()}`;
}


function getOrganizationById(id, callback) {
    db.get(
        `
      SELECT *
      FROM pi_organizations
      WHERE id = ?
    `,
        [id],
        callback
    );
}


/* =========================================================
   GET /people
   人物列表
========================================================= */

router.get(
    "/people",
    verifyAdminToken,
    (req, res) => {
        const search =
            normalizeText(req.query.search);

        const status =
            normalizeText(req.query.status);

        const params = [];

        let sql = `
        SELECT
          id,
          slug,
          name_zh,
          name_en,
          aliases,
          birth_date,
          death_date,
          nationality,
          country_region,
          primary_role,
          biography,
          tags,
          profile_image_url,
          verification_status,
          confidence_level,
          is_public,
          record_status,
          created_at,
          updated_at
        FROM pi_people
        WHERE record_status = 'active'
      `;

        if (search) {
            sql += `
        AND (
          name_zh LIKE ?
          OR name_en LIKE ?
          OR aliases LIKE ?
          OR primary_role LIKE ?
          OR country_region LIKE ?
        )
      `;

            const keyword =
                `%${search}%`;

            params.push(
                keyword,
                keyword,
                keyword,
                keyword,
                keyword
            );
        }

        if (
            status &&
            status !== "all"
        ) {
            sql += `
        AND verification_status = ?
      `;

            params.push(status);
        }

        sql += `
      ORDER BY
        updated_at DESC,
        id DESC
    `;

        db.all(
            sql,
            params,
            (err, rows) => {
                if (err) {
                    console.error(
                        "People Intelligence list error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取人物列表失败"
                    });
                }

                return res.json({
                    success: true,
                    count: rows.length,
                    people: rows
                });
            }
        );
    }
);


/* =========================================================
   GET /people/:id
   单个人物
========================================================= */

router.get(
    "/people/:id",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的人物 ID"
            });
        }

        getPersonById(
            id,
            (err, person) => {
                if (err) {
                    console.error(
                        "People Intelligence detail error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取人物资料失败"
                    });
                }

                if (!person) {
                    return res.status(404).json({
                        success: false,
                        message: "人物不存在"
                    });
                }

                return res.json({
                    success: true,
                    person
                });
            }
        );
    }
);


/* =========================================================
   POST /people
   新增人物
========================================================= */

router.post(
    "/people",
    verifyAdminToken,
    (req, res) => {
        const nameZh =
            normalizeText(req.body.name_zh);

        const nameEn =
            normalizeText(req.body.name_en);

        if (!nameEn) {
            return res.status(400).json({
                success: false,
                message: "英文姓名不能为空"
            });
        }

        const slug =
            normalizeText(req.body.slug) ||
            buildPersonSlug(nameEn);

        const sql = `
      INSERT INTO pi_people (
        slug,
        name_zh,
        name_en,
        aliases,
        birth_date,
        death_date,
        nationality,
        country_region,
        primary_role,
        biography,
        tags,
        profile_image_url,
        verification_status,
        confidence_level,
        is_public,
        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `;

        const params = [
            slug,
            nameZh || null,
            nameEn,
            normalizeText(
                req.body.aliases
            ) || null,
            normalizeText(
                req.body.birth_date
            ) || null,
            normalizeText(
                req.body.death_date
            ) || null,
            normalizeText(
                req.body.nationality
            ) || null,
            normalizeText(
                req.body.country_region
            ) || null,
            normalizeText(
                req.body.primary_role
            ) || null,
            normalizeText(
                req.body.biography
            ) || null,
            normalizeText(
                req.body.tags
            ) || null,
            normalizeText(
                req.body.profile_image_url
            ) || null,
            normalizeText(
                req.body.verification_status
            ) || "draft",
            normalizeText(
                req.body.confidence_level
            ) || "medium",
            req.body.is_public === 1 ||
                req.body.is_public === true
                ? 1
                : 0
        ];

        db.run(
            sql,
            params,
            function (err) {
                if (err) {
                    console.error(
                        "People Intelligence create error:",
                        err
                    );

                    if (
                        String(err.message)
                            .includes("UNIQUE")
                    ) {
                        return res.status(409).json({
                            success: false,
                            message: "人物 slug 已存在"
                        });
                    }

                    return res.status(500).json({
                        success: false,
                        message: "新增人物失败"
                    });
                }

                const newId =
                    this.lastID;

                getPersonById(
                    newId,
                    (readErr, person) => {
                        if (readErr) {
                            return res.status(201).json({
                                success: true,
                                id: newId,
                                message: "人物已创建"
                            });
                        }

                        return res.status(201).json({
                            success: true,
                            message: "人物已创建",
                            person
                        });
                    }
                );
            }
        );
    }
);


/* =========================================================
   PUT /people/:id
   修改人物资料
========================================================= */

router.put(
    "/people/:id",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的人物 ID"
            });
        }

        const nameZh =
            normalizeText(req.body.name_zh);

        const nameEn =
            normalizeText(req.body.name_en);

        if (!nameEn) {
            return res.status(400).json({
                success: false,
                message: "英文姓名不能为空"
            });
        }

        const sql = `
      UPDATE pi_people
      SET
        name_zh = ?,
        name_en = ?,
        aliases = ?,
        birth_date = ?,
        death_date = ?,
        nationality = ?,
        country_region = ?,
        primary_role = ?,
        biography = ?,
        tags = ?,
        profile_image_url = ?,
        verification_status = ?,
        confidence_level = ?,
        is_public = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;

        const params = [
            nameZh || null,
            nameEn,
            normalizeText(
                req.body.aliases
            ) || null,
            normalizeText(
                req.body.birth_date
            ) || null,
            normalizeText(
                req.body.death_date
            ) || null,
            normalizeText(
                req.body.nationality
            ) || null,
            normalizeText(
                req.body.country_region
            ) || null,
            normalizeText(
                req.body.primary_role
            ) || null,
            normalizeText(
                req.body.biography
            ) || null,
            normalizeText(
                req.body.tags
            ) || null,
            normalizeText(
                req.body.profile_image_url
            ) || null,
            normalizeText(
                req.body.verification_status
            ) || "draft",
            normalizeText(
                req.body.confidence_level
            ) || "medium",
            req.body.is_public === 1 ||
                req.body.is_public === true
                ? 1
                : 0,
            id
        ];

        db.run(
            sql,
            params,
            function (err) {
                if (err) {
                    console.error(
                        "People Intelligence update error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "修改人物资料失败"
                    });
                }

                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "人物不存在"
                    });
                }

                getPersonById(
                    id,
                    (readErr, person) => {
                        if (readErr) {
                            return res.json({
                                success: true,
                                message: "人物资料已更新"
                            });
                        }

                        return res.json({
                            success: true,
                            message: "人物资料已更新",
                            person
                        });
                    }
                );
            }
        );
    }
);


/* =========================================================
   PATCH /people/:id/status
   修改人物审核状态
========================================================= */

router.patch(
    "/people/:id/status",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的人物 ID"
            });
        }

        const allowedStatuses = [
            "draft",
            "pending",
            "verified",
            "disputed",
            "hidden"
        ];

        const status =
            normalizeText(
                req.body.verification_status
            );

        if (
            !allowedStatuses.includes(
                status
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的人物状态"
            });
        }

        db.run(
            `
        UPDATE pi_people
        SET
          verification_status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
            [
                status,
                id
            ],
            function (err) {
                if (err) {
                    console.error(
                        "People Intelligence status update error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "更新人物状态失败"
                    });
                }

                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "人物不存在"
                    });
                }

                getPersonById(
                    id,
                    (readErr, person) => {
                        if (readErr) {
                            return res.json({
                                success: true,
                                message: "人物状态已更新"
                            });
                        }

                        return res.json({
                            success: true,
                            message: "人物状态已更新",
                            person
                        });
                    }
                );
            }
        );
    }
);

/* =========================================================
   PATCH /people/:id/publication
   发布 / 取消发布人物
========================================================= */

router.patch(
    "/people/:id/publication",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的人物 ID"
            });
        }

        const isPublic =
            req.body.is_public === 1 ||
            req.body.is_public === true;

        getPersonById(
            id,
            (readErr, person) => {
                if (readErr) {
                    console.error(
                        "People Intelligence publication read error:",
                        readErr
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取人物资料失败"
                    });
                }

                if (!person) {
                    return res.status(404).json({
                        success: false,
                        message: "人物不存在"
                    });
                }

                /*
                 * 发布时必须：
                 * 1. 已审核通过
                 * 2. 记录状态正常
                 */
                if (isPublic) {
                    if (
                        person.verification_status !==
                        "verified"
                    ) {
                        return res.status(409).json({
                            success: false,
                            message:
                                "人物资料尚未审核通过，不能发布"
                        });
                    }

                    if (
                        person.record_status !==
                        "active"
                    ) {
                        return res.status(409).json({
                            success: false,
                            message:
                                "非正常状态的人物资料不能发布"
                        });
                    }
                }

                db.run(
                    `
            UPDATE pi_people
            SET
              is_public = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `,
                    [
                        isPublic ? 1 : 0,
                        id
                    ],
                    function (err) {
                        if (err) {
                            console.error(
                                "People Intelligence publication update error:",
                                err
                            );

                            return res.status(500).json({
                                success: false,
                                message: "更新发布状态失败"
                            });
                        }

                        getPersonById(
                            id,
                            (finalErr, updatedPerson) => {
                                if (finalErr) {
                                    return res.json({
                                        success: true,
                                        message:
                                            isPublic
                                                ? "人物已发布"
                                                : "人物已取消发布"
                                    });
                                }

                                return res.json({
                                    success: true,
                                    message:
                                        isPublic
                                            ? "人物已发布"
                                            : "人物已取消发布",
                                    person: updatedPerson
                                });
                            }
                        );
                    }
                );
            }
        );
    }
);


/* =========================================================
   PATCH /people/:id/record-status
   人物记录生命周期
   active   = 正常
   trashed  = 垃圾箱
   archived = 归档
========================================================= */

router.patch(
    "/people/:id/record-status",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的人物 ID"
            });
        }

        const allowedStatuses = [
            "active",
            "trashed",
            "archived"
        ];

        const recordStatus =
            normalizeText(
                req.body.record_status
            );

        if (
            !allowedStatuses.includes(
                recordStatus
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的记录状态"
            });
        }

        /*
         * trashed / archived 时自动取消公开，
         * 避免前台继续显示无效数据。
         */
        const shouldHidePublic =
            recordStatus !== "active";

        const sql =
            shouldHidePublic
                ? `
            UPDATE pi_people
            SET
              record_status = ?,
              is_public = 0,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `
                : `
            UPDATE pi_people
            SET
              record_status = ?,
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `;

        db.run(
            sql,
            [
                recordStatus,
                id
            ],
            function (err) {
                if (err) {
                    console.error(
                        "People Intelligence record status update error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "更新人物记录状态失败"
                    });
                }

                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "人物不存在"
                    });
                }

                getPersonById(
                    id,
                    (readErr, person) => {
                        if (readErr) {
                            return res.json({
                                success: true,
                                message:
                                    recordStatus === "trashed"
                                        ? "人物已移入垃圾箱"
                                        : recordStatus === "archived"
                                            ? "人物已归档"
                                            : "人物已恢复"
                            });
                        }

                        return res.json({
                            success: true,
                            message:
                                recordStatus === "trashed"
                                    ? "人物已移入垃圾箱"
                                    : recordStatus === "archived"
                                        ? "人物已归档"
                                        : "人物已恢复",
                            person
                        });
                    }
                );
            }
        );
    }
);



/* =========================================================
   Organization Management V1
   机构 / 企业 / 基金 / 信托 / Family Office
========================================================= */

const PI_ORGANIZATION_TYPES = [
    "company",
    "listed_company",
    "fund",
    "trust",
    "family_office",
    "government",
    "nonprofit",
    "other"
];

const PI_ORGANIZATION_VERIFICATION_STATUSES = [
    "draft",
    "pending",
    "verified",
    "disputed",
    "hidden"
];

const PI_ORGANIZATION_RECORD_STATUSES = [
    "active",
    "trashed",
    "archived"
];


/* =========================================================
   GET /organizations
   机构列表
========================================================= */

router.get(
    "/organizations",
    verifyAdminToken,
    (req, res) => {
        const search =
            normalizeText(req.query.search);

        const status =
            normalizeText(req.query.status);

        const type =
            normalizeText(req.query.type);

        const params = [];

        let sql = `
          SELECT
            id,
            slug,
            name_zh,
            name_en,
            aliases,
            organization_type,
            country_region,
            headquarters,
            founded_date,
            industry,
            industry_primary,
            industry_secondary,
            description,
            website_url,
            logo_url,
            listed_status,
            ticker_symbol,
            exchange_name,
            isin,
            lei,
            verification_status,
            confidence_level,
            record_status,
            is_public,
            data_updated_at,
            created_at,
            updated_at
          FROM pi_organizations
          WHERE record_status = 'active'
        `;

        if (search) {
            sql += `
              AND (
                name_zh LIKE ?
                OR name_en LIKE ?
                OR aliases LIKE ?
                OR country_region LIKE ?
                OR headquarters LIKE ?
                OR industry LIKE ?
                OR industry_primary LIKE ?
                OR industry_secondary LIKE ?
                OR ticker_symbol LIKE ?
                OR exchange_name LIKE ?
                OR isin LIKE ?
                OR lei LIKE ?
              )
            `;

            const keyword =
                `%${search}%`;

            params.push(
                keyword,
                keyword,
                keyword,
                keyword,
                keyword,
                keyword,
                keyword,
                keyword,
                keyword,
                keyword,
                keyword,
                keyword
            );
        }

        if (
            status &&
            status !== "all"
        ) {
            sql += `
              AND verification_status = ?
            `;

            params.push(status);
        }

        if (
            type &&
            type !== "all"
        ) {
            sql += `
              AND organization_type = ?
            `;

            params.push(type);
        }

        sql += `
          ORDER BY
            updated_at DESC,
            id DESC
        `;

        db.all(
            sql,
            params,
            (err, rows) => {
                if (err) {
                    console.error(
                        "People Intelligence organizations list error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取机构列表失败"
                    });
                }

                return res.json({
                    success: true,
                    count: rows.length,
                    organizations: rows
                });
            }
        );
    }
);


/* =========================================================
   GET /organizations/:id
   单个机构
========================================================= */

router.get(
    "/organizations/:id",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的机构 ID"
            });
        }

        getOrganizationById(
            id,
            (err, organization) => {
                if (err) {
                    console.error(
                        "People Intelligence organization detail error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取机构资料失败"
                    });
                }

                if (!organization) {
                    return res.status(404).json({
                        success: false,
                        message: "机构不存在"
                    });
                }

                return res.json({
                    success: true,
                    organization
                });
            }
        );
    }
);


/* =========================================================
   POST /organizations
   新增机构
========================================================= */

router.post(
    "/organizations",
    verifyAdminToken,
    (req, res) => {
        const nameZh =
            normalizeText(req.body.name_zh);

        const nameEn =
            normalizeText(req.body.name_en);

        if (!nameEn) {
            return res.status(400).json({
                success: false,
                message: "机构英文名称不能为空"
            });
        }

        const organizationType =
            normalizeText(
                req.body.organization_type
            ) || "company";

        if (
            !PI_ORGANIZATION_TYPES.includes(
                organizationType
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的机构类型"
            });
        }

        const verificationStatus =
            normalizeText(
                req.body.verification_status
            ) || "draft";

        if (
            !PI_ORGANIZATION_VERIFICATION_STATUSES.includes(
                verificationStatus
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的机构审核状态"
            });
        }

        const slug =
            normalizeText(req.body.slug) ||
            buildOrganizationSlug(nameEn);

        const sql = `
          INSERT INTO pi_organizations (
            slug,
            name_zh,
            name_en,
            aliases,
            organization_type,
            country_region,
            headquarters,
            founded_date,
            industry,
            industry_primary,
            industry_secondary,
            description,
            website_url,
            logo_url,
            listed_status,
            ticker_symbol,
            exchange_name,
            isin,
            lei,
            verification_status,
            confidence_level,
            record_status,
            is_public,
            data_updated_at,
            created_at,
            updated_at
          )
          VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            'active',
            0,
            ?,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `;

        const params = [
            slug,
            nameZh || null,
            nameEn,
            normalizeText(
                req.body.aliases
            ) || null,
            organizationType,
            normalizeText(
                req.body.country_region
            ) || null,
            normalizeText(
                req.body.headquarters
            ) || null,
            normalizeText(
                req.body.founded_date
            ) || null,
            normalizeText(
                req.body.industry
            ) || null,
            normalizeText(
                req.body.industry_primary
            ) || null,
            normalizeText(
                req.body.industry_secondary
            ) || null,
            normalizeText(
                req.body.description
            ) || null,
            normalizeText(
                req.body.website_url
            ) || null,
            normalizeText(
                req.body.logo_url
            ) || null,
            normalizeText(
                req.body.listed_status
            ) || null,
            normalizeText(
                req.body.ticker_symbol
            ) || null,
            normalizeText(
                req.body.exchange_name
            ) || null,
            normalizeText(
                req.body.isin
            ) || null,
            normalizeText(
                req.body.lei
            ) || null,
            verificationStatus,
            normalizeText(
                req.body.confidence_level
            ) || "medium",
            normalizeText(
                req.body.data_updated_at
            ) || null
        ];

        db.run(
            sql,
            params,
            function (err) {
                if (err) {
                    console.error(
                        "People Intelligence organization create error:",
                        err
                    );

                    if (
                        String(err.message)
                            .includes("UNIQUE")
                    ) {
                        return res.status(409).json({
                            success: false,
                            message: "机构 slug 已存在"
                        });
                    }

                    return res.status(500).json({
                        success: false,
                        message: "新增机构失败"
                    });
                }

                const newId =
                    this.lastID;

                getOrganizationById(
                    newId,
                    (readErr, organization) => {
                        if (readErr) {
                            return res.status(201).json({
                                success: true,
                                id: newId,
                                message: "机构已创建"
                            });
                        }

                        return res.status(201).json({
                            success: true,
                            message: "机构已创建",
                            organization
                        });
                    }
                );
            }
        );
    }
);


/* =========================================================
   PUT /organizations/:id
   修改机构资料
========================================================= */

router.put(
    "/organizations/:id",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的机构 ID"
            });
        }

        getOrganizationById(
            id,
            (readErr, existing) => {
                if (readErr) {
                    return res.status(500).json({
                        success: false,
                        message: "读取原机构资料失败"
                    });
                }

                if (!existing) {
                    return res.status(404).json({
                        success: false,
                        message: "机构不存在"
                    });
                }

                const mergedPayload = {
                    ...existing,
                    ...req.body
                };

                const nameEn =
                    normalizeText(
                        mergedPayload.name_en
                    );

                if (!nameEn) {
                    return res.status(400).json({
                        success: false,
                        message: "机构英文名称不能为空"
                    });
                }

                const organizationType =
                    normalizeText(
                        mergedPayload.organization_type
                    ) || "company";

                if (
                    !PI_ORGANIZATION_TYPES.includes(
                        organizationType
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "无效的机构类型"
                    });
                }

                const verificationStatus =
                    normalizeText(
                        mergedPayload.verification_status
                    ) || "draft";

                if (
                    !PI_ORGANIZATION_VERIFICATION_STATUSES.includes(
                        verificationStatus
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "无效的机构审核状态"
                    });
                }

                const sql = `
                  UPDATE pi_organizations
                  SET
                    name_zh = ?,
                    name_en = ?,
                    aliases = ?,
                    organization_type = ?,
                    country_region = ?,
                    headquarters = ?,
                    founded_date = ?,
                    industry = ?,
                    industry_primary = ?,
                    industry_secondary = ?,
                    description = ?,
                    website_url = ?,
                    logo_url = ?,
                    listed_status = ?,
                    ticker_symbol = ?,
                    exchange_name = ?,
                    isin = ?,
                    lei = ?,
                    verification_status = ?,
                    confidence_level = ?,
                    is_public = ?,
                    data_updated_at = ?,
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `;

                const params = [
                    normalizeText(
                        mergedPayload.name_zh
                    ) || null,
                    nameEn,
                    normalizeText(
                        mergedPayload.aliases
                    ) || null,
                    organizationType,
                    normalizeText(
                        mergedPayload.country_region
                    ) || null,
                    normalizeText(
                        mergedPayload.headquarters
                    ) || null,
                    normalizeText(
                        mergedPayload.founded_date
                    ) || null,
                    normalizeText(
                        mergedPayload.industry
                    ) || null,
                    normalizeText(
                        mergedPayload.industry_primary
                    ) || null,
                    normalizeText(
                        mergedPayload.industry_secondary
                    ) || null,
                    normalizeText(
                        mergedPayload.description
                    ) || null,
                    normalizeText(
                        mergedPayload.website_url
                    ) || null,
                    normalizeText(
                        mergedPayload.logo_url
                    ) || null,
                    normalizeText(
                        mergedPayload.listed_status
                    ) || null,
                    normalizeText(
                        mergedPayload.ticker_symbol
                    ) || null,
                    normalizeText(
                        mergedPayload.exchange_name
                    ) || null,
                    normalizeText(
                        mergedPayload.isin
                    ) || null,
                    normalizeText(
                        mergedPayload.lei
                    ) || null,
                    verificationStatus,
                    normalizeText(
                        mergedPayload.confidence_level
                    ) || "medium",
                    normalizeBooleanInteger(
                        mergedPayload.is_public
                    ),
                    normalizeText(
                        mergedPayload.data_updated_at
                    ) || null,
                    id
                ];

                db.run(
                    sql,
                    params,
                    function (err) {
                        if (err) {
                            console.error(
                                "People Intelligence organization update error:",
                                err
                            );

                            return res.status(500).json({
                                success: false,
                                message: "修改机构资料失败"
                            });
                        }

                        getOrganizationById(
                            id,
                            (finalErr, organization) => {
                                if (finalErr) {
                                    return res.json({
                                        success: true,
                                        message: "机构资料已更新"
                                    });
                                }

                                return res.json({
                                    success: true,
                                    message: "机构资料已更新",
                                    organization
                                });
                            }
                        );
                    }
                );
            }
        );
    }
);


/* =========================================================
   PATCH /organizations/:id/status
   修改机构审核状态
========================================================= */

router.patch(
    "/organizations/:id/status",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的机构 ID"
            });
        }

        const verificationStatus =
            normalizeText(
                req.body.verification_status
            );

        if (
            !PI_ORGANIZATION_VERIFICATION_STATUSES.includes(
                verificationStatus
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的机构审核状态"
            });
        }

        db.run(
            `
              UPDATE pi_organizations
              SET
                verification_status = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
            [verificationStatus, id],
            function (err) {
                if (err) {
                    console.error(
                        "People Intelligence organization status error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "更新机构审核状态失败"
                    });
                }

                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "机构不存在"
                    });
                }

                getOrganizationById(
                    id,
                    (readErr, organization) => {
                        return res.json({
                            success: true,
                            message: "机构审核状态已更新",
                            organization:
                                readErr
                                    ? undefined
                                    : organization
                        });
                    }
                );
            }
        );
    }
);


/* =========================================================
   PATCH /organizations/:id/publication
   发布 / 取消发布机构
========================================================= */

router.patch(
    "/organizations/:id/publication",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的机构 ID"
            });
        }

        const isPublic =
            req.body.is_public === 1 ||
            req.body.is_public === true;

        getOrganizationById(
            id,
            (readErr, organization) => {
                if (readErr) {
                    return res.status(500).json({
                        success: false,
                        message: "读取机构资料失败"
                    });
                }

                if (!organization) {
                    return res.status(404).json({
                        success: false,
                        message: "机构不存在"
                    });
                }

                if (isPublic) {
                    if (
                        organization.verification_status !==
                        "verified"
                    ) {
                        return res.status(409).json({
                            success: false,
                            message:
                                "机构资料尚未审核通过，不能发布"
                        });
                    }

                    if (
                        organization.record_status !==
                        "active"
                    ) {
                        return res.status(409).json({
                            success: false,
                            message:
                                "非正常状态的机构资料不能发布"
                        });
                    }
                }

                db.run(
                    `
                      UPDATE pi_organizations
                      SET
                        is_public = ?,
                        updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?
                    `,
                    [
                        isPublic ? 1 : 0,
                        id
                    ],
                    function (err) {
                        if (err) {
                            console.error(
                                "People Intelligence organization publication error:",
                                err
                            );

                            return res.status(500).json({
                                success: false,
                                message: "更新机构发布状态失败"
                            });
                        }

                        getOrganizationById(
                            id,
                            (finalErr, updatedOrganization) => {
                                return res.json({
                                    success: true,
                                    message:
                                        isPublic
                                            ? "机构已发布"
                                            : "机构已取消发布",
                                    organization:
                                        finalErr
                                            ? undefined
                                            : updatedOrganization
                                });
                            }
                        );
                    }
                );
            }
        );
    }
);


/* =========================================================
   PATCH /organizations/:id/record-status
   机构记录生命周期
========================================================= */

router.patch(
    "/organizations/:id/record-status",
    verifyAdminToken,
    (req, res) => {
        const id =
            Number(req.params.id);

        if (!Number.isInteger(id)) {
            return res.status(400).json({
                success: false,
                message: "无效的机构 ID"
            });
        }

        const recordStatus =
            normalizeText(
                req.body.record_status
            );

        if (
            !PI_ORGANIZATION_RECORD_STATUSES.includes(
                recordStatus
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的机构记录状态"
            });
        }

        const shouldHidePublic =
            recordStatus !== "active";

        const sql =
            shouldHidePublic
                ? `
                    UPDATE pi_organizations
                    SET
                      record_status = ?,
                      is_public = 0,
                      updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `
                : `
                    UPDATE pi_organizations
                    SET
                      record_status = ?,
                      updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                  `;

        db.run(
            sql,
            [
                recordStatus,
                id
            ],
            function (err) {
                if (err) {
                    console.error(
                        "People Intelligence organization record status error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "更新机构记录状态失败"
                    });
                }

                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "机构不存在"
                    });
                }

                getOrganizationById(
                    id,
                    (readErr, organization) => {
                        return res.json({
                            success: true,
                            message:
                                recordStatus === "trashed"
                                    ? "机构已移入垃圾箱"
                                    : recordStatus === "archived"
                                        ? "机构已归档"
                                        : "机构已恢复",
                            organization:
                                readErr
                                    ? undefined
                                    : organization
                        });
                    }
                );
            }
        );
    }
);


/* =========================================================
   People Intelligence Relationship Model V1
   通用关系模型 API
========================================================= */

const PI_ENTITY_TYPES = [
    "person",
    "organization"
];

const PI_RELATIONSHIP_VERIFICATION_STATUSES = [
    "draft",
    "pending",
    "verified",
    "disputed",
    "hidden"
];

const PI_RELATIONSHIP_STATUSES = [
    "current",
    "ended",
    "historical"
];


function normalizeInteger(value) {
    const number = Number(value);

    return Number.isInteger(number) && number > 0
        ? number
        : null;
}


function normalizeOptionalNumber(value) {
    if (
        value === undefined ||
        value === null ||
        value === ""
    ) {
        return null;
    }

    const number = Number(value);

    return Number.isFinite(number)
        ? number
        : null;
}


function normalizeBooleanInteger(value) {
    return (
        value === true ||
        value === 1 ||
        value === "1" ||
        value === "true"
    )
        ? 1
        : 0;
}


function getRelationshipTypeByCode(
    code,
    callback
) {
    db.get(
        `
          SELECT *
          FROM pi_relationship_types
          WHERE code = ?
            AND is_active = 1
        `,
        [code],
        callback
    );
}


function getEntityByType(
    entityType,
    entityId,
    callback
) {
    if (entityType === "person") {
        return db.get(
            `
              SELECT
                id,
                name_zh,
                name_en,
                record_status
              FROM pi_people
              WHERE id = ?
            `,
            [entityId],
            callback
        );
    }

    if (entityType === "organization") {
        return db.get(
            `
              SELECT
                id,
                name_zh,
                name_en,
                organization_type
              FROM pi_organizations
              WHERE id = ?
            `,
            [entityId],
            callback
        );
    }

    return callback(
        null,
        null
    );
}


function getRelationshipById(
    id,
    callback
) {
    db.get(
        `
          SELECT
            r.*,
            rt.name_zh AS relationship_name_zh,
            rt.name_en AS relationship_name_en,
            rt.category AS relationship_category,
            rt.directional AS relationship_directional,
            rt.inverse_code AS relationship_inverse_code,

            (
              SELECT COUNT(*)
              FROM pi_evidence e
              WHERE e.entity_type = 'relationship'
                AND e.entity_id = r.id
            ) AS evidence_count,

            (
              SELECT COUNT(*)
              FROM pi_evidence e
              WHERE e.entity_type = 'relationship'
                AND e.entity_id = r.id
                AND e.verification_status = 'verified'
            ) AS verified_evidence_count,

            CASE
              WHEN r.source_entity_type = 'person'
              THEN (
                SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                FROM pi_people
                WHERE id = r.source_entity_id
              )
              WHEN r.source_entity_type = 'organization'
              THEN (
                SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                FROM pi_organizations
                WHERE id = r.source_entity_id
              )
              ELSE NULL
            END AS source_entity_name,

            CASE
              WHEN r.target_entity_type = 'person'
              THEN (
                SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                FROM pi_people
                WHERE id = r.target_entity_id
              )
              WHEN r.target_entity_type = 'organization'
              THEN (
                SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                FROM pi_organizations
                WHERE id = r.target_entity_id
              )
              ELSE NULL
            END AS target_entity_name

          FROM pi_relationships r
          LEFT JOIN pi_relationship_types rt
            ON rt.code = r.relationship_type
          WHERE r.id = ?
        `,
        [id],
        callback
    );
}


function validateRelationshipEntities(
    payload,
    callback
) {
    const sourceEntityType =
        normalizeText(
            payload.source_entity_type
        );

    const targetEntityType =
        normalizeText(
            payload.target_entity_type
        );

    const sourceEntityId =
        normalizeInteger(
            payload.source_entity_id
        );

    const targetEntityId =
        normalizeInteger(
            payload.target_entity_id
        );

    const relationshipType =
        normalizeText(
            payload.relationship_type
        );

    if (
        !PI_ENTITY_TYPES.includes(
            sourceEntityType
        ) ||
        !PI_ENTITY_TYPES.includes(
            targetEntityType
        )
    ) {
        return callback({
            status: 400,
            message:
                "V1 关系模型仅支持 person 和 organization 实体"
        });
    }

    if (
        !sourceEntityId ||
        !targetEntityId
    ) {
        return callback({
            status: 400,
            message: "来源实体或目标实体 ID 无效"
        });
    }

    if (!relationshipType) {
        return callback({
            status: 400,
            message: "关系类型不能为空"
        });
    }

    if (
        sourceEntityType === targetEntityType &&
        sourceEntityId === targetEntityId
    ) {
        return callback({
            status: 400,
            message: "实体不能与自身建立该关系"
        });
    }

    getRelationshipTypeByCode(
        relationshipType,
        (typeErr, typeRow) => {
            if (typeErr) {
                return callback({
                    status: 500,
                    message: "读取关系类型失败"
                });
            }

            if (!typeRow) {
                return callback({
                    status: 400,
                    message: "关系类型不存在或已停用"
                });
            }

            if (
                typeRow.source_entity_type !==
                sourceEntityType ||
                typeRow.target_entity_type !==
                targetEntityType
            ) {
                return callback({
                    status: 400,
                    message:
                        "关系类型与来源/目标实体类型不匹配"
                });
            }

            getEntityByType(
                sourceEntityType,
                sourceEntityId,
                (sourceErr, sourceEntity) => {
                    if (sourceErr) {
                        return callback({
                            status: 500,
                            message: "读取来源实体失败"
                        });
                    }

                    if (!sourceEntity) {
                        return callback({
                            status: 404,
                            message: "来源实体不存在"
                        });
                    }

                    getEntityByType(
                        targetEntityType,
                        targetEntityId,
                        (targetErr, targetEntity) => {
                            if (targetErr) {
                                return callback({
                                    status: 500,
                                    message: "读取目标实体失败"
                                });
                            }

                            if (!targetEntity) {
                                return callback({
                                    status: 404,
                                    message: "目标实体不存在"
                                });
                            }

                            return callback(
                                null,
                                {
                                    sourceEntityType,
                                    sourceEntityId,
                                    targetEntityType,
                                    targetEntityId,
                                    relationshipType,
                                    relationshipTypeRow:
                                        typeRow
                                }
                            );
                        }
                    );
                }
            );
        }
    );
}


/* =========================================================
   GET /relationship-types
   关系类型字典
========================================================= */

router.get(
    "/relationship-types",
    verifyAdminToken,
    (req, res) => {
        const sourceEntityType =
            normalizeText(
                req.query.source_entity_type
            );

        const targetEntityType =
            normalizeText(
                req.query.target_entity_type
            );

        const params = [];

        let sql = `
          SELECT *
          FROM pi_relationship_types
          WHERE is_active = 1
        `;

        if (sourceEntityType) {
            sql += `
              AND source_entity_type = ?
            `;
            params.push(sourceEntityType);
        }

        if (targetEntityType) {
            sql += `
              AND target_entity_type = ?
            `;
            params.push(targetEntityType);
        }

        sql += `
          ORDER BY
            category ASC,
            sort_order ASC,
            id ASC
        `;

        db.all(
            sql,
            params,
            (err, rows) => {
                if (err) {
                    console.error(
                        "People Intelligence relationship types error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取关系类型失败"
                    });
                }

                return res.json({
                    success: true,
                    count: rows.length,
                    relationship_types: rows
                });
            }
        );
    }
);


/* =========================================================
   GET /relationships
   通用关系列表
========================================================= */

router.get(
    "/relationships",
    verifyAdminToken,
    (req, res) => {
        const entityType =
            normalizeText(
                req.query.entity_type
            );

        const entityId =
            normalizeInteger(
                req.query.entity_id
            );

        const relationshipType =
            normalizeText(
                req.query.relationship_type
            );

        const verificationStatus =
            normalizeText(
                req.query.verification_status
            );

        const params = [];

        let sql = `
          SELECT
            r.*,
            rt.name_zh AS relationship_name_zh,
            rt.name_en AS relationship_name_en,
            rt.category AS relationship_category,

            (
              SELECT COUNT(*)
              FROM pi_evidence e
              WHERE e.entity_type = 'relationship'
                AND e.entity_id = r.id
            ) AS evidence_count,

            (
              SELECT COUNT(*)
              FROM pi_evidence e
              WHERE e.entity_type = 'relationship'
                AND e.entity_id = r.id
                AND e.verification_status = 'verified'
            ) AS verified_evidence_count,

            CASE
              WHEN r.source_entity_type = 'person'
              THEN (
                SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                FROM pi_people
                WHERE id = r.source_entity_id
              )
              WHEN r.source_entity_type = 'organization'
              THEN (
                SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                FROM pi_organizations
                WHERE id = r.source_entity_id
              )
              ELSE NULL
            END AS source_entity_name,

            CASE
              WHEN r.target_entity_type = 'person'
              THEN (
                SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                FROM pi_people
                WHERE id = r.target_entity_id
              )
              WHEN r.target_entity_type = 'organization'
              THEN (
                SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                FROM pi_organizations
                WHERE id = r.target_entity_id
              )
              ELSE NULL
            END AS target_entity_name

          FROM pi_relationships r
          LEFT JOIN pi_relationship_types rt
            ON rt.code = r.relationship_type
          WHERE 1 = 1
        `;

        if (entityType && entityId) {
            sql += `
              AND (
                (
                  r.source_entity_type = ?
                  AND r.source_entity_id = ?
                )
                OR
                (
                  r.target_entity_type = ?
                  AND r.target_entity_id = ?
                )
              )
            `;

            params.push(
                entityType,
                entityId,
                entityType,
                entityId
            );
        }

        if (relationshipType) {
            sql += `
              AND r.relationship_type = ?
            `;
            params.push(relationshipType);
        }

        if (verificationStatus) {
            sql += `
              AND r.verification_status = ?
            `;
            params.push(verificationStatus);
        }

        sql += `
          ORDER BY
            r.updated_at DESC,
            r.id DESC
        `;

        db.all(
            sql,
            params,
            (err, rows) => {
                if (err) {
                    console.error(
                        "People Intelligence relationships list error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取关系列表失败"
                    });
                }

                return res.json({
                    success: true,
                    count: rows.length,
                    relationships: rows
                });
            }
        );
    }
);


/* =========================================================
   GET /relationships/:id
   单条关系
========================================================= */

router.get(
    "/relationships/:id",
    verifyAdminToken,
    (req, res) => {
        const id =
            normalizeInteger(
                req.params.id
            );

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "无效的关系 ID"
            });
        }

        getRelationshipById(
            id,
            (err, relationship) => {
                if (err) {
                    console.error(
                        "People Intelligence relationship detail error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取关系失败"
                    });
                }

                if (!relationship) {
                    return res.status(404).json({
                        success: false,
                        message: "关系不存在"
                    });
                }

                return res.json({
                    success: true,
                    relationship
                });
            }
        );
    }
);


/* =========================================================
   POST /relationships
   新增关系
========================================================= */

router.post(
    "/relationships",
    verifyAdminToken,
    (req, res) => {
        validateRelationshipEntities(
            req.body,
            (validationError, normalized) => {
                if (validationError) {
                    return res
                        .status(validationError.status)
                        .json({
                            success: false,
                            message:
                                validationError.message
                        });
                }

                const ownershipPercentage =
                    normalizeOptionalNumber(
                        req.body.ownership_percentage
                    );

                const votingPercentage =
                    normalizeOptionalNumber(
                        req.body.voting_percentage
                    );

                if (
                    ownershipPercentage !== null &&
                    (
                        ownershipPercentage < 0 ||
                        ownershipPercentage > 100
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "持股比例必须在 0 到 100 之间"
                    });
                }

                if (
                    votingPercentage !== null &&
                    (
                        votingPercentage < 0 ||
                        votingPercentage > 100
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "投票权比例必须在 0 到 100 之间"
                    });
                }

                const relationshipStatus =
                    normalizeText(
                        req.body.relationship_status
                    ) || "current";

                if (
                    !PI_RELATIONSHIP_STATUSES.includes(
                        relationshipStatus
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "无效的关系状态"
                    });
                }

                const verificationStatus =
                    normalizeText(
                        req.body.verification_status
                    ) || "draft";

                if (
                    !PI_RELATIONSHIP_VERIFICATION_STATUSES.includes(
                        verificationStatus
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "无效的审核状态"
                    });
                }

                const isCurrent =
                    req.body.is_current === undefined
                        ? relationshipStatus === "current"
                            ? 1
                            : 0
                        : normalizeBooleanInteger(
                            req.body.is_current
                        );

                const sql = `
                  INSERT INTO pi_relationships (
                    source_entity_type,
                    source_entity_id,
                    target_entity_type,
                    target_entity_id,
                    relationship_type,
                    relationship_label,
                    direction_type,
                    role_title,
                    ownership_percentage,
                    voting_percentage,
                    investment_amount,
                    currency,
                    is_control_relationship,
                    start_date,
                    end_date,
                    relationship_status,
                    is_current,
                    description,
                    notes,
                    verification_status,
                    confidence_level,
                    is_public,
                    created_at,
                    updated_at
                  )
                  VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                  )
                `;

                const params = [
                    normalized.sourceEntityType,
                    normalized.sourceEntityId,
                    normalized.targetEntityType,
                    normalized.targetEntityId,
                    normalized.relationshipType,
                    normalizeText(
                        req.body.relationship_label
                    ) ||
                    normalized.relationshipTypeRow.name_zh,
                    normalizeText(
                        req.body.direction_type
                    ) || "directed",
                    normalizeText(
                        req.body.role_title
                    ) || null,
                    ownershipPercentage,
                    votingPercentage,
                    normalizeOptionalNumber(
                        req.body.investment_amount
                    ),
                    normalizeText(
                        req.body.currency
                    ) || null,
                    normalizeBooleanInteger(
                        req.body.is_control_relationship
                    ),
                    normalizeText(
                        req.body.start_date
                    ) || null,
                    normalizeText(
                        req.body.end_date
                    ) || null,
                    relationshipStatus,
                    isCurrent,
                    normalizeText(
                        req.body.description
                    ) || null,
                    normalizeText(
                        req.body.notes
                    ) || null,
                    verificationStatus,
                    normalizeText(
                        req.body.confidence_level
                    ) || "medium",
                    0
                ];

                db.run(
                    sql,
                    params,
                    function (err) {
                        if (err) {
                            console.error(
                                "People Intelligence relationship create error:",
                                err
                            );

                            return res.status(500).json({
                                success: false,
                                message: "新增关系失败"
                            });
                        }

                        const newId = this.lastID;

                        getRelationshipById(
                            newId,
                            (readErr, relationship) => {
                                if (readErr) {
                                    return res.status(201).json({
                                        success: true,
                                        id: newId,
                                        message: "关系已创建"
                                    });
                                }

                                return res.status(201).json({
                                    success: true,
                                    message: "关系已创建",
                                    relationship
                                });
                            }
                        );
                    }
                );
            }
        );
    }
);


/* =========================================================
   PUT /relationships/:id
   修改关系
========================================================= */

router.put(
    "/relationships/:id",
    verifyAdminToken,
    (req, res) => {
        const id =
            normalizeInteger(
                req.params.id
            );

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "无效的关系 ID"
            });
        }

        getRelationshipById(
            id,
            (existingErr, existing) => {
                if (existingErr) {
                    return res.status(500).json({
                        success: false,
                        message: "读取原关系失败"
                    });
                }

                if (!existing) {
                    return res.status(404).json({
                        success: false,
                        message: "关系不存在"
                    });
                }

                const mergedPayload = {
                    ...existing,
                    ...req.body
                };

                validateRelationshipEntities(
                    mergedPayload,
                    (validationError, normalized) => {
                        if (validationError) {
                            return res
                                .status(validationError.status)
                                .json({
                                    success: false,
                                    message:
                                        validationError.message
                                });
                        }

                        const ownershipPercentage =
                            normalizeOptionalNumber(
                                mergedPayload.ownership_percentage
                            );

                        const votingPercentage =
                            normalizeOptionalNumber(
                                mergedPayload.voting_percentage
                            );

                        if (
                            ownershipPercentage !== null &&
                            (
                                ownershipPercentage < 0 ||
                                ownershipPercentage > 100
                            )
                        ) {
                            return res.status(400).json({
                                success: false,
                                message:
                                    "持股比例必须在 0 到 100 之间"
                            });
                        }

                        if (
                            votingPercentage !== null &&
                            (
                                votingPercentage < 0 ||
                                votingPercentage > 100
                            )
                        ) {
                            return res.status(400).json({
                                success: false,
                                message:
                                    "投票权比例必须在 0 到 100 之间"
                            });
                        }

                        const relationshipStatus =
                            normalizeText(
                                mergedPayload.relationship_status
                            ) || "current";

                        const verificationStatus =
                            normalizeText(
                                mergedPayload.verification_status
                            ) || "draft";

                        if (
                            !PI_RELATIONSHIP_STATUSES.includes(
                                relationshipStatus
                            )
                        ) {
                            return res.status(400).json({
                                success: false,
                                message: "无效的关系状态"
                            });
                        }

                        if (
                            !PI_RELATIONSHIP_VERIFICATION_STATUSES.includes(
                                verificationStatus
                            )
                        ) {
                            return res.status(400).json({
                                success: false,
                                message: "无效的审核状态"
                            });
                        }

                        db.run(
                            `
                              UPDATE pi_relationships
                              SET
                                source_entity_type = ?,
                                source_entity_id = ?,
                                target_entity_type = ?,
                                target_entity_id = ?,
                                relationship_type = ?,
                                relationship_label = ?,
                                direction_type = ?,
                                role_title = ?,
                                ownership_percentage = ?,
                                voting_percentage = ?,
                                investment_amount = ?,
                                currency = ?,
                                is_control_relationship = ?,
                                start_date = ?,
                                end_date = ?,
                                relationship_status = ?,
                                is_current = ?,
                                description = ?,
                                notes = ?,
                                verification_status = ?,
                                confidence_level = ?,
                                is_public = ?,
                                updated_at = CURRENT_TIMESTAMP
                              WHERE id = ?
                            `,
                            [
                                normalized.sourceEntityType,
                                normalized.sourceEntityId,
                                normalized.targetEntityType,
                                normalized.targetEntityId,
                                normalized.relationshipType,
                                normalizeText(
                                    mergedPayload.relationship_label
                                ) ||
                                normalized.relationshipTypeRow.name_zh,
                                normalizeText(
                                    mergedPayload.direction_type
                                ) || "directed",
                                normalizeText(
                                    mergedPayload.role_title
                                ) || null,
                                ownershipPercentage,
                                votingPercentage,
                                normalizeOptionalNumber(
                                    mergedPayload.investment_amount
                                ),
                                normalizeText(
                                    mergedPayload.currency
                                ) || null,
                                normalizeBooleanInteger(
                                    mergedPayload.is_control_relationship
                                ),
                                normalizeText(
                                    mergedPayload.start_date
                                ) || null,
                                normalizeText(
                                    mergedPayload.end_date
                                ) || null,
                                relationshipStatus,
                                normalizeBooleanInteger(
                                    mergedPayload.is_current
                                ),
                                normalizeText(
                                    mergedPayload.description
                                ) || null,
                                normalizeText(
                                    mergedPayload.notes
                                ) || null,
                                verificationStatus,
                                normalizeText(
                                    mergedPayload.confidence_level
                                ) || "medium",
                                normalizeBooleanInteger(
                                    mergedPayload.is_public
                                ),
                                id
                            ],
                            function (err) {
                                if (err) {
                                    console.error(
                                        "People Intelligence relationship update error:",
                                        err
                                    );

                                    return res.status(500).json({
                                        success: false,
                                        message: "修改关系失败"
                                    });
                                }

                                getRelationshipById(
                                    id,
                                    (readErr, relationship) => {
                                        if (readErr) {
                                            return res.json({
                                                success: true,
                                                message: "关系已更新"
                                            });
                                        }

                                        return res.json({
                                            success: true,
                                            message: "关系已更新",
                                            relationship
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    }
);


/* =========================================================
   PATCH /relationships/:id/status
   修改关系审核状态
========================================================= */

router.patch(
    "/relationships/:id/status",
    verifyAdminToken,
    (req, res) => {
        const id =
            normalizeInteger(
                req.params.id
            );

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "无效的关系 ID"
            });
        }

        const verificationStatus =
            normalizeText(
                req.body.verification_status
            );

        if (
            !PI_RELATIONSHIP_VERIFICATION_STATUSES.includes(
                verificationStatus
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的关系审核状态"
            });
        }

        const applyStatusUpdate = () => {
            db.run(
                `
                  UPDATE pi_relationships
                  SET
                    verification_status = ?,
                    updated_at = CURRENT_TIMESTAMP
                  WHERE id = ?
                `,
                [
                    verificationStatus,
                    id
                ],
                function (err) {
                    if (err) {
                        console.error(
                            "People Intelligence relationship status error:",
                            err
                        );

                        return res.status(500).json({
                            success: false,
                            message: "更新关系审核状态失败"
                        });
                    }

                    if (this.changes === 0) {
                        return res.status(404).json({
                            success: false,
                            message: "关系不存在"
                        });
                    }

                    getRelationshipById(
                        id,
                        (readErr, relationship) => {
                            return res.json({
                                success: true,
                                message: "关系审核状态已更新",
                                relationship:
                                    readErr
                                        ? undefined
                                        : relationship
                            });
                        }
                    );
                }
            );
        };

        if (verificationStatus !== "verified") {
            return applyStatusUpdate();
        }

        db.get(
            `
              SELECT COUNT(*) AS verified_count
              FROM pi_evidence
              WHERE entity_type = 'relationship'
                AND entity_id = ?
                AND verification_status = 'verified'
            `,
            [id],
            (countErr, row) => {
                if (countErr) {
                    console.error(
                        "People Intelligence relationship evidence count error:",
                        countErr
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取关系证据状态失败"
                    });
                }

                if (
                    !row ||
                    Number(row.verified_count) < 1
                ) {
                    return res.status(409).json({
                        success: false,
                        message:
                            "关系至少需要 1 条已核验证据，才能审核通过"
                    });
                }

                return applyStatusUpdate();
            }
        );
    }
);


/* =========================================================
   PATCH /relationships/:id/publication
   发布 / 取消发布关系
========================================================= */

router.patch(
    "/relationships/:id/publication",
    verifyAdminToken,
    (req, res) => {
        const id =
            normalizeInteger(
                req.params.id
            );

        const isPublic =
            normalizeBooleanInteger(
                req.body.is_public
            );

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "无效的关系 ID"
            });
        }

        getRelationshipById(
            id,
            (readErr, relationship) => {
                if (readErr) {
                    return res.status(500).json({
                        success: false,
                        message: "读取关系失败"
                    });
                }

                if (!relationship) {
                    return res.status(404).json({
                        success: false,
                        message: "关系不存在"
                    });
                }

                if (
                    isPublic === 1 &&
                    relationship.verification_status !==
                    "verified"
                ) {
                    return res.status(409).json({
                        success: false,
                        message:
                            "关系尚未审核通过，不能发布"
                    });
                }

                db.run(
                    `
                      UPDATE pi_relationships
                      SET
                        is_public = ?,
                        updated_at = CURRENT_TIMESTAMP
                      WHERE id = ?
                    `,
                    [isPublic, id],
                    function (err) {
                        if (err) {
                            console.error(
                                "People Intelligence relationship publication error:",
                                err
                            );

                            return res.status(500).json({
                                success: false,
                                message: "更新关系发布状态失败"
                            });
                        }

                        getRelationshipById(
                            id,
                            (finalErr, updatedRelationship) => {
                                return res.json({
                                    success: true,
                                    message:
                                        isPublic === 1
                                            ? "关系已发布"
                                            : "关系已取消发布",
                                    relationship:
                                        finalErr
                                            ? undefined
                                            : updatedRelationship
                                });
                            }
                        );
                    }
                );
            }
        );
    }
);


/* =========================================================
   Evidence & Source Management V1
   证据 / 来源管理 API
========================================================= */

const PI_EVIDENCE_ENTITY_TYPES = [
    "person",
    "organization",
    "relationship"
];

const PI_EVIDENCE_TYPES = [
    "web",
    "company_filing",
    "exchange_filing",
    "government_record",
    "news",
    "api",
    "document",
    "other"
];

const PI_EVIDENCE_SOURCE_TIERS = [
    "primary",
    "secondary",
    "tertiary"
];

const PI_EVIDENCE_VERIFICATION_STATUSES = [
    "pending",
    "verified",
    "disputed",
    "rejected"
];


function getEvidenceById(
    id,
    callback
) {
    db.get(
        `
          SELECT *
          FROM pi_evidence
          WHERE id = ?
        `,
        [id],
        callback
    );
}


function validateEvidenceTarget(
    entityType,
    entityId,
    callback
) {
    if (
        !PI_EVIDENCE_ENTITY_TYPES.includes(
            entityType
        )
    ) {
        return callback({
            status: 400,
            message:
                "证据目标仅支持 person、organization、relationship"
        });
    }

    if (!entityId) {
        return callback({
            status: 400,
            message: "证据目标 ID 无效"
        });
    }

    if (
        entityType === "person" ||
        entityType === "organization"
    ) {
        return getEntityByType(
            entityType,
            entityId,
            (err, entity) => {
                if (err) {
                    return callback({
                        status: 500,
                        message: "读取证据目标失败"
                    });
                }

                if (!entity) {
                    return callback({
                        status: 404,
                        message: "证据目标不存在"
                    });
                }

                return callback(
                    null,
                    entity
                );
            }
        );
    }

    if (entityType === "relationship") {
        return getRelationshipById(
            entityId,
            (err, relationship) => {
                if (err) {
                    return callback({
                        status: 500,
                        message: "读取关系证据目标失败"
                    });
                }

                if (!relationship) {
                    return callback({
                        status: 404,
                        message: "关系证据目标不存在"
                    });
                }

                return callback(
                    null,
                    relationship
                );
            }
        );
    }

    return callback({
        status: 400,
        message: "无效的证据目标类型"
    });
}


function normalizeEvidencePayload(
    payload
) {
    const entityType =
        normalizeText(
            payload.entity_type
        );

    const entityId =
        normalizeInteger(
            payload.entity_id
        );

    const evidenceType =
        normalizeText(
            payload.evidence_type
        ) || "web";

    const sourceTier =
        normalizeText(
            payload.source_tier
        ) || "secondary";

    const verificationStatus =
        normalizeText(
            payload.verification_status
        ) || "pending";

    return {
        entityType,
        entityId,
        evidenceType,
        sourceTier,
        verificationStatus
    };
}


/* =========================================================
   GET /evidence
   证据列表
========================================================= */

router.get(
    "/evidence",
    verifyAdminToken,
    (req, res) => {
        const entityType =
            normalizeText(
                req.query.entity_type
            );

        const entityId =
            normalizeInteger(
                req.query.entity_id
            );

        const verificationStatus =
            normalizeText(
                req.query.verification_status
            );

        const evidenceType =
            normalizeText(
                req.query.evidence_type
            );

        const search =
            normalizeText(
                req.query.search
            );

        const params = [];

        let sql = `
          SELECT *
          FROM pi_evidence
          WHERE 1 = 1
        `;

        if (entityType) {
            sql += `
              AND entity_type = ?
            `;
            params.push(entityType);
        }

        if (entityId) {
            sql += `
              AND entity_id = ?
            `;
            params.push(entityId);
        }

        if (verificationStatus) {
            sql += `
              AND verification_status = ?
            `;
            params.push(
                verificationStatus
            );
        }

        if (evidenceType) {
            sql += `
              AND evidence_type = ?
            `;
            params.push(
                evidenceType
            );
        }

        if (search) {
            const keyword =
                `%${search}%`;

            sql += `
              AND (
                source_name LIKE ?
                OR source_title LIKE ?
                OR source_url LIKE ?
                OR publisher LIKE ?
                OR evidence_summary LIKE ?
              )
            `;

            params.push(
                keyword,
                keyword,
                keyword,
                keyword,
                keyword
            );
        }

        sql += `
          ORDER BY
            updated_at DESC,
            id DESC
        `;

        db.all(
            sql,
            params,
            (err, rows) => {
                if (err) {
                    console.error(
                        "People Intelligence evidence list error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取证据列表失败"
                    });
                }

                return res.json({
                    success: true,
                    count: rows.length,
                    evidence: rows
                });
            }
        );
    }
);


/* =========================================================
   GET /evidence/:id
   单条证据
========================================================= */

router.get(
    "/evidence/:id",
    verifyAdminToken,
    (req, res) => {
        const id =
            normalizeInteger(
                req.params.id
            );

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "无效的证据 ID"
            });
        }

        getEvidenceById(
            id,
            (err, evidence) => {
                if (err) {
                    console.error(
                        "People Intelligence evidence detail error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "读取证据失败"
                    });
                }

                if (!evidence) {
                    return res.status(404).json({
                        success: false,
                        message: "证据不存在"
                    });
                }

                return res.json({
                    success: true,
                    evidence
                });
            }
        );
    }
);


/* =========================================================
   POST /evidence
   新增证据
========================================================= */

router.post(
    "/evidence",
    verifyAdminToken,
    (req, res) => {
        const normalized =
            normalizeEvidencePayload(
                req.body
            );

        if (
            !PI_EVIDENCE_TYPES.includes(
                normalized.evidenceType
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的证据类型"
            });
        }

        if (
            !PI_EVIDENCE_SOURCE_TIERS.includes(
                normalized.sourceTier
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的来源等级"
            });
        }

        if (
            !PI_EVIDENCE_VERIFICATION_STATUSES.includes(
                normalized.verificationStatus
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的证据审核状态"
            });
        }

        validateEvidenceTarget(
            normalized.entityType,
            normalized.entityId,
            (validationError) => {
                if (validationError) {
                    return res
                        .status(
                            validationError.status
                        )
                        .json({
                            success: false,
                            message:
                                validationError.message
                        });
                }

                const sql = `
                  INSERT INTO pi_evidence (
                    entity_type,
                    entity_id,
                    evidence_type,
                    source_name,
                    source_title,
                    source_url,
                    publisher,
                    published_at,
                    evidence_summary,
                    source_tier,
                    confidence_level,
                    verification_status,
                    is_primary_source,
                    archived_url,
                    created_at,
                    updated_at
                  )
                  VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                  )
                `;

                const params = [
                    normalized.entityType,
                    normalized.entityId,
                    normalized.evidenceType,
                    normalizeText(
                        req.body.source_name
                    ) || null,
                    normalizeText(
                        req.body.source_title
                    ) || null,
                    normalizeText(
                        req.body.source_url
                    ) || null,
                    normalizeText(
                        req.body.publisher
                    ) || null,
                    normalizeText(
                        req.body.published_at
                    ) || null,
                    normalizeText(
                        req.body.evidence_summary
                    ) || null,
                    normalized.sourceTier,
                    normalizeText(
                        req.body.confidence_level
                    ) || "medium",
                    normalized.verificationStatus,
                    normalizeBooleanInteger(
                        req.body.is_primary_source
                    ),
                    normalizeText(
                        req.body.archived_url
                    ) || null
                ];

                db.run(
                    sql,
                    params,
                    function (err) {
                        if (err) {
                            console.error(
                                "People Intelligence evidence create error:",
                                err
                            );

                            return res.status(500).json({
                                success: false,
                                message: "新增证据失败"
                            });
                        }

                        const newId =
                            this.lastID;

                        getEvidenceById(
                            newId,
                            (readErr, evidence) => {
                                if (readErr) {
                                    return res.status(201).json({
                                        success: true,
                                        id: newId,
                                        message: "证据已创建"
                                    });
                                }

                                return res.status(201).json({
                                    success: true,
                                    message: "证据已创建",
                                    evidence
                                });
                            }
                        );
                    }
                );
            }
        );
    }
);


/* =========================================================
   PUT /evidence/:id
   修改证据
========================================================= */

router.put(
    "/evidence/:id",
    verifyAdminToken,
    (req, res) => {
        const id =
            normalizeInteger(
                req.params.id
            );

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "无效的证据 ID"
            });
        }

        getEvidenceById(
            id,
            (readErr, existing) => {
                if (readErr) {
                    return res.status(500).json({
                        success: false,
                        message: "读取原证据失败"
                    });
                }

                if (!existing) {
                    return res.status(404).json({
                        success: false,
                        message: "证据不存在"
                    });
                }

                const mergedPayload = {
                    ...existing,
                    ...req.body
                };

                const normalized =
                    normalizeEvidencePayload(
                        mergedPayload
                    );

                if (
                    !PI_EVIDENCE_TYPES.includes(
                        normalized.evidenceType
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "无效的证据类型"
                    });
                }

                if (
                    !PI_EVIDENCE_SOURCE_TIERS.includes(
                        normalized.sourceTier
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "无效的来源等级"
                    });
                }

                if (
                    !PI_EVIDENCE_VERIFICATION_STATUSES.includes(
                        normalized.verificationStatus
                    )
                ) {
                    return res.status(400).json({
                        success: false,
                        message: "无效的证据审核状态"
                    });
                }

                validateEvidenceTarget(
                    normalized.entityType,
                    normalized.entityId,
                    (validationError) => {
                        if (validationError) {
                            return res
                                .status(
                                    validationError.status
                                )
                                .json({
                                    success: false,
                                    message:
                                        validationError.message
                                });
                        }

                        const sql = `
                          UPDATE pi_evidence
                          SET
                            entity_type = ?,
                            entity_id = ?,
                            evidence_type = ?,
                            source_name = ?,
                            source_title = ?,
                            source_url = ?,
                            publisher = ?,
                            published_at = ?,
                            evidence_summary = ?,
                            source_tier = ?,
                            confidence_level = ?,
                            verification_status = ?,
                            is_primary_source = ?,
                            archived_url = ?,
                            updated_at = CURRENT_TIMESTAMP
                          WHERE id = ?
                        `;

                        const params = [
                            normalized.entityType,
                            normalized.entityId,
                            normalized.evidenceType,
                            normalizeText(
                                mergedPayload.source_name
                            ) || null,
                            normalizeText(
                                mergedPayload.source_title
                            ) || null,
                            normalizeText(
                                mergedPayload.source_url
                            ) || null,
                            normalizeText(
                                mergedPayload.publisher
                            ) || null,
                            normalizeText(
                                mergedPayload.published_at
                            ) || null,
                            normalizeText(
                                mergedPayload.evidence_summary
                            ) || null,
                            normalized.sourceTier,
                            normalizeText(
                                mergedPayload.confidence_level
                            ) || "medium",
                            normalized.verificationStatus,
                            normalizeBooleanInteger(
                                mergedPayload.is_primary_source
                            ),
                            normalizeText(
                                mergedPayload.archived_url
                            ) || null,
                            id
                        ];

                        db.run(
                            sql,
                            params,
                            function (err) {
                                if (err) {
                                    console.error(
                                        "People Intelligence evidence update error:",
                                        err
                                    );

                                    return res.status(500).json({
                                        success: false,
                                        message: "修改证据失败"
                                    });
                                }

                                getEvidenceById(
                                    id,
                                    (finalErr, evidence) => {
                                        if (finalErr) {
                                            return res.json({
                                                success: true,
                                                message:
                                                    "证据已更新"
                                            });
                                        }

                                        return res.json({
                                            success: true,
                                            message:
                                                "证据已更新",
                                            evidence
                                        });
                                    }
                                );
                            }
                        );
                    }
                );
            }
        );
    }
);


/* =========================================================
   PATCH /evidence/:id/status
   修改证据审核状态
========================================================= */

router.patch(
    "/evidence/:id/status",
    verifyAdminToken,
    (req, res) => {
        const id =
            normalizeInteger(
                req.params.id
            );

        const verificationStatus =
            normalizeText(
                req.body.verification_status
            );

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "无效的证据 ID"
            });
        }

        if (
            !PI_EVIDENCE_VERIFICATION_STATUSES.includes(
                verificationStatus
            )
        ) {
            return res.status(400).json({
                success: false,
                message: "无效的证据审核状态"
            });
        }

        db.run(
            `
              UPDATE pi_evidence
              SET
                verification_status = ?,
                updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `,
            [
                verificationStatus,
                id
            ],
            function (err) {
                if (err) {
                    console.error(
                        "People Intelligence evidence status error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "更新证据审核状态失败"
                    });
                }

                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "证据不存在"
                    });
                }

                getEvidenceById(
                    id,
                    (readErr, evidence) => {
                        return res.json({
                            success: true,
                            message:
                                "证据审核状态已更新",
                            evidence:
                                readErr
                                    ? undefined
                                    : evidence
                        });
                    }
                );
            }
        );
    }
);


/* =========================================================
   DELETE /evidence/:id
   删除证据
========================================================= */

router.delete(
    "/evidence/:id",
    verifyAdminToken,
    (req, res) => {
        const id =
            normalizeInteger(
                req.params.id
            );

        if (!id) {
            return res.status(400).json({
                success: false,
                message: "无效的证据 ID"
            });
        }

        db.run(
            `
              DELETE FROM pi_evidence
              WHERE id = ?
            `,
            [id],
            function (err) {
                if (err) {
                    console.error(
                        "People Intelligence evidence delete error:",
                        err
                    );

                    return res.status(500).json({
                        success: false,
                        message: "删除证据失败"
                    });
                }

                if (this.changes === 0) {
                    return res.status(404).json({
                        success: false,
                        message: "证据不存在"
                    });
                }

                return res.json({
                    success: true,
                    message: "证据已删除"
                });
            }
        );
    }
);



/* =========================================================
   Unified Review Queue V1
   AI / 人工录入统一审核工作台
========================================================= */

function reviewDbAll(
    sql,
    params = []
) {
    return new Promise(
        (resolve, reject) => {
            db.all(
                sql,
                params,
                (err, rows) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve(rows || []);
                }
            );
        }
    );
}


router.get(
    "/review-queue",
    verifyAdminToken,
    async (req, res) => {
        try {
            const status =
                normalizeText(
                    req.query.status
                ) || "reviewable";

            const type =
                normalizeText(
                    req.query.type
                ) || "all";

            const search =
                normalizeText(
                    req.query.search
                ).toLowerCase();

            const publication =
                normalizeText(
                    req.query.publication
                ) || "all";

            const peopleSql = `
              SELECT
                id,
                name_zh,
                name_en,
                primary_role,
                country_region,
                verification_status,
                confidence_level,
                is_public,
                updated_at
              FROM pi_people
              WHERE record_status = 'active'
            `;

            const organizationsSql = `
              SELECT
                id,
                name_zh,
                name_en,
                organization_type,
                country_region,
                industry_primary,
                industry_secondary,
                verification_status,
                confidence_level,
                is_public,
                updated_at
              FROM pi_organizations
              WHERE record_status = 'active'
            `;

            const relationshipsSql = `
              SELECT
                r.id,
                r.relationship_type,
                r.source_entity_type,
                r.source_entity_id,
                r.target_entity_type,
                r.target_entity_id,
                r.role_title,
                r.ownership_percentage,
                r.verification_status,
                r.confidence_level,
                r.is_public,
                r.updated_at,
                rt.name_zh AS relationship_name_zh,
                rt.name_en AS relationship_name_en,

                CASE
                  WHEN r.source_entity_type = 'person'
                  THEN (
                    SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                    FROM pi_people
                    WHERE id = r.source_entity_id
                  )
                  WHEN r.source_entity_type = 'organization'
                  THEN (
                    SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                    FROM pi_organizations
                    WHERE id = r.source_entity_id
                  )
                  ELSE NULL
                END AS source_entity_name,

                CASE
                  WHEN r.target_entity_type = 'person'
                  THEN (
                    SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                    FROM pi_people
                    WHERE id = r.target_entity_id
                  )
                  WHEN r.target_entity_type = 'organization'
                  THEN (
                    SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                    FROM pi_organizations
                    WHERE id = r.target_entity_id
                  )
                  ELSE NULL
                END AS target_entity_name,

                (
                  SELECT COUNT(*)
                  FROM pi_evidence e
                  WHERE e.entity_type = 'relationship'
                    AND e.entity_id = r.id
                ) AS evidence_count,

                (
                  SELECT COUNT(*)
                  FROM pi_evidence e
                  WHERE e.entity_type = 'relationship'
                    AND e.entity_id = r.id
                    AND e.verification_status = 'verified'
                ) AS verified_evidence_count

              FROM pi_relationships r
              LEFT JOIN pi_relationship_types rt
                ON rt.code = r.relationship_type
            `;

            const evidenceSql = `
              SELECT
                id,
                entity_type,
                entity_id,
                evidence_type,
                source_name,
                source_title,
                publisher,
                source_tier,
                verification_status,
                confidence_level,
                updated_at
              FROM pi_evidence
            `;

            const [
                people,
                organizations,
                relationships,
                evidence
            ] = await Promise.all([
                reviewDbAll(peopleSql),
                reviewDbAll(organizationsSql),
                reviewDbAll(relationshipsSql),
                reviewDbAll(evidenceSql)
            ]);

            const items = [];

            people.forEach((row) => {
                items.push({
                    object_type: "person",
                    object_id: row.id,
                    title:
                        row.name_zh ||
                        row.name_en ||
                        `Person #${row.id}`,
                    subtitle:
                        [
                            row.name_en,
                            row.primary_role,
                            row.country_region
                        ]
                            .filter(Boolean)
                            .join(" · "),
                    verification_status:
                        row.verification_status,
                    confidence_level:
                        row.confidence_level,
                    is_public:
                        Number(row.is_public || 0),
                    evidence_count: null,
                    verified_evidence_count: null,
                    updated_at: row.updated_at
                });
            });

            organizations.forEach((row) => {
                items.push({
                    object_type: "organization",
                    object_id: row.id,
                    title:
                        row.name_zh ||
                        row.name_en ||
                        `Organization #${row.id}`,
                    subtitle:
                        [
                            row.name_en,
                            row.organization_type,
                            row.country_region,
                            row.industry_primary,
                            row.industry_secondary
                        ]
                            .filter(Boolean)
                            .join(" · "),
                    verification_status:
                        row.verification_status,
                    confidence_level:
                        row.confidence_level,
                    is_public:
                        Number(row.is_public || 0),
                    evidence_count: null,
                    verified_evidence_count: null,
                    updated_at: row.updated_at
                });
            });

            relationships.forEach((row) => {
                const relationLabel =
                    row.relationship_name_zh ||
                    row.relationship_name_en ||
                    row.relationship_type;

                items.push({
                    object_type: "relationship",
                    object_id: row.id,
                    title:
                        `${row.source_entity_name || "未知实体"} → ${relationLabel} → ${row.target_entity_name || "未知实体"}`,
                    subtitle:
                        [
                            row.role_title,
                            row.ownership_percentage == null
                                ? null
                                : `持股 ${row.ownership_percentage}%`
                        ]
                            .filter(Boolean)
                            .join(" · "),
                    verification_status:
                        row.verification_status,
                    confidence_level:
                        row.confidence_level,
                    is_public:
                        Number(row.is_public || 0),
                    evidence_count:
                        Number(row.evidence_count || 0),
                    verified_evidence_count:
                        Number(
                            row.verified_evidence_count || 0
                        ),
                    updated_at: row.updated_at
                });
            });

            evidence.forEach((row) => {
                items.push({
                    object_type: "evidence",
                    object_id: row.id,
                    title:
                        row.source_title ||
                        row.source_name ||
                        `Evidence #${row.id}`,
                    subtitle:
                        [
                            `${row.entity_type} #${row.entity_id}`,
                            row.publisher,
                            row.source_tier
                        ]
                            .filter(Boolean)
                            .join(" · "),
                    verification_status:
                        row.verification_status,
                    confidence_level:
                        row.confidence_level,
                    is_public: null,
                    evidence_count: null,
                    verified_evidence_count: null,
                    updated_at: row.updated_at
                });
            });

            const reviewableStatuses = new Set([
                "draft",
                "pending",
                "disputed"
            ]);

            let filtered = items.filter((item) => {
                if (
                    type !== "all" &&
                    item.object_type !== type
                ) {
                    return false;
                }

                if (
                    status === "reviewable" &&
                    !reviewableStatuses.has(
                        item.verification_status
                    )
                ) {
                    return false;
                }

                if (
                    status !== "all" &&
                    status !== "reviewable" &&
                    item.verification_status !==
                    status
                ) {
                    return false;
                }

                if (publication !== "all") {
                    if (item.object_type === "evidence") {
                        return false;
                    }

                    if (
                        publication === "published" &&
                        Number(item.is_public) !== 1
                    ) {
                        return false;
                    }

                    if (
                        publication === "unpublished" &&
                        Number(item.is_public) === 1
                    ) {
                        return false;
                    }
                }

                if (search) {
                    const haystack = [
                        item.title,
                        item.subtitle,
                        item.object_type,
                        item.object_id
                    ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();

                    if (
                        !haystack.includes(search)
                    ) {
                        return false;
                    }
                }

                return true;
            });

            filtered.sort((a, b) => {
                const aTime =
                    new Date(
                        a.updated_at || 0
                    ).getTime();

                const bTime =
                    new Date(
                        b.updated_at || 0
                    ).getTime();

                return bTime - aTime;
            });

            const summary = {
                total: filtered.length,
                draft:
                    filtered.filter(
                        (item) =>
                            item.verification_status ===
                            "draft"
                    ).length,
                pending:
                    filtered.filter(
                        (item) =>
                            item.verification_status ===
                            "pending"
                    ).length,
                disputed:
                    filtered.filter(
                        (item) =>
                            item.verification_status ===
                            "disputed"
                    ).length
            };

            return res.json({
                success: true,
                count: filtered.length,
                summary,
                items: filtered
            });
        } catch (error) {
            console.error(
                "People Intelligence review queue error:",
                error
            );

            return res.status(500).json({
                success: false,
                message: "读取统一审核队列失败"
            });
        }
    }
);

/*
 * ============================================================
 * PEOPLE INTELLIGENCE
 * CORRECTION CENTER + VERSION HISTORY
 * ============================================================
 */


/*
 * ------------------------------------------------------------
 * Shared helpers
 * ------------------------------------------------------------
 */

function normalizePiEntityType(value) {
    const type = String(value || "")
        .trim()
        .toLowerCase();

    const allowedTypes = new Set([
        "person",
        "organization",
        "relationship",
        "evidence"
    ]);

    return allowedTypes.has(type)
        ? type
        : null;
}


function safeJsonStringify(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return null;
    }

    if (typeof value === "string") {
        return value;
    }

    try {
        return JSON.stringify(value);
    } catch (error) {
        return String(value);
    }
}


async function getNextPiVersionNumber(
    entityType,
    entityId
) {
    const row = await dbGet(
        `
        SELECT
            COALESCE(MAX(version_number), 0) + 1
                AS next_version
        FROM pi_version_history
        WHERE entity_type = ?
          AND entity_id = ?
        `,
        [
            entityType,
            entityId
        ]
    );

    return Number(
        row?.next_version || 1
    );
}


async function writePiVersionHistory({
    entityType,
    entityId,
    actionType,
    changedFields = null,
    beforeData = null,
    afterData = null,
    changeReason = null,
    sourceType = "admin",
    operatorId = null,
    operatorName = null,
    correctionId = null
}) {
    const normalizedType =
        normalizePiEntityType(entityType);

    const numericEntityId =
        Number(entityId);

    if (
        !normalizedType ||
        !Number.isInteger(numericEntityId) ||
        numericEntityId <= 0
    ) {
        throw new Error(
            "Invalid version history entity"
        );
    }

    const versionNumber =
        await getNextPiVersionNumber(
            normalizedType,
            numericEntityId
        );

    const result = await dbRun(
        `
        INSERT INTO pi_version_history (
            entity_type,
            entity_id,
            version_number,
            action_type,
            changed_fields,
            before_data,
            after_data,
            change_reason,
            source_type,
            operator_id,
            operator_name,
            correction_id,
            created_at
        )
        VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            CURRENT_TIMESTAMP
        )
        `,
        [
            normalizedType,
            numericEntityId,
            versionNumber,
            String(
                actionType || "update"
            ),
            safeJsonStringify(
                changedFields
            ),
            safeJsonStringify(
                beforeData
            ),
            safeJsonStringify(
                afterData
            ),
            changeReason || null,
            sourceType || "admin",
            operatorId || null,
            operatorName || null,
            correctionId || null
        ]
    );

    return {
        id: result.lastID,
        version_number: versionNumber
    };
}


/*
 * ------------------------------------------------------------
 * CORRECTION CENTER
 * GET /corrections
 * ------------------------------------------------------------
 */

router.get(
    "/corrections",
    verifyAdminToken,
    async (req, res) => {
        try {
            const status = String(
                req.query.status || "all"
            )
                .trim()
                .toLowerCase();

            const entityType = String(
                req.query.entity_type || "all"
            )
                .trim()
                .toLowerCase();

            const search = String(
                req.query.search || ""
            )
                .trim()
                .toLowerCase();

            const rows = await dbAll(
                `
                SELECT *
                FROM pi_corrections
                ORDER BY
                    CASE status
                        WHEN 'pending' THEN 1
                        WHEN 'reviewing' THEN 2
                        WHEN 'approved' THEN 3
                        WHEN 'rejected' THEN 4
                        WHEN 'applied' THEN 5
                        ELSE 6
                    END,
                    created_at DESC,
                    id DESC
                `
            );

            const filtered =
                rows.filter((row) => {
                    if (
                        status !== "all" &&
                        row.status !== status
                    ) {
                        return false;
                    }

                    if (
                        entityType !== "all" &&
                        row.entity_type !==
                        entityType
                    ) {
                        return false;
                    }

                    if (search) {
                        const haystack = [
                            row.id,
                            row.entity_type,
                            row.entity_id,
                            row.field_name,
                            row.original_value,
                            row.proposed_value,
                            row.correction_reason,
                            row.evidence_description,
                            row.source_name,
                            row.submitter_name,
                            row.submitter_email
                        ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();

                        if (
                            !haystack.includes(
                                search
                            )
                        ) {
                            return false;
                        }
                    }

                    return true;
                });

            const summary = {
                total: filtered.length,
                pending:
                    filtered.filter(
                        (row) =>
                            row.status ===
                            "pending"
                    ).length,
                reviewing:
                    filtered.filter(
                        (row) =>
                            row.status ===
                            "reviewing"
                    ).length,
                approved:
                    filtered.filter(
                        (row) =>
                            row.status ===
                            "approved"
                    ).length,
                rejected:
                    filtered.filter(
                        (row) =>
                            row.status ===
                            "rejected"
                    ).length,
                applied:
                    filtered.filter(
                        (row) =>
                            row.status ===
                            "applied"
                    ).length
            };

            return res.json({
                success: true,
                count: filtered.length,
                summary,
                corrections: filtered
            });
        } catch (error) {
            console.error(
                "People Intelligence corrections list error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "读取纠错中心数据失败"
            });
        }
    }
);


/*
 * ------------------------------------------------------------
 * CORRECTION CENTER
 * GET /corrections/:id
 * ------------------------------------------------------------
 */

router.get(
    "/corrections/:id",
    verifyAdminToken,
    async (req, res) => {
        try {
            const correctionId =
                Number(req.params.id);

            if (
                !Number.isInteger(
                    correctionId
                ) ||
                correctionId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "无效的纠错记录 ID"
                });
            }

            const correction =
                await dbGet(
                    `
                    SELECT *
                    FROM pi_corrections
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [correctionId]
                );

            if (!correction) {
                return res.status(404).json({
                    success: false,
                    message:
                        "纠错记录不存在"
                });
            }

            return res.json({
                success: true,
                correction
            });
        } catch (error) {
            console.error(
                "People Intelligence correction detail error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "读取纠错记录失败"
            });
        }
    }
);


/*
 * ------------------------------------------------------------
 * CORRECTION CENTER
 * POST /corrections
 * ------------------------------------------------------------
 */

router.post(
    "/corrections",
    verifyAdminToken,
    async (req, res) => {
        try {
            const entityType =
                normalizePiEntityType(
                    req.body.entity_type
                );

            const entityId =
                Number(req.body.entity_id);

            if (!entityType) {
                return res.status(400).json({
                    success: false,
                    message:
                        "对象类型无效"
                });
            }

            if (
                !Number.isInteger(entityId) ||
                entityId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "对象 ID 无效"
                });
            }

            const result = await dbRun(
                `
                INSERT INTO pi_corrections (
                    entity_type,
                    entity_id,
                    correction_type,
                    field_name,
                    original_value,
                    proposed_value,
                    correction_reason,
                    evidence_description,
                    evidence_url,
                    submitter_name,
                    submitter_email,
                    submitter_type,
                    status,
                    created_by,
                    updated_by,
                    created_at,
                    updated_at
                )
                VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                    ?, ?, 'pending', ?, ?,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )
                `,
                [
                    entityType,
                    entityId,
                    req.body.correction_type ||
                    "data_correction",
                    req.body.field_name || null,
                    safeJsonStringify(
                        req.body.original_value
                    ),
                    safeJsonStringify(
                        req.body.proposed_value
                    ),
                    req.body.correction_reason ||
                    null,
                    req.body.evidence_description ||
                    null,
                    req.body.evidence_url ||
                    null,
                    req.body.submitter_name ||
                    null,
                    req.body.submitter_email ||
                    null,
                    req.body.submitter_type ||
                    "admin",
                    req.admin?.id || null,
                    req.admin?.id || null
                ]
            );

            const correction =
                await dbGet(
                    `
                    SELECT *
                    FROM pi_corrections
                    WHERE id = ?
                    `,
                    [result.lastID]
                );

            return res.status(201).json({
                success: true,
                message:
                    "纠错记录已创建",
                correction
            });
        } catch (error) {
            console.error(
                "People Intelligence create correction error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "创建纠错记录失败"
            });
        }
    }
);


/*
 * ------------------------------------------------------------
 * CORRECTION CENTER
 * PATCH /corrections/:id/status
 * ------------------------------------------------------------
 */

router.patch(
    "/corrections/:id/status",
    verifyAdminToken,
    async (req, res) => {
        try {
            const correctionId =
                Number(req.params.id);

            const nextStatus = String(
                req.body.status || ""
            )
                .trim()
                .toLowerCase();

            const allowedStatuses =
                new Set([
                    "pending",
                    "reviewing",
                    "approved",
                    "rejected",
                    "applied"
                ]);

            if (
                !Number.isInteger(
                    correctionId
                ) ||
                correctionId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "无效的纠错记录 ID"
                });
            }

            if (
                !allowedStatuses.has(
                    nextStatus
                )
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "无效的纠错状态"
                });
            }

            const before =
                await dbGet(
                    `
                    SELECT *
                    FROM pi_corrections
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [correctionId]
                );

            if (!before) {
                return res.status(404).json({
                    success: false,
                    message:
                        "纠错记录不存在"
                });
            }

            const reviewedAt =
                [
                    "approved",
                    "rejected",
                    "applied"
                ].includes(nextStatus)
                    ? new Date()
                        .toISOString()
                    : null;

            const appliedAt =
                nextStatus === "applied"
                    ? new Date()
                        .toISOString()
                    : null;

            await dbRun(
                `
                UPDATE pi_corrections
                SET
                    status = ?,
                    review_comment = ?,
                    reviewed_by = ?,
                    reviewed_at = ?,
                    applied_at = ?,
                    updated_by = ?,
                    updated_at =
                        CURRENT_TIMESTAMP
                WHERE id = ?
                `,
                [
                    nextStatus,
                    req.body.review_comment ||
                    null,
                    req.admin?.id || null,
                    reviewedAt,
                    appliedAt,
                    req.admin?.id || null,
                    correctionId
                ]
            );

            const after =
                await dbGet(
                    `
                    SELECT *
                    FROM pi_corrections
                    WHERE id = ?
                    `,
                    [correctionId]
                );

            if (
                nextStatus === "approved" ||
                nextStatus === "rejected" ||
                nextStatus === "applied"
            ) {
                await writePiVersionHistory({
                    entityType:
                        before.entity_type,
                    entityId:
                        before.entity_id,
                    actionType:
                        `correction_${nextStatus}`,
                    changedFields: [
                        before.field_name ||
                        "correction"
                    ],
                    beforeData: {
                        correction_status:
                            before.status,
                        original_value:
                            before.original_value
                    },
                    afterData: {
                        correction_status:
                            after.status,
                        proposed_value:
                            after.proposed_value
                    },
                    changeReason:
                        req.body.review_comment ||
                        before.correction_reason ||
                        null,
                    sourceType:
                        "correction",
                    operatorId:
                        req.admin?.id || null,
                    operatorName:
                        req.admin?.username ||
                        req.admin?.email ||
                        null,
                    correctionId
                });
            }

            return res.json({
                success: true,
                message:
                    "纠错状态已更新",
                correction: after
            });
        } catch (error) {
            console.error(
                "People Intelligence correction status error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "更新纠错状态失败"
            });
        }
    }
);


/*
 * ------------------------------------------------------------
 * VERSION HISTORY
 * GET /versions
 * ------------------------------------------------------------
 */

router.get(
    "/versions",
    verifyAdminToken,
    async (req, res) => {
        try {
            const entityType = String(
                req.query.entity_type || "all"
            )
                .trim()
                .toLowerCase();

            const entityId =
                req.query.entity_id
                    ? Number(
                        req.query.entity_id
                    )
                    : null;

            const actionType = String(
                req.query.action_type || "all"
            )
                .trim()
                .toLowerCase();

            const search = String(
                req.query.search || ""
            )
                .trim()
                .toLowerCase();

            const rows = await dbAll(
                `
                SELECT *
                FROM pi_version_history
                ORDER BY
                    created_at DESC,
                    id DESC
                `
            );

            const filtered =
                rows.filter((row) => {
                    if (
                        entityType !== "all" &&
                        row.entity_type !==
                        entityType
                    ) {
                        return false;
                    }

                    if (
                        entityId &&
                        Number(row.entity_id) !==
                        entityId
                    ) {
                        return false;
                    }

                    if (
                        actionType !== "all" &&
                        String(
                            row.action_type ||
                            ""
                        ).toLowerCase() !==
                        actionType
                    ) {
                        return false;
                    }

                    if (search) {
                        const haystack = [
                            row.entity_type,
                            row.entity_id,
                            row.version_number,
                            row.action_type,
                            row.changed_fields,
                            row.change_reason,
                            row.operator_name,
                            row.source_type
                        ]
                            .filter(Boolean)
                            .join(" ")
                            .toLowerCase();

                        if (
                            !haystack.includes(
                                search
                            )
                        ) {
                            return false;
                        }
                    }

                    return true;
                });

            return res.json({
                success: true,
                count: filtered.length,
                versions: filtered
            });
        } catch (error) {
            console.error(
                "People Intelligence versions list error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "读取版本历史失败"
            });
        }
    }
);


/*
 * ------------------------------------------------------------
 * VERSION HISTORY
 * GET /versions/entity/:type/:id
 * ------------------------------------------------------------
 */

router.get(
    "/versions/entity/:type/:id",
    verifyAdminToken,
    async (req, res) => {
        try {
            const entityType =
                normalizePiEntityType(
                    req.params.type
                );

            const entityId =
                Number(req.params.id);

            if (!entityType) {
                return res.status(400).json({
                    success: false,
                    message:
                        "对象类型无效"
                });
            }

            if (
                !Number.isInteger(entityId) ||
                entityId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "对象 ID 无效"
                });
            }

            const versions =
                await dbAll(
                    `
                    SELECT *
                    FROM pi_version_history
                    WHERE entity_type = ?
                      AND entity_id = ?
                    ORDER BY
                        version_number DESC,
                        id DESC
                    `,
                    [
                        entityType,
                        entityId
                    ]
                );

            return res.json({
                success: true,
                count: versions.length,
                entity_type:
                    entityType,
                entity_id:
                    entityId,
                versions
            });
        } catch (error) {
            console.error(
                "People Intelligence entity versions error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "读取对象版本历史失败"
            });
        }
    }
);


/*
 * ------------------------------------------------------------
 * VERSION HISTORY
 * GET /versions/:id
 *
 * 注意：
 * 必须放在 /versions/entity/:type/:id 后面。
 * ------------------------------------------------------------
 */

router.get(
    "/versions/:id",
    verifyAdminToken,
    async (req, res) => {
        try {
            const versionId =
                Number(req.params.id);

            if (
                !Number.isInteger(versionId) ||
                versionId <= 0
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "无效的版本记录 ID"
                });
            }

            const version =
                await dbGet(
                    `
                    SELECT *
                    FROM pi_version_history
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [versionId]
                );

            if (!version) {
                return res.status(404).json({
                    success: false,
                    message:
                        "版本记录不存在"
                });
            }

            return res.json({
                success: true,
                version
            });
        } catch (error) {
            console.error(
                "People Intelligence version detail error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "读取版本记录失败"
            });
        }
    }
);

module.exports = router;