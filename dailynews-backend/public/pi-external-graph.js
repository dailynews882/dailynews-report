"use strict";

/*
 * V9.1-D - External Family Graph
 *
 * Parent-aware family layout.
 * Uses child_parent_summaries from Wikidata profile API.
 *
 * V8.2 local family tree remains untouched.
 * Read-only. No database writes.
 */

(function () {
    const NS = "http://www.w3.org/2000/svg";
    const EXTERNAL_ID = "piExternalSvg";
    const ORIGINAL_ID = "familyTreeSvg";

    const COLORS = {
        center: "#2454d6",
        parent: "#64748b",
        sibling: "#9333ea",
        spouse: "#e11d48",
        mother: "#e11d48",
        child: "#059669",
        unknown: "#94a3b8"
    };

    let externalSvg = null;
    let externalZoom = null;
    let externalLayer = null;
    let externalBounds = null;
    let active = false;

    function originalSvg() {
        return document.getElementById(ORIGINAL_ID);
    }

    function ensureExternalSvg() {
        const original = originalSvg();

        if (!original) {
            throw new Error("找不到原有家族树 SVG");
        }

        const parent = original.parentElement;

        if (!parent) {
            throw new Error("找不到家族树画布容器");
        }

        if (getComputedStyle(parent).position === "static") {
            parent.style.position = "relative";
        }

        if (!externalSvg || !externalSvg.isConnected) {
            externalSvg = document.createElementNS(NS, "svg");
            externalSvg.id = EXTERNAL_ID;

            Object.assign(externalSvg.style, {
                position: "absolute",
                inset: "0",
                width: "100%",
                height: "100%",
                zIndex: "10",
                background: "transparent",
                touchAction: "none",
                cursor: "grab",
                userSelect: "none"
            });

            parent.appendChild(externalSvg);
        }

        return externalSvg;
    }

    function clear() {
        if (externalSvg && typeof d3 !== "undefined") {
            d3.select(externalSvg).selectAll("*").remove();
            d3.select(externalSvg).on(".zoom", null);
        }

        externalLayer = null;
        externalBounds = null;
        externalZoom = null;
    }

    function hide() {
        active = false;

        if (externalSvg) {
            externalSvg.style.display = "none";
        }

        const original = originalSvg();

        if (original) {
            original.style.visibility = "visible";
        }
    }

    function show() {
        ensureExternalSvg();

        active = true;
        externalSvg.style.display = "block";

        const original = originalSvg();

        if (original) {
            original.style.visibility = "hidden";
        }
    }

    function fit() {
        if (!active || !externalZoom || !externalBounds) {
            return;
        }

        const rect = externalSvg.getBoundingClientRect();

        if (!rect.width || !rect.height) {
            return;
        }

        const padding = 65;

        const availableWidth = Math.max(
            100,
            rect.width - padding * 2
        );

        const availableHeight = Math.max(
            100,
            rect.height - padding * 2
        );

        const scale = Math.min(
            availableWidth / externalBounds.width,
            availableHeight / externalBounds.height,
            1.15
        );

        const safeScale = Math.max(
            0.12,
            Math.min(4, scale)
        );

        const x =
            rect.width / 2 -
            externalBounds.centerX * safeScale;

        const y =
            rect.height / 2 -
            externalBounds.centerY * safeScale;

        d3.select(externalSvg)
            .transition()
            .duration(300)
            .call(
                externalZoom.transform,
                d3.zoomIdentity
                    .translate(x, y)
                    .scale(safeScale)
            );
    }

    function zoomBy(factor) {
        if (!active || !externalZoom) {
            return;
        }

        d3.select(externalSvg)
            .transition()
            .duration(200)
            .call(externalZoom.scaleBy, factor);
    }

    function unique(values) {
        return [...new Set(values.filter(Boolean))];
    }

    function asIds(values) {
        if (!Array.isArray(values)) {
            return [];
        }

        return unique(
            values
                .map(value => {
                    if (typeof value === "string") {
                        return value;
                    }

                    return value?.id || "";
                })
                .filter(id => /^Q[1-9]\d*$/.test(id))
        );
    }

    function shorten(value, limit) {
        const text = String(value || "");

        return text.length > limit
            ? text.slice(0, limit) + "…"
            : text;
    }

    function render(data) {
        if (!data || !Array.isArray(data.nodes)) {
            throw new Error("外部人物关系数据无效");
        }

        if (typeof d3 === "undefined") {
            throw new Error("D3.js 尚未加载");
        }

        const rootId = String(data.qid || "");

        const nodeMap = new Map(
            data.nodes
                .filter(node => node && node.id)
                .map(node => [String(node.id), node])
        );

        if (!nodeMap.has(rootId)) {
            throw new Error("缺少核心人物节点");
        }

        const relations = Array.isArray(data.family_relations)
            ? data.family_relations
            : [];

        const summaries = Array.isArray(data.child_parent_summaries)
            ? data.child_parent_summaries
            : [];

        const direct = {
            father: [],
            mother: [],
            spouse: [],
            sibling: [],
            child: []
        };

        for (const relation of relations) {
            if (
                !relation ||
                !Object.prototype.hasOwnProperty.call(
                    direct,
                    relation.type
                )
            ) {
                continue;
            }

            if (String(relation.from) !== rootId) {
                continue;
            }

            const target = String(relation.to || "");

            if (!target || target === rootId) {
                continue;
            }

            if (!direct[relation.type].includes(target)) {
                direct[relation.type].push(target);
            }
        }

        const childIds = unique([
            ...direct.child,
            ...summaries.map(item => String(item.child_id || ""))
        ]).filter(id => /^Q[1-9]\d*$/.test(id));

        const summaryMap = new Map();

        for (const summary of summaries) {
            if (summary && summary.child_id) {
                summaryMap.set(
                    String(summary.child_id),
                    summary
                );
            }
        }

        /*
         * Group children by explicitly declared mother.
         * Unknown/conflicting cases remain separate.
         */

        const familyGroups = new Map();

        function getGroup(key, motherId, status) {
            if (!familyGroups.has(key)) {
                familyGroups.set(key, {
                    key,
                    motherId,
                    status,
                    children: []
                });
            }

            return familyGroups.get(key);
        }

        for (const childId of childIds) {
            const summary = summaryMap.get(childId);

            const fathers = asIds(summary?.father_ids);
            const mothers = asIds(summary?.mother_ids);

            let key = "unknown";
            let motherId = null;
            let status = "unknown";

            if (
                summary &&
                fathers.length > 0 &&
                !fathers.includes(rootId)
            ) {
                key = "conflict";
                status = "conflict";
            } else if (
                summary &&
                mothers.length === 1 &&
                (
                    fathers.includes(rootId) ||
                    (
                        fathers.length === 0 &&
                        direct.child.includes(childId)
                    )
                )
            ) {
                motherId = mothers[0];
                key = `mother:${motherId}`;
                status = "declared";
            } else if (mothers.length > 1) {
                key = "multiple";
                status = "multiple";
            }

            getGroup(key, motherId, status)
                .children.push(childId);
        }

        /*
         * Include explicitly declared spouses even when
         * no child is assigned to them.
         */

        const spouseIds = unique(direct.spouse);

        for (const spouseId of spouseIds) {
            const key = `mother:${spouseId}`;

            if (!familyGroups.has(key)) {
                getGroup(key, spouseId, "spouse_only");
            }
        }

        /*
         * Parent generation.
         */

        const positions = new Map();

        positions.set(rootId, {
            x: 0,
            y: 0,
            type: "center",
            label: "核心人物"
        });

        const parentIds = unique([
            ...direct.father,
            ...direct.mother
        ]);

        const parentSpacing = 230;

        parentIds.forEach((id, index) => {
            positions.set(id, {
                x:
                    (index - (parentIds.length - 1) / 2) *
                    parentSpacing,
                y: -310,
                type: "parent",
                label: direct.father.includes(id)
                    ? "父亲"
                    : "母亲"
            });
        });

        /*
         * Siblings: same generation as root.
         */

        const siblingSpacing = 180;

        direct.sibling.forEach((id, index) => {
            const side = index % 2 === 0 ? -1 : 1;
            const rank = Math.floor(index / 2) + 1;

            positions.set(id, {
                x: side * rank * siblingSpacing,
                y: 0,
                type: "sibling",
                label: "兄弟姐妹"
            });
        });

        /*
         * Family groups are laid out as separate columns.
         * Each group has one mother/partner heading,
         * followed by her explicitly assigned children.
         */

        const groups = [...familyGroups.values()];

        const GROUP_GAP = 100;
        const CHILD_SPACING = 160;
        const MAX_COLUMNS = 4;
        const CHILD_ROW_GAP = 155;

        const widths = groups.map(group => {
            const columns = Math.min(
                MAX_COLUMNS,
                Math.max(1, group.children.length)
            );

            return Math.max(
                230,
                columns * CHILD_SPACING
            );
        });

        const totalWidth =
            widths.reduce((sum, width) => sum + width, 0) +
            Math.max(0, groups.length - 1) * GROUP_GAP;

        let cursorX = -totalWidth / 2;

        const groupCenters = new Map();

        groups.forEach((group, index) => {
            const width = widths[index];
            const centerX = cursorX + width / 2;

            groupCenters.set(group.key, centerX);

            if (group.motherId) {
                const isSpouse = spouseIds.includes(
                    group.motherId
                );

                positions.set(group.motherId, {
                    x: centerX,
                    y: 190,
                    type: isSpouse ? "spouse" : "mother",
                    label: isSpouse
                        ? "配偶（Wikidata 声明）"
                        : "子女母亲（非配偶认定）"
                });
            }

            const columns = Math.min(
                MAX_COLUMNS,
                Math.max(1, group.children.length)
            );

            group.children.forEach((childId, childIndex) => {
                const row = Math.floor(
                    childIndex / columns
                );

                const column = childIndex % columns;

                const start = row * columns;

                const count = Math.min(
                    columns,
                    group.children.length - start
                );

                positions.set(childId, {
                    x:
                        centerX +
                        (column - (count - 1) / 2) *
                        CHILD_SPACING,
                    y: 440 + row * CHILD_ROW_GAP,
                    type: "child",
                    label:
                        group.status === "declared"
                            ? "子女 · 父母已声明"
                            : group.status === "conflict"
                                ? "子女 · 父亲声明冲突"
                                : group.status === "multiple"
                                    ? "子女 · 母亲声明不唯一"
                                    : "子女 · 归属待核验"
                });
            });

            cursorX += width + GROUP_GAP;
        });

        /*
         * Draw SVG.
         */

        clear();
        show();

        const selection = d3.select(externalSvg);

        selection
            .attr("width", "100%")
            .attr("height", "100%")
            .attr("preserveAspectRatio", "xMidYMid meet");

        externalLayer = selection
            .append("g")
            .attr("class", "pi-external-layer");

        externalZoom = d3.zoom()
            .scaleExtent([0.12, 4])
            .on("zoom", event => {
                if (externalLayer) {
                    externalLayer.attr(
                        "transform",
                        event.transform
                    );
                }
            });

        selection.call(externalZoom);
        selection.on("dblclick.zoom", null);

        selection
            .on("mousedown.cursor", () => {
                externalSvg.style.cursor = "grabbing";
            })
            .on("mouseup.cursor", () => {
                externalSvg.style.cursor = "grab";
            })
            .on("mouseleave.cursor", () => {
                externalSvg.style.cursor = "grab";
            });

        const linksLayer = externalLayer
            .append("g")
            .attr("class", "pi-external-links");

        function drawPath(path, options = {}) {
            linksLayer
                .append("path")
                .attr("d", path)
                .attr("fill", "none")
                .attr(
                    "stroke",
                    options.color || "#94a3b8"
                )
                .attr(
                    "stroke-width",
                    options.width || 1.7
                )
                .attr(
                    "stroke-dasharray",
                    options.dash || null
                )
                .attr("opacity", 0.9);
        }

        /*
         * Parent connectors.
         */

        if (parentIds.length > 0) {
            const junctionY = -155;

            for (const id of parentIds) {
                const point = positions.get(id);

                drawPath(
                    `M ${point.x} ${point.y + 30}
                     V ${junctionY}
                     H 0`
                );
            }

            drawPath(
                `M 0 ${junctionY} V -38`
            );
        }

        /*
         * Sibling connectors.
         */

        for (const id of direct.sibling) {
            const point = positions.get(id);

            if (!point) continue;

            const direction = point.x < 0 ? -1 : 1;

            drawPath(
                `M ${direction * 38} 0
                 H ${point.x - direction * 30}`,
                {
                    color: "#a78bfa"
                }
            );
        }

        /*
         * Each family group has a separate branch.
         * The branch indicates association with the
         * central parent and the declared mother.
         */

        for (const group of groups) {
            const centerX = groupCenters.get(group.key);

            const isKnownMother =
                group.status === "declared";

            const color = isKnownMother
                ? "#059669"
                : "#94a3b8";

            const headingY = 190;

            /*
             * Root to group:
             * visual grouping only, not a claim of marriage.
             */

            if (group.motherId) {
                drawPath(
                    `M 0 38
                     V 105
                     H ${centerX}
                     V ${headingY - 32}`,
                    {
                        color: spouseIds.includes(group.motherId)
                            ? "#fb7185"
                            : "#94a3b8",
                        dash: "5 4"
                    }
                );
            }

            if (group.children.length === 0) {
                continue;
            }

            const groupRows = Math.ceil(
                group.children.length / MAX_COLUMNS
            );

            for (let row = 0; row < groupRows; row++) {
                const rowChildren = group.children.slice(
                    row * MAX_COLUMNS,
                    (row + 1) * MAX_COLUMNS
                );

                const points = rowChildren
                    .map(id => positions.get(id))
                    .filter(Boolean);

                if (!points.length) continue;

                const rowY = points[0].y;
                const branchY = rowY - 85;

                const xs = points.map(point => point.x);

                const minX = Math.min(...xs);
                const maxX = Math.max(...xs);

                /*
                 * For known mothers, branch from mother.
                 * For unknown mothers, use a separate
                 * unverified group connector.
                 */

                if (row === 0) {
                    if (group.motherId) {
                        drawPath(
                            `M ${centerX} ${headingY + 32}
                             V ${branchY}`,
                            {
                                color,
                                dash: isKnownMother
                                    ? null
                                    : "5 4"
                            }
                        );
                    } else {
                        drawPath(
                            `M ${centerX} ${branchY - 45}
                             V ${branchY}`,
                            {
                                color,
                                dash: "5 4"
                            }
                        );
                    }
                } else {
                    drawPath(
                        `M ${centerX} ${headingY + 32}
                         V ${branchY}`,
                        {
                            color,
                            dash: isKnownMother
                                ? null
                                : "5 4"
                        }
                    );
                }

                if (points.length > 1) {
                    drawPath(
                        `M ${minX} ${branchY}
                         H ${maxX}`,
                        {
                            color
                        }
                    );
                }

                for (const point of points) {
                    drawPath(
                        `M ${point.x} ${branchY}
                         V ${point.y - 32}`,
                        {
                            color,
                            dash: isKnownMother
                                ? null
                                : "5 4"
                        }
                    );
                }
            }
        }

        /*
         * Draw nodes.
         */

        const nodesLayer = externalLayer
            .append("g")
            .attr("class", "pi-external-nodes");

        for (const [id, position] of positions) {
            const node = nodeMap.get(id);

            const name = node?.name || id;
            const isCenter = id === rootId;

            const color =
                COLORS[position.type] ||
                COLORS.unknown;


            const group = nodesLayer
                .append("g")
                .attr(
                    "transform",
                    `translate(${position.x},${position.y})`
                )
                .attr("data-qid", id)
                .style("cursor", "pointer")
                .attr("role", "button")
                .attr("tabindex", "0")
                .attr("aria-label", `查看人物：${name}`);

            const selectPerson = () => {
                const detail = {
                    qid: id,
                    node,
                    isCenter,
                    relationship: position.label,
                    source: "Wikidata"
                };

                window.dispatchEvent(
                    new CustomEvent("pi:external-person-selected", {
                        detail
                    })
                );
            };

            group.on("click", event => {
                event.stopPropagation();
                selectPerson();
            });

            group.on("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    selectPerson();
                }
            });



            const radius = isCenter ? 36 : 29;
            const imageUrl = node?.profile_image_url;

            if (
                typeof imageUrl === "string" &&
                imageUrl.startsWith("https://commons.wikimedia.org/")
            ) {
                const clipId = `pi-external-photo-${id}`;

                const defs = group.append("defs");

                defs.append("clipPath")
                    .attr("id", clipId)
                    .append("circle")
                    .attr("r", radius - 3);

                group.append("image")
                    .attr("href", imageUrl)
                    .attr("x", -(radius - 3))
                    .attr("y", -(radius - 3))
                    .attr("width", (radius - 3) * 2)
                    .attr("height", (radius - 3) * 2)
                    .attr("preserveAspectRatio", "xMidYMid slice")
                    .attr("clip-path", `url(#${clipId})`);

                group.append("circle")
                    .attr("r", radius)
                    .attr("fill", "none")
                    .attr("stroke", color)
                    .attr("stroke-width", isCenter ? 3.5 : 2.5);

            } else {
                group.append("circle")
                    .attr("r", radius)
                    .attr("fill", "#ffffff")
                    .attr("stroke", color)
                    .attr("stroke-width", isCenter ? 3.5 : 2.5);
            }



            if (!imageUrl) {
                group.append("text")
                    .attr("text-anchor", "middle")
                    .attr("dominant-baseline", "middle")
                    .attr("font-size", isCenter ? 12 : 11)
                    .attr("font-weight", 700)
                    .attr("fill", "#172033")
                    .text(
                        shorten(
                            name,
                            isCenter ? 5 : 4
                        )
                    );
            }

            group.append("text")
                .attr("text-anchor", "middle")
                .attr("y", 66)
                .attr("font-size", 11)
                .attr("fill", "#64748b")
                .text(position.label);

            group.append("title")
                .text(
                    `${name}\nWikidata: ${id}\n${position.label}`
                );
        }

        /*
         * Group labels for unresolved relationships.
         */

        const labelsLayer = externalLayer
            .append("g")
            .attr("class", "pi-external-group-labels");

        for (const group of groups) {
            if (group.motherId) {
                continue;
            }

            const centerX = groupCenters.get(group.key);

            const label =
                group.status === "conflict"
                    ? "父亲关系存在冲突 · 待核验"
                    : group.status === "multiple"
                        ? "母亲声明不唯一 · 待核验"
                        : "母亲关系未知 · 待核验";

            labelsLayer.append("text")
                .attr("x", centerX)
                .attr("y", 345)
                .attr("text-anchor", "middle")
                .attr("font-size", 13)
                .attr("font-weight", 600)
                .attr("fill", "#64748b")
                .text(label);
        }

        /*
         * Calculate bounds.
         */

        const allPositions = [...positions.values()];

        const xs = allPositions.map(point => point.x);
        const ys = allPositions.map(point => point.y);

        const minX = Math.min(...xs) - 145;
        const maxX = Math.max(...xs) + 145;
        const minY = Math.min(...ys) - 120;
        const maxY = Math.max(...ys) + 125;

        externalBounds = {
            width: Math.max(1, maxX - minX),
            height: Math.max(1, maxY - minY),
            centerX: (minX + maxX) / 2,
            centerY: (minY + maxY) / 2
        };

        fit();

        return {
            rendered: true,
            family_node_count: positions.size,
            family_group_count: groups.length,
            child_count: childIds.length,
            child_parent_lookup_status:
                data.child_parent_lookup_status || "unknown"
        };
    }

    window.PIExternalGraph = {
        render,
        hide,
        show,
        clear,
        fit,
        zoomIn: () => zoomBy(1.25),
        zoomOut: () => zoomBy(0.8),
        isActive: () => active
    };
})();