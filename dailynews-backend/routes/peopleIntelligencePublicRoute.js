const express = require("express");
const db = require("../db");

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

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row || null);
        });
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows || []);
        });
    });
}

function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

/* =========================================================
   公开实体检索查询
========================================================= */

async function findPublishedPerson(query) {
    const keyword = `%${query}%`;
    return dbGet(
        `
          SELECT
            id, slug, name_zh, name_en, aliases, birth_date, death_date,
            nationality, country_region, primary_role, biography, tags,
            profile_image_url, confidence_level, updated_at
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
        [query, query, query, keyword, keyword, keyword, query, query, query]
    );
}

async function findPublishedOrganization(query) {
    const keyword = `%${query}%`;
    return dbGet(
        `
          SELECT
            id, slug, name_zh, name_en, aliases, organization_type,
            country_region, headquarters, founded_date, industry,
            industry_primary, industry_secondary, description, website_url,
            logo_url, listed_status, ticker_symbol, exchange_name, isin, lei,
            confidence_level, data_updated_at, updated_at
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
        [query, query, query, query, query, query, keyword, keyword, keyword, keyword, query, query, query, query]
    );
}

/* =========================================================
   多度关系与拓扑抽取（支持二度穿透）
========================================================= */

async function getPublishedRelationships(entityType, entityId) {
    // 1. 查询一度直接关联
    const firstDegree = await dbAll(
        `
          SELECT
            r.*,
            rt.name_zh AS relationship_name_zh,
            rt.name_en AS relationship_name_en,
            rt.category AS relationship_category,
            CASE
              WHEN r.source_entity_type = 'person' THEN (SELECT COALESCE(NULLIF(p.name_zh, ''), p.name_en) FROM pi_people p WHERE p.id = r.source_entity_id AND p.is_public = 1)
              WHEN r.source_entity_type = 'organization' THEN (SELECT COALESCE(NULLIF(o.name_zh, ''), o.name_en) FROM pi_organizations o WHERE o.id = r.source_entity_id AND o.is_public = 1)
              ELSE NULL
            END AS source_entity_name,
            CASE
              WHEN r.target_entity_type = 'person' THEN (SELECT COALESCE(NULLIF(p.name_zh, ''), p.name_en) FROM pi_people p WHERE p.id = r.target_entity_id AND p.is_public = 1)
              WHEN r.target_entity_type = 'organization' THEN (SELECT COALESCE(NULLIF(o.name_zh, ''), o.name_en) FROM pi_organizations o WHERE o.id = r.target_entity_id AND o.is_public = 1)
              ELSE NULL
            END AS target_entity_name
          FROM pi_relationships r
          LEFT JOIN pi_relationship_types rt ON rt.code = r.relationship_type
          WHERE r.verification_status = 'verified'
            AND r.is_public = 1
            AND (
              (r.source_entity_type = ? AND r.source_entity_id = ?)
              OR
              (r.target_entity_type = ? AND r.target_entity_id = ?)
            )
          ORDER BY r.is_current DESC, r.updated_at DESC
        `,
        [entityType, entityId, entityType, entityId]
    );

    const validFirstDegree = firstDegree.filter(r => r.source_entity_name && r.target_entity_name);
    const seenRelIds = new Set(validFirstDegree.map(r => r.id));
    const allRelationships = [...validFirstDegree];

    // 2. 收集一度目标节点，穿透查询二度关系（如企业的子公司或关联人）
    const secondDegreeTargets = [];
    validFirstDegree.forEach(r => {
        const isSource = r.source_entity_type === entityType && Number(r.source_entity_id) === Number(entityId);
        const nextType = isSource ? r.target_entity_type : r.source_entity_type;
        const nextId = isSource ? r.target_entity_id : r.source_entity_id;
        secondDegreeTargets.push({ type: nextType, id: nextId });
    });

    for (const target of secondDegreeTargets.slice(0, 10)) { // 限制最多穿透前10个核心实体，保证查询性能
        const secondDegree = await dbAll(
            `
              SELECT
                r.*,
                rt.name_zh AS relationship_name_zh,
                rt.name_en AS relationship_name_en,
                rt.category AS relationship_category,
                CASE
                  WHEN r.source_entity_type = 'person' THEN (SELECT COALESCE(NULLIF(p.name_zh, ''), p.name_en) FROM pi_people p WHERE p.id = r.source_entity_id AND p.is_public = 1)
                  WHEN r.source_entity_type = 'organization' THEN (SELECT COALESCE(NULLIF(o.name_zh, ''), o.name_en) FROM pi_organizations o WHERE o.id = r.source_entity_id AND o.is_public = 1)
                  ELSE NULL
                END AS source_entity_name,
                CASE
                  WHEN r.target_entity_type = 'person' THEN (SELECT COALESCE(NULLIF(p.name_zh, ''), p.name_en) FROM pi_people p WHERE p.id = r.target_entity_id AND p.is_public = 1)
                  WHEN r.target_entity_type = 'organization' THEN (SELECT COALESCE(NULLIF(o.name_zh, ''), o.name_en) FROM pi_organizations o WHERE o.id = r.target_entity_id AND o.is_public = 1)
                  ELSE NULL
                END AS target_entity_name
              FROM pi_relationships r
              LEFT JOIN pi_relationship_types rt ON rt.code = r.relationship_type
              WHERE r.verification_status = 'verified'
                AND r.is_public = 1
                AND (
                  (r.source_entity_type = ? AND r.source_entity_id = ?)
                  OR
                  (r.target_entity_type = ? AND r.target_entity_id = ?)
                )
              LIMIT 6
            `,
            [target.type, target.id, target.type, target.id]
        );

        secondDegree.forEach(rel => {
            if (!seenRelIds.has(rel.id) && rel.source_entity_name && rel.target_entity_name) {
                seenRelIds.add(rel.id);
                allRelationships.push(rel);
            }
        });
    }

    return allRelationships;
}

async function getVerifiedEvidenceForRelationships(relationshipIds) {
    if (!Array.isArray(relationshipIds) || relationshipIds.length === 0) {
        return [];
    }
    const placeholders = relationshipIds.map(() => "?").join(",");
    return dbAll(
        `
          SELECT
            id, entity_type, entity_id, evidence_type, source_name, source_title,
            source_url, publisher, published_at, retrieved_at, evidence_summary,
            source_tier, confidence_level, is_primary_source, archived_url, updated_at
          FROM pi_evidence
          WHERE entity_type = 'relationship'
            AND verification_status = 'verified'
            AND entity_id IN (${placeholders})
          ORDER BY is_primary_source DESC, updated_at DESC
        `,
        relationshipIds
    );
}

/* =========================================================
   GET /search?q=... (主公开检索路由)
========================================================= */

router.get("/search", async (req, res) => {
    const query = normalizeText(req.query.q);
    if (!query) {
        return res.status(400).json({ success: false, message: "请输入搜索关键词" });
    }

    try {
        const person = await findPublishedPerson(query);
        const organization = person ? null : await findPublishedOrganization(query);

        if (!person && !organization) {
            return res.status(404).json({
                success: false,
                found: false,
                query,
                message: "暂未找到已核验并已发布的公开情报数据"
            });
        }

        const entityType = person ? "person" : "organization";
        const entity = person || organization;

        const relationships = await getPublishedRelationships(entityType, entity.id);
        const evidence = await getVerifiedEvidenceForRelationships(relationships.map(r => r.id));

        const evidenceMap = {};
        evidence.forEach(item => {
            const key = String(item.entity_id);
            if (!evidenceMap[key]) evidenceMap[key] = [];
            evidenceMap[key].push(item);
        });

        const relationshipResults = relationships.map(item => ({
            ...item,
            evidence: evidenceMap[String(item.id)] || []
        }));

        return res.json({
            success: true,
            found: true,
            query,
            entity_type: entityType,
            entity,
            relationships: relationshipResults,
            summary: {
                relationship_count: relationshipResults.length,
                verified_evidence_count: evidence.length
            }
        });
    } catch (error) {
        console.error("People Intelligence public search error:", error);
        return res.status(500).json({
            success: false,
            message: "读取公开人谱情报数据失败"
        });
    }
});

/* =========================================================
   POST /corrections (公众提交纠错)
========================================================= */

router.post("/corrections", async (req, res) => {
    try {
        const entityType = normalizeText(req.body.entity_type).toLowerCase();
        const entityId = Number(req.body.entity_id);
        const items = Array.isArray(req.body.items) ? req.body.items : [];
        const correctionReason = normalizeText(req.body.correction_reason);
        const evidenceUrl = normalizeText(req.body.evidence_url);
        const submitterName = normalizeText(req.body.submitter_name);
        const submitterEmail = normalizeText(req.body.submitter_email);

        if (entityType !== "person" && entityType !== "organization") {
            return res.status(400).json({ success: false, message: "纠错对象类型无效" });
        }
        if (!Number.isInteger(entityId) || entityId <= 0) {
            return res.status(400).json({ success: false, message: "纠错对象 ID 无效" });
        }
        if (items.length < 1 || items.length > 9) {
            return res.status(400).json({ success: false, message: "请选择 1~9 个纠错字段" });
        }
        if (!correctionReason) {
            return res.status(400).json({ success: false, message: "请填写纠错原因" });
        }

        const createdCorrections = [];
        for (const item of items) {
            const result = await dbRun(
                `
                INSERT INTO pi_corrections (
                    entity_type, entity_id, correction_type, field_name,
                    original_value, proposed_value, correction_reason,
                    evidence_url, submitter_name, submitter_email,
                    submitter_type, status, created_at, updated_at
                )
                VALUES (
                    ?, ?, 'data_correction', ?,
                    ?, ?, ?,
                    ?, ?, ?,
                    'public', 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                `,
                [
                    entityType,
                    entityId,
                    normalizeText(item.field_name),
                    JSON.stringify(item.originalValue || ""),
                    JSON.stringify(item.proposed_value || ""),
                    correctionReason,
                    evidenceUrl || null,
                    submitterName || null,
                    submitterEmail || null
                ]
            );
            createdCorrections.push({ id: result.lastID, field_name: item.field_name });
        }

        return res.status(201).json({
            success: true,
            message: "纠错申请已提交，等待管理员审核",
            count: createdCorrections.length,
            corrections: createdCorrections
        });
    } catch (error) {
        console.error("Public correction error:", error);
        return res.status(500).json({ success: false, message: "提交纠错申请失败" });
    }
});

module.exports = router;