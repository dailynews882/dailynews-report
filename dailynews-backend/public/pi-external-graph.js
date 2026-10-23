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

    const FAMILY = { P22: "father", P25: "mother", P26: "spouse", P40: "child", P3373: "sibling" };
    let graphData = null;
    let expanded = new Set();
    function edgeKey(edge) {
        return edge.evidence_id || edge.statement_id || [edge.from, edge.to, edge.type, edge.source_url].join("|");
    }
    function buildModel(data) {
        const root = String(data.qid || "");
        const all = new Map((data.nodes || []).filter(n => (/^Q[1-9]\d*$/.test(n?.id || "") || /^wp:[a-f0-9]{32}:\d+$/.test(n?.id || "")) && n.entity_type !== "other").map(n => [n.id, n]));
        const facts = new Map();
        for (const edge of [...(data.family_relations || []), ...(data.child_parent_relations || [])]) {
            const normalized = edge.statement_subject && edge.statement_object
                ? { ...edge, from: edge.statement_subject, to: edge.statement_object, type: FAMILY[edge.property] || edge.type, label: edge.statement_label || edge.label } : edge;
            if (!all.has(normalized.from) || !all.has(normalized.to) || normalized.from === normalized.to || !["father", "mother", "parent", "child", "sibling", "spouse"].includes(normalized.type)) continue;
            facts.set(edgeKey(normalized), normalized);
        }
        const edges = [...facts.values()], adjacency = new Map(), parents = new Map(), children = new Map();
        const add = (map, id, item) => { if (!map.has(id)) map.set(id, []); map.get(id).push(item); };
        for (const edge of edges) {
            const isParent = ["father", "mother", "parent"].includes(edge.type), isChild = edge.type === "child";
            const step = isParent ? -1 : isChild ? 1 : 0;
            add(adjacency, edge.from, { id: edge.to, step, edge }); add(adjacency, edge.to, { id: edge.from, step: -step, edge });
            if (isParent || isChild) {
                const child = isParent ? edge.from : edge.to, parent = isParent ? edge.to : edge.from;
                add(parents, child, { id: parent, edge }); add(children, parent, { id: child, edge });
            }
        }
        const depths = new Map([[root, 0]]), levels = new Map([[root, 0]]), queue = [root];
        for (const id of queue) {
            if (depths.get(id) >= 2) continue;
            for (const item of adjacency.get(id) || []) {
                if (depths.has(item.id)) continue;
                depths.set(item.id, depths.get(id) + 1); levels.set(item.id, levels.get(id) + item.step); queue.push(item.id);
            }
        }
        const paths = [];
        for (const [map, type, label] of [[parents, "grandparent", "祖辈（两段父母路径）"], [children, "grandchild", "孙辈／外孙辈（两段子女路径）"]]) {
            for (const first of map.get(root) || []) for (const second of map.get(first.id) || []) {
                if ([root, first.id].includes(second.id)) continue;
                paths.push({ from: root, to: second.id, via: first.id, type, label, derived: true, direct_statement: false, steps: [first.edge, second.edge] });
            }
        }
        const nodes = [...all.values()].filter(n => depths.has(n.id)).slice(0, 100);
        const visible = new Set(nodes.map(n => n.id));
        return { root, nodes, edges: edges.filter(e => visible.has(e.from) && visible.has(e.to)), depths, levels,
            paths: [...new Map(paths.filter(p => visible.has(p.to)).map(p => [p.to + "|" + p.via + "|" + p.type, p])).values()] };
    }
    function reset(data) {
        const familyIds = new Set([data.qid, ...(data.family_relations || []).flatMap(e => [e.from, e.to]), ...(data.child_parent_relations || []).flatMap(e => [e.from, e.to])]);
        graphData = { ...data, nodes: [...new Map((data.nodes || []).filter(n => familyIds.has(n.id)).map(n => [n.id, n])).values()].slice(0, 100) };
        expanded = new Set([String(data.qid)]);
        return draw(graphData);
    }
    function merge(data) {
        if (!graphData) return reset(data);
        const before = buildModel(graphData), id = String(data.qid);
        if (!before.depths.has(id) || before.depths.get(id) >= 2 || expanded.has(id)) return { rendered: false, reason: "DEPTH_OR_DUPLICATE" };
        if (expanded.size >= 20) return { rendered: false, reason: "EXPANSION_LIMIT" };
        const nodes = new Map((graphData.nodes || []).map(n => [n.id, n]));
        const familyIds = new Set([id, ...(data.family_relations || []).flatMap(e => [e.from, e.to]), ...(data.child_parent_relations || []).flatMap(e => [e.from, e.to])]);
        let limited = false;
        for (const node of data.nodes || []) {
            if (!familyIds.has(node.id)) continue;
            if (nodes.has(node.id) || nodes.size < 100) nodes.set(node.id, node); else limited = true;
        }
        graphData = { ...graphData, nodes: [...nodes.values()],
            family_relations: [...graphData.family_relations || [], ...data.family_relations || []],
            child_parent_relations: [...graphData.child_parent_relations || [], ...data.child_parent_relations || []] };
        expanded.add(id);
        return { ...draw(graphData), limited };
    }
    function canExpand(id) {
        const depth = graphData && buildModel(graphData).depths.get(id);
        return /^Q[1-9]\d*$/.test(id || "") && depth !== undefined && depth < 2 && !expanded.has(id) && expanded.size < 20;
    }
    function draw(data) {
        const model = buildModel(data);
        if (!model.nodes.some(n => n.id === model.root)) throw new Error("缺少核心人物节点");
        show(); clear();
        const svg = d3.select(externalSvg);
        externalLayer = svg.append("g");
        externalZoom = d3.zoom().scaleExtent([0.12, 4]).on("zoom", event => externalLayer.attr("transform", event.transform));
        svg.call(externalZoom).on("dblclick.zoom", null);
        const rows = new Map(), positions = new Map();
        for (const node of model.nodes) {
            if (node.id === model.root) { positions.set(node.id, { x: 0, y: 0 }); continue; }
            const level = model.levels.get(node.id) || 0;
            if (!rows.has(level)) rows.set(level, []); rows.get(level).push(node.id);
        }
        for (const [level, ids] of rows) {
            ids.sort();
            ids.forEach((id, index) => {
                const columns = Math.min(8, ids.length), row = Math.floor(index / columns);
                const count = Math.min(columns, ids.length - row * columns);
                positions.set(id, level === 0
                    ? { x: (index % 2 ? 1 : -1) * (Math.floor((index % 8) / 2) + 1) * 170, y: row * 155 }
                    : { x: ((index % columns) - (count - 1) / 2) * 170, y: level * 230 + Math.sign(level) * row * 155 });
            });
        }
        const edgeLayer = externalLayer.append("g"), nodeLayer = externalLayer.append("g");
        const path = edge => { const a = positions.get(edge.from), b = positions.get(edge.to); return "M " + a.x + " " + a.y + " L " + b.x + " " + b.y; };
        const lines = edgeLayer.selectAll("path").data(model.edges).join("path")
            .attr("d", path).attr("fill", "none").attr("stroke", e => e.source_difference ? "#d97706" : e.type === "spouse" ? "#e11d48" : "#94a3b8")
            .attr("stroke-width", 2).attr("stroke-dasharray", e => e.spouse_status === "former" || e.derived ? "5,4" : null)
            .style("cursor", "pointer").on("click", (event, edge) => {
                event.stopPropagation(); window.dispatchEvent(new CustomEvent("pi:external-evidence-selected", { detail: { edges: [edge] } }));
            });
        lines.append("title").text(e => (e.label || e.type) + " · 点击查看原始声明与证据");
        const groups = nodeLayer.selectAll("g.pi-person").data(model.nodes, n => n.id).join("g").attr("class", "pi-person")
            .attr("transform", n => "translate(" + positions.get(n.id).x + "," + positions.get(n.id).y + ")")
            .attr("tabindex", 0).attr("role", "button").attr("aria-label", n => (n.name || n.id) + "，查看人物，双击展开")
            .style("cursor", "pointer");
        const select = node => {
            const paths = model.paths.filter(p => p.to === node.id);
            const direct = model.edges.find(e => e.from === model.root && e.to === node.id);
            window.dispatchEvent(new CustomEvent("pi:external-person-selected", { detail: { qid: node.id, node, isCenter: node.id === model.root,
                relationship: node.id === model.root ? "中心人物" : paths[0]?.label || direct?.label || "有来源的关系路径（见连线）", paths } }));
            window.dispatchEvent(new CustomEvent("pi:external-evidence-selected", { detail: { edges: model.edges.filter(e => e.from === node.id || e.to === node.id), paths } }));
        };
        const expand = node => { select(node); if (canExpand(node.id)) window.dispatchEvent(new CustomEvent("pi:external-expand", { detail: { qid: node.id } })); };
        groups.on("click", (event, node) => select(node)).on("dblclick", (event, node) => { event.stopPropagation(); expand(node); })
            .on("keydown", (event, node) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(node); } if (event.key.toLowerCase() === "e") expand(node); });
        groups.call(d3.drag().on("start", event => event.sourceEvent?.stopPropagation()).on("drag", function (event, node) {
            positions.set(node.id, { x: event.x, y: event.y }); d3.select(this).attr("transform", "translate(" + event.x + "," + event.y + ")"); lines.attr("d", path);
        }).subject((event, node) => positions.get(node.id)));
        groups.each(function (node) {
            const group = d3.select(this), center = node.id === model.root, radius = center ? 35 : 29;
            group.append("circle").attr("r", radius).attr("fill", "#fff").attr("stroke", center ? "#2454d6" : "#64748b").attr("stroke-width", center ? 3 : 2);
            if (typeof node.profile_image_url === "string" && node.profile_image_url.startsWith("https://commons.wikimedia.org/")) {
                const clip = "pi-qid-" + node.id;
                group.append("clipPath").attr("id", clip).append("circle").attr("r", radius - 2);
                group.append("image").attr("href", node.profile_image_url).attr("x", -radius + 2).attr("y", -radius + 2).attr("width", radius * 2 - 4).attr("height", radius * 2 - 4).attr("preserveAspectRatio", "xMidYMid slice").attr("clip-path", "url(#" + clip + ")");
            } else group.append("text").attr("text-anchor", "middle").attr("dy", ".35em").attr("font-size", 11).text(shorten(node.name || node.id, 5));
            group.append("text").attr("text-anchor", "middle").attr("y", 52).attr("font-size", 12).attr("fill", "#172033").text(shorten(node.name || node.id, 13));
            const pathLabel = model.paths.find(p => p.to === node.id)?.label;
            group.append("text").attr("text-anchor", "middle").attr("y", 70).attr("font-size", 10).attr("fill", "#64748b").text(pathLabel || (center ? "中心人物" : canExpand(node.id) ? "双击或按 E 展开" : "已展开／两层边界"));
            group.append("title").text((node.name || node.id) + "\n" + node.id + "\n" + (pathLabel || "点击查看资料与来源"));
        });
        const points = [...positions.values()], xs = points.map(p => p.x), ys = points.map(p => p.y);
        const minX = Math.min(...xs) - 130, maxX = Math.max(...xs) + 130, minY = Math.min(...ys) - 90, maxY = Math.max(...ys) + 100;
        externalBounds = { width: maxX - minX, height: maxY - minY, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 }; fit();
        return { rendered: true, family_node_count: model.nodes.length, relation_count: model.edges.length, derived_path_count: model.paths.length };
    }
    window.PIExternalGraph = { render: reset, merge, buildModel, canExpand, hide, show, clear, fit,
        zoomIn: () => zoomBy(1.25), zoomOut: () => zoomBy(0.8), isActive: () => active };
})();
