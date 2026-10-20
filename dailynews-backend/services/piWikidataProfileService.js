
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

const API_URL = "https://www.wikidata.org/w/api.php";


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

const MAX_RELATED_IDS = 100;
const MAX_CHILD_PARENT_LOOKUPS = 60;

async function wikidataRequest(params) {
    const url = new URL(API_URL);

    for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
        headers: {
            Accept: "application/json",
            "User-Agent": "DailyNewsPeopleIntelligence/1.0"
        },
        signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
        throw new Error(
            `Wikidata HTTP ${response.status}`
        );
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(
            data.error.info ||
            data.error.code ||
            "Wikidata API error"
        );
    }

    return data;
}

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

async function getEntities(ids) {
    const entities = {};

    for (
        let index = 0;
        index < ids.length;
        index += 20
    ) {
        const batch = ids.slice(index, index + 20);

        const data = await wikidataRequest({
            action: "wbgetentities",
            ids: batch.join("|"),
            props: "labels|descriptions|claims",
            languages: "zh|zh-hans|zh-hant|en",
            format: "json"
        });

        Object.assign(
            entities,
            data.entities || {}
        );
    }

    return entities;
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

function buildChildParentSummary(
    childId,
    childEntity
) {
    const fatherIds = getEntityIds(
        childEntity,
        "P22"
    );

    const motherIds = getEntityIds(
        childEntity,
        "P25"
    );

    return {
        child_id: childId,
        father_ids: fatherIds,
        mother_ids: motherIds,
        father_status:
            fatherIds.length > 0
                ? "wikidata_declared"
                : "not_declared",
        mother_status:
            motherIds.length > 0
                ? "wikidata_declared"
                : "not_declared",
        verification_status: "external_candidate"
    };
}

function buildChildParentRelations(
    summaries
) {
    const relations = [];

    for (const summary of summaries) {
        const childId = summary.child_id;

        for (const fatherId of summary.father_ids) {
            relations.push({
                from: childId,
                to: fatherId,
                type: "father",
                label: "父亲",
                property: "P22",
                source: "Wikidata",
                source_url:
                    `https://www.wikidata.org/wiki/${childId}#P22`,
                verification_status:
                    "external_candidate"
            });
        }

        for (const motherId of summary.mother_ids) {
            relations.push({
                from: childId,
                to: motherId,
                type: "mother",
                label: "母亲",
                property: "P25",
                source: "Wikidata",
                source_url:
                    `https://www.wikidata.org/wiki/${childId}#P25`,
                verification_status:
                    "external_candidate"
            });
        }
    }

    return relations;
}

async function getWikidataProfile(req, res) {
    const qid = String(
        req.params.qid || ""
    ).trim().toUpperCase();

    if (!/^Q[1-9]\d*$/.test(qid)) {
        return res.status(400).json({
            success: false,
            message: "无效的 Wikidata 人物 ID"
        });
    }

    try {
        /*
         * Step 1: Load central person.
         */

        const rootData = await getEntities([qid]);
        const person = rootData[qid];

        if (
            !person ||
            person.missing !== undefined
        ) {
            return res.status(404).json({
                success: false,
                message: "Wikidata 中不存在该人物"
            });
        }

        if (
            !getEntityIds(person, "P31")
                .includes("Q5")
        ) {
            return res.status(422).json({
                success: false,
                message:
                    "该 Wikidata 实体未被标记为人类"
            });
        }

        /*
         * Step 2: Read direct relationships.
         */

        const relations = [];
        const relatedIds = new Set();

        for (
            const [property, type]
            of Object.entries(RELATION_PROPERTIES)
        ) {
            const ids = getEntityIds(
                person,
                property
            );

            for (const targetId of ids) {
                if (targetId === qid) {
                    continue;
                }

                relations.push({
                    from: qid,
                    to: targetId,
                    type,
                    label: PROPERTY_LABELS[type],
                    property,
                    source: "Wikidata",
                    source_url:
                        `https://www.wikidata.org/wiki/${qid}#${property}`,
                    verification_status:
                        "external_candidate"
                });

                relatedIds.add(targetId);
            }
        }

        if (
            relatedIds.size >
            MAX_RELATED_IDS
        ) {
            return res.status(422).json({
                success: false,
                message:
                    "关联实体数量超过当前接口安全限制"
            });
        }

        /*
         * Step 3: Load related entities.
         */

        const relatedEntities =
            await getEntities([...relatedIds]);

        const nodes = [
            buildNode(qid, person)
        ];

        for (const id of relatedIds) {
            nodes.push(
                buildNode(
                    id,
                    relatedEntities[id]
                )
            );
        }

        /*
         * Step 4: Build profile.
         */

        // V10.1: Resolve identity and education labels using the same live API.
        // These are display attributes, NOT graph edges or persisted records.
        const identityIds = [...new Set(
            ["P27", "P19", "P551", "P106", "P69"]
                .flatMap(property => getEntityIds(person, property))
        )].slice(0, 80);
        const identityEntities = await getEntities(
            identityIds.filter(id => !relatedEntities[id])
        );
        const identityNames = property => getEntityIds(person, property)
            .map(id => getLocalizedValue(
                (relatedEntities[id] || identityEntities[id])?.labels
            ) || id);

        const profile = {
            ...buildNode(qid, person),
            citizenship: identityNames("P27"),
            birthplace: identityNames("P19"),
            residence: identityNames("P551"),
            occupations: identityNames("P106"),
            education: identityNames("P69"),
            birth_date:
                getTimeValue(person, "P569"),
            death_date:
                getTimeValue(person, "P570"),
            gender_ids:
                getEntityIds(person, "P21"),
            occupation_ids:
                getEntityIds(person, "P106")
        };

        const familyTypes = new Set([
            "father",
            "mother",
            "spouse",
            "child",
            "sibling"
        ]);

        const familyRelations =
            relations.filter(
                item =>
                    familyTypes.has(item.type)
            );

        /*
         * Step 5: Read each child's parents.
         *
         * The child's record is already included
         * in relatedEntities, so no extra request
         * is needed for those child entities.
         */

        const childIds = [
            ...new Set(
                familyRelations
                    .filter(
                        item =>
                            item.type === "child"
                    )
                    .map(item => item.to)
            )
        ];

        let childParentLookupStatus =
            "completed";

        let childParentSummaries = [];
        let childParentRelations = [];

        if (
            childIds.length >
            MAX_CHILD_PARENT_LOOKUPS
        ) {
            childParentLookupStatus =
                "skipped_safety_limit";

        } else {
            childParentSummaries =
                childIds.map(childId =>
                    buildChildParentSummary(
                        childId,
                        relatedEntities[childId]
                    )
                );

            childParentRelations =
                buildChildParentRelations(
                    childParentSummaries
                );
        }

        /*
         * Step 6: Return original fields
         * plus new child-parent fields.
         *
         * Do not merge child-parent relations
         * into family_relations yet.
         *
         * This preserves the existing
         * frontend graph contract.
         */

        return res.json({
            success: true,
            source: "Wikidata",
            qid,
            profile,
            nodes,
            relations,
            family_relations:
                familyRelations,

            organization_relations:
                relations.filter(
                    item =>
                        item.type === "employer" ||
                        item.type === "owned_entity"
                ),

            commercial_relation_counts: {
                employer:
                    relations.filter(
                        item => item.type === "employer"
                    ).length,

                owned_entity:
                    relations.filter(
                        item => item.type === "owned_entity"
                    ).length
            },

            education_relations:
                relations.filter(
                    item =>
                        item.type === "education"
                ),

            /*
             * V9.1-A new fields.
             */

            child_parent_relations:
                childParentRelations,

            child_parent_summaries:
                childParentSummaries,

            child_parent_lookup_status:
                childParentLookupStatus,

            child_parent_count:
                childIds.length,

            child_parent_relation_count:
                childParentRelations.length,

            /*
             * Original counters.
             */

            node_count:
                nodes.length,

            relation_count:
                relations.length,


            notice:
                "仅展示 Wikidata 中直接声明的关系，未核验真实性。子女父母关系来自子女各自的声明，缺失关系不作推断。P108 表示雇主关系，P1830 表示拥有的实体；两者均不能单独证明当前持股比例或实际控制权。尚未查询企业反向创办者、CEO、董事及股东关系。"

        });

    } catch (error) {
        console.error(
            "[PI WIKIDATA PROFILE]",
            error.message
        );

        return res.status(502).json({
            success: false,
            message:
                "Wikidata 人物详情查询失败"
        });
    }
}

module.exports = {
    getWikidataProfile
};
