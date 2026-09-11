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

module.exports = router;