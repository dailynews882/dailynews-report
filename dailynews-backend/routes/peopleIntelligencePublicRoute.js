const express = require("express");
const db = require("../db");

const router = express.Router();


/* =========================================================
   Helpers
========================================================= */

function normalizeText(value) {
    if (
        value === undefined ||
        value === null
    ) {
        return "";
    }

    return String(value).trim();
}


function dbGet(
    sql,
    params = []
) {
    return new Promise(
        (resolve, reject) => {
            db.get(
                sql,
                params,
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    resolve(row || null);
                }
            );
        }
    );
}


function dbAll(
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


/* =========================================================
   Public search helpers
========================================================= */

async function findPublishedPerson(
    query
) {
    const keyword =
        `%${query}%`;

    return dbGet(
        `
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
            confidence_level,
            updated_at
          FROM pi_people
          WHERE verification_status = 'verified'
            AND record_status = 'active'
            AND is_public = 1
            AND (
              name_zh = ?
              OR name_en = ?
              OR slug = ?
              OR aliases LIKE ?
              OR name_zh LIKE ?
              OR name_en LIKE ?
            )
          ORDER BY
            CASE
              WHEN name_zh = ? THEN 1
              WHEN name_en = ? THEN 2
              WHEN slug = ? THEN 3
              ELSE 4
            END,
            updated_at DESC
          LIMIT 1
        `,
        [
            query,
            query,
            query,
            keyword,
            keyword,
            keyword,
            query,
            query,
            query
        ]
    );
}


async function findPublishedOrganization(
    query
) {
    const keyword =
        `%${query}%`;

    return dbGet(
        `
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
            confidence_level,
            data_updated_at,
            updated_at
          FROM pi_organizations
          WHERE verification_status = 'verified'
            AND record_status = 'active'
            AND is_public = 1
            AND (
              name_zh = ?
              OR name_en = ?
              OR slug = ?
              OR ticker_symbol = ?
              OR isin = ?
              OR lei = ?
              OR aliases LIKE ?
              OR name_zh LIKE ?
              OR name_en LIKE ?
              OR ticker_symbol LIKE ?
            )
          ORDER BY
            CASE
              WHEN name_zh = ? THEN 1
              WHEN name_en = ? THEN 2
              WHEN ticker_symbol = ? THEN 3
              WHEN slug = ? THEN 4
              ELSE 5
            END,
            updated_at DESC
          LIMIT 1
        `,
        [
            query,
            query,
            query,
            query,
            query,
            query,
            keyword,
            keyword,
            keyword,
            keyword,
            query,
            query,
            query,
            query
        ]
    );
}


async function getPublishedRelationships(
    entityType,
    entityId
) {
    return dbAll(
        `
          SELECT
            r.id,
            r.source_entity_type,
            r.source_entity_id,
            r.target_entity_type,
            r.target_entity_id,
            r.relationship_type,
            r.role_title,
            r.ownership_percentage,
            r.voting_percentage,
            r.investment_amount,
            r.currency,
            r.start_date,
            r.end_date,
            r.relationship_status,
            r.description,
            r.confidence_level,
            r.is_current,
            r.updated_at,

            rt.name_zh AS relationship_name_zh,
            rt.name_en AS relationship_name_en,
            rt.category AS relationship_category,

            CASE
              WHEN r.source_entity_type = 'person'
              THEN (
                SELECT COALESCE(
                  NULLIF(p.name_zh, ''),
                  p.name_en
                )
                FROM pi_people p
                WHERE p.id = r.source_entity_id
                  AND p.verification_status = 'verified'
                  AND p.record_status = 'active'
                  AND p.is_public = 1
              )

              WHEN r.source_entity_type = 'organization'
              THEN (
                SELECT COALESCE(
                  NULLIF(o.name_zh, ''),
                  o.name_en
                )
                FROM pi_organizations o
                WHERE o.id = r.source_entity_id
                  AND o.verification_status = 'verified'
                  AND o.record_status = 'active'
                  AND o.is_public = 1
              )

              ELSE NULL
            END AS source_entity_name,

            CASE
              WHEN r.target_entity_type = 'person'
              THEN (
                SELECT COALESCE(
                  NULLIF(p.name_zh, ''),
                  p.name_en
                )
                FROM pi_people p
                WHERE p.id = r.target_entity_id
                  AND p.verification_status = 'verified'
                  AND p.record_status = 'active'
                  AND p.is_public = 1
              )

              WHEN r.target_entity_type = 'organization'
              THEN (
                SELECT COALESCE(
                  NULLIF(o.name_zh, ''),
                  o.name_en
                )
                FROM pi_organizations o
                WHERE o.id = r.target_entity_id
                  AND o.verification_status = 'verified'
                  AND o.record_status = 'active'
                  AND o.is_public = 1
              )

              ELSE NULL
            END AS target_entity_name,

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

          WHERE r.verification_status = 'verified'
            AND r.is_public = 1
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

          ORDER BY
            r.is_current DESC,
            r.updated_at DESC,
            r.id DESC
        `,
        [
            entityType,
            entityId,
            entityType,
            entityId
        ]
    );
}


function keepFullyPublishedRelationships(
    rows
) {
    return rows.filter(
        (row) =>
            row.source_entity_name &&
            row.target_entity_name
    );
}


async function getVerifiedEvidenceForRelationships(
    relationshipIds
) {
    if (
        !Array.isArray(relationshipIds) ||
        relationshipIds.length === 0
    ) {
        return [];
    }

    const placeholders =
        relationshipIds
            .map(() => "?")
            .join(",");

    return dbAll(
        `
          SELECT
            id,
            entity_type,
            entity_id,
            evidence_type,
            source_name,
            source_title,
            source_url,
            publisher,
            published_at,
            retrieved_at,
            evidence_summary,
            source_tier,
            confidence_level,
            is_primary_source,
            archived_url,
            updated_at
          FROM pi_evidence
          WHERE entity_type = 'relationship'
            AND verification_status = 'verified'
            AND entity_id IN (${placeholders})
          ORDER BY
            is_primary_source DESC,
            updated_at DESC,
            id DESC
        `,
        relationshipIds
    );
}


/* =========================================================
   GET /search?q=...
   Public People Intelligence Search V1

   公开规则：
   1. 主实体必须 verified + active + is_public = 1
   2. 关系必须 verified + is_public = 1
   3. 关系两端实体都必须是公开且已核验状态
   4. Evidence 只返回 verified
========================================================= */

router.get(
    "/search",
    async (req, res) => {
        const query =
            normalizeText(
                req.query.q
            );

        if (!query) {
            return res.status(400).json({
                success: false,
                message: "请输入搜索关键词"
            });
        }

        try {
            const person =
                await findPublishedPerson(
                    query
                );

            const organization =
                person
                    ? null
                    : await findPublishedOrganization(
                        query
                    );

            if (
                !person &&
                !organization
            ) {
                return res.status(404).json({
                    success: false,
                    found: false,
                    query,
                    message:
                        "暂未找到已核验并已发布的公开情报数据"
                });
            }

            const entityType =
                person
                    ? "person"
                    : "organization";

            const entity =
                person || organization;

            const rawRelationships =
                await getPublishedRelationships(
                    entityType,
                    entity.id
                );

            const relationships =
                keepFullyPublishedRelationships(
                    rawRelationships
                );

            const evidence =
                await getVerifiedEvidenceForRelationships(
                    relationships.map(
                        (item) => item.id
                    )
                );

            const evidenceByRelationship =
                {};

            evidence.forEach(
                (item) => {
                    const key =
                        String(
                            item.entity_id
                        );

                    if (
                        !evidenceByRelationship[
                        key
                        ]
                    ) {
                        evidenceByRelationship[
                            key
                        ] = [];
                    }

                    evidenceByRelationship[
                        key
                    ].push(item);
                }
            );

            const relationshipResults =
                relationships.map(
                    (item) => ({
                        ...item,
                        evidence:
                            evidenceByRelationship[
                            String(item.id)
                            ] || []
                    })
                );

            return res.json({
                success: true,
                found: true,
                query,
                entity_type: entityType,
                entity,
                relationships:
                    relationshipResults,
                summary: {
                    relationship_count:
                        relationshipResults.length,
                    verified_evidence_count:
                        evidence.length
                }
            });
        } catch (error) {
            console.error(
                "People Intelligence public search error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "读取公开人谱情报数据失败"
            });
        }
    }
);


module.exports = router;