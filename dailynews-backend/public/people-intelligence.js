/* =========================================================

   Global Capital & Strict Family Hierarchy Engine (V4.0)

   File: public/people-intelligence.js

========================================================= */



let currentData = null;
let ciRequestSequence = 0;


/*
 * V9.3-B: External Wikidata organization candidates.
 * Cache belongs to the current external graph only.
 * Never merge these candidates into verified local records.
 */
let piExternalOrganizationCache = new Map();
let piExternalOrganizationNodeMap = new Map();
let piExternalRootQid = null;
let piCurrentExternalProfile = null;

function piDisplayList(values) {
    return Array.isArray(values) && values.length
        ? [...new Set(values.filter(Boolean))].join("、")
        : "暂无数据";
}
function piFillExternalIdentity(profile, relationship = "") {
    const set = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value || "暂无数据";
    };
    const country = piDisplayList(profile.citizenship);
    const residence = piDisplayList(profile.residence);
    const birthplace = piDisplayList(profile.birthplace);
    set("infoCountry", [
        country !== "暂无数据" ? `国籍：${country}` : "",
        residence !== "暂无数据" ? `居住：${residence}` : "",
        birthplace !== "暂无数据" ? `出生地：${birthplace}` : ""
    ].filter(Boolean).join("；") || "暂无数据");
    set("infoEducation", piDisplayList(profile.education));
    set("infoMarital", relationship ||
        "请查看左侧关系图；婚姻现状需独立核验");
    if (Array.isArray(profile.occupations) && profile.occupations.length) {
        set("infoRole", piDisplayList(profile.occupations));
    }
}



function renderSelectedExternalOrganizations(qid) {
    const box = document.getElementById("infoBizList");
    const positions = document.getElementById("ciPositions");
    const ownership = document.getElementById("ciOwnership");
    const coreOrg = document.getElementById("infoCoreOrg");
    if (!box) return;

    const relations = piExternalOrganizationCache.get(String(qid)) || [];
    const grouped = new Map();
    for (const relation of relations) {
        const id = String(relation?.to || "");
        if (!/^Q[1-9]\d*$/.test(id) ||
            !["employer", "owned_entity"].includes(relation?.type)) continue;
        if (!grouped.has(id)) grouped.set(id, new Set());
        grouped.get(id).add(relation.type);
    }

    const entities = [...grouped].map(([id, types]) => ({
        id, types, node: piExternalOrganizationNodeMap.get(id) || {}
    })).sort((a, b) =>
        Number(b.types.has("owned_entity")) - Number(a.types.has("owned_entity")) ||
        String(a.node.name || a.id).localeCompare(String(b.node.name || b.id), "zh")
    );
    const escape = value => String(value ?? "").replace(/[&<>"']/g,
        ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const employerCount = entities.filter(e => e.types.has("employer")).length;
    const ownedCount = entities.filter(e => e.types.has("owned_entity")).length;

    if (positions) {
        positions.textContent = employerCount
            ? `Wikidata 记录 ${employerCount} 个任职机构；具体职务与任期未提供或尚待核验。`
            : "暂无可核验的任职机构声明";
    }
    if (ownership) {
        ownership.textContent = ownedCount
            ? `Wikidata 记录 ${ownedCount} 个“拥有实体”声明（P1830）；不代表已核实持股比例、当前股权或控制权。`
            : "暂无可核验的持股比例及控制权数据";
    }
    if (coreOrg) coreOrg.textContent = entities.length
        ? entities.slice(0, 3).map(e => e.node.name || e.id).join("、") +
        (entities.length > 3 ? ` 等 ${entities.length} 个关联实体` : "")
        : "暂无数据";

    box.classList.remove("ci-empty");
    if (!entities.length) {
        box.textContent = "Wikidata 暂无该人物的 P108 / P1830 企业关联声明。";
        return;
    }
    const cards = entities.map(e => {
        const tags = [
            e.types.has("employer") ? "任职机构 · P108" : "",
            e.types.has("owned_entity") ? "拥有实体声明 · P1830" : ""
        ].filter(Boolean);
        return `<div style="border-bottom:1px solid #e2e8f0;padding:11px 2px;overflow-wrap:anywhere">
            <div style="font-weight:700;color:#172554">${escape(e.node.name || e.id)}</div>
            ${e.node.description ? `<div style="font-size:12px;color:#64748b;margin:4px 0">${escape(e.node.description)}</div>` : ""}
            <div style="font-size:12px;color:#334155">${tags.map(escape).join(" · ")}</div>
            <a style="font-size:12px" href="https://www.wikidata.org/wiki/${encodeURIComponent(e.id)}"
               target="_blank" rel="noopener noreferrer">查看原始实体 ↗</a>
        </div>`;
    }).join("");
    box.innerHTML = `<div style="padding:10px 12px;background:#f1f5f9;border-radius:8px;font-size:12px;line-height:1.7">
        <strong>${entities.length} 个不同关联实体</strong> · 任职 ${employerCount} · 拥有声明 ${ownedCount}<br>
        <span style="color:#64748b">按实体合并去重；不代表当前股权或实际控制权。</span>
    </div><details style="margin-top:10px"><summary style="cursor:pointer;padding:9px 0;color:#1d4ed8;font-weight:600">
        展开查看全部 ${entities.length} 家关联实体</summary>${cards}</details>`;
}


let ciOrgRequestSequence = 0;

let svg, gContainer, zoomHandler;

document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("piFamilyReadingSize")?.addEventListener("click", () => window.PIExternalGraph?.focus());

    initSvg();

    bindEvents();



    const params = new URLSearchParams(window.location.search);

    const searchTarget = params.get("q") || "何鸿燊";

    document.getElementById("globalSearchInput").value = searchTarget;

    loadPersonTopology(searchTarget);

});



function initSvg() {

    svg = d3.select("#familyTreeSvg");

    svg.selectAll("*").remove();



    gContainer = svg.append("g").attr("class", "tree-main-group");



    zoomHandler = d3.zoom()

        .scaleExtent([0.15, 2.5])

        .on("zoom", (event) => gContainer.attr("transform", event.transform));



    svg.call(zoomHandler);

}



function bindEvents() {

    document.getElementById("globalSearchForm")?.addEventListener("submit", (e) => {

        e.preventDefault();

        const target = document.getElementById("globalSearchInput").value.trim();

        if (target) {

            window.history.replaceState(null, "", `?q=${encodeURIComponent(target)}`);

            loadPersonTopology(target);

        }

    });



    document.getElementById("btnTreeCenter")?.addEventListener("click", () => {

        svg.transition().duration(600).call(

            zoomHandler.transform,

            d3.zoomIdentity.translate(0, 0).scale(0.85)

        );

    });



    document.getElementById("btnZoomIn")?.addEventListener("click", () => svg.transition().duration(300).call(zoomHandler.scaleBy, 1.25));

    document.getElementById("btnZoomOut")?.addEventListener("click", () => svg.transition().duration(300).call(zoomHandler.scaleBy, 0.8));

}




/* =========================================================
   V9.0-S6: 本地人物优先 + Wikidata 外部人物候选
   不修改 V8.2 家族树布局，不写入数据库
========================================================= */

let piExternalSearchSequence = 0;
let piExternalProfileSequence = 0;
let piExternalProfileController = null;
let piExternalSearchController = null;
let piLiveMode = false;
let piSelectedExternalQid = null;
let piSelectedExternalVersion = 0;
let piExternalBusy = false;
let piSelectionController = null;
let piSelectionSequence = 0;
let piSelectionPromise = null;
let piSelectionRequestQid = null;

function piFamilyStatus(message) {
    const status = document.getElementById("piFamilyStatus");
    if (status) status.textContent = message;
}
function piPartialNotice(data) {
    const codes = { TIMEOUT: "超时", RATE_LIMITED: "限流", BUSY: "请求繁忙", NODE_LIMIT: "节点上限", RESULT_LIMIT: "反向结果上限", REQUEST_LIMIT: "请求上限", ENTITY_MISSING: "实体缺失", UNVERIFIED_PERSON_OMITTED: "未通过人物核验的关系已省略" };
    const difference = data.source_conflicts?.length ? ` 发现 ${data.source_conflicts.length} 项来源差异／身份待核对；保留双方证据，未覆盖。` : "";
    return (data.partial_results ? "部分资料未完成：" + (data.warnings || []).map(w => w.section + "：" + (codes[w.code] || w.code || "外部请求失败")).join("；") + "。缺失不代表没有亲属。" : "实时声明及文章记载均待独立核验；点击人物查看来源，可按 QID 展开。最多两层。") + difference;
}
function piUpdateExpandButton() {
    const button = document.getElementById("piExpandPerson");
    if (button) button.disabled = piExternalBusy || !piSelectedExternalQid || !window.PIExternalGraph?.canExpand(piSelectedExternalQid);
}
function piResetFamilyPanel() {
    ++piSelectionSequence; piSelectionController?.abort(); piSelectionPromise = null; piSelectionRequestQid = null;
    piSelectedExternalQid = null; piSelectedExternalVersion++; piExternalBusy = false;
    document.getElementById("piFamilyEvidenceList")?.replaceChildren();
    piUpdateExpandButton();
}
function piShowEvidence(detail) {
    const list = document.getElementById("piFamilyEvidenceList");
    if (!list) return;
    list.replaceChildren();
    const link = (container, text, url) => {
        try { const parsed = new URL(url); if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password) return;
            const a = createExternalText("a", text); a.href = parsed.href; a.target = "_blank"; a.rel = "noopener noreferrer"; container.append(a); } catch (_) { /* Invalid source URL is not clickable. */ }
    };
    for (const path of detail.paths || []) list.append(createExternalText("p", path.label + "：" + path.from + " → " + path.via + " → " + path.to + "；由两条有来源的关系边组成，不是单条直接声明。"));
    const edges = [...new Map([...(detail.edges || []), ...(detail.paths || []).flatMap(p => p.steps || [])].map(e => [e.evidence_id || e.statement_id || [e.from,e.to,e.type,e.source_url].join("|"),e])).values()];
    if (!edges.length) list.append(createExternalText("p", "暂无可展示的声明；不能据此认定不存在亲属。"));
    for (const edge of edges.slice(0, 40)) {
        const item = document.createElement("div"); item.className = "pi-family-evidence-item";
        item.append(createExternalText("p", (edge.statement_subject || edge.from) + " → " + (edge.statement_object || edge.to) + " · " + (edge.property || edge.type) + " · " + (edge.statement_label || edge.label || edge.type)));
        link(item, edge.source === "Wikipedia" ? "文章修订来源 ↗" : "原始声明 ↗", edge.source_url);
        if (edge.article) {
            const article = edge.article;
            item.append(createExternalText("p", `来源类型：Wikipedia 文章记载／待独立核验；${article.title}；修订 ${article.revision_id}；${article.location?.field || article.location?.section || ""}`));
            if (edge.derived) item.append(createExternalText("p", "路径分解：由文章亲属称谓展开，并非文章逐条直接声明；中间身份可能未知。"));
            item.append(createExternalText("p", article.excerpt || ""));
            if (!article.citations?.length) item.append(createExternalText("p", "该段未提供可用引用。"));
            for (const citation of article.citations || []) {
                link(item, "文章引用 ↗", citation.url); item.append(createExternalText("p", citation.text || citation.id));
                for (const url of citation.urls || []) link(item, "引用链接 ↗", url);
            }
        } else item.append(createExternalText("p", "声明 ID：" + (edge.statement_id || "来源未提供") + "；独立核验：未完成"));
        if (edge.source_difference) item.append(createExternalText("p", "此关系存在来源差异／身份待核对，请对照 Wikidata 与文章，不能据此认定任一方正确。"));
        if (Object.keys(edge.qualifiers || {}).length) item.append(createExternalText("pre", "限定条件：" + JSON.stringify(edge.qualifiers, null, 2)));
        const refs = edge.references || [];
        if (!refs.length && !edge.article) item.append(createExternalText("p", "该声明未提供可用参考文献。"));
        for (const reference of refs) {
            for (const snak of reference.snaks?.P854 || []) link(item, "参考文献 ↗", snak.datavalue?.value);
            for (const snak of reference.snaks?.P248 || []) {
                const id = snak.datavalue?.value?.id;
                if (/^Q[1-9]\d*$/.test(id || "")) link(item, "引述来源 " + id + " ↗", "https://www.wikidata.org/wiki/" + id);
            }
            item.append(createExternalText("pre", "参考声明：" + JSON.stringify(reference.snaks || {}, null, 2)));
        }
        list.append(item);
    }
    if (edges.length > 40) list.append(createExternalText("p", "当前仅显示前 40 条证据，请选择具体人物或连线查看。"));
}
async function piExpandExternalPerson(qid) {
    if (!/^Q[1-9]\d*$/.test(qid || "") || !window.PIExternalGraph?.canExpand(qid)) return;
    const version = piSelectedExternalVersion, searchVersion = piExternalSearchSequence;
    const sequence = ++piExternalProfileSequence;
    piExternalProfileController?.abort();
    const controller = piExternalProfileController = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    piExternalBusy = true; piUpdateExpandButton(); piFamilyStatus("正在实时展开 " + qid + "…");
    try {
        const shared = piSelectionRequestQid === qid ? piSelectionPromise : null;
        const data = shared ? await shared : await piReadSelectedProfile(qid, controller.signal);
        if (sequence !== piExternalProfileSequence || searchVersion !== piExternalSearchSequence || version !== piSelectedExternalVersion) return;
        const result = window.PIExternalGraph.merge(data);
        if (!result.rendered) { piFamilyStatus("已达到展开边界，未重复加载。"); return; }
        piExternalOrganizationCache.set(qid, data.organization_relations || []);
        for (const node of data.nodes || []) piExternalOrganizationNodeMap.set(node.id, node);
        const selected = data.profile || {};
        piRenderSelectedInfo(selected, { relationship: "关系见图谱中心视角标签" });
        piShowEvidence({ edges: data.family_relations || [] });
        piFamilyStatus(piPartialNotice(data) + (result.limited ? " 已达到当前图谱节点上限。" : ""));
    } catch (error) {
        if (sequence === piExternalProfileSequence && searchVersion === piExternalSearchSequence && version === piSelectedExternalVersion)
            piFamilyStatus("展开未完成：" + (controller.signal.aborted ? "请求超时或已取消" : error.message) + "；保留已显示关系，可稍后重试。");
    } finally {
        clearTimeout(timer);
        if (sequence === piExternalProfileSequence) { piExternalBusy = false; piUpdateExpandButton(); }
    }
}
window.addEventListener("pi:external-expand", event => piExpandExternalPerson(event.detail?.qid));
window.addEventListener("pi:external-evidence-selected", event => piShowEvidence(event.detail || {}));
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("piExpandPerson")?.addEventListener("click", () => piExpandExternalPerson(piSelectedExternalQid));
    document.getElementById("piShowFamilyEvidence")?.addEventListener("click", () => {
        const panel = document.getElementById("piFamilyEvidence"); if (panel) { panel.open = true; panel.scrollIntoView({ block: "nearest" }); }
    });
});

function getExternalCandidatePanel() {
    let panel = document.getElementById("piExternalCandidatePanel");

    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = "piExternalCandidatePanel";
    panel.hidden = true;

    Object.assign(panel.style, {
        position: "fixed",
        top: "90px",
        left: "50%",
        transform: "translateX(-50%)",
        width: "min(720px, calc(100vw - 32px))",
        maxHeight: "75vh",
        overflowY: "auto",
        padding: "20px",
        background: "#ffffff",
        color: "#172033",
        border: "1px solid #cbd5e1",
        borderRadius: "12px",
        boxShadow: "0 12px 40px rgba(0,0,0,0.22)",
        zIndex: "9999"
    });

    document.body.appendChild(panel);

    return panel;
}

function closeExternalCandidatePanel() {
    const panel = document.getElementById("piExternalCandidatePanel");

    if (panel) {
        panel.hidden = true;
        panel.replaceChildren();
    }
}

function createExternalText(tag, value) {
    const element = document.createElement(tag);
    element.textContent = String(value || "");
    return element;
}

function renderExternalCandidates(payload, query) {
    const panel = getExternalCandidatePanel();
    panel.replaceChildren();
    panel.hidden = false;

    const header = document.createElement("div");

    Object.assign(header.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "12px"
    });

    const title = createExternalText(
        "h2",
        `Wikidata 实时搜索：${query}`
    );

    title.style.margin = "0";

    const closeButton = createExternalText("button", "关闭");
    closeButton.type = "button";
    closeButton.style.cursor = "pointer";
    closeButton.addEventListener(
        "click",
        closeExternalCandidatePanel
    );

    header.append(title, closeButton);
    panel.appendChild(header);

    const notice = createExternalText(
        "p",
        "以下资料来自 Wikidata，尚未完成本站身份及关系核验，不代表已收录为正式人物档案。"
    );

    notice.style.color = "#64748b";
    panel.appendChild(notice);

    const candidates = Array.isArray(payload.candidates)
        ? payload.candidates
        : [];

    if (!candidates.length) {
        panel.appendChild(
            createExternalText(
                "p",
                "未找到符合 Wikidata 人物类型条件的候选。"
            )
        );
        return;
    }

    for (const candidate of candidates) {
        if (
            candidate.entity_type !== "human" ||
            candidate.type_checked !== true ||
            !/^Q[1-9]\d*$/.test(candidate.wikidata_id || "")
        ) {
            continue;
        }

        const card = document.createElement("article");

        Object.assign(card.style, {
            border: "1px solid #e2e8f0",
            borderRadius: "9px",
            padding: "14px",
            marginTop: "12px"
        });

        const name = createExternalText(
            "h3",
            candidate.name || candidate.wikidata_id
        );

        name.style.margin = "0 0 8px";

        const description = createExternalText(
            "p",
            candidate.description || "暂无人物简介"
        );

        const identifier = createExternalText(
            "p",
            `Wikidata ID：${candidate.wikidata_id}`
        );

        identifier.style.fontSize = "12px";
        identifier.style.color = "#64748b";

        const link = createExternalText(
            "a",
            "查看 Wikidata 原始资料 ↗"
        );

        link.href =
            `https://www.wikidata.org/wiki/${candidate.wikidata_id}`;

        link.target = "_blank";
        link.rel = "noopener noreferrer";


        const generateButton = document.createElement("button");

        generateButton.type = "button";
        generateButton.textContent = "生成实时人物关系图";

        Object.assign(generateButton.style, {
            display: "block",
            marginTop: "12px",
            padding: "9px 16px",
            background: "#2454d6",
            color: "#ffffff",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer"
        });

        generateButton.addEventListener("click", async () => {
            const searchVersion = piExternalSearchSequence;
            const sequence = ++piExternalProfileSequence;
            piExternalProfileController?.abort();
            const controller = piExternalProfileController = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30000);
            piResetFamilyPanel();
            generateButton.disabled = true;
            generateButton.textContent = "正在读取人物关系…";

            try {
                const response = await fetch(
                    `/api/people-intelligence/external/profile/${encodeURIComponent(candidate.wikidata_id)}`,
                    { cache: "no-store", signal: controller.signal }
                );

                const data = await response.json();
                if (sequence !== piExternalProfileSequence || searchVersion !== piExternalSearchSequence) return;

                if (!response.ok || !data.success) {
                    throw new Error(
                        data.message || "外部人物关系查询失败"
                    );
                }

                if (!window.PIExternalGraph) {
                    throw new Error("外部关系图渲染器尚未加载");
                }


                // V9.0: Synchronize external person graph and right infobox.
                // Never mix verified local records with external candidates.

                // Invalidate any pending commercial request for the previous person.
                ciRequestSequence += 1;

                // The external person is not a verified local database entity.
                currentData = null;

                // Render the external relationship graph.
                piResetFamilyPanel();
                window.PIExternalGraph.render(data);
                piFamilyStatus(piPartialNotice(data));
                piShowEvidence({ edges: data.family_relations || [] });

                const profile = data.profile || {};

                // Update external identity.
                const setExternalText = (id, value) => {
                    const element = document.getElementById(id);
                    if (element) {
                        element.textContent = value || "--";
                    }
                };

                setExternalText(
                    "infoNameZh",
                    profile.name || candidate.name || "外部人物"
                );

                setExternalText(
                    "infoNameEn",
                    profile.id ? `Wikidata · ${profile.id}` : "Wikidata 外部候选"
                );

                // V9.3-B: Display the selected external person's photo.
                // Only use the image URL returned by the Wikidata API.
                const photo = document.getElementById("infoPhoto");
                const photoWrap = document.getElementById("infoPhotoWrap");

                const externalPhotoUrl =
                    typeof profile.profile_image_url === "string" &&
                        profile.profile_image_url.startsWith(
                            "https://commons.wikimedia.org/"
                        )
                        ? profile.profile_image_url
                        : "";

                if (photo) {
                    if (externalPhotoUrl) {
                        photo.src = externalPhotoUrl;
                    } else {
                        photo.removeAttribute("src");
                    }
                }

                if (photoWrap) {
                    photoWrap.style.display =
                        externalPhotoUrl ? "block" : "none";
                }

                // Wikidata profile currently provides a description and dates.
                setExternalText("infoRole", profile.description || "外部人物候选");

                const formatExternalDate = (value) => {
                    const time = value?.time || value;
                    if (typeof time !== "string") return "--";

                    const match = time.match(/^([+-]?\d{4,})-(\d{2})-(\d{2})/);
                    return match
                        ? `${match[1].replace(/^\+/, "")}-${match[2]}-${match[3]}`
                        : "--";
                };

                setExternalText(
                    "infoBirth",
                    formatExternalDate(profile.birth_date)
                );

                setExternalText(
                    "infoDeath",
                    formatExternalDate(profile.death_date)
                );

                // These fields have not yet been verified for this candidate.
                piCurrentExternalProfile = profile;
                piFillExternalIdentity(profile);
                setExternalText("infoCoreOrg", "暂无数据");

                // Clear ALL previously displayed local commercial intelligence.
                const pendingFields = {
                    infoBizList: "Wikidata 商业关系待核验",
                    ciPositions: "外部人物商业任职待核验",
                    ciOwnership: "外部人物持股与控制权待核验",
                    ciIndustries: "外部人物产业与资本事件待核验",
                    ciNews: "外部人物商业新闻与风险事件待核验"
                };

                for (const [id, message] of Object.entries(pendingFields)) {
                    const element = document.getElementById(id);

                    if (element) {
                        element.textContent = message;
                        element.classList.add("ci-empty");
                    }
                }

                /*
                * V9.2-A: External commercial relationship display.
                * Read-only Wikidata candidates.
                * Never merge external data into verified local records.
                */

                const externalRelations = Array.isArray(data.organization_relations)
                    ? data.organization_relations
                    : [];

                const externalNodeMap = new Map(
                    (Array.isArray(data.nodes) ? data.nodes : [])
                        .filter(node => node && node.id)
                        .map(node => [node.id, node])
                );


                // 100 buckets are a classification schema, not a second public biography.
                const bucketPanel = document.getElementById("piBucketPanel");
                if (bucketPanel) bucketPanel.hidden = true;

                // V9.3-B: Replace the cache whenever a new external graph is generated.
                piExternalOrganizationCache = new Map();
                piExternalOrganizationNodeMap = externalNodeMap;
                piExternalRootQid = data.qid || profile.id || null;

                if (piExternalRootQid) {
                    piExternalOrganizationCache.set(
                        piExternalRootQid,
                        externalRelations
                    );
                }


                const escapeExternalHTML = value =>
                    String(value ?? "").replace(/[&<>"']/g, character => ({
                        "&": "&amp;",
                        "<": "&lt;",
                        ">": "&gt;",
                        '"': "&quot;",
                        "'": "&#39;"
                    }[character]));

                const employerRelations = externalRelations.filter(
                    relation =>
                        relation &&
                        relation.type === "employer" &&
                        typeof relation.to === "string" &&
                        /^Q[1-9]\d*$/.test(relation.to)
                );

                const externalOrganizations = [
                    ...new Map(
                        employerRelations.map(relation => [
                            relation.to,
                            relation
                        ])
                    ).values()
                ];

                /*
                * V9.2-B: External organization intelligence cards.
                * Read-only, source-linked, and clearly classified.
                */

                const renderExternalOrganization = relation => {
                    const organization = externalNodeMap.get(relation.to);

                    const organizationName =
                        organization?.name || relation.to;

                    const organizationDescription =
                        organization?.description || "";

                    const sourceURL =
                        `https://www.wikidata.org/wiki/${encodeURIComponent(relation.to)}`;

                    const relationshipType = {
                        employer: "雇主 / 任职机构",
                        founder: "创办人关联",
                        executive: "管理职务",
                        shareholder: "股东关系"
                    }[relation.type] || "其他商业关联";

                    return `
                       <div class="ci-entry" style="
                           margin-bottom: 12px;
                           padding: 13px 15px;
                           border: 1px solid #dbe3ee;
                           border-left: 3px solid #2454d6;
                           border-radius: 8px;
                           background: #ffffff;
                           overflow-wrap: anywhere;
                       ">
                           <div style="
                               font-size: 15px;
                               font-weight: 700;
                               color: #172554;
                               margin-bottom: 7px;
                           ">
                               ${escapeExternalHTML(organizationName)}
                           </div>

                           ${organizationDescription ? `
                               <div style="
                                   font-size: 12px;
                                   color: #64748b;
                                   margin-bottom: 9px;
                                   line-height: 1.5;
                               ">
                                   ${escapeExternalHTML(organizationDescription)}
                               </div>
                           ` : ""}

                           <div style="
                               font-size: 13px;
                               line-height: 1.8;
                               color: #334155;
                           ">
                               <div>
                                   <strong>关系性质：</strong>
                                   ${escapeExternalHTML(relationshipType)}
                               </div>

                               <div>
                                   <strong>数据属性：</strong>
                                   Wikidata ${escapeExternalHTML(relation.property || "P108")}
                               </div>

                               <div>
                                   <strong>核验状态：</strong>
                                   外部候选，尚未独立核验
                               </div>
                           </div>

                           <div style="
                               margin-top: 10px;
                               padding-top: 9px;
                               border-top: 1px solid #e2e8f0;
                           ">
                               <a href="${sourceURL}"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style="
                                      color: #2454d6;
                                      font-size: 12px;
                                      text-decoration: none;
                                  ">
                                   查看 Wikidata 企业资料 ↗
                               </a>
                           </div>
                       </div>
                   `;
                };


                /*
                 * V9.4-B1: Unified external commercial rendering.
                 * Show P108 employer and P1830 owned-entity candidates.
                 * The same renderer is used when selecting graph nodes.
                 * Read-only; never modify verified local records.
                 */
                if (piExternalRootQid) {
                    renderSelectedExternalOrganizations(
                        String(piExternalRootQid)
                    );
                }


                // Employment does not establish ownership or control.
                // Keep ownership and capital information unverified.

                setExternalText(
                    "infoBiography",
                    profile.description
                        ? `${profile.description}\n\n资料来源：Wikidata。人物身份及关系尚未经过本站独立核验。`
                        : "Wikidata 外部人物候选，人物资料尚待核验。"
                );

                const wikiLink = document.getElementById("infoWikiUrl");

                if (wikiLink) {
                    wikiLink.href = profile.id
                        ? `https://www.wikidata.org/wiki/${encodeURIComponent(profile.id)}`
                        : "#";

                    wikiLink.textContent = "查看 Wikidata 原始资料 ↗";
                }

                closeExternalCandidatePanel();


            } catch (error) {
                if (sequence !== piExternalProfileSequence || searchVersion !== piExternalSearchSequence) return;
                console.error("生成外部关系图失败:", error);

                alert(`生成失败：${error.message}`);

            } finally {
                clearTimeout(timer);
                generateButton.disabled = false;
                generateButton.textContent = "生成实时人物关系图";
            }
        });

        card.append(
            name,
            description,
            identifier,
            link,
            generateButton
        );

        panel.appendChild(card);

    }

    if (payload.partial_results) {
        const warning = createExternalText(
            "p",
            "部分语言搜索失败，当前结果可能不完整。"
        );

        warning.style.color = "#b45309";
        panel.appendChild(warning);
    }
}

async function loadPersonTopology(name) {
    const query = String(name || "").trim();
    if (!query) return;
    const sequence = ++piExternalSearchSequence;
    piLiveMode = true;
    ++piExternalProfileSequence; piExternalProfileController?.abort();
    piExternalSearchController?.abort();
    const searchController = piExternalSearchController = new AbortController();
    const searchTimer = setTimeout(() => searchController.abort(), 30000);
    piResetFamilyPanel(); piFamilyStatus("正在检索实时人物身份…");
    ciRequestSequence += 1;
    currentData = null;
    piExternalOrganizationCache = new Map();
    piExternalOrganizationNodeMap = new Map();
    piExternalRootQid = null;
    piCurrentExternalProfile = null;
    if (window.PIExternalGraph) window.PIExternalGraph.hide();
    if (gContainer) gContainer.selectAll("*").remove();
    closeExternalCandidatePanel();
    const panel = getExternalCandidatePanel();
    panel.hidden = false;
    panel.replaceChildren(createExternalText("p", `正在实时查询 Wikidata：${query}…`));
    // The history endpoint records the query only, never the fetched profile.
    fetch("/api/people-intelligence/search-history", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, source: "Wikidata" }), signal: AbortSignal.timeout(5000)
    }).catch(() => { });
    try {
        const response = await fetch(
            `/api/people-intelligence/external/search?q=${encodeURIComponent(query)}`,
            { cache: "no-store", signal: searchController.signal }
        );
        const data = await response.json();
        if (sequence !== piExternalSearchSequence) return;
        if (!response.ok || !data.success) throw new Error(data.message || "实时搜索失败");
        renderExternalCandidates(data, query);
        piFamilyStatus(data.partial_results ? piPartialNotice(data) : "请选择通过人物类型核验的候选，再生成家族图谱。");
    } catch (error) {
        if (sequence !== piExternalSearchSequence) return;
        console.error("Wikidata 实时搜索失败:", error);
        panel.hidden = false;
        panel.replaceChildren(createExternalText("p", `实时搜索失败：${error.message}`));
    } finally { clearTimeout(searchTimer); }
}

/* =========================================================

   核心严谨家谱分房支系树布局算法

========================================================= */



function renderStrictFamilyTree(familyTree) {

    gContainer.selectAll("*").remove();

    const {
        core,
        parents = [],
        spouses = [],
        familyUnits = [],
        children = [],
        unassignedChildren = []
    } = familyTree;

    const units = familyUnits.length
        ? familyUnits
        : spouses.map(spouse => ({
            spouse,
            children: spouse.children || []
        }));

    const svgElement = document.getElementById("familyTreeSvg");
    const canvasWidth = Math.max(
        760,
        svgElement?.clientWidth || (window.innerWidth - 450)
    );
    const centerX = canvasWidth / 2;

    // V8.2 紧凑家谱：父母 -> 核心 -> 各配偶分房 -> 共同子女
    const parentY = 70;
    const coreY = 185;
    const spouseY = 315;
    const childY = 430;
    const unassignedY = 535;

    const displayName = item =>
        item?.name || item?.name_zh || item?.name_en || `#${item?.id || "?"}`;

    const displayAvatar = item =>
        item?.avatar || item?.profile_image_url || "";

    const coreNode = {
        id: core.id,
        name: core.name_zh || core.name_en,
        avatar: core.profile_image_url || "",
        role: "核心人物",
        x: centerX,
        y: coreY,
        category: "core",
        stroke: "#1d4ed8",
        raw: core
    };

    // 父母在核心上方横向紧凑排列。
    const parentGap = 150;
    const pNodes = parents.map((parent, index) => ({
        id: parent.id,
        name: displayName(parent),
        avatar: displayAvatar(parent),
        role: parent.kinship_label || parent.rel || "父母",
        x: centerX + (index - (parents.length - 1) / 2) * parentGap,
        y: parentY,
        category: "parent",
        stroke: "#4338ca",
        raw: parent
    }));

    // 每一位配偶 = 一个独立家庭分支；宽度由该房子女人数决定。
    const unitWidths = units.map(unit =>
        Math.max(190, Math.max(1, (unit.children || []).length) * 92)
    );

    const totalWidth = unitWidths.reduce((sum, width) => sum + width, 0);
    let cursorX = centerX - totalWidth / 2;

    const spouseBranches = units.map((unit, unitIndex) => {
        const width = unitWidths[unitIndex];
        const branchX = cursorX + width / 2;
        cursorX += width;

        const spouse = unit.spouse || unit;
        const branchChildren = unit.children || spouse.children || [];

        const spouseNode = {
            id: spouse.id,
            name: displayName(spouse),
            avatar: displayAvatar(spouse),
            role: spouse.kinship_label || spouse.rel || "配偶",
            x: branchX,
            y: spouseY,
            category: "spouse",
            stroke: "#e11d48",
            raw: spouse
        };

        const childGap = Math.min(
            96,
            Math.max(70, width / Math.max(branchChildren.length, 1))
        );

        const childrenNodes = branchChildren.map((child, childIndex) => ({
            id: child.id,
            name: displayName(child),
            avatar: displayAvatar(child),
            role: child.kinship_label || child.rel || "子女",
            x: branchX +
                (childIndex - (branchChildren.length - 1) / 2) * childGap,
            y: childY,
            category: "child",
            stroke: "#059669",
            raw: child
        }));

        return {
            spouseNode,
            childrenNodes,
            branchX
        };
    });

    // 没有第二位父母证据的孩子单独保留，不强行归到任何配偶。
    const assignedIds = new Set(
        spouseBranches.flatMap(branch =>
            branch.childrenNodes.map(child => Number(child.id))
        )
    );

    const looseChildren = (
        unassignedChildren.length
            ? unassignedChildren
            : children.filter(child => !assignedIds.has(Number(child.id)))
    ).filter(child => !assignedIds.has(Number(child.id)));

    const looseGap = 92;
    const looseNodes = looseChildren.map((child, index) => ({
        id: child.id,
        name: displayName(child),
        avatar: displayAvatar(child),
        role: "另一方父母待确认",
        x: centerX +
            (index - (looseChildren.length - 1) / 2) * looseGap,
        y: unassignedY,
        category: "child",
        stroke: "#64748b",
        raw: child
    }));

    const lines = [];

    // 父母夫妻横线 -> 一根竖线 -> 核心人物。
    if (pNodes.length >= 2) {
        const joinY = parentY + 42;
        const left = Math.min(...pNodes.map(node => node.x));
        const right = Math.max(...pNodes.map(node => node.x));

        pNodes.forEach(node => {
            lines.push({
                d: `M ${node.x} ${node.y + 22} L ${node.x} ${joinY}`,
                type: "family-line"
            });
        });

        lines.push({
            d: `M ${left} ${joinY} L ${right} ${joinY}`,
            type: "family-line"
        });

        lines.push({
            d: `M ${centerX} ${joinY} L ${centerX} ${coreY - 32}`,
            type: "family-line"
        });

    } else {
        pNodes.forEach(node => {
            lines.push({
                d: `M ${node.x} ${node.y + 22} L ${coreNode.x} ${coreNode.y - 32}`,
                type: "family-line"
            });
        });
    }

    // 核心人物 -> 配偶分房总横线。
    if (spouseBranches.length) {
        const familyRailY = coreY + 64;
        const branchXs = spouseBranches.map(branch => branch.branchX);
        const left = Math.min(centerX, ...branchXs);
        const right = Math.max(centerX, ...branchXs);

        lines.push({
            d: `M ${centerX} ${coreY + 32} L ${centerX} ${familyRailY}`,
            type: "family-line"
        });

        lines.push({
            d: `M ${left} ${familyRailY} L ${right} ${familyRailY}`,
            type: "family-line"
        });

        spouseBranches.forEach(branch => {
            lines.push({
                d: `M ${branch.branchX} ${familyRailY} L ${branch.spouseNode.x} ${spouseY - 28}`,
                type: "marriage-line"
            });

            if (!branch.childrenNodes.length) return;

            const childRailY = spouseY + 62;
            const childXs = branch.childrenNodes.map(child => child.x);
            const childLeft = Math.min(branch.branchX, ...childXs);
            const childRight = Math.max(branch.branchX, ...childXs);

            lines.push({
                d: `M ${branch.branchX} ${spouseY + 28} L ${branch.branchX} ${childRailY}`,
                type: "family-line"
            });

            lines.push({
                d: `M ${childLeft} ${childRailY} L ${childRight} ${childRailY}`,
                type: "family-line"
            });

            branch.childrenNodes.forEach(child => {
                lines.push({
                    d: `M ${child.x} ${childRailY} L ${child.x} ${childY - 22}`,
                    type: "family-line"
                });
            });
        });
    }

    // 未归属子女只作为“待确认”分支。
    if (looseNodes.length) {
        const looseRailY = unassignedY - 58;
        const xs = looseNodes.map(node => node.x);

        lines.push({
            d: `M ${centerX} ${coreY + 32} L ${centerX} ${looseRailY}`,
            type: "family-line"
        });

        lines.push({
            d: `M ${Math.min(...xs)} ${looseRailY} L ${Math.max(...xs)} ${looseRailY}`,
            type: "family-line"
        });

        looseNodes.forEach(node => {
            lines.push({
                d: `M ${node.x} ${looseRailY} L ${node.x} ${unassignedY - 22}`,
                type: "family-line"
            });
        });
    }

    gContainer.selectAll(".family-line-path")
        .data(lines)
        .enter()
        .append("path")
        .attr("class", d => d.type)
        .attr("d", d => d.d)
        .attr("fill", "none");

    const allPeopleNodes = [coreNode, ...pNodes, ...looseNodes];

    spouseBranches.forEach(branch => {
        allPeopleNodes.push(branch.spouseNode);
        allPeopleNodes.push(...branch.childrenNodes);
    });

    const personG = gContainer.selectAll(".tree-node-person")
        .data(allPeopleNodes)
        .enter()
        .append("g")
        .attr("class", "tree-node node-circle")
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
        .style("cursor", "pointer")
        .on("click", (event, node) => {
            event.stopPropagation();
            loadAndDisplayEntity(node.name);
        })
        .on("dblclick", (event, node) => {
            event.stopPropagation();
            document.getElementById("globalSearchInput").value = node.name;
            window.history.replaceState(
                null,
                "",
                `?q=${encodeURIComponent(node.name)}`
            );
            loadPersonTopology(node.name);
        });

    personG.append("circle")
        .attr(
            "r",
            node => node.category === "core"
                ? 30
                : node.category === "spouse"
                    ? 24
                    : 20
        )
        .attr("fill", "#ffffff")
        .attr("stroke", node => node.stroke)
        .attr(
            "stroke-width",
            node => node.category === "core" ? 3 : 2
        );

    personG.each(function (node) {
        const radius = node.category === "core"
            ? 27
            : node.category === "spouse"
                ? 21
                : 18;

        const clipId = `v82-clip-${node.category}-${node.id}`;
        const group = d3.select(this);

        group.append("clipPath")
            .attr("id", clipId)
            .append("circle")
            .attr("r", radius);

        if (node.avatar) {
            group.append("image")
                .attr("href", node.avatar)
                .attr("xlink:href", node.avatar)
                .attr("x", -radius)
                .attr("y", -radius)
                .attr("width", radius * 2)
                .attr("height", radius * 2)
                .attr("clip-path", `url(#${clipId})`)
                .attr("preserveAspectRatio", "xMidYMid slice");
        } else {
            group.append("text")
                .attr("text-anchor", "middle")
                .attr("dominant-baseline", "central")
                .attr(
                    "font-size",
                    node.category === "core" ? "16px" : "12px"
                )
                .attr("font-weight", "700")
                .attr("fill", "#475569")
                .text(
                    String(node.name || "?").trim().slice(0, 1) || "?"
                );
        }
    });

    personG.append("text")
        .attr(
            "y",
            node => node.category === "core" ? 43 : 34
        )
        .attr("text-anchor", "middle")
        .attr(
            "font-size",
            node => node.category === "core" ? "12px" : "10px"
        )
        .attr("font-weight", "700")
        .attr("fill", "#0f172a")
        .text(node => node.name);

    personG.append("text")
        .attr(
            "y",
            node => node.category === "core" ? 56 : 46
        )
        .attr("text-anchor", "middle")
        .attr("font-size", "9px")
        .attr("fill", "#64748b")
        .text(node => node.role || "");

    // 自动把整棵紧凑家谱放入左侧可视区域。
    const bounds = gContainer.node()?.getBBox();

    if (bounds && bounds.width > 0 && bounds.height > 0) {
        const scale = Math.min(
            1,
            (canvasWidth - 60) / bounds.width,
            560 / bounds.height
        );

        const tx =
            canvasWidth / 2 -
            (bounds.x + bounds.width / 2) * scale;

        const ty = 24 - bounds.y * scale;

        svg.call(
            zoomHandler.transform,
            d3.zoomIdentity.translate(tx, ty).scale(scale)
        );
    }
}



/* =========================================================

   右侧标准 Infobox 深度渲染与天眼查穿透

========================================================= */


/*
 * V9.3-B: External person selection -> right infobox.
 * Independent from the verified local V8.2 family tree.
 * Read-only; no database writes.
 */
async function piReadSelectedProfile(qid, signal) {
    const response = await fetch("/api/people-intelligence/external/profile/" + encodeURIComponent(qid), { cache: "no-store", signal });
    const data = await response.json();
    if (!response.ok || !data.success || data.profile?.id && data.profile.id !== qid || data.qid && data.qid !== qid) throw new Error(data.message || "人物资料读取失败或身份不匹配");
    return data;
}
function piRenderSelectedInfo(node, detail = {}) {
    const qid = String(node.id || detail.qid || ""), temporary = qid.startsWith("wp:"), article = temporary || node.source === "Wikipedia";
    const list = values => Array.isArray(values) && values.length ? values.filter(Boolean).join("、") : "未获取";
    const date = value => typeof (value?.time || value) === "string" ? (value.time || value).replace(/^\+/, "").split("T")[0] : "未获取";
    const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value || "未获取"; };
    const fields = {
        infoNameZh: node.name || qid, infoNameEn: temporary ? "Wikipedia 会话临时身份 · 待独立核验" : "Wikidata · " + qid,
        infoRole: list(node.occupations) === "未获取" ? node.description || "未获取" : list(node.occupations),
        infoBirth: date(node.birth_date), infoDeath: date(node.death_date), infoCountry: list(node.citizenship), infoEducation: list(node.education),
        infoMarital: "未获取（婚姻现状需来源核验）", infoCoreOrg: "未获取", infoBizList: "未获取当前人物企业资料", ciPositions: "未获取当前人物任职资料",
        ciOwnership: "未获取当前人物持股资料", ciIndustries: "未获取当前人物产业资料", ciNews: "未获取当前人物新闻资料",
        infoRelation: `关系视角：中心人物 ${detail.perspective || piCurrentExternalProfile?.name || piExternalRootQid || "（见图谱）"} · ${detail.relationship || "关系未获取"}`,
        infoBiography: (node.description || "未获取人物简介") + (temporary && node.article?.excerpt ? "\n文章片段：" + node.article.excerpt : "") + `\n来源：${article ? "Wikipedia 文章记载" : "Wikidata"}；待独立核验。`
    };
    if (node.residence?.length || node.birthplace?.length) fields.infoCountry += `；居住：${list(node.residence)}；出生地：${list(node.birthplace)}`;
    for (const [id, value] of Object.entries(fields)) text(id, value);
    const photo = document.getElementById("infoPhoto"), wrap = document.getElementById("infoPhotoWrap");
    const image = typeof node.profile_image_url === "string" && node.profile_image_url.startsWith("https://commons.wikimedia.org/") ? node.profile_image_url : "";
    if (photo) { if (image) photo.src = image; else photo.removeAttribute("src"); }
    if (wrap) wrap.style.display = image ? "block" : "none";
    const wiki = document.getElementById("infoWikiUrl");
    if (wiki) {
        wiki.href = article && /^https:\/\/(zh|en)\.wikipedia\.org\//.test(node.source_url || "") ? node.source_url : temporary ? "#" : "https://www.wikidata.org/wiki/" + encodeURIComponent(qid);
        wiki.textContent = article ? "查看 Wikipedia 修订来源 ↗" : "查看 Wikidata 原始资料 ↗";
    }
    if (!temporary && piExternalOrganizationCache.has(qid)) renderSelectedExternalOrganizations(qid);
}
window.addEventListener("pi:external-person-selected", event => {
    const detail = event.detail || {}, node = detail.node || {}, qid = String(detail.qid || node.id || "");
    if (!/^Q[1-9]\d*$/.test(qid) && !/^wp:[a-f0-9]{32}:\d+$/.test(qid)) return;
    if (piExternalBusy && piSelectedExternalQid !== qid) { ++piExternalProfileSequence; piExternalProfileController?.abort(); piExternalBusy = false; }
    const sequence = ++piSelectionSequence, searchVersion = piExternalSearchSequence;
    piSelectionController?.abort(); piSelectionPromise = null; piSelectionRequestQid = null;
    piSelectedExternalQid = qid; piSelectedExternalVersion++; ciRequestSequence++; piUpdateExpandButton();
    piRenderSelectedInfo({ ...node, id: qid }, detail);
    const status = value => { const el = document.getElementById("piPersonStatus"); if (el) el.textContent = value; };
    if (qid.startsWith("wp:")) { status("会话内已有资料与证据；未获取字段不补造，未进行姓名或本地人物回退。"); return; }
    status("正在按所选人物 QID 获取实时详情…");
    const controller = piSelectionController = new AbortController(), timer = setTimeout(() => controller.abort(), 30000);
    piSelectionRequestQid = qid;
    const task = piSelectionPromise = piReadSelectedProfile(qid, controller.signal);
    task.then(data => {
        if (sequence !== piSelectionSequence || searchVersion !== piExternalSearchSequence || piSelectedExternalQid !== qid) return;
        piExternalOrganizationCache.set(qid, data.organization_relations || []);
        for (const candidate of data.nodes || []) piExternalOrganizationNodeMap.set(candidate.id, candidate);
        piRenderSelectedInfo({ ...data.profile, id: qid }, detail);
        piShowEvidence({ edges: [...(detail.edges || []), ...(data.family_relations || [])], paths: detail.paths || [] });
        status(data.partial_results ? "当前人物资料部分未获取；保留已取得内容。" : "当前人物实时资料已更新；关系仍待独立核验。");
    }).catch(error => {
        if (sequence === piSelectionSequence && searchVersion === piExternalSearchSequence) status("详情未获取：" + (controller.signal.aborted ? "请求已取消或超时" : error.message) + "；仅显示当前所选人物已有资料。");
    }).finally(() => clearTimeout(timer));
});



function renderRightInfobox(entity, familyTree) {

    if (!entity) return;



    document.getElementById("infoNameZh").textContent = entity.name_zh || entity.name_en || "--";

    document.getElementById("infoNameEn").textContent = entity.name_en || "";



    const photoEl = document.getElementById("infoPhoto");

    if (entity.profile_image_url) {

        photoEl.src = entity.profile_image_url;

        document.getElementById("infoPhotoWrap").style.display = "block";

    } else {

        document.getElementById("infoPhotoWrap").style.display = "none";

    }



    document.getElementById("infoRole").textContent = entity.title_honor || entity.primary_role || "--";

    document.getElementById("infoBirth").textContent = entity.birth_date || "--";

    document.getElementById("infoDeath").textContent = entity.death_date || "--";

    document.getElementById("infoCountry").textContent = entity.country_region || "--";

    document.getElementById("infoEducation").textContent = entity.education || "--";



    // 婚姻状况与子女统计

    const spousesCount = familyTree?.spouses?.length || 0;
    const childrenCount = familyTree?.children?.length || familyTree?.unassignedChildren?.length || 0;

    document.getElementById("infoMarital").textContent =
        `${spousesCount} 位配偶 / ${childrenCount} 名子女`;

    document.getElementById("infoCoreOrg").textContent = entity.core_organization || "--";



    // V8.3-A: only display structured, sourced fields already returned by API.
    // Do not infer ownership, wealth, news, or commercial positions from biography.
    const escapeCI = value => String(value ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
    const setCI = (id, items, emptyText, renderItem) => {
        const el = document.getElementById(id);
        if (!el) return;
        const valid = Array.isArray(items) ? items.filter(Boolean) : [];
        el.classList.toggle("ci-empty", valid.length === 0);
        el.innerHTML = valid.length ? valid.map(renderItem).join("") : escapeCI(emptyText);
    };
    const orgs = Array.isArray(familyTree?.enterprises) ? familyTree.enterprises : [];
    setCI("infoBizList", orgs, "暂无已核验企业关系数据", o => {
        const name = o.name || o.name_zh || o.name_en;
        if (!name) return "";
        const role = o.role || o.role_title || "关联机构（关系待核验）";
        const percentage = o.ownership_percentage;
        const ownership = percentage !== null && percentage !== undefined && percentage !== "" && Number.isFinite(Number(percentage))
            ? ` · 直接持股 ${escapeCI(percentage)}%` : "";
        return `<div class="ci-entry"><strong>${escapeCI(name)}</strong><span>${escapeCI(role)}${ownership}</span></div>`;
    });
    const positions = Array.isArray(entity.commercial_positions) ? entity.commercial_positions : [];
    setCI("ciPositions", positions, "暂无已核验商业任职数据", p => `<div class="ci-entry"><strong>${escapeCI(p.title || p.role || "商业任职")}</strong><span>${escapeCI(p.organization || p.organization_name || "机构未注明")}${p.start_date ? " · " + escapeCI(p.start_date) : ""}${p.end_date ? " — " + escapeCI(p.end_date) : ""}</span></div>`);
    const ownershipRows = Array.isArray(entity.ownership_records) ? entity.ownership_records : [];
    setCI("ciOwnership", ownershipRows, "暂无已核验持股与控制权数据", o => `<div class="ci-entry"><strong>${escapeCI(o.organization || o.organization_name || "未注明企业")}</strong><span>${escapeCI(o.ownership_type || "权益关系")}${o.percentage !== null && o.percentage !== undefined ? " · " + escapeCI(o.percentage) + "%" : ""}${o.source ? " · 来源：" + escapeCI(o.source) : ""}</span></div>`);
    const industries = Array.isArray(entity.industries) ? entity.industries : [];
    const capitalEvents = Array.isArray(entity.capital_events) ? entity.capital_events : [];
    setCI("ciIndustries", [...industries.map(v => ({ label: typeof v === "string" ? v : v.name, type: "行业" })), ...capitalEvents.map(v => ({ label: v.title, type: v.date || "资本事件" }))], "暂无已核验产业或资本事件数据", i => `<div class="ci-entry"><strong>${escapeCI(i.label || "未命名事件")}</strong><span>${escapeCI(i.type)}</span></div>`);
    const news = Array.isArray(entity.intelligence_events) ? entity.intelligence_events : [];
    setCI("ciNews", news, "暂无已核验新闻与风险事件数据", n => `<div class="ci-entry"><strong>${escapeCI(n.title || "情报事件")}</strong><span>${escapeCI(n.date || "日期未注明")}${n.source ? " · " + escapeCI(n.source) : ""}</span></div>`);

    // 生平长文

    document.getElementById("infoBiography").textContent = entity.biography || "暂无已核验人物简介";

    document.getElementById("infoWikiUrl").href = `https://zh.wikipedia.org/wiki/${encodeURIComponent(entity.name_zh || entity.name_en)}`;

}




// V8.3-C: fetch verified commercial records after the profile is rendered.
async function loadCommercialIntelligence(entity) {
    const sequence = ++ciRequestSequence;
    const personId = Number(entity?.id);
    if (!Number.isSafeInteger(personId) || personId < 1) return;
    const ids = ['ciPositions', 'ciOwnership', 'ciIndustries', 'ciNews'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) { el.textContent = '正在读取已核验商业情报…'; el.classList.add('ci-empty'); } });
    try {
        const response = await fetch(`/api/people-intelligence/people/${personId}/business-intelligence`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json();
        if (sequence !== ciRequestSequence || !payload.success) return;
        const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
        const sources = record => (record.sources || []).filter(s => /^https:\/\//.test(s.url || '')).map(s => ` <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">来源：${esc(s.name || s.title || '核验证据')} ↗</a>`).join('');
        const draw = (id, rows, empty, template) => { const el = document.getElementById(id); if (!el) return; el.classList.toggle('ci-empty', !rows.length); el.innerHTML = rows.length ? rows.map(template).join('') : esc(empty); };
        // V8.3-F: aggregate verified positions into the organization panel.
        // A directorship is an employment/governance link, NOT ownership or control.
        const orgPanel = document.getElementById('infoBizList');
        if (orgPanel) {
            const orgMap = new Map();
            const addOrg = (name, relation, sourceHtml, key) => {
                const label = String(name || '').trim();
                if (!label) return;
                const mapKey = key || label.toLocaleLowerCase();
                if (!orgMap.has(mapKey)) orgMap.set(mapKey, { name: label, id: /^id:[1-9]\d*$/.test(mapKey) ? Number(mapKey.slice(3)) : null, relations: [], sourceLinks: new Set() });
                const org = orgMap.get(mapKey);
                if (relation && !org.relations.includes(relation)) org.relations.push(relation);
                if (sourceHtml) org.sourceLinks.add(sourceHtml);
            };
            // Existing verified family-enterprise relationships remain visible.
            const existing = Array.isArray(currentData?.familyTree?.enterprises)
                ? currentData.familyTree.enterprises : [];
            for (const o of existing) {
                const name = o.name || o.name_zh || o.name_en;
                const rel = o.role || o.role_title || '企业关联（关系待核验）';
                const pct = o.ownership_percentage;
                const ownership = pct !== null && pct !== undefined && pct !== '' && Number.isFinite(Number(pct))
                    ? ` · 直接持股 ${pct}%` : '';
                addOrg(name, rel + ownership, '', o.id != null ? 'id:' + o.id : undefined);
            }
            for (const p of (payload.commercial_positions || [])) {
                const relation = `任职关联：${p.title || '商业任职'}${p.status === 'former' ? '（历史任职）' : p.status === 'current' ? '（现任）' : ''}`;
                addOrg(p.organization_name, relation, sources(p),
                    p.organization_id != null ? 'id:' + p.organization_id : undefined);
            }
            orgPanel.classList.toggle('ci-empty', orgMap.size === 0);
            orgPanel.innerHTML = orgMap.size
                ? [...orgMap.values()].map(o => `<div class="ci-entry"><strong>${o.id ? `<button type="button" class="ci-org-trigger" data-organization-id="${o.id}">${esc(o.name)} ↗</button>` : esc(o.name)}</strong><span>${o.relations.map(esc).join(' · ')}</span>${[...o.sourceLinks].join('')}</div>`).join('')
                : '暂无已核验企业关系数据';
        }
        draw('ciPositions', payload.commercial_positions || [], '暂无已核验商业任职数据', p => `<div class="ci-entry"><strong>${esc(p.title)}</strong><span>${esc(p.organization_name)}${p.start_date ? ' · ' + esc(p.start_date) : ''}${p.end_date ? ' — ' + esc(p.end_date) : ''}${p.status ? ' · ' + esc(p.status) : ''}</span>${sources(p)}</div>`);
        draw('ciOwnership', payload.ownership_records || [], '暂无已核验持股与控制权数据', o => `<div class="ci-entry"><strong>${esc(o.organization_name)}</strong><span>${esc(o.ownership_type)}${o.percentage != null ? ' · 持股 ' + esc(o.percentage) + '%' : ''}${o.voting_percentage != null ? ' · 投票权 ' + esc(o.voting_percentage) + '%' : ''}${o.as_of_date ? ' · 截至 ' + esc(o.as_of_date) : ''}</span>${sources(o)}</div>`);
        draw('ciIndustries', payload.capital_events || [], '暂无已核验产业或资本事件数据', e => `<div class="ci-entry"><strong>${esc(e.title)}</strong><span>${esc(e.event_type)}${e.date ? ' · ' + esc(e.date) : ''}${e.amount != null ? ' · ' + esc(e.amount) + ' ' + esc(e.currency || '') : ''}</span>${sources(e)}</div>`);
        draw('ciNews', payload.intelligence_events || [], '暂无已核验新闻与风险事件数据', e => `<div class="ci-entry"><strong>${esc(e.title)}</strong><span>${esc(e.event_type)}${e.date ? ' · ' + esc(e.date) : ''}${e.risk_level ? ' · 风险：' + esc(e.risk_level) : ''}</span>${sources(e)}</div>`);
    } catch (error) {
        if (sequence !== ciRequestSequence) return;
        console.error('V8.3-C 情报接口:', error);
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '商业情报接口暂不可用，请检查服务器日志'; });
    }
}

// 点击图谱节点时，右侧即时加载该人物深度档案

async function loadAndDisplayEntity(name) {
    // Legacy curated navigation is separate; never use it for an active live search.
    if (piLiveMode) { piFamilyStatus("实时模式仅允许按 Wikidata QID 查询；未使用本地人物回退。"); return; }
    const localVersion = ciRequestSequence;

    try {

        const res = await fetch(`/api/people-intelligence/search?q=${encodeURIComponent(name)}`);

        const data = await res.json();

        if (piLiveMode || localVersion !== ciRequestSequence) return;
        if (data.success && data.entity) {

            currentData = data;
            currentData = data;
            renderRightInfobox(data.entity, data.familyTree);
            loadCommercialIntelligence(data.entity);

        } else {

            ++ciRequestSequence;
            renderRightInfobox({

                name_zh: name,

                name_en: "",

                primary_role: "家族支系成员",

                biography: "暂无已核验人物简介"

            }, null);

        }

    } catch (e) {

        console.error(e);

    }

}
// V8.3-G1: event delegation keeps the verified organization links clickable after rerender.
(function bindOrganizationDetails() {
    const escapeOrg = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const overlay = () => document.getElementById('ciOrgOverlay');
    const close = () => { ++ciOrgRequestSequence; const el = overlay(); if (el) el.hidden = true; };
    document.addEventListener('click', event => {
        const trigger = event.target.closest?.('.ci-org-trigger');
        if (trigger) {
            const id = Number(trigger.dataset.organizationId);
            if (Number.isSafeInteger(id) && id > 0) openOrganizationDetail(id);
            return;
        }
        if (event.target.id === 'ciOrgClose' || event.target.id === 'ciOrgOverlay') close();
        const person = event.target.closest?.('.ci-org-person-link');
        if (person) {
            const name = person.dataset.personName;
            close();
            if (name) loadAndDisplayEntity(name);
        }
    });
    document.addEventListener('keydown', event => { if (event.key === 'Escape' && overlay() && !overlay().hidden) close(); });
    async function openOrganizationDetail(id) {
        const layer = overlay(), body = document.getElementById('ciOrgDetailBody');
        if (!layer || !body) return;
        const sequence = ++ciOrgRequestSequence;
        layer.hidden = false;
        document.getElementById('ciOrgTitle').textContent = '企业详情';
        body.textContent = '正在读取已核验企业资料…';
        layer.querySelector('.ci-org-dialog')?.focus();
        try {
            const response = await fetch(`/api/people-intelligence/organizations/${id}/detail`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (sequence !== ciOrgRequestSequence || layer.hidden) return;
            if (!data.success || !data.organization) throw new Error('企业档案不可用');
            const o = data.organization;
            document.getElementById('ciOrgTitle').textContent = o.name_zh || o.name_en || '企业详情';
            const fieldEvidence = data.field_evidence && typeof data.field_evidence === 'object'
                ? data.field_evidence : {};
            const safeUrl = url => {
                try { const parsed = new URL(String(url || '')); return parsed.protocol === 'https:' ? parsed.href : ''; }
                catch { return ''; }
            };
            const evidenceFor = key => {
                const sources = Array.isArray(fieldEvidence[key]) ? fieldEvidence[key] : [];
                return sources.filter(s => safeUrl(s.url)).map(s =>
                    `<div style="font-size:12px;margin-top:4px"><a href="${escapeOrg(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">核验证据：${escapeOrg(s.title || s.name || s.publisher || '官方来源')} ↗</a>${s.publisher ? ` · ${escapeOrg(s.publisher)}` : ''}</div>`
                ).join('');
            };
            const fields = [
                ['英文名称', 'name_en'], ['注册地区', 'country_region'],
                ['总部', 'headquarters'], ['成立日期', 'founded_date'],
                ['行业', 'industry_primary', 'industry'], ['上市状态', 'listed_status'],
                ['股票代码', 'ticker_symbol'], ['交易所', 'exchange_name'],
                ['ISIN', 'isin'], ['LEI', 'lei']
            ];
            const renderField = ([label, key, fallback]) => {
                const actualKey = o[key] ? key : fallback;
                const value = actualKey ? o[actualKey] : null;
                const verified = actualKey && Array.isArray(fieldEvidence[actualKey]) && fieldEvidence[actualKey].length > 0;
                return `<dt>${escapeOrg(label)}</dt><dd>${escapeOrg(value || '暂无资料')}${verified ? ' · <strong>已核验</strong>' + evidenceFor(actualKey) : value ? ' · <span>字段证据待核验</span>' : ''}</dd>`;
            };
            const websiteUrl = safeUrl(o.website_url);
            const websiteVerified = websiteUrl && Array.isArray(fieldEvidence.website_url) && fieldEvidence.website_url.length > 0;
            const website = websiteUrl
                ? `<a href="${escapeOrg(websiteUrl)}" target="_blank" rel="noopener noreferrer">访问企业网站 ↗</a>${websiteVerified ? ' · <strong>已核验</strong>' + evidenceFor('website_url') : ' · 字段证据待核验'}`
                : '暂无资料';
            const positions = Array.isArray(data.positions) ? data.positions : [];
            const evidence = p => (p.sources || []).filter(s => safeUrl(s.url)).map(s =>
                `<div><a href="${escapeOrg(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">来源：${escapeOrg(s.name || s.title || '已核验证据')} ↗</a></div>`).join('');
            body.innerHTML = `<dl>${fields.map(renderField).join('')}<dt>企业官网</dt><dd>${website}</dd><dt>资料更新日期</dt><dd>${escapeOrg(o.data_updated_at || '未注明')}</dd></dl>` +
                (o.description ? `<h3>企业简介</h3><p>${escapeOrg(o.description)}</p><p style="font-size:12px">简介不代表已完成字段级核验</p>` : '') +
                `<h3>已核验关联人物（${positions.length} 条任职记录）</h3>` +
                (positions.length ? positions.map(p => `<div class="ci-org-person"><button type="button" class="ci-org-person-link" data-person-name="${escapeOrg(p.person_name)}">${escapeOrg(p.person_name)} ↗</button><div>${escapeOrg(p.title || '职务未注明')} · ${p.status === 'former' ? '历史任职' : p.status === 'current' ? '记录标记为现任' : '状态未注明'}</div><div>${escapeOrg(p.start_date || '开始日期未注明')}${p.end_date ? ' — ' + escapeOrg(p.end_date) : ''}</div>${evidence(p)}</div>`).join('') : '<p>暂无已核验公开任职记录</p>') +
                '<p style="color:#64748b;font-size:12px">任职关系不代表持股或实际控制。记录中的“现任”状态不等于实时核验结果。</p>';
        } catch (error) {
            if (sequence !== ciOrgRequestSequence) return;
            console.error('V8.3-G1 企业详情:', error);
            body.textContent = '企业详情读取失败，请检查本地服务器和企业详情接口。';
        }
    }
})();

/*
* V9.0-S7-D
* External graph toolbar routing.
* V8.2 local zoom behavior remains unchanged.
*/

(function () {
    const controls = [
        ["btnTreeCenter", "fit"],
        ["btnZoomIn", "zoomIn"],
        ["btnZoomOut", "zoomOut"]
    ];

    document.addEventListener("DOMContentLoaded", () => {
        for (const [id, method] of controls) {
            const button = document.getElementById(id);

            if (!button) continue;

            button.addEventListener(
                "click",
                event => {
                    const graph = window.PIExternalGraph;

                    if (!graph || !graph.isActive()) {
                        return;
                    }

                    event.preventDefault();
                    event.stopImmediatePropagation();

                    graph[method]();
                },
                true
            );
        }
    });
})();

/* V11.2: Official company lookup and US political disclosure discovery.
 * No modifications to V8.2 tree and no automatic person/company identity claims.
 */
(function initExternalSourcePanel() {
    let seq = 0;
    const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    function ensurePanel() {
        let panel = document.getElementById("piV112Sources");
        if (panel) return panel;
        const anchor = document.getElementById("infoBizList");
        if (!anchor) return null;
        panel = document.createElement("section");
        panel.id = "piV112Sources";
        panel.style.cssText = "margin:18px 0;padding:12px;border:1px solid #cbd5e1;border-radius:8px;font-size:13px;line-height:1.65;overflow-wrap:anywhere";
        panel.innerHTML = `<h3 style="margin:0 0 6px">官方企业与美国政治人物金融信息</h3>
          <p style="color:#64748b;margin:0 0 10px">独立实时查询。名称匹配只是候选，不自动证明企业同一性、个人持股或交易。</p>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <input id="piV112Query" maxlength="100" placeholder="企业名称 / 股票代码 / 政治人物姓名" aria-label="官方数据查询名称" style="flex:1;min-width:160px;padding:7px;border:1px solid #cbd5e1;border-radius:5px" />
            <button type="button" data-pi-source="sec">SEC</button>
            <button type="button" data-pi-source="gleif">GLEIF</button>
            <button type="button" data-pi-source="politics">官方披露入口</button>
            <button type="button" data-pi-source="trades">国会议员交易</button>
            <button type="button" data-pi-source="fec">FEC 候选</button>
          </div>
          <div id="piV112Result" aria-live="polite" style="margin-top:10px">请选择数据源查询。</div>`;
        anchor.insertAdjacentElement("afterend", panel);
        panel.addEventListener("click", async event => {
            const button = event.target.closest("button[data-pi-source]");
            if (!button) return;
            const q = panel.querySelector("#piV112Query").value.trim();
            const target = panel.querySelector("#piV112Result");
            if (q.length < 2) { target.textContent = "请至少输入 2 个字符。"; return; }
            const current = ++seq;
            const source = button.dataset.piSource;
            const routes = {
                sec: `/api/people-intelligence/data-sources/sec/search?q=${encodeURIComponent(q)}`,
                gleif: `/api/people-intelligence/data-sources/gleif/search?name=${encodeURIComponent(q)}`,
                politics: `/api/people-intelligence/data-sources/politics/us/disclosures?name=${encodeURIComponent(q)}`,
                trades: `/api/people-intelligence/data-sources/politics/us/trades?name=${encodeURIComponent(q)}`,
                fec: `/api/people-intelligence/data-sources/politics/us/fec/candidates?name=${encodeURIComponent(q)}`
            };
            target.textContent = "正在查询官方来源…";
            try {
                const response = await fetch(routes[source], { cache: "no-store" });
                const data = await response.json();
                if (current !== seq) return;
                if (!response.ok || !data.success) throw new Error(data.message || "接口失败");
                if (source === "trades") {
                    const sources = Array.isArray(data.sources) ? data.sources : [];
                    target.innerHTML = `<div style="font-weight:700">美国国会议员证券交易 · 官方披露入口</div>` +
                        `<p>${esc(data.message || "尚未获取具体交易记录")}</p>` +
                        sources.map(s => `<div style="padding:6px 0"><a href="${esc(s.search_url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a></div>`).join("") +
                        `<p style="color:#64748b">${esc(data.legal_note || "")}</p>` +
                        `<p style="color:#64748b">交易明细：尚未接入结构化数据；不会将 FEC 竞选献金或 SEC 公司申报误写成个人交易。</p>`;
                    return;
                }
                if (source === "politics") {
                    target.innerHTML = `<p><strong>美国国会议员交易披露：</strong>尚未接入结构化交易 API；以下是官方查询入口，并非该人物的交易记录。</p>` +
                        (data.sources || []).map(s => `<div><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a></div>`).join("") +
                        `<p style="color:#64748b">${esc(data.license_note)}</p>`;
                    return;
                }
                if (source === "fec" && !data.configured) {
                    target.innerHTML = `${esc(data.message)} <a href="https://www.fec.gov/data/" target="_blank" rel="noopener noreferrer">FEC 官网 ↗</a>`;
                    return;
                }
                const rows = Array.isArray(data.results) ? data.results : [];
                target.innerHTML = `<div style="color:#64748b">${source === "fec" ? "FEC 竞选资金候选（不是股票交易）" : "官方实体名称候选（尚未完成身份核验）"} · ${rows.length} 条</div>` +
                    (rows.length ? rows.map(row => {
                        const name = row.legal_name || row.name || row.entity_id || "未命名";
                        const extra = source === "sec" ? `CIK ${row.cik || "--"} · ${row.ticker || "--"}` : source === "gleif" ? `LEI ${row.entity_id || "--"} · ${row.jurisdiction || "--"}` : `${row.office || "--"} · ${row.state || "--"}`;
                        const url = String(row.source_url || "");
                        return `<div style="padding:7px 0;border-bottom:1px solid #e2e8f0"><strong>${esc(name)}</strong><div>${esc(extra)}</div>${/^https:\/\//.test(url) ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">查看官方记录 ↗</a>` : ""}</div>`;
                    }).join("") : "<p>暂无候选结果。</p>");
            } catch (error) { if (current === seq) target.textContent = `查询失败：${error.message}`; }
        });
        return panel;
    }
    document.addEventListener("DOMContentLoaded", ensurePanel);
    window.piEnsureV112SourcePanel = ensurePanel;
})();
