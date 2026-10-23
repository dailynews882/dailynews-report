
"use strict";

/*
 * V9.1-A
 * Wikidata external person profile service.
 *
 * New feature:
 * Query the explicitly declared father (P22)
 * and mother (P25) of each directly listed child.
 *
 * Safety:
 * - Read-only external API requests.
 * - No database writes.
 * - No inferred mother or father.
 * - Preserve existing response fields.
 * - Child-parent data remains unverified.
 */




const RELATION_PROPERTIES = {
    // Family relationships
    P22: "father",
    P25: "mother",
    P26: "spouse",
    P40: "child",
    P3373: "sibling",

    // Education
    P69: "education",

    // Commercial relationships
    P108: "employer",
    P1830: "owned_entity"
};



const PROPERTY_LABELS = {
    father: "父亲",
    mother: "母亲",
    spouse: "配偶",
    child: "子女",
    sibling: "兄弟姐妹",

    education: "教育机构",

    employer: "雇主 / 任职机构",
    owned_entity: "拥有的实体"
};



function getLocalizedValue(values) {
    if (!values) return "";

    for (const language of [
        "zh",
        "zh-hans",
        "zh-hant",
        "en"
    ]) {
        if (values[language]?.value) {
            return values[language].value;
        }
    }

    return Object.values(values)[0]?.value || "";
}

function getEntityId(claim) {
    if (
        !claim ||
        claim.rank === "deprecated" ||
        claim.mainsnak?.snaktype !== "value"
    ) {
        return null;
    }

    const value = claim.mainsnak.datavalue?.value;
    const id = value?.id;

    return (
        typeof id === "string" &&
        /^Q[1-9]\d*$/.test(id)
    )
        ? id
        : null;
}

function getEntityIds(entity, property) {
    const claims = entity?.claims?.[property] || [];
    const ids = new Set();

    for (const claim of claims) {
        const id = getEntityId(claim);

        if (id) {
            ids.add(id);
        }
    }

    return [...ids];
}

function getTimeValue(entity, property) {
    const claims = entity?.claims?.[property] || [];

    for (const claim of claims) {
        if (
            claim.rank === "deprecated" ||
            claim.mainsnak?.snaktype !== "value"
        ) {
            continue;
        }

        const value = claim.mainsnak.datavalue?.value;

        if (typeof value?.time === "string") {
            return {
                time: value.time,
                precision: value.precision ?? null
            };
        }
    }

    return null;
}

function getWikidataImageFilename(entity) {
    const claims = entity?.claims?.P18 || [];

    for (const claim of claims) {
        if (
            claim.rank === "deprecated" ||
            claim.mainsnak?.snaktype !== "value"
        ) {
            continue;
        }

        const filename = claim.mainsnak?.datavalue?.value;

        if (
            typeof filename === "string" &&
            filename.trim()
        ) {
            return filename.trim();
        }
    }

    return null;
}

/*
 * V9.3-A: Resolve Wikidata P18 image
 * to a Wikimedia Commons Special:FilePath URL.
 *
 * External candidate only.
 * No database writes.
 */
function getWikidataImageUrl(entity) {
    const claims = entity?.claims?.P18 || [];

    for (const claim of claims) {
        if (
            claim.rank === "deprecated" ||
            claim.mainsnak?.snaktype !== "value"
        ) {
            continue;
        }

        const filename = claim.mainsnak?.datavalue?.value;

        if (
            typeof filename !== "string" ||
            !filename.trim()
        ) {
            continue;
        }

        return (
            "https://commons.wikimedia.org/wiki/Special:FilePath/" +
            encodeURIComponent(filename.trim()) +
            "?width=240"
        );
    }

    return null;
}

function buildNode(id, entity) {
    return {
        id,
        name:
            getLocalizedValue(entity?.labels) || id,
        description:
            getLocalizedValue(entity?.descriptions),

        profile_image_url:
            getWikidataImageUrl(entity),

        image_source:
            getWikidataImageFilename(entity)
                ? "Wikimedia Commons / Wikidata P18"
                : null,

        birth_date:
            getTimeValue(entity || {}, "P569"),

        death_date:
            getTimeValue(entity || {}, "P570"),

        source: "Wikidata",
        source_url:
            `https://www.wikidata.org/wiki/${id}`,

        verification_status:
            "external_candidate"
    };
}


/*
 * Extract explicitly declared parents
 * from a child's own Wikidata record.
 *
 * Do not infer missing parents.
 */

async function getWikidataProfile(req, res) {
    const live = require("./piWikidataFamilyService");
    const qid = String(req.params.qid || "").trim().toUpperCase();
    if (!live.QID.test(qid)) return res.status(400).json({ success: false, message: "无效的 Wikidata 人物 ID" });
    const ctx = live.context();
    try {
        const rootData = await live.entities([qid], ctx, "root", true), person = rootData[qid];
        if (!person) return res.status(404).json({ success: false, message: "Wikidata 中不存在该人物" });
        if (!live.human(person)) return res.status(422).json({ success: false, message: "该实体未通过 P31=Q5 人物核验" });
        const wikipedia = require("./piWikipediaFamilyService");
        const [family, articleData] = await Promise.all([
            live.family(qid, person, ctx),
            wikipedia.extract(qid, person, ctx).catch(error => {
                live.warn(ctx, "wikipedia", live.errorCode(error));
                return { observations: [], articles: [], identities: {} };
            })
        ]);
        const related = family.entities;
        const otherRelations = [];
        for (const [property, type] of Object.entries(RELATION_PROPERTIES)) {
            if (live.TYPES[property]) continue;
            for (const target of live.ids(person, property).slice(0, 30)) {
                otherRelations.push({ from: qid, to: target, type, label: PROPERTY_LABELS[type], property,
                    source: "Wikidata", source_url: "https://www.wikidata.org/wiki/" + qid + "#" + property, verification_status: "external_candidate" });
            }
        }
        const identityIds = [...new Set(["P27", "P19", "P551", "P106", "P69"].flatMap(p => live.ids(person, p)))];
        const extraIds = [...new Set([...otherRelations.map(e => e.to), ...identityIds])].filter(id => !related[id]);
        const articleReserve = Math.min(wikipedia.LIMITS.nodes, articleData.observations.length);
        const remaining = Math.max(0, live.LIMITS.nodes - Object.keys(related).length - articleReserve);
        if (extraIds.length > remaining) live.warn(ctx, "optional", "NODE_LIMIT");
        Object.assign(related, await live.entities(extraIds.slice(0, remaining), ctx, "optional"));
        const nodes = Object.entries(related).map(([id, entity]) => ({ ...buildNode(id, entity), entity_type: live.human(entity) ? "human" : "other", gender_ids: live.ids(entity, "P21") }));
        const names = property => live.ids(person, property).map(id => live.localized(related[id]?.labels) || id);
        const profile = { ...nodes.find(n => n.id === qid), citizenship: names("P27"), birthplace: names("P19"), residence: names("P551"),
            occupations: names("P106"), education: names("P69"), occupation_ids: live.ids(person, "P106") };
        const articleFamily = wikipedia.combine(qid, nodes, family.relations, articleData);
        nodes.push(...articleFamily.nodes);
        if (articleFamily.limited) live.warn(ctx, "wikipedia", "NODE_LIMIT");
        const familyRelations = [...family.relations, ...articleFamily.relations];
        const relations = [...familyRelations, ...otherRelations];
        return res.json({ success: true, source: "Wikidata", qid, profile, nodes, relations,
            family_relations: familyRelations, child_parent_relations: family.childRelations,
            sources: ["Wikidata", ...(articleData.articles.length ? ["Wikipedia"] : [])], wikipedia_articles: articleData.articles,
            source_conflicts: articleFamily.conflicts,
            child_parent_summaries: family.summaries, child_parent_lookup_status: ctx.warnings.some(w => ["family", "co_parents"].includes(w.section)) ? "partial" : "completed",
            child_parent_count: family.summaries.length, child_parent_relation_count: family.childRelations.length,
            organization_relations: otherRelations.filter(r => ["employer", "owned_entity"].includes(r.type)),
            commercial_relation_counts: { employer: otherRelations.filter(r => r.type === "employer").length, owned_entity: otherRelations.filter(r => r.type === "owned_entity").length },
            education_relations: otherRelations.filter(r => r.type === "education"), node_count: nodes.length, relation_count: relations.length,
            partial_results: ctx.warnings.length > 0, warnings: ctx.warnings, family_depth: 1, limits: live.LIMITS,
            notice: "Wikidata 声明与 Wikipedia 文章记载分别保留，均待独立核验；文章称现任不代表已核实当前婚姻。跨代关系展示两段路径，未记载的中间身份明确标为未知；缺失不代表没有亲属。P108/P1830 不证明当前持股或控制权。" });
    } catch (error) {
        return res.status(502).json({ success: false, code: live.errorCode(error), message: "Wikidata 人物详情暂不可用，请稍后重试" });
    }
}
module.exports = { getWikidataProfile };
