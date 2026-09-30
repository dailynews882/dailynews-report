const express = require("express");
const db = require("../db");
const { verifyAdminToken } = require("../middleware/adminAuth");

const router = express.Router();

const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const WIKIDATA_ENTITY_URL = "https://www.wikidata.org/wiki/";
const WIKIDATA_TIMEOUT_MS = 12000;

/* ============================================================
   Helpers
============================================================ */

function normalizeText(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
}

async function fetchJsonWithTimeout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WIKIDATA_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "User-Agent": "DailyNews-PeopleIntelligence/1.0 (contact@dailynews.report)"
            },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`);
        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row || null)));
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

/* ============================================================
   GET /wikidata/search?q=
   搜索 Wikidata 实体（返回候选 QID）
============================================================ */

router.get("/wikidata/search", verifyAdminToken, async (req, res) => {
    const query = normalizeText(req.query.q);
    if (!query) return res.status(400).json({ success: false, message: "请输入搜索关键词" });

    try {
        const searchUrl = `${WIKIDATA_API_URL}?action=wbsearchentities&search=${encodeURIComponent(query)}&language=zh&uselang=zh&type=item&limit=8&format=json&origin=*`;
        const data = await fetchJsonWithTimeout(searchUrl);
        const items = (data.search || []).map(item => ({
            qid: item.id,
            label: item.label,
            description: item.description || "暂无描述",
            url: `${WIKIDATA_ENTITY_URL}${item.id}`
        }));
        return res.json({ success: true, count: items.length, items });
    } catch (error) {
        console.error("Wikidata search error:", error);
        return res.status(502).json({ success: false, message: "维基数据检索超时或失败" });
    }
});

/* ============================================================
   POST /wikidata/ingest
   输入 QID 一键深度抽取人物、配偶、子嗣、产业并存入数据库
============================================================ */

router.post("/wikidata/ingest", verifyAdminToken, async (req, res) => {
    const qid = normalizeText(req.body.qid);
    if (!qid || !/^Q\d+$/.test(qid)) {
        return res.status(400).json({ success: false, message: "无效的 Wikidata QID" });
    }

    try {
        // 1. 获取实体完整 Claim 属性
        const entityUrl = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${qid}&languages=zh|en&format=json&origin=*`;
        const result = await fetchJsonWithTimeout(entityUrl);
        const entityData = result?.entities?.[qid];

        if (!entityData) {
            return res.status(404).json({ success: false, message: "未找到该维基实体" });
        }

        const nameZh = entityData.labels?.zh?.value || "";
        const nameEn = entityData.labels?.en?.value || entityData.labels?.zh?.value || qid;
        const biography = entityData.descriptions?.zh?.value || entityData.descriptions?.en?.value || "";

        // 出生日期解析 (P569)
        let birthDate = null;
        const birthClaim = entityData.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time;
        if (birthClaim) {
            birthDate = birthClaim.replace(/^\+/, "").slice(0, 10);
        }

        // 2. 存入或更新主人物 (pi_people)
        let personId;
        const existingPerson = await dbGet(`SELECT id FROM pi_people WHERE name_en = ? OR name_zh = ?`, [nameEn, nameZh]);

        if (existingPerson) {
            personId = existingPerson.id;
            await dbRun(
                `UPDATE pi_people SET name_zh = COALESCE(NULLIF(name_zh, ''), ?), birth_date = COALESCE(birth_date, ?), biography = COALESCE(NULLIF(biography, ''), ?) WHERE id = ?`,
                [nameZh, birthDate, biography, personId]
            );
        } else {
            const insertRes = await dbRun(
                `INSERT INTO pi_people (slug, name_zh, name_en, birth_date, biography, verification_status, confidence_level, is_public) 
                 VALUES (?, ?, ?, ?, ?, 'draft', 'high', 0)`,
                [`${nameEn.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`, nameZh, nameEn, birthDate, biography]
            );
            personId = insertRes.lastID;
        }

        // 3. 关联关系批量抓取器 (配偶 P26、子女 P40、雇主/创办 P108/P112)
        const relationsFound = [];
        const claims = entityData.claims || {};

        const relationPropertyMap = [
            { prop: "P26", code: "spouse_of", label: "配偶", type: "person" },
            { prop: "P40", code: "parent_of", label: "子女", type: "person" },
            { prop: "P22", code: "child_of", label: "父亲", type: "person" },
            { prop: "P25", code: "child_of", label: "母亲", type: "person" },
            { prop: "P108", code: "employee_of", label: "任职/关联机构", type: "organization" },
            { prop: "P112", code: "founder_of", label: "创办企业", type: "organization" }
        ];

        // 收集所有关联实体的 QID
        const targetQids = [];
        relationPropertyMap.forEach(item => {
            if (claims[item.prop]) {
                claims[item.prop].forEach(c => {
                    const targetId = c.mainsnak?.datavalue?.value?.id;
                    if (targetId) targetQids.push({ targetQid: targetId, ...item });
                });
            }
        });

        // 批量查询目标 QID 的中文标签（最多取前 15 个）
        if (targetQids.length > 0) {
            const sliceTargets = targetQids.slice(0, 15);
            const idsQuery = sliceTargets.map(t => t.targetQid).join("|");
            const labelsUrl = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${idsQuery}&props=labels&languages=zh|en&format=json&origin=*`;
            const labelsData = await fetchJsonWithTimeout(labelsUrl);

            for (const item of sliceTargets) {
                const targetEntity = labelsData?.entities?.[item.targetQid];
                const targetNameZh = targetEntity?.labels?.zh?.value || targetEntity?.labels?.en?.value || item.targetQid;
                const targetNameEn = targetEntity?.labels?.en?.value || targetNameZh;

                if (item.type === "person") {
                    let relPerson = await dbGet(`SELECT id FROM pi_people WHERE name_zh = ? OR name_en = ?`, [targetNameZh, targetNameEn]);
                    let relPersonId = relPerson ? relPerson.id : null;
                    if (!relPersonId) {
                        const newP = await dbRun(
                            `INSERT INTO pi_people (slug, name_zh, name_en, verification_status, confidence_level, is_public) VALUES (?, ?, ?, 'draft', 'medium', 0)`,
                            [`${targetNameEn.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`, targetNameZh, targetNameEn]
                        );
                        relPersonId = newP.lastID;
                    }
                    // 建立关系
                    await dbRun(
                        `INSERT INTO pi_relationships (source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, relationship_label, verification_status, is_public)
                         VALUES ('person', ?, 'person', ?, ?, ?, 'draft', 0)`,
                        [personId, relPersonId, item.code, item.label]
                    );
                    relationsFound.push(`${item.label}: ${targetNameZh}`);
                } else if (item.type === "organization") {
                    let relOrg = await dbGet(`SELECT id FROM pi_organizations WHERE name_zh = ? OR name_en = ?`, [targetNameZh, targetNameEn]);
                    let relOrgId = relOrg ? relOrg.id : null;
                    if (!relOrgId) {
                        const newOrg = await dbRun(
                            `INSERT INTO pi_organizations (slug, name_zh, name_en, verification_status, confidence_level, is_public) VALUES (?, ?, ?, 'draft', 'medium', 0)`,
                            [`org-${Date.now()}`, targetNameZh, targetNameEn]
                        );
                        relOrgId = newOrg.lastID;
                    }
                    await dbRun(
                        `INSERT INTO pi_relationships (source_entity_type, source_entity_id, target_entity_type, target_entity_id, relationship_type, relationship_label, verification_status, is_public)
                         VALUES ('person', ?, 'organization', ?, ?, ?, 'draft', 0)`,
                        [personId, relOrgId, item.code, item.label]
                    );
                    relationsFound.push(`${item.label}: ${targetNameZh}`);
                }
            }
        }

        return res.json({
            success: true,
            message: `成功抓取入库【${nameZh || nameEn}】，自动建立并导入 ${relationsFound.length} 条关联关系！`,
            person_id: personId,
            relations_count: relationsFound.length,
            details: relationsFound
        });

    } catch (error) {
        console.error("Wikidata Ingest error:", error);
        return res.status(500).json({ success: false, message: "维基百科抓取入库发生错误: " + error.message });
    }
});

module.exports = router;