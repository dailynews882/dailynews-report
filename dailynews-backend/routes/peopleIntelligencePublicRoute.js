const express = require("express");
const db = require("../db");

const router = express.Router();

// V11: isolated, read-only GLEIF + SEC endpoints. No local database writes.
router.use("/data-sources", require("./piExternalDataSourcesRoute"));

function normalizeText(value) {
    return value === undefined || value === null ? "" : String(value).trim();
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
    });
}

function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
}

function normalizeRelationshipType(value) {
    return normalizeText(value).toLowerCase().replace(/\s+/g, "_");
}

function getOtherAvatar(row, isSource) {
    return isSource ? normalizeText(row.target_avatar) : normalizeText(row.source_avatar);
}

function getRelationshipPerspective(row, corePersonId) {
    const isSource =
        row.source_entity_type === "person" &&
        Number(row.source_entity_id) === Number(corePersonId);

    const isTarget =
        row.target_entity_type === "person" &&
        Number(row.target_entity_id) === Number(corePersonId);

    if (!isSource && !isTarget) return null;

    return {
        isSource,
        otherId: isSource ? row.target_entity_id : row.source_entity_id,
        otherType: isSource ? row.target_entity_type : row.source_entity_type,
        otherName: isSource ? row.target_name : row.source_name,
        otherAvatar: getOtherAvatar(row, isSource),
        otherGender: normalizeText(isSource ? row.target_gender : row.source_gender).toLowerCase()
    };
}

function classifyPersonRelationship(row, perspective) {
    const type = normalizeRelationshipType(row.relationship_type);
    const label = normalizeText(row.relationship_label).toLowerCase();
    const isSource = perspective.isSource;

    // relationship_type 的方向以 source -> target 为准。
    // 例如 A child_of B：A 是 B 的子女；从 A 看 B 是 parent，从 B 看 A 是 child。
    if (["father_of", "mother_of", "parent_of"].includes(type)) {
        return isSource ? "child" : "parent";
    }

    if (["son_of", "daughter_of", "child_of"].includes(type)) {
        return isSource ? "parent" : "child";
    }

    if (["spouse_of", "husband_of", "wife_of", "partner_of"].includes(type)) {
        return "spouse";
    }

    if (["sibling_of", "brother_of", "sister_of", "relative_of"].includes(type)) {
        return "relative";
    }

    // 兼容旧数据中的中文 relationship_label。标签同样按 source -> target 解读。
    if (label.includes("配偶") || label.includes("妻") || label.includes("丈夫") || label.includes("夫")) {
        return "spouse";
    }

    if (label.includes("父亲") || label.includes("母亲") || label === "父" || label === "母" || label.includes("父母")) {
        return isSource ? "child" : "parent";
    }

    if (label.includes("儿子") || label.includes("女儿") || label === "子" || label === "女" || label.includes("子女")) {
        return isSource ? "parent" : "child";
    }

    return "relative";
}

const HAN_VARIANT_PAIRS = [["鸿", "鴻"], ["云", "雲"], ["泽", "澤"], ["铭", "銘"], ["华", "華"], ["龙", "龍"], ["凤", "鳳"], ["国", "國"], ["东", "東"], ["马", "馬"], ["陈", "陳"], ["刘", "劉"], ["杨", "楊"], ["赵", "趙"], ["孙", "孫"], ["张", "張"], ["吴", "吳"], ["郑", "鄭"], ["叶", "葉"], ["钟", "鍾"], ["卢", "盧"], ["罗", "羅"], ["谢", "謝"], ["许", "許"], ["冯", "馮"], ["苏", "蘇"], ["黄", "黃"]];
function buildNameVariants(value) { const base = normalizeText(value); if (!base) return []; const s = new Set([base]); for (let r = 0; r < 2; r++)for (const cur of [...s]) for (const [a, b] of HAN_VARIANT_PAIRS) { if (cur.includes(a)) s.add(cur.split(a).join(b)); if (cur.includes(b)) s.add(cur.split(b).join(a)); } return [...s].slice(0, 24); }
async function findPublicPersonByExternalIdentity(query) { const q = normalizeText(query).toUpperCase(); if (!/^Q\d+$/.test(q)) return null; return dbGet(`SELECT p.* FROM pi_external_identities x JOIN pi_people p ON x.entity_type='person' AND x.entity_id=p.id WHERE x.provider='wikidata' AND upper(x.external_id)=? AND p.record_status='active' AND p.verification_status='verified' AND p.is_public=1 ORDER BY x.is_primary DESC,x.id ASC LIMIT 1`, [q]); }

async function findPerson(query) {
    const raw = normalizeText(query); if (!raw) return null;
    const byQid = await findPublicPersonByExternalIdentity(raw); if (byQid) return byQid;
    const variants = buildNameVariants(raw);
    for (const c of variants) { const p = await dbGet(`SELECT * FROM pi_people WHERE record_status='active' AND verification_status='verified' AND is_public=1 AND (name_zh=? OR lower(trim(name_en))=lower(trim(?))) ORDER BY CASE WHEN name_zh=? THEN 1 ELSE 2 END,id ASC LIMIT 1`, [c, c, c]); if (p) return p; }
    for (const c of variants) { const k = `%${c}%`; const p = await dbGet(`SELECT * FROM pi_people WHERE record_status='active' AND verification_status='verified' AND is_public=1 AND (aliases LIKE ? OR name_zh LIKE ? OR name_en LIKE ?) ORDER BY id ASC LIMIT 1`, [k, k, k]); if (p) return p; }
    return null;
}

async function getUniqueRelationships(personId) {
    return dbAll(
        `SELECT
            r.id,
            r.source_entity_type,
            r.source_entity_id,
            r.target_entity_type,
            r.target_entity_id,
            r.relationship_type,
            r.relationship_label,
            r.direction_type,
            r.role_title,
            r.ownership_percentage,
            r.voting_percentage,
            r.investment_amount,
            r.currency,
            r.is_control_relationship,
            r.start_date,
            r.end_date,
            r.relationship_status,
            r.is_current,
            r.description,
            r.notes,
            r.verification_status,
            r.confidence_level,
            r.is_public,

            CASE
              WHEN r.source_entity_type = 'person'
                THEN (
                    SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                    FROM pi_people
                    WHERE id = r.source_entity_id
                      AND record_status = 'active'
                      AND verification_status = 'verified'
                      AND is_public = 1
                )
              WHEN r.source_entity_type = 'organization'
                THEN (
                    SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                    FROM pi_organizations
                    WHERE id = r.source_entity_id
                      AND record_status = 'active'
                      AND verification_status = 'verified'
                      AND is_public = 1
                )
              ELSE NULL
            END AS source_name,

            CASE
              WHEN r.target_entity_type = 'person'
                THEN (
                    SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                    FROM pi_people
                    WHERE id = r.target_entity_id
                      AND record_status = 'active'
                      AND verification_status = 'verified'
                      AND is_public = 1
                )
              WHEN r.target_entity_type = 'organization'
                THEN (
                    SELECT COALESCE(NULLIF(name_zh, ''), name_en)
                    FROM pi_organizations
                    WHERE id = r.target_entity_id
                      AND record_status = 'active'
                      AND verification_status = 'verified'
                      AND is_public = 1
                )
              ELSE NULL
            END AS target_name,

            CASE
              WHEN r.source_entity_type = 'person'
                THEN (
                    SELECT profile_image_url
                    FROM pi_people
                    WHERE id = r.source_entity_id
                      AND record_status = 'active'
                      AND verification_status = 'verified'
                      AND is_public = 1
                )
              ELSE ''
            END AS source_avatar,

            CASE
              WHEN r.target_entity_type = 'person'
                THEN (
                    SELECT profile_image_url
                    FROM pi_people
                    WHERE id = r.target_entity_id
                      AND record_status = 'active'
                      AND verification_status = 'verified'
                      AND is_public = 1
                )
              ELSE ''
            END AS target_avatar,

            CASE
              WHEN r.source_entity_type = 'person'
                THEN (SELECT gender FROM pi_people WHERE id = r.source_entity_id)
              ELSE ''
            END AS source_gender,

            CASE
              WHEN r.target_entity_type = 'person'
                THEN (SELECT gender FROM pi_people WHERE id = r.target_entity_id)
              ELSE ''
            END AS target_gender

         FROM pi_relationships r
         WHERE r.verification_status = 'verified'
           AND r.is_public = 1
           AND COALESCE(r.relationship_status, 'current') <> 'deleted'
           AND (
                (r.source_entity_type = 'person' AND r.source_entity_id = ?)
                OR
                (r.target_entity_type = 'person' AND r.target_entity_id = ?)
           )
         ORDER BY r.id ASC`,
        [personId, personId]
    );
}

function dedupeRelationships(rows) {
    const result = [];
    const seen = new Set();

    for (const row of rows) {
        const key = [
            row.source_entity_type,
            row.source_entity_id,
            row.target_entity_type,
            row.target_entity_id,
            normalizeRelationshipType(row.relationship_type),
            normalizeText(row.relationship_label)
        ].join("|");

        if (seen.has(key)) continue;
        seen.add(key);
        result.push(row);
    }

    return result;
}

function pushUniqueById(list, item) {
    if (!item || item.id === undefined || item.id === null) return;

    if (list.some(existing => Number(existing.id) === Number(item.id))) return;

    list.push(item);
}

function getKinshipLabel(category, perspective) {
    const gender = normalizeText(perspective.otherGender).toLowerCase();
    const male = ["male", "m", "男", "男性"].includes(gender);
    const female = ["female", "f", "女", "女性"].includes(gender);

    if (category === "parent") return male ? "父亲" : female ? "母亲" : "父母";
    if (category === "child") return male ? "儿子" : female ? "女儿" : "子女";
    if (category === "spouse") return male ? "丈夫" : female ? "妻子" : "配偶";
    if (category === "relative") return "亲属";
    return "关系";
}

function buildPersonObject(row, perspective, category) {
    return {
        id: perspective.otherId,
        name: normalizeText(perspective.otherName),
        avatar: normalizeText(perspective.otherAvatar),
        rel: normalizeText(row.relationship_label) || normalizeText(row.relationship_type) || "关系",
        kinship_label: getKinshipLabel(category, perspective),
        gender: normalizeText(perspective.otherGender),
        relationship_type: normalizeRelationshipType(row.relationship_type),
        relationship_id: row.id
    };
}

function buildEnterpriseObject(row, perspective) {
    return {
        id: perspective.otherId,
        name: normalizeText(perspective.otherName),
        role:
            normalizeText(row.role_title) ||
            normalizeText(row.relationship_label) ||
            normalizeText(row.relationship_type) ||
            "关联机构",
        relationship_type: normalizeRelationshipType(row.relationship_type),
        relationship_id: row.id,
        ownership_percentage: row.ownership_percentage,
        voting_percentage: row.voting_percentage,
        investment_amount: row.investment_amount,
        currency: normalizeText(row.currency),
        is_control_relationship: Number(row.is_control_relationship || 0),
        relationship_status: normalizeText(row.relationship_status),
        is_current: Number(row.is_current ?? 1)
    };
}

function buildStandardRelationship(row, corePersonId) {
    const perspective = getRelationshipPerspective(row, corePersonId);

    return {
        id: row.id,
        source: {
            type: row.source_entity_type,
            id: row.source_entity_id,
            name: normalizeText(row.source_name),
            avatar: normalizeText(row.source_avatar)
        },
        target: {
            type: row.target_entity_type,
            id: row.target_entity_id,
            name: normalizeText(row.target_name),
            avatar: normalizeText(row.target_avatar)
        },
        relationship_type: normalizeRelationshipType(row.relationship_type),
        relationship_label: normalizeText(row.relationship_label),
        direction_type: normalizeText(row.direction_type) || "directed",
        role_title: normalizeText(row.role_title),
        ownership_percentage: row.ownership_percentage,
        voting_percentage: row.voting_percentage,
        investment_amount: row.investment_amount,
        currency: normalizeText(row.currency),
        is_control_relationship: Number(row.is_control_relationship || 0),
        start_date: normalizeText(row.start_date),
        end_date: normalizeText(row.end_date),
        relationship_status: normalizeText(row.relationship_status),
        is_current: Number(row.is_current ?? 1),
        description: normalizeText(row.description),
        notes: normalizeText(row.notes),
        confidence_level: normalizeText(row.confidence_level),
        core_perspective: perspective
            ? {
                core_is_source: perspective.isSource,
                other_entity_type: perspective.otherType,
                other_entity_id: perspective.otherId
            }
            : null
    };
}


// =========================================================
// V8.2 Family Unit Engine
// 只依据数据库 parent_of / spouse_of 事实进行分房，不按姓名硬编码。
// 核心规则：核心人物的子女 ∩ 配偶的子女 = 双方共同子女。
// =========================================================
async function getVerifiedChildIds(parentId) {
    const rows = await dbAll(
        `SELECT DISTINCT r.target_entity_id AS child_id
         FROM pi_relationships r
         JOIN pi_people p ON p.id = r.target_entity_id
         WHERE r.source_entity_type = 'person'
           AND r.target_entity_type = 'person'
           AND r.relationship_type = 'parent_of'
           AND r.source_entity_id = ?
           AND r.verification_status = 'verified'
           AND r.is_public = 1
           AND COALESCE(r.relationship_status, 'current') <> 'deleted'
           AND p.record_status = 'active'
           AND p.verification_status = 'verified'
           AND p.is_public = 1`,
        [parentId]
    );
    return new Set(rows.map(row => Number(row.child_id)));
}

async function buildFamilyUnits(corePersonId, spouses, children) {
    const coreChildIds = new Set(children.map(child => Number(child.id)));
    const assignedChildIds = new Set();
    const familyUnits = [];

    for (const spouse of spouses) {
        const spouseChildIds = await getVerifiedChildIds(spouse.id);

        const sharedChildren = children.filter(child =>
            coreChildIds.has(Number(child.id)) &&
            spouseChildIds.has(Number(child.id))
        );

        sharedChildren.forEach(child => assignedChildIds.add(Number(child.id)));

        familyUnits.push({
            spouse: { ...spouse },
            children: sharedChildren.map(child => ({ ...child }))
        });
    }

    return {
        familyUnits,
        unassignedChildren: children.filter(
            child => !assignedChildIds.has(Number(child.id))
        )
    };
}


// V8.3-C: public, verified commercial intelligence (read-only).
router.get('/people/:id/business-intelligence', async (req, res) => {
    const personId = Number(req.params.id);
    if (!Number.isSafeInteger(personId) || personId < 1) return res.status(400).json({ success: false, message: '无效人物 ID' });
    try {
        const person = await dbGet("SELECT id FROM pi_people WHERE id=? AND record_status='active' AND verification_status='verified' AND is_public=1", [personId]);
        if (!person) return res.status(404).json({ success: false, message: '人物不存在或尚未公开核验' });
        const orgGuard = "o.record_status='active' AND o.verification_status='verified' AND o.is_public=1";
        const positions = await dbAll(`SELECT p.id,p.role_title AS title,p.role_category,p.start_date,p.end_date,p.status,o.id AS organization_id,COALESCE(NULLIF(o.name_zh,''),o.name_en) AS organization_name,o.ticker_symbol,o.exchange_name,p.source_reference FROM pi_business_positions p JOIN pi_organizations o ON o.id=p.organization_id WHERE p.person_id=? AND p.verification_status='verified' AND p.is_public=1 AND ${orgGuard} ORDER BY p.start_date DESC,p.id DESC LIMIT 100`, [personId]);
        const ownership = await dbAll(`SELECT d.id,d.ownership_type,d.ownership_percentage AS percentage,d.voting_percentage,d.shares_count,d.as_of_date,d.disclosure_type,o.id AS organization_id,COALESCE(NULLIF(o.name_zh,''),o.name_en) AS organization_name,o.ticker_symbol,o.exchange_name FROM pi_ownership_disclosures d JOIN pi_organizations o ON o.id=d.organization_id WHERE d.holder_entity_type='person' AND d.holder_entity_id=? AND d.verification_status='verified' AND d.is_public=1 AND ${orgGuard} ORDER BY d.as_of_date DESC,d.id DESC LIMIT 100`, [personId]);
        const capital = await dbAll(`SELECT DISTINCT e.id,e.event_type,e.title,e.description,e.event_date AS date,e.amount,e.currency,e.status FROM pi_capital_events e JOIN pi_business_event_entities l ON l.event_kind='capital' AND l.event_id=e.id AND l.entity_type='person' AND l.entity_id=? WHERE e.verification_status='verified' AND e.is_public=1 ORDER BY e.event_date DESC,e.id DESC LIMIT 100`, [personId]);
        const intelligence = await dbAll(`SELECT DISTINCT e.id,e.event_type,e.title,e.summary,e.occurred_at AS date,e.published_at,e.risk_level FROM pi_intelligence_events e JOIN pi_business_event_entities l ON l.event_kind='intelligence' AND l.event_id=e.id AND l.entity_type='person' AND l.entity_id=? WHERE e.verification_status='verified' AND e.is_public=1 ORDER BY e.published_at DESC,e.id DESC LIMIT 100`, [personId]);
        // Attach only verified/public evidence with an HTTPS URL; no unreviewed source is exposed.
        const groups = [['position', positions], ['ownership', ownership], ['capital', capital], ['intelligence', intelligence]];
        for (const [kind, rows] of groups) {
            if (!rows.length) continue;
            const ids = rows.map(r => r.id);
            const sources = await dbAll(`SELECT l.record_id,e.source_name,e.source_title,e.source_url,e.published_at FROM pi_business_evidence_links l JOIN pi_evidence e ON e.id=l.evidence_id WHERE l.record_type=? AND l.record_id IN (${ids.map(() => '?').join(',')}) AND e.verification_status='verified' AND e.source_url LIKE 'https://%' ORDER BY e.id DESC`, [kind, ...ids]);
            for (const row of rows) row.sources = sources.filter(s => s.record_id === row.id).map(s => ({ name: s.source_name, title: s.source_title, url: s.source_url, published_at: s.published_at }));
        }
        res.json({ success: true, person_id: personId, commercial_positions: positions, ownership_records: ownership, capital_events: capital, intelligence_events: intelligence, meta: { verified_only: true, public_only: true } });
    } catch (error) {
        console.error('V8.3-C commercial intelligence error:', error);
        res.status(500).json({ success: false, message: '商业情报读取失败，请检查 V8.3-B 迁移是否完成' });
    }
});

// V8.3-G1: verified/public organization detail and linked public positions.
router.get('/organizations/:id/detail', async (req, res) => {
    const organizationId = Number(req.params.id);
    if (!Number.isSafeInteger(organizationId) || organizationId < 1) {
        return res.status(400).json({ success: false, message: '无效企业 ID' });
    }
    try {
        const organization = await dbGet(`SELECT id,name_zh,name_en,organization_type,country_region,
            headquarters,founded_date,industry,industry_primary,description,website_url,
            listed_status,ticker_symbol,exchange_name,isin,lei,data_updated_at
            FROM pi_organizations WHERE id=? AND record_status='active'
            AND verification_status='verified' AND is_public=1`, [organizationId]);
        if (!organization) return res.status(404).json({ success: false, message: '企业不存在或尚未公开核验' });
        const positions = await dbAll(`SELECT p.id,p.person_id,p.role_title AS title,p.status,
            p.start_date,p.end_date,COALESCE(NULLIF(pe.name_zh,''),pe.name_en) AS person_name
            FROM pi_business_positions p JOIN pi_people pe ON pe.id=p.person_id
            WHERE p.organization_id=? AND p.verification_status='verified' AND p.is_public=1
            AND pe.record_status='active' AND pe.verification_status='verified' AND pe.is_public=1
            ORDER BY CASE WHEN p.status='current' THEN 0 ELSE 1 END,p.id DESC LIMIT 100`, [organizationId]);
        if (positions.length) {
            const ids = positions.map(p => p.id);
            const evidence = await dbAll(`SELECT l.record_id,e.source_name,e.source_title,e.source_url,e.published_at
                FROM pi_business_evidence_links l JOIN pi_evidence e ON e.id=l.evidence_id
                WHERE l.record_type='position' AND l.record_id IN (${ids.map(() => '?').join(',')})
                AND e.verification_status='verified' AND e.source_url LIKE 'https://%'
                ORDER BY e.id DESC`, ids);
            for (const p of positions) p.sources = evidence.filter(e => e.record_id === p.id)
                .map(e => ({ name: e.source_name, title: e.source_title, url: e.source_url, published_at: e.published_at }));
        }
        // G2-D: expose only field evidence matching the published organization value.
        // An approved decision alone is not sufficient: evidence must still be verified.
        const fieldEvidenceRows = await dbAll(`SELECT l.field_name,l.field_value,l.verified_at,
            e.id AS evidence_id,e.source_name,e.source_title,e.source_url,e.publisher,e.published_at
            FROM pi_organization_field_evidence l
            JOIN pi_evidence e ON e.id=l.evidence_id
            WHERE l.organization_id=? AND l.verification_status='verified'
              AND l.verified_at IS NOT NULL AND e.verification_status='verified'
              AND e.source_url LIKE 'https://%'
            ORDER BY l.field_name,l.id DESC`, [organizationId]);
        const fieldEvidence = {};
        for (const row of fieldEvidenceRows) {
            if (!Object.prototype.hasOwnProperty.call(organization, row.field_name)) continue;
            if (!normalizeText(organization[row.field_name])) continue;
            if (normalizeText(organization[row.field_name]) !== normalizeText(row.field_value)) continue;
            if (!/^https:\/\/[^\s]+$/i.test(normalizeText(row.source_url))) continue;
            (fieldEvidence[row.field_name] ||= []).push({
                evidence_id: row.evidence_id,
                name: row.source_name,
                title: row.source_title,
                publisher: row.publisher,
                url: row.source_url,
                published_at: row.published_at,
                verified_at: row.verified_at
            });
        }
        return res.json({
            success: true, organization, positions, field_evidence: fieldEvidence,
            meta: {
                verified_only: true, public_only: true,
                relationship_scope: 'verified_positions_only',
                field_evidence_scope: 'verified_and_value_matched'
            }
        });
    } catch (error) {
        console.error('V8.3-G1 organization detail error:', error);
        return res.status(500).json({ success: false, message: '企业详情读取失败' });
    }
});

router.get("/search", async (req, res) => {
    const query = normalizeText(req.query.q);

    if (!query) {
        return res.status(400).json({
            success: false,
            message: "请输入关键词"
        });
    }

    try {
        const person = await findPerson(query);

        if (!person) {
            return res.status(404).json({
                success: false,
                found: false,
                message: `未找到【${query}】的已发布情报档案`
            });
        }

        const relationshipRows = dedupeRelationships(
            await getUniqueRelationships(person.id)
        );

        const parents = [];
        const spouses = [];
        const children = [];
        const relatives = [];
        const enterprises = [];

        for (const row of relationshipRows) {
            const perspective = getRelationshipPerspective(row, person.id);

            if (!perspective) continue;

            perspective.otherName = normalizeText(perspective.otherName);

            // 公开树图不输出空名字、无效 ID 或自关联节点。
            if (!perspective.otherName) continue;
            if (perspective.otherId === undefined || perspective.otherId === null) continue;
            if (
                perspective.otherType === "person" &&
                Number(perspective.otherId) === Number(person.id)
            ) continue;

            if (perspective.otherType === "organization") {
                pushUniqueById(
                    enterprises,
                    buildEnterpriseObject(row, perspective)
                );
                continue;
            }

            if (perspective.otherType !== "person") continue;

            const category = classifyPersonRelationship(row, perspective);
            const personObj = buildPersonObject(row, perspective, category);

            if (category === "parent") {
                pushUniqueById(parents, personObj);
            } else if (category === "spouse") {
                pushUniqueById(spouses, {
                    ...personObj,
                    children: []
                });
            } else if (category === "child") {
                pushUniqueById(children, personObj);
            } else {
                pushUniqueById(relatives, personObj);
            }
        }

        const {
            familyUnits,
            unassignedChildren
        } = await buildFamilyUnits(person.id, spouses, children);

        // 兼容前端旧字段：spouses 中同时附带本房共同子女。
        const spousesWithChildren = familyUnits.map(unit => ({
            ...unit.spouse,
            children: unit.children
        }));

        const relationships = relationshipRows.map(row =>
            buildStandardRelationship(row, person.id)
        );

        return res.json({
            success: true,
            found: true,
            entity: person,

            familyTree: {
                core: person,
                parents,
                spouses: spousesWithChildren,
                familyUnits,
                children,
                unassignedChildren,
                relatives,
                enterprises
            },

            relationships,

            meta: {
                relationship_count: relationships.length,
                parent_count: parents.length,
                spouse_count: spouses.length,
                child_count: children.length,
                relative_count: relatives.length,
                enterprise_count: enterprises.length,
                family_branch_assignment: "shared_parent_intersection_v8_2",
                family_unit_count: familyUnits.length,
                unassigned_child_count: unassignedChildren.length
            }
        });
    } catch (e) {
        console.error("Public search error:", e);

        return res.status(500).json({
            success: false,
            message: "数据读取失败"
        });
    }
});


// V10: Query history is an audit of search terms only, never a cached biography.
const piHistoryFs = require("fs/promises");
const piHistoryPath = require("path");
const piHistoryFile = piHistoryPath.join(__dirname, "../data/pi-search-history.jsonl");
router.post("/search-history", async (req, res) => {
    const query = String(req.body?.query || "").trim();
    if (!query || query.length > 100) return res.status(400).json({ success: false, message: "无效关键词" });
    try {
        await piHistoryFs.mkdir(piHistoryPath.dirname(piHistoryFile), { recursive: true });
        await piHistoryFs.appendFile(piHistoryFile, JSON.stringify({ query, source: "Wikidata", searched_at: new Date().toISOString() }) + "\n", "utf8");
        res.json({ success: true });
    } catch (e) {
        console.error("PI search history:", e.message);
        res.status(500).json({ success: false, message: "搜索记录保存失败" });
    }
});

module.exports = router;