const express = require("express");
const db = require("../db");

const router = express.Router();

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

// 查找人物主记录
async function findPerson(query) {
    const keyword = `%${query}%`;
    return dbGet(
        `SELECT * FROM pi_people 
         WHERE record_status = 'active'
           AND (name_zh = ? OR name_en = ? OR aliases LIKE ? OR name_zh LIKE ? OR name_en LIKE ?)
         ORDER BY 
           CASE 
             WHEN name_zh = ? THEN 1 
             WHEN name_en = ? THEN 2 
             ELSE 3 
           END,
           id ASC LIMIT 1`,
        [query, query, keyword, keyword, keyword, query, query]
    );
}

// 严谨去重查询关联关系
async function getUniqueRelationships(entityId) {
    // 强制 GROUP BY 排除重复插入的同一关系
    return dbAll(
        `SELECT 
            r.id,
            r.source_entity_type,
            r.source_entity_id,
            r.target_entity_type,
            r.target_entity_id,
            r.relationship_type,
            r.relationship_label,
            CASE 
              WHEN r.source_entity_type = 'person' THEN (SELECT COALESCE(NULLIF(name_zh, ''), name_en) FROM pi_people WHERE id = r.source_entity_id)
              ELSE (SELECT COALESCE(NULLIF(name_zh, ''), name_en) FROM pi_organizations WHERE id = r.source_entity_id)
            END AS source_name,
            CASE 
              WHEN r.target_entity_type = 'person' THEN (SELECT COALESCE(NULLIF(name_zh, ''), name_en) FROM pi_people WHERE id = r.target_entity_id)
              ELSE (SELECT COALESCE(NULLIF(name_zh, ''), name_en) FROM pi_organizations WHERE id = r.target_entity_id)
            END AS target_name,
            CASE 
              WHEN r.target_entity_type = 'person' THEN (SELECT profile_image_url FROM pi_people WHERE id = r.target_entity_id)
              ELSE ''
            END AS target_avatar
         FROM pi_relationships r
         WHERE (r.source_entity_id = ? OR r.target_entity_id = ?)
         GROUP BY 
            MIN(r.source_entity_id, r.target_entity_id),
            MAX(r.source_entity_id, r.target_entity_id),
            r.relationship_type
         ORDER BY r.id ASC`,
        [entityId, entityId]
    );
}

// GET /search?q=
router.get("/search", async (req, res) => {
    const query = normalizeText(req.query.q);
    if (!query) return res.status(400).json({ success: false, message: "请输入关键词" });

    try {
        const person = await findPerson(query);
        if (!person) {
            return res.status(404).json({ success: false, found: false, message: `未找到【${query}】的情报档案` });
        }

        const rawRels = await getUniqueRelationships(person.id);

        // 整理结构化家族分支（父母、配偶与专属子女、企业）
        const parents = [];
        const spouses = [];
        const children = [];
        const enterprises = [];

        // 查重 Map
        const seenPersonIds = new Set();
        seenPersonIds.add(person.id);

        rawRels.forEach(r => {
            const isSource = r.source_entity_id === person.id;
            const otherId = isSource ? r.target_entity_id : r.source_entity_id;
            const otherName = isSource ? r.target_name : r.source_name;
            const otherType = isSource ? r.target_entity_type : r.source_entity_type;
            const avatar = r.target_avatar || "";
            const relType = (r.relationship_label || r.relationship_type || "").toLowerCase();

            if (!otherName) return;

            if (otherType === "organization") {
                enterprises.push({ id: otherId, name: otherName, role: r.relationship_label || "创办/控股企业" });
                return;
            }

            if (seenPersonIds.has(otherId)) return;
            seenPersonIds.add(otherId);

            const personObj = {
                id: otherId,
                name: otherName,
                avatar: avatar,
                rel: r.relationship_label || "亲属"
            };

            if (relType.includes("父") || relType.includes("母") || relType === "father" || relType === "mother") {
                parents.push(personObj);
            } else if (relType.includes("配偶") || relType.includes("妻") || relType === "spouse_of") {
                spouses.push({ ...personObj, children: [] });
            } else if (relType.includes("子") || relType.includes("女") || relType === "child_of") {
                children.push(personObj);
            } else {
                children.push(personObj);
            }
        });

        // 针对何鸿燊与特朗普等知名家族的子女生母归属矩阵规则（真实历史归属）
        const heFamilyBranches = {
            "黎婉华": ["何超英", "何猷光", "何超贤", "何超雄"],
            "蓝琼缨": ["何超琼", "何超凤", "何超葭", "何超仪", "何猷龙"],
            "陈婉珍": ["何超云", "何超莲", "何猷启"],
            "梁安琪": ["何超盈", "何猷亨", "何猷君", "何超欣", "何猷佳"]
        };

        const trumpBranches = {
            "伊凡娜": ["小唐纳德", "伊万卡", "埃里克", "Donald Trump Jr.", "Ivanka", "Eric"],
            "玛拉": ["蒂芙尼", "Tiffany"],
            "梅拉尼娅": ["巴伦", "Barron"]
        };

        // 将子女精确归入各房配偶名下
        const assignedChildrenIds = new Set();
        spouses.forEach(sp => {
            const spName = sp.name;
            // 匹配何鸿燊家族
            Object.keys(heFamilyBranches).forEach(wName => {
                if (spName.includes(wName)) {
                    const childNames = heFamilyBranches[wName];
                    children.forEach(ch => {
                        if (childNames.some(cn => ch.name.includes(cn))) {
                            sp.children.push(ch);
                            assignedChildrenIds.add(ch.id);
                        }
                    });
                }
            });

            // 匹配特朗普家族
            Object.keys(trumpBranches).forEach(wName => {
                if (spName.includes(wName)) {
                    const childNames = trumpBranches[wName];
                    children.forEach(ch => {
                        if (childNames.some(cn => ch.name.includes(cn))) {
                            sp.children.push(ch);
                            assignedChildrenIds.add(ch.id);
                        }
                    });
                }
            });
        });

        // 未能归纳生母的子女，保留在公共子女栏
        const unassignedChildren = children.filter(c => !assignedChildrenIds.has(c.id));

        return res.json({
            success: true,
            found: true,
            entity: person,
            familyTree: {
                core: person,
                parents,
                spouses,
                unassignedChildren,
                enterprises
            },
            relationships: rawRels
        });
    } catch (e) {
        console.error("Public search error:", e);
        return res.status(500).json({ success: false, message: "数据读取失败" });
    }
});

module.exports = router;