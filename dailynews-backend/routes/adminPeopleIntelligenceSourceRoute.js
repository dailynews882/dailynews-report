const express = require("express");
const db = require("../db");
const { verifyAdminToken } = require("../middleware/adminAuth");

const router = express.Router();

const WIKIDATA_API_URL = "https://www.wikidata.org/w/api.php";
const WIKIDATA_ENTITY_URL = "https://www.wikidata.org/wiki/";
const WIKIPEDIA_ZH_API = "https://zh.wikipedia.org/api/rest_v1/page/summary/";
const WIKIDATA_TIMEOUT_MS = 15000;

function normalizeText(value) {
    return value === undefined || value === null ? "" : String(value).trim();
}

async function fetchJsonWithTimeout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WIKIDATA_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Accept: "application/json",
                "User-Agent": "DailyNews-PeopleIntelligence/2.0 (contact@dailynews.report)"
            },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
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

// 维基百科条目快速搜索（优先过滤出人物实体）
router.get("/wikidata/search", verifyAdminToken, async (req, res) => {
    const query = normalizeText(req.query.q);
    if (!query) return res.status(400).json({ success: false, message: "请输入搜索关键词" });

    try {
        const searchUrl = `${WIKIDATA_API_URL}?action=wbsearchentities&search=${encodeURIComponent(query)}&language=zh&uselang=zh&type=item&limit=10&format=json&origin=*`;
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

// 深度抽取入库：家谱多代际（祖辈、父母、配偶、子嗣）与生平档案
router.post("/wikidata/ingest", verifyAdminToken, async (req, res) => {
    const qid = normalizeText(req.body.qid);
    if (!qid || !/^Q\d+$/.test(qid)) {
        return res.status(400).json({ success: false, message: "无效的 Wikidata QID" });
    }

    try {
        const entityUrl = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${qid}&languages=zh|en&format=json&origin=*`;
        const result = await fetchJsonWithTimeout(entityUrl);
        const entityData = result?.entities?.[qid];

        if (!entityData) {
            return res.status(404).json({ success: false, message: "未找到该维基实体" });
        }

        const nameZh = entityData.labels?.zh?.value || "";
        const nameEn = entityData.labels?.en?.value || entityData.labels?.zh?.value || qid;
        let shortBio = entityData.descriptions?.zh?.value || entityData.descriptions?.en?.value || "";

        // 获取中文维基百科详尽生平长文
        let detailedBio = "";
        let avatarUrl = "";
        try {
            const queryName = nameZh || nameEn;
            if (queryName) {
                const wikiSummary = await fetchJsonWithTimeout(`${WIKIPEDIA_ZH_API}${encodeURIComponent(queryName)}`);
                if (wikiSummary?.extract) {
                    detailedBio = wikiSummary.extract;
                }
                if (wikiSummary?.thumbnail?.source) {
                    avatarUrl = wikiSummary.thumbnail.source;
                }
            }
        } catch (e) { }

        if (!detailedBio) {
            detailedBio = `${nameZh || nameEn}，知名商业及社会公众人物。${shortBio ? "简介：" + shortBio : ""}`;
        }

        // 解析维基百科原生高清大图 (P18)
        if (!avatarUrl && entityData.claims?.P18?.[0]?.mainsnak?.datavalue?.value) {
            const fileName = entityData.claims.P18[0].mainsnak.datavalue.value;
            avatarUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=400`;
        }

        // 解析生卒年月
        let birthDate = null;
        let deathDate = null;
        const bClaim = entityData.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time;
        if (bClaim) birthDate = bClaim.replace(/^\+/, "").slice(0, 10);
        const dClaim = entityData.claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time;
        if (dClaim) deathDate = dClaim.replace(/^\+/, "").slice(0, 10);

        let nationality = "中国香港 / 中国澳门";

        // 存入或更新主人物
        let personId;
        const existingPerson = await dbGet(`SELECT id FROM pi_people WHERE name_en = ? OR name_zh = ?`, [nameEn, nameZh]);

        if (existingPerson) {
            personId = existingPerson.id;
            await dbRun(
                `UPDATE pi_people SET
                    name_zh = COALESCE(NULLIF(name_zh, ''), ?),
                    birth_date = COALESCE(birth_date, ?),
                    death_date = COALESCE(death_date, ?),
                    profile_image_url = COALESCE(NULLIF(profile_image_url, ''), ?),
                    biography = COALESCE(NULLIF(biography, ''), ?),
                    country_region = COALESCE(NULLIF(country_region, ''), ?),
                    verification_status = 'verified',
                    is_public = 1
                 WHERE id = ?`,
                [nameZh, birthDate, deathDate, avatarUrl, detailedBio, nationality, personId]
            );
        } else {
            const insertRes = await dbRun(
                `INSERT INTO pi_people (
                    slug, name_zh, name_en, birth_date, death_date, country_region,
                    profile_image_url, biography, verification_status, confidence_level, is_public
                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'verified', 'high', 1)`,
                [`${nameEn.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`, nameZh, nameEn, birthDate, deathDate, nationality, avatarUrl, detailedBio]
            );
            personId = insertRes.lastID;
        }

        // 全景家谱与企业关联映射规则
        const claims = entityData.claims || {};
        const relationPropertyMap = [
            { prop: "P22", code: "father", label: "父亲", type: "person" },
            { prop: "P25", code: "mother", label: "母亲", type: "person" },
            { prop: "P26", code: "spouse_of", label: "配偶", type: "person" },
            { prop: "P40", code: "child_of", label: "子女", type: "person" },
            { prop: "P108", code: "employee_of", label: "任职/控制机构", type: "organization" },
            { prop: "P112", code: "founder_of", label: "创办企业", type: "organization" }
        ];

        const targetQids = [];
        relationPropertyMap.forEach(item => {
            if (claims[item.prop]) {
                claims[item.prop].forEach(c => {
                    const targetId = c.mainsnak?.datavalue?.value?.id;
                    if (targetId) targetQids.push({ targetQid: targetId, ...item });
                });
            }
        });

        const relationsFound = [];

        if (targetQids.length > 0) {
            const sliceTargets = targetQids.slice(0, 25);
            const idsQuery = sliceTargets.map(t => t.targetQid).join("|");
            const labelsUrl = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${idsQuery}&props=labels|descriptions|claims&languages=zh|en&format=json&origin=*`;
            const entitiesResult = await fetchJsonWithTimeout(labelsUrl);

            for (const item of sliceTargets) {
                const targetEntity = entitiesResult?.entities?.[item.targetQid];
                const targetNameZh = targetEntity?.labels?.zh?.value || targetEntity?.labels?.en?.value || item.targetQid;
                const targetNameEn = targetEntity?.labels?.en?.value || targetNameZh;
                let targetDesc = targetEntity?.descriptions?.zh?.value || targetEntity?.descriptions?.en?.value || "";

                // 获取成员头像
                let targetAvatar = "";
                if (targetEntity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value) {
                    const tFileName = targetEntity.claims.P18[0].mainsnak.datavalue.value;
                    targetAvatar = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(tFileName)}?width=300`;
                }

                // 尝试抓取关联人物的生平短文
                let targetBio = targetDesc;
                try {
                    if (item.type === "person" && targetNameZh) {
                        const subSummary = await fetchJsonWithTimeout(`${WIKIPEDIA_ZH_API}${encodeURIComponent(targetNameZh)}`);
                        if (subSummary?.extract) targetBio = subSummary.extract;
                        if (!targetAvatar && subSummary?.thumbnail?.source) targetAvatar = subSummary.thumbnail.source;
                    }
                } catch (e) { }

                if (item.type === "person") {
                    let relPerson = await dbGet(`SELECT id FROM pi_people WHERE name_zh = ? OR name_en = ?`, [targetNameZh, targetNameEn]);
                    let relPersonId = relPerson ? relPerson.id : null;
                    if (!relPersonId) {
                        const newP = await dbRun(
                            `INSERT INTO pi_people (
                                slug, name_zh, name_en, profile_image_url, biography,
                                verification_status, confidence_level, is_public
                             ) VALUES (?, ?, ?, ?, ?, 'verified', 'high', 1)`,
                            [`${targetNameEn.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${Date.now()}`, targetNameZh, targetNameEn, targetAvatar, targetBio || `${targetNameZh}，家族成员。`]
                        );
                        relPersonId = newP.lastID;
                    } else {
                        await dbRun(
                            `UPDATE pi_people SET 
                                profile_image_url = COALESCE(NULLIF(profile_image_url, ''), ?),
                                biography = COALESCE(NULLIF(biography, ''), ?)
                             WHERE id = ?`,
                            [targetAvatar, targetBio, relPersonId]
                        );
                    }

                    // 写入关系
                    await dbRun(
                        `INSERT INTO pi_relationships (
                            source_entity_type, source_entity_id, target_entity_type, target_entity_id,
                            relationship_type, relationship_label, verification_status, is_public
                         ) VALUES ('person', ?, 'person', ?, ?, ?, 'verified', 1)`,
                        [personId, relPersonId, item.code, item.label]
                    );
                    relationsFound.push(`[${item.label}] ${targetNameZh}`);
                } else if (item.type === "organization") {
                    let relOrg = await dbGet(`SELECT id FROM pi_organizations WHERE name_zh = ? OR name_en = ?`, [targetNameZh, targetNameEn]);
                    let relOrgId = relOrg ? relOrg.id : null;
                    if (!relOrgId) {
                        const newOrg = await dbRun(
                            `INSERT INTO pi_organizations (
                                slug, name_zh, name_en, description,
                                verification_status, confidence_level, is_public
                             ) VALUES (?, ?, ?, ?, 'verified', 'high', 1)`,
                            [`org-${Date.now()}`, targetNameZh, targetNameEn, targetDesc || `${targetNameZh}，关联商业机构。`]
                        );
                        relOrgId = newOrg.lastID;
                    }

                    await dbRun(
                        `INSERT INTO pi_relationships (
                            source_entity_type, source_entity_id, target_entity_type, target_entity_id,
                            relationship_type, relationship_label, verification_status, is_public
                         ) VALUES ('person', ?, 'organization', ?, ?, ?, 'verified', 1)`,
                        [personId, relOrgId, item.code, item.label]
                    );
                    relationsFound.push(`[${item.label}] ${targetNameZh}`);
                }
            }
        }

        return res.json({
            success: true,
            message: `成功抓取入库【${nameZh || nameEn}】全景家谱！`,
            person_id: personId,
            relations_count: relationsFound.length,
            details: relationsFound
        });

    } catch (error) {
        console.error("Wikidata Ingest error:", error);
        return res.status(500).json({ success: false, message: "维基百科全景抓取发生错误: " + error.message });
    }
});

module.exports = router;