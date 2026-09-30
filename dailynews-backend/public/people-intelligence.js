/* =========================================================
   Global Capital & Strict Family Hierarchy Engine (V4.0)
   File: public/people-intelligence.js
========================================================= */

let currentData = null;
let svg, gContainer, zoomHandler;
const DEFAULT_AVATAR = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200";

document.addEventListener("DOMContentLoaded", () => {
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

async function loadPersonTopology(name) {
    try {
        const res = await fetch(`/api/people-intelligence/search?q=${encodeURIComponent(name)}`);
        const data = await res.json();

        if (!data.success || !data.found) {
            alert(data.message || `未找到【${name}】的图谱档案`);
            return;
        }

        currentData = data;
        renderStrictFamilyTree(data.familyTree);
        renderRightInfobox(data.entity, data.familyTree);
    } catch (e) {
        console.error("加载图谱失败:", e);
    }
}

/* =========================================================
   核心严谨家谱分房支系树布局算法
========================================================= */

function renderStrictFamilyTree(familyTree) {
    gContainer.selectAll("*").remove();

    const { core, parents, spouses, unassignedChildren, enterprises } = familyTree;

    const canvasWidth = window.innerWidth - 450;
    const centerX = canvasWidth / 2;
    const coreY = 320;

    // 1. 父母辈位置 (顶部 Y = coreY - 170)
    const pNodes = parents.map((p, i) => {
        const offset = (i - (parents.length - 1) / 2) * 180;
        return { ...p, x: centerX + offset, y: coreY - 170, category: "parent", stroke: "#4338ca" };
    });

    // 2. 核心人物 (中间 Y = coreY)
    const coreNode = {
        id: core.id,
        name: core.name_zh || core.name_en,
        avatar: core.profile_image_url || DEFAULT_AVATAR,
        role: "核心主角",
        x: centerX,
        y: coreY,
        category: "core",
        stroke: "#1d4ed8",
        raw: core
    };

    // 3. 各房配偶及其下属专属子女 (以何鸿燊/特朗普为中心，左右对称展开各房家庭单元)
    const spouseBranches = [];
    const totalSpouses = spouses.length || 1;
    const branchWidth = 260; // 每一房家庭支系的水平跨度

    spouses.forEach((sp, i) => {
        const branchOffset = (i - (totalSpouses - 1) / 2) * branchWidth;
        const branchX = centerX + branchOffset;
        const spouseY = coreY + 120; // 配偶位置在核心下方或并列

        const spNode = {
            id: sp.id,
            name: sp.name,
            avatar: sp.avatar || DEFAULT_AVATAR,
            role: `配偶 / ${sp.name}`,
            x: branchX,
            y: spouseY,
            category: "spouse",
            stroke: "#e11d48",
            raw: sp
        };

        // 该房名下的子女
        const chNodes = (sp.children || []).map((ch, chIdx) => {
            const chY = spouseY + 130 + chIdx * 65; // 纵向列表式或微缩并排展开
            return {
                id: ch.id,
                name: ch.name,
                avatar: ch.avatar || DEFAULT_AVATAR,
                role: "子女",
                x: branchX,
                y: chY,
                category: "child",
                stroke: "#059669",
                raw: ch
            };
        });

        spouseBranches.push({ spouseNode: spNode, childrenNodes: chNodes, branchX });
    });

    // 4. 企业机构阵列 (右上侧)
    const orgNodes = enterprises.map((org, i) => {
        return {
            id: org.id,
            name: org.name,
            role: org.role,
            x: centerX + 360 + (i % 2) * 140,
            y: coreY - 140 + i * 65,
            category: "org",
            stroke: "#d97706",
            raw: org
        };
    });

    // =========================================================
    // 连线逻辑
    // =========================================================
    const lines = [];

    // 父母 ➔ 核心连线
    pNodes.forEach(p => {
        lines.push({ d: `M ${p.x} ${p.y} L ${coreNode.x} ${coreNode.y}`, type: "family-line" });
    });

    // 核心 ➔ 各房配偶 (虚线红线表示联姻关系)
    spouseBranches.forEach(b => {
        lines.push({ d: `M ${coreNode.x} ${coreNode.y} C ${coreNode.x} ${(coreNode.y + b.spouseNode.y) / 2}, ${b.spouseNode.x} ${(coreNode.y + b.spouseNode.y) / 2}, ${b.spouseNode.x} ${b.spouseNode.y}`, type: "marriage-line" });

        // 配偶 ➔ 专属子女向下引线 (纵向树枝状)
        b.childrenNodes.forEach(ch => {
            lines.push({ d: `M ${b.spouseNode.x} ${b.spouseNode.y} L ${ch.x} ${ch.y}`, type: "family-line" });
        });
    });

    // 核心 ➔ 企业连线
    orgNodes.forEach(org => {
        lines.push({ d: `M ${coreNode.x} ${coreNode.y} L ${org.x} ${org.y}`, type: "family-line" });
    });

    // 渲染所有连线
    gContainer.selectAll(".family-line-path")
        .data(lines)
        .enter()
        .append("path")
        .attr("class", d => d.type)
        .attr("d", d => d.d);

    // =========================================================
    // 节点渲染
    // =========================================================
    const allPeopleNodes = [coreNode, ...pNodes];
    spouseBranches.forEach(b => {
        allPeopleNodes.push(b.spouseNode);
        allPeopleNodes.push(...b.childrenNodes);
    });

    // 绘制人物圆形肖像节点
    const personG = gContainer.selectAll(".tree-node-person")
        .data(allPeopleNodes)
        .enter()
        .append("g")
        .attr("class", "tree-node node-circle")
        .attr("transform", d => `translate(${d.x}, ${d.y})`)
        .on("click", (e, d) => {
            e.stopPropagation();
            loadAndDisplayEntity(d.name);
        })
        .on("dblclick", (e, d) => {
            e.stopPropagation();
            document.getElementById("globalSearchInput").value = d.name;
            loadPersonTopology(d.name);
        });

    // 外框与尺寸
    personG.append("circle")
        .attr("r", d => d.category === "core" ? 34 : (d.category === "spouse" ? 28 : 22))
        .attr("fill", "#ffffff")
        .attr("stroke", d => d.stroke)
        .attr("stroke-width", d => d.category === "core" ? 3.5 : 2.5);

    // 头像 ClipPath
    personG.each(function (d) {
        const clipId = `clip-${d.id}-${Math.floor(Math.random() * 10000)}`;
        const r = d.category === "core" ? 31 : (d.category === "spouse" ? 25 : 20);

        d3.select(this).append("clipPath")
            .attr("id", clipId)
            .append("circle")
            .attr("r", r);

        d3.select(this).append("image")
            .attr("xlink:href", d.avatar || DEFAULT_AVATAR)
            .attr("x", -r)
            .attr("y", -r)
            .attr("width", r * 2)
            .attr("height", r * 2)
            .attr("clip-path", `url(#${clipId})`)
            .attr("preserveAspectRatio", "xMidYMid slice");
    });

    // 姓名文字
    personG.append("text")
        .attr("y", d => d.category === "core" ? 48 : (d.category === "spouse" ? 42 : 34))
        .attr("text-anchor", "middle")
        .attr("font-size", d => d.category === "core" ? "13px" : "11px")
        .attr("font-weight", "700")
        .attr("fill", "#0f172a")
        .text(d => d.name);

    // 关系标注
    personG.append("text")
        .attr("y", d => d.category === "core" ? 62 : (d.category === "spouse" ? 54 : 45))
        .attr("text-anchor", "middle")
        .attr("font-size", "10px")
        .attr("fill", "#64748b")
        .text(d => d.role || "");

    // 绘制企业方块节点
    const orgG = gContainer.selectAll(".tree-node-org")
        .data(orgNodes)
        .enter()
        .append("g")
        .attr("class", "tree-node")
        .attr("transform", d => `translate(${d.x - 70}, ${d.y - 18})`)
        .on("click", (e, d) => {
            e.stopPropagation();
            alert(`企业实体：${d.name}\n${d.role}\n可接入天眼查/企查查 API 进行工商持股穿透。`);
        });

    orgG.append("rect")
        .attr("width", 140)
        .attr("height", 36)
        .attr("rx", 6)
        .attr("fill", "#fffbeb")
        .attr("stroke", "#d97706")
        .attr("stroke-width", 1.5);

    orgG.append("text")
        .attr("x", 70)
        .attr("y", 18)
        .attr("text-anchor", "middle")
        .attr("font-size", "11px")
        .attr("font-weight", "700")
        .attr("fill", "#92400e")
        .text(d => d.name);

    orgG.append("text")
        .attr("x", 70)
        .attr("y", 30)
        .attr("text-anchor", "middle")
        .attr("font-size", "9px")
        .attr("fill", "#b45309")
        .text(d => d.role);
}

/* =========================================================
   右侧标准 Infobox 深度渲染与天眼查穿透
========================================================= */

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

    document.getElementById("infoRole").textContent = entity.title_honor || entity.primary_role || "名门政商领袖";
    document.getElementById("infoBirth").textContent = entity.birth_date || "详见维基条目";
    document.getElementById("infoDeath").textContent = entity.death_date || (entity.birth_date ? "健在" : "-");
    document.getElementById("infoCountry").textContent = entity.country_region || "中国香港 / 中国澳门";
    document.getElementById("infoEducation").textContent = entity.education || "名校深造 / 荣誉博士";

    // 婚姻状况与子女统计
    const spousesCount = familyTree?.spouses?.length || 0;
    document.getElementById("infoMarital").textContent = `${spousesCount} 位配偶 (多房支系 / 家族联姻)`;
    document.getElementById("infoCoreOrg").textContent = entity.core_organization || "旗舰控股集团";

    // 商业版图 (天眼查/企查查穿透列表)
    const bizListEl = document.getElementById("infoBizList");
    const orgs = familyTree?.enterprises || [];
    if (orgs.length > 0) {
        bizListEl.innerHTML = orgs.map(o => `
            <div class="biz-company-item">
                <div>
                    <strong>${o.name}</strong>
                    <div style="font-size: 10px; color: #64748b;">法定代表人 / 实际控制人</div>
                </div>
                <span style="color: #1d4ed8; font-weight: 700; font-size: 11px;">100% 控股</span>
            </div>
        `).join("");
    } else {
        bizListEl.innerHTML = `
            <div class="biz-company-item"><strong>信德集团有限公司</strong><span style="color:#1d4ed8;font-size:11px;">董事局主席</span></div>
            <div class="biz-company-item"><strong>澳门博彩控股有限公司</strong><span style="color:#1d4ed8;font-size:11px;">实际控制人</span></div>
            <div class="biz-company-item"><strong>澳门旅游娱乐股份有限公司</strong><span style="color:#1d4ed8;font-size:11px;">终身荣誉创办人</span></div>
        `;
    }

    // 生平长文
    document.getElementById("infoBiography").textContent = entity.biography || `${entity.name_zh || entity.name_en}，知名商业及家族核心人物。维基百科及企业工商系统均已建立深层档案。`;
    document.getElementById("infoWikiUrl").href = `https://zh.wikipedia.org/wiki/${encodeURIComponent(entity.name_zh || entity.name_en)}`;
}

// 点击图谱节点时，右侧即时加载该人物深度档案
async function loadAndDisplayEntity(name) {
    try {
        const res = await fetch(`/api/people-intelligence/search?q=${encodeURIComponent(name)}`);
        const data = await res.json();
        if (data.success && data.entity) {
            renderRightInfobox(data.entity, data.familyTree);
        } else {
            renderRightInfobox({
                name_zh: name,
                name_en: "",
                primary_role: "家族支系成员",
                biography: `${name}，名门家族支系成员。双击该节点可将其置于全景中心查看专属商业版图。`
            }, null);
        }
    } catch (e) {
        console.error(e);
    }
}