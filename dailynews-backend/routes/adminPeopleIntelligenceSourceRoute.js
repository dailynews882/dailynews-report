const express = require("express");

const db = require("../db");

const { verifyAdminToken } = require("../middleware/adminAuth");



const router = express.Router();



const WIKIDATA_API_URL = "https://www\.wikidata.org/w/api.php";

const WIKIDATA_ENTITY_URL = "https://www\.wikidata.org/wiki/";

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






async function findPersonByExternalIdentity(provider, externalId) {
    return dbGet(
        `SELECT p.*
         FROM pi_external_identities x
         JOIN pi_people p
           ON x.entity_type = 'person'
          AND x.entity_id = p.id
         WHERE x.provider = ?
           AND x.external_id = ?
         ORDER BY x.is_primary DESC, x.id ASC
         LIMIT 1`,
        [provider, externalId]
    );
}

async function bindExternalIdentity(personId, provider, externalId, externalUrl = "", languageCode = "") {
    if (!personId || !provider || !externalId) return;

    await dbRun(
        `INSERT OR IGNORE INTO pi_external_identities
         (entity_type, entity_id, provider, external_id, external_url, language_code, is_primary, last_synced_at)
         VALUES ('person', ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
        [personId, provider, externalId, externalUrl, languageCode]
    );

    await dbRun(
        `UPDATE pi_external_identities
         SET external_url = CASE WHEN ? <> '' THEN ? ELSE external_url END,
             language_code = CASE WHEN ? <> '' THEN ? ELSE language_code END,
             is_primary = 1,
             last_synced_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE entity_type = 'person'
           AND entity_id = ?
           AND provider = ?
           AND external_id = ?`,
        [externalUrl, externalUrl, languageCode, languageCode, personId, provider, externalId]
    );
}

async function findExistingPersonForWikidata(qid, nameZh, nameEn) {
    const byIdentity = await findPersonByExternalIdentity("wikidata", qid);
    if (byIdentity) return byIdentity;

    if (nameEn) {
        const byEnglish = await dbGet(
            `SELECT * FROM pi_people
             WHERE lower(trim(name_en)) = lower(trim(?))
             ORDER BY id ASC LIMIT 1`,
            [nameEn]
        );
        if (byEnglish) return byEnglish;
    }

    if (nameZh) {
        const byChinese = await dbGet(
            `SELECT * FROM pi_people
             WHERE trim(name_zh) = trim(?)
                OR instr(COALESCE(aliases, ''), ?) > 0
             ORDER BY id ASC LIMIT 1`,
            [nameZh, nameZh]
        );
        if (byChinese) return byChinese;
    }

    return null;
}

function getClaimItemIds(claims, propertyId) {

    return (claims?.[propertyId] || [])

        .map((claim) => claim?.mainsnak?.datavalue?.value?.id)

        .filter((id) => /^Q\d+$/.test(normalizeText(id)));

}



async function resolveWikidataLabels(qids) {

    const uniqueQids = [...new Set(

        (qids || []).filter((id) => /^Q\d+$/.test(id))

    )];



    const labelMap = new Map();



    for (let i = 0; i < uniqueQids.length; i += 40) {

        const batch = uniqueQids.slice(i, i + 40);



        const url =

            `${WIKIDATA_API_URL}?action=wbgetentities&ids=${batch.join("|")}` +

            `&props=labels&languages=zh|en&languagefallback=1&format=json&origin=*`;



        const data = await fetchJsonWithTimeout(url);



        for (const qid of batch) {

            const entity = data?.entities?.[qid];



            const label =

                entity?.labels?.zh?.value ||

                entity?.labels?.en?.value ||

                qid;



            labelMap.set(qid, label);

        }

    }



    return labelMap;

}



function labelsForProperty(claims, propertyId, labelMap) {

    return getClaimItemIds(claims, propertyId)

        .map((qid) => labelMap.get(qid) || qid)

        .filter(Boolean);

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
                // 头像不再按姓名从 Wikipedia 猜测；只使用 Wikidata P18。


            }

        } catch (e) { }



        if (!detailedBio) {

            detailedBio = `${nameZh || nameEn}，知名商业及社会公众人物。${shortBio ? "简介：" + shortBio : ""}`;

        }



        // 头像唯一可靠来源：Wikidata P18（Wikimedia Commons）。
        // 没有 P18 时保持空白，不使用姓名去 Wikipedia 猜头像。
        const mainImageFile =
            entityData.claims?.P18?.[0]?.mainsnak?.datavalue?.value || "";

        avatarUrl = mainImageFile
            ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(mainImageFile)}?width=400`
            : "";



        // 解析生卒年月

        let birthDate = null;

        let deathDate = null;

        const bClaim = entityData.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time;

        if (bClaim) birthDate = bClaim.replace(/^\+/, "").slice(0, 10);

        const dClaim = entityData.claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time;

        if (dClaim) deathDate = dClaim.replace(/^\+/, "").slice(0, 10);



        let nationality = "";

        let gender = "";

        let education = "";

        let professionType = "";

        let primaryRole = "";



        // 存入或更新主人物

        let personId;

        const existingPerson = await findExistingPersonForWikidata(qid, nameZh, nameEn);



        if (existingPerson) {

            personId = existingPerson.id;

            await dbRun(

                `UPDATE pi_people SET

                    name_zh = COALESCE(NULLIF(name_zh, ''), ?),

                    birth_date = COALESCE(birth_date, ?),

                    death_date = COALESCE(death_date, ?),

                    profile_image_url = CASE
                        WHEN ? <> '' THEN ?
                        ELSE profile_image_url
                    END,

                    biography = COALESCE(NULLIF(biography, ''), ?),

                    country_region = COALESCE(NULLIF(country_region, ''), ?),

                    verification_status = 'verified',

                    is_public = 1

                 WHERE id = ?`,

                [nameZh, birthDate, deathDate, avatarUrl, avatarUrl, detailedBio, nationality, personId]

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



        await bindExternalIdentity(
            personId,
            "wikidata",
            qid,
            `${WIKIDATA_ENTITY_URL}${qid}`,
            nameZh ? "zh" : "en"
        );

        // 全景家谱与企业关联映射规则

        const claims = entityData.claims || {};



        // Wikidata 人物结构化字段：

        // P21 性别

        // P27 国籍 / 公民身份

        // P69 教育机构

        // P106 职业

        // P39 曾任 / 现任职务

        const profilePropertyIds = ["P21", "P27", "P69", "P106", "P39"];



        const profileQids = profilePropertyIds.flatMap((propertyId) =>

            getClaimItemIds(claims, propertyId)

        );



        const profileLabelMap = await resolveWikidataLabels(profileQids);



        gender = labelsForProperty(

            claims,

            "P21",

            profileLabelMap

        ).join(" / ");



        nationality = labelsForProperty(

            claims,

            "P27",

            profileLabelMap

        ).join(" / ");



        education = labelsForProperty(

            claims,

            "P69",

            profileLabelMap

        ).join(" / ");



        professionType = labelsForProperty(

            claims,

            "P106",

            profileLabelMap

        ).join(" / ");



        const positionValues = labelsForProperty(

            claims,

            "P39",

            profileLabelMap

        );



        primaryRole =

            positionValues.join(" / ") ||

            professionType;



        // 将解析后的 Wikidata 字段写回主人物档案。

        await dbRun(

            `UPDATE pi_people SET

                gender = ?,

                country_region = ?,

                education = ?,

                profession_type = ?,

                primary_role = ?,

                updated_at = CURRENT_TIMESTAMP

             WHERE id = ?`,

            [

                gender,

                nationality,

                education,

                professionType,

                primaryRole,

                personId

            ]

        );



        // V7: breadth-first, two-hop family import. depth=1 imports direct family;
        // depth=2 also imports the direct family's immediate relatives.
        const requestedDepth = req.body.depth === undefined ? 2 : Number(req.body.depth);
        if (![1, 2].includes(requestedDepth)) {
            return res.status(400).json({ success: false, message: "depth 只能为 1 或 2" });
        }
        const MAX_PEOPLE = 65;
        const MAX_RELATIONSHIPS = 150;
        const BATCH_SIZE = 20;
        const relationsFound = [];
        const idByQid = new Map([[qid, personId]]);
        const visited = new Set();
        const queued = new Set([qid]);
        const queue = [{ qid, depth: 0 }];
        let newRelationships = 0;
        let skippedUnresolved = 0;
        let limitReached = false;

        const familyProperties = [
            { prop: "P22", code: "parent_of", label: "父亲", reverse: true },
            { prop: "P25", code: "parent_of", label: "母亲", reverse: true },
            { prop: "P26", code: "spouse_of", label: "配偶", symmetric: true },
            { prop: "P40", code: "parent_of", label: "子女" }
        ];
        const organizationProperties = [
            { prop: "P108", code: "employee_of", label: "任职机构" },
            { prop: "P112", code: "founder_of", label: "创办企业" }
        ];
        const entityCache = new Map([[qid, entityData]]);

        async function loadEntities(ids) {
            const missing = [...new Set(ids)].filter(id => !entityCache.has(id));
            for (let i = 0; i < missing.length; i += BATCH_SIZE) {
                const batch = missing.slice(i, i + BATCH_SIZE);
                const url = `${WIKIDATA_API_URL}?action=wbgetentities&ids=${batch.join("|")}` +
                    `&props=labels|descriptions|claims&languages=zh|en&format=json`;
                const data = await fetchJsonWithTimeout(url);
                for (const id of batch) entityCache.set(id, data?.entities?.[id] || null);
            }
        }

        async function ensurePerson(entityQid) {
            if (idByQid.has(entityQid)) return idByQid.get(entityQid);

            const e = entityCache.get(entityQid);
            if (!e || e.missing || !e.labels || !(e.labels.zh?.value || e.labels.en?.value)) {
                skippedUnresolved++;
                return null;
            }

            const zh = e.labels.zh?.value || e.labels.en?.value;
            const en = e.labels.en?.value || zh;
            const bio = e.descriptions?.zh?.value || e.descriptions?.en?.value || "";
            const file = e.claims?.P18?.[0]?.mainsnak?.datavalue?.value || "";
            const avatar = file
                ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=300`
                : "";

            const birthTime = e.claims?.P569?.[0]?.mainsnak?.datavalue?.value?.time || "";
            const deathTime = e.claims?.P570?.[0]?.mainsnak?.datavalue?.value?.time || "";
            const birthValue = birthTime ? birthTime.replace(/^\+/, "").slice(0, 10) : null;
            const deathValue = deathTime ? deathTime.replace(/^\+/, "").slice(0, 10) : null;

            // V7.1：关联人物也解析完整的 Wikidata 结构化档案。
            const relatedProfilePropertyIds = ["P21", "P27", "P69", "P106", "P39"];
            const relatedProfileQids = relatedProfilePropertyIds.flatMap((propertyId) =>
                getClaimItemIds(e.claims || {}, propertyId)
            );
            const relatedProfileLabelMap = await resolveWikidataLabels(relatedProfileQids);

            const genderValue = labelsForProperty(e.claims || {}, "P21", relatedProfileLabelMap).join(" / ");
            const nationalityValue = labelsForProperty(e.claims || {}, "P27", relatedProfileLabelMap).join(" / ");
            const educationValue = labelsForProperty(e.claims || {}, "P69", relatedProfileLabelMap).join(" / ");
            const professionValue = labelsForProperty(e.claims || {}, "P106", relatedProfileLabelMap).join(" / ");
            const positionValue = labelsForProperty(e.claims || {}, "P39", relatedProfileLabelMap).join(" / ");
            const primaryRoleValue = positionValue || professionValue;

            const existing = await findExistingPersonForWikidata(entityQid, zh, en);

            let id;

            if (existing) {
                id = existing.id;
                await dbRun(
                    `UPDATE pi_people SET
                        name_zh = COALESCE(NULLIF(name_zh, ''), ?),
                        birth_date = COALESCE(birth_date, ?),
                        death_date = COALESCE(death_date, ?),
                        country_region = COALESCE(NULLIF(country_region, ''), ?),
                        profile_image_url = CASE WHEN ? <> '' THEN ? ELSE profile_image_url END,
                        biography = COALESCE(NULLIF(biography, ''), ?),
                        gender = COALESCE(NULLIF(gender, ''), ?),
                        education = COALESCE(NULLIF(education, ''), ?),
                        profession_type = COALESCE(NULLIF(profession_type, ''), ?),
                        primary_role = COALESCE(NULLIF(primary_role, ''), ?),
                        verification_status = 'verified',
                        confidence_level = 'high',
                        record_status = 'active',
                        is_public = 1,
                        updated_at = CURRENT_TIMESTAMP
                     WHERE id = ?`,
                    [
                        zh, birthValue, deathValue, nationalityValue,
                        avatar, avatar, bio, genderValue, educationValue,
                        professionValue, primaryRoleValue, id
                    ]
                );
            } else {
                const created = await dbRun(
                    `INSERT INTO pi_people (
                        slug, name_zh, name_en, birth_date, death_date, country_region,
                        profile_image_url, biography, gender, education, profession_type,
                        primary_role, verification_status, confidence_level, record_status, is_public
                     ) VALUES (
                        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        'verified', 'high', 'active', 1
                     )`,
                    [
                        `${en.toLowerCase().replace(/[^a-z0-9]/g, "-")}-${entityQid.toLowerCase()}`,
                        zh, en, birthValue, deathValue, nationalityValue, avatar, bio,
                        genderValue, educationValue, professionValue, primaryRoleValue
                    ]
                );
                id = created.lastID;
            }

            await bindExternalIdentity(
                id,
                "wikidata",
                entityQid,
                `${WIKIDATA_ENTITY_URL}${entityQid}`,
                e.labels?.zh?.value ? "zh" : "en"
            );

            idByQid.set(entityQid, id);
            return id;
        }

        async function ensurePersonRelationship(fromId, toId, rule, otherName) {
            const sourceId = rule.reverse ? toId : fromId;
            const targetId = rule.reverse ? fromId : toId;
            if (sourceId === targetId) return;
            const existing = await dbGet(
                `SELECT id FROM pi_relationships WHERE source_entity_type = 'person'
                   AND target_entity_type = 'person' AND relationship_type = ?
                   AND ((source_entity_id = ? AND target_entity_id = ?)
                     OR (? = 1 AND source_entity_id = ? AND target_entity_id = ?)) LIMIT 1`,
                [rule.code, sourceId, targetId, rule.symmetric ? 1 : 0, targetId, sourceId]
            );
            if (existing) return;
            if (newRelationships >= MAX_RELATIONSHIPS) { limitReached = true; return; }
            await dbRun(
                `INSERT INTO pi_relationships
                 (source_entity_type, source_entity_id, target_entity_type, target_entity_id,
                  relationship_type, relationship_label, verification_status, is_public)
                 VALUES ('person', ?, 'person', ?, ?, ?, 'verified', 1)`,
                [sourceId, targetId, rule.code, rule.label]
            );
            newRelationships++;
            relationsFound.push(`[${rule.label}] ${otherName}`);
        }

        // Only import organizations for the requested core person in V7.
        async function importRootOrganizations(rootClaims) {
            const items = organizationProperties.flatMap(rule =>
                getClaimItemIds(rootClaims, rule.prop).map(targetQid => ({ ...rule, targetQid }))
            ).slice(0, 20);
            await loadEntities(items.map(item => item.targetQid));
            for (const item of items) {
                const e = entityCache.get(item.targetQid);
                if (!e || e.missing || !(e.labels?.zh?.value || e.labels?.en?.value)) continue;
                const zh = e.labels?.zh?.value || e.labels?.en?.value;
                const en = e.labels?.en?.value || zh;
                const found = await dbGet(
                    `SELECT id FROM pi_organizations WHERE name_en = ? OR name_zh = ? LIMIT 1`, [en, zh]
                );
                let orgId = found?.id;
                if (!orgId) {
                    const created = await dbRun(
                        `INSERT INTO pi_organizations (slug, name_zh, name_en, description,
                         verification_status, confidence_level, is_public)
                         VALUES (?, ?, ?, ?, 'verified', 'high', 1)`,
                        [`org-${item.targetQid.toLowerCase()}`, zh, en,
                        e.descriptions?.zh?.value || e.descriptions?.en?.value || ""]
                    );
                    orgId = created.lastID;
                }
                const existing = await dbGet(
                    `SELECT id FROM pi_relationships WHERE source_entity_type = 'person'
                     AND source_entity_id = ? AND target_entity_type = 'organization'
                     AND target_entity_id = ? AND relationship_type = ? LIMIT 1`,
                    [personId, orgId, item.code]
                );
                if (!existing && newRelationships < MAX_RELATIONSHIPS) {
                    await dbRun(
                        `INSERT INTO pi_relationships (source_entity_type, source_entity_id,
                         target_entity_type, target_entity_id, relationship_type,
                         relationship_label, verification_status, is_public)
                         VALUES ('person', ?, 'organization', ?, ?, ?, 'verified', 1)`,
                        [personId, orgId, item.code, item.label]
                    );
                    newRelationships++;
                    relationsFound.push(`[${item.label}] ${zh}`);
                }
            }
        }

        while (queue.length > 0 && visited.size < MAX_PEOPLE && newRelationships < MAX_RELATIONSHIPS) {
            const current = queue.shift();
            if (visited.has(current.qid)) continue;
            await loadEntities([current.qid]);
            const currentEntity = entityCache.get(current.qid);
            if (!currentEntity || currentEntity.missing) continue;
            const currentId = await ensurePerson(current.qid);
            if (!currentId) continue;
            visited.add(current.qid);
            const currentClaims = currentEntity.claims || {};
            const edges = familyProperties.flatMap(rule =>
                getClaimItemIds(currentClaims, rule.prop).map(targetQid => ({ ...rule, targetQid }))
            );
            const uniqueEdges = edges.filter(edge => edge.targetQid !== current.qid);
            // Bound the per-node fanout; fetch in batches rather than silently taking the first 25 globally.
            const selected = uniqueEdges.slice(0, 35);
            if (uniqueEdges.length > selected.length) limitReached = true;
            await loadEntities(selected.map(edge => edge.targetQid));
            for (const edge of selected) {
                if (newRelationships >= MAX_RELATIONSHIPS) { limitReached = true; break; }
                const targetId = await ensurePerson(edge.targetQid);
                if (!targetId) continue;
                const targetEntity = entityCache.get(edge.targetQid);
                const targetName = targetEntity.labels?.zh?.value || targetEntity.labels?.en?.value;
                await ensurePersonRelationship(currentId, targetId, edge, targetName);
                if (current.depth + 1 < requestedDepth && !queued.has(edge.targetQid)
                    && queued.size < MAX_PEOPLE) {
                    queue.push({ qid: edge.targetQid, depth: current.depth + 1 });
                    queued.add(edge.targetQid);
                } else if (current.depth + 1 < requestedDepth && queued.size >= MAX_PEOPLE) {
                    limitReached = true;
                }
            }
            if (current.depth === 0) await importRootOrganizations(currentClaims);
        }

        return res.json({
            success: true,
            message: `已完成【${nameZh || nameEn}】V8.1.1 身份绑定 + V7 家族抓取`,
            person_id: personId,
            depth: requestedDepth,
            people_processed: visited.size,
            relationships_created: newRelationships,
            relations_count: relationsFound.length,
            limit_reached: limitReached,
            skipped_unresolved: skippedUnresolved,
            details: relationsFound
        });

    } catch (error) {

        console.error("Wikidata Ingest error:", error);

        return res.status(500).json({ success: false, message: "维基百科全景抓取发生错误: " + error.message });

    }

});




// V10: Read-only history list, independent of the people database.
router.get("/search-history", verifyAdminToken, async (req, res) => {
    try {
        const fs = require("fs/promises");
        const file = require("path").join(__dirname, "../data/pi-search-history.jsonl");
        let raw = "";
        try { raw = await fs.readFile(file, "utf8"); }
        catch (e) { if (e.code !== "ENOENT") throw e; }
        const records = raw.trim().split("\n").filter(Boolean).slice(-200).reverse()
            .map(line => { try { return JSON.parse(line); } catch { return null; } })
            .filter(Boolean);
        res.json({ success: true, records });
    } catch (e) {
        console.error("PI history list:", e.message);
        res.status(500).json({ success: false, message: "搜索历史读取失败" });
    }
});

module.exports = router;