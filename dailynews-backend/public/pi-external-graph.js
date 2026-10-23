"use strict";

/*
 * V11.4.2 - deterministic generation and family-unit layout.
 * External evidence is retained; layout never invents a parent or marriage.
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
    let selectedId = null;
    let viewTransform = null;
    let lastLayout = null;
    let manualX = new Map();

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

    function fit(readable = false) {
        if (!active || !externalZoom || !externalBounds) {
            return;
        }

        const rect = externalSvg.getBoundingClientRect();

        if (!rect.width || !rect.height) {
            return;
        }

        const padding = 65;
        const topPadding = rect.width <= 600 ? 180 : 130;

        const availableWidth = Math.max(
            100,
            rect.width - padding * 2
        );

        const availableHeight = Math.max(
            100,
            rect.height - topPadding - padding
        );

        const scale = Math.min(
            availableWidth / externalBounds.width,
            availableHeight / externalBounds.height,
            1.15
        );

        const safeScale = Math.max(
            readable === true ? 0.85 : 0.12,
            Math.min(4, scale)
        );

        let x =
            rect.width / 2 -
            externalBounds.centerX * safeScale;

        let y =
            topPadding + availableHeight / 2 -
            externalBounds.centerY * safeScale;
        if (readable === true && scale < 0.85 && lastLayout) {
            const root = lastLayout.positions.get(lastLayout.model.root);
            x = rect.width / 2 - root.x * safeScale;
            y = topPadding + availableHeight / 2 - root.y * safeScale;
        }

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

    const FAMILY = { P22: "father", P25: "mother", P26: "spouse", P40: "child", P3373: "sibling" };
    // Includes a sibling reached via a parent, plus that sibling's own family.
    const MAX_DEPTH = 3;
    const relationLines = value => wrapName(value, 140);
    let graphData = null;
    let expanded = new Set();
    function edgeKey(edge) {
        return edge.evidence_id || edge.statement_id || [edge.from, edge.to, edge.type, edge.source_url].join("|");
    }
    function parentPair(edge) {
        if (["father", "mother", "parent"].includes(edge.type)) return { parent: edge.to, child: edge.from, role: edge.type };
        if (edge.type === "child") return { parent: edge.from, child: edge.to, role: "parent" };
        return null;
    }
    function generations(root, nodes, edges) {
        const owners = new Map(nodes.map(n => [n.id, n.id])), weights = new Map(nodes.map(n => [n.id, 0]));
        function find(id) {
            const owner = owners.get(id);
            if (owner !== id) { const top = find(owner); weights.set(id, weights.get(id) + weights.get(owner)); owners.set(id, top); }
            return owners.get(id);
        }
        const priority = edge => (edge.derived ? 10 : 0) + ({ father: 0, mother: 0, parent: 1, child: 2, spouse: 3, sibling: 4 }[edge.type] ?? 5);
        const conflicts = new Set();
        for (const edge of [...edges].sort((a, b) => priority(a) - priority(b) || edgeKey(a).localeCompare(edgeKey(b), "en"))) {
            const delta = ["father", "mother", "parent"].includes(edge.type) ? -1 : edge.type === "child" ? 1 : 0;
            const a = find(edge.from), b = find(edge.to), wa = weights.get(edge.from), wb = weights.get(edge.to);
            if (a === b) { if (wb - wa !== delta) conflicts.add(edgeKey(edge)); }
            else { owners.set(b, a); weights.set(b, delta + wa - wb); }
        }
        find(root); const origin = weights.get(root), levels = new Map();
        for (const node of nodes) { find(node.id); levels.set(node.id, weights.get(node.id) - origin); }
        return { levels, conflicts };
    }
    function wrapName(value, width = 174) {
        // Conservative glyph widths, with word boundaries preferred. Never elide a name.
        const lines = []; let line = "", size = 0;
        const glyphWidth = ch => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(ch) ? 14 : /[MWmw@]/.test(ch) ? 14 : /\s/.test(ch) ? 4 : 9;
        for (const word of String(value || "").match(/\s+|[^\s]+/g) || []) {
            const length = Array.from(word).reduce((sum, ch) => sum + glyphWidth(ch), 0);
            if (line && size + length > width && !/^\s+$/.test(word)) { lines.push(line.trimEnd()); line = ""; size = 0; }
            for (const ch of word) {
                const w = glyphWidth(ch);
                if (size + w > width && line) { lines.push(line.trimEnd()); line = ""; size = 0; }
                if (!line && /\s/.test(ch)) continue;
                line += ch; size += w;
            }
        }
        if (line.trim()) lines.push(line.trimEnd());
        return lines.length ? lines : [""];
    }
    function familyUnits(model) {
        const childParents = new Map(), units = new Map(), ambiguous = [];
        for (const edge of model.edges) {
            const pair = parentPair(edge);
            if (!pair || edge.layout_conflict || model.levels.get(pair.child) !== model.levels.get(pair.parent) + 1) continue;
            if (!childParents.has(pair.child)) childParents.set(pair.child, new Map());
            const parents = childParents.get(pair.child);
            if (!parents.has(pair.parent)) parents.set(pair.parent, { roles: new Set(), edges: [] });
            parents.get(pair.parent).roles.add(pair.role); parents.get(pair.parent).edges.push(edge);
        }
        function add(parents, child, evidence, uncertain) {
            const key = parents.join("|") + (uncertain ? "|ambiguous" : "");
            if (!units.has(key)) units.set(key, { key, parents, children: [], edges: [], uncertain, level: model.levels.get(parents[0]) });
            const unit = units.get(key); unit.children.push(child); unit.edges.push(...evidence);
        }
        for (const [child, parents] of childParents) {
            const ids = [...parents.keys()].sort();
            const roleCount = role => [...parents.values()].filter(p => p.roles.has(role)).length;
            const uncertain = ids.length > 2 || roleCount("father") > 1 || roleCount("mother") > 1 || model.edges.some(e => e.source_difference && parentPair(e)?.child === child);
            if (uncertain) {
                ambiguous.push(child);
                units.set("ambiguous|" + child, { key: "ambiguous|" + child, parents: ids, children: [child], edges: [...parents.values()].flatMap(p => p.edges), uncertain: true, level: model.levels.get(ids[0]) });
            }
            else add(ids, child, [...parents.values()].flatMap(p => p.edges), false);
        }
        return { units: [...units.values()].sort((a, b) => a.level - b.level || a.key.localeCompare(b.key, "en")), ambiguous };
    }
    function relationshipLabel(model, id) {
        if (id === model.root) return "中心人物";
        const labels = new Set();
        const childTerm = edge => /^(儿子|兒子)$/.test(edge.article?.location?.relation_term || "") ? "儿子" : /^(女儿|女兒)$/.test(edge.article?.location?.relation_term || "") ? "女儿" : "子女";
        for (const edge of model.edges) {
            if (edge.layout_conflict) continue;
            const pair = parentPair(edge);
            if (pair?.child === model.root && pair.parent === id) labels.add({ father: "父亲", mother: "母亲", parent: "父母（未区分）" }[pair.role]);
            if (pair?.parent === model.root && pair.child === id) labels.add(edge.type === "child" ? childTerm(edge) : "子女");
            if (["spouse", "sibling"].includes(edge.type) && [edge.from, edge.to].includes(model.root) && [edge.from, edge.to].includes(id))
                labels.add(edge.type === "sibling" ? "兄弟姐妹" : edge.spouse_status === "former" ? "前配偶" : edge.spouse_status === "reported_current" ? "配偶（文章称现任）" : "配偶（状态待核验）");
        }
        for (const path of model.paths.filter(p => p.to === id)) {
            if (path.steps.some(step => model.edges.some(e => e.layout_conflict && edgeKey(e) === edgeKey(step)))) continue;
            if (path.type === "grandparent") {
                const first = parentPair(path.steps[0])?.role, second = parentPair(path.steps[1])?.role;
                labels.add(first === "father" ? second === "father" ? "祖父" : second === "mother" ? "祖母" : "父系祖辈" : first === "mother" ? second === "father" ? "外祖父" : second === "mother" ? "外祖母" : "母系祖辈" : "祖辈（两段路径）");
            } else labels.add("孙辈／外孙辈（两段路径）");
        }
        if (!labels.size) {
            const rootParents = new Set(model.edges.map(parentPair).filter(p => p?.child === model.root).map(p => p.parent));
            if (model.edges.map(parentPair).some(p => p?.child === id && rootParents.has(p.parent))) labels.add("兄弟姐妹（共同父／母有记载）");
            const siblings = new Set(model.edges.filter(e => e.type === "sibling" && [e.from, e.to].includes(model.root)).map(e => e.from === model.root ? e.to : e.from));
            model.edges.map(parentPair).filter(p => p && p.child !== model.root && rootParents.has(p.parent)).forEach(p => siblings.add(p.child));
            if (model.edges.map(parentPair).some(p => p?.child === id && siblings.has(p.parent))) labels.add("兄弟姐妹的子女（关系路径）");
            if (model.edges.some(e => e.type === "spouse" && ((siblings.has(e.from) && e.to === id) || (siblings.has(e.to) && e.from === id)))) labels.add("兄弟姐妹的配偶（关系路径）");
            const rootChildren = new Set(model.edges.map(parentPair).filter(p => p?.parent === model.root).map(p => p.child));
            const coParent = model.edges.map(parentPair).find(p => p?.parent === id && rootChildren.has(p.child));
            if (coParent) labels.add(coParent.role === "mother" ? "子女的母亲（婚姻未声明）" : coParent.role === "father" ? "子女的父亲（婚姻未声明）" : "子女的另一位家长（婚姻未声明）");
        }
        if (labels.has("儿子") || labels.has("女儿")) labels.delete("子女");
        return [...labels].join("／") || "关联人物（见来源路径）";
    }
    function layout(model, overrides = new Map()) {
        const { units, ambiguous } = familyUnits(model), positions = new Map(), rows = new Map(), labels = new Map();
        for (const node of model.nodes) {
            const lines = wrapName(node.name || node.id); labels.set(node.id, lines);
            const level = model.levels.get(node.id);
            if (!rows.has(level)) rows.set(level, []); rows.get(level).push(node.id);
        }
        const levels = [...rows.keys()].sort((a, b) => a - b);
        // Sort entire child-family blocks, not individual children, using parent barycentres.
        for (const level of levels) {
            const ids = rows.get(level).sort(), blocks = [], assigned = new Set();
            const incoming = units.filter(u => u.level + 1 === level && !u.uncertain);
            for (const unit of incoming) {
                const children = [...new Set(unit.children)].filter(id => !assigned.has(id)).sort();
                children.forEach(id => assigned.add(id));
                if (children.length) blocks.push({ key: unit.key, ids: children, score: unit.parents.reduce((s, id) => s + (positions.get(id)?.x || 0), 0) / unit.parents.length });
            }
            for (const id of ids) if (!assigned.has(id)) {
                const relatives = model.edges.filter(e => ["spouse", "sibling"].includes(e.type) && (e.from === id || e.to === id));
                const rootPartner = relatives.some(e => e.from === model.root || e.to === model.root);
                blocks.push({ key: id === model.root ? "0-root" : rootPartner ? "1-" + id : "2-" + id, ids: [id], score: 0 });
            }
            blocks.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key, "en"));
            const ordered = blocks.flatMap(b => b.ids);
            if (level === 0 && ordered.includes(model.root)) { ordered.splice(ordered.indexOf(model.root), 1); ordered.splice(Math.floor(ordered.length / 2), 0, model.root); }
            rows.set(level, ordered);
            ordered.forEach((id, index) => positions.set(id, { x: (index - (ordered.length - 1) / 2) * 218, y: 0, level, bottom: 63 + labels.get(id).length * 18 + relationLines(relationshipLabel(model, id)).length * 22 + 28, width: 190 }));
        }
        // Root remains the coordinate origin. Every generation has exactly one horizontal row.
        const rootX = positions.get(model.root).x;
        for (const point of positions.values()) point.x -= rootX;
        // A shared parent occupies the gap between family blocks. Each other explicit
        // parent is aligned over their own children's centre; spouse status is irrelevant.
        const rootUnits = units.filter(u => !u.uncertain && u.parents.includes(model.root));
        if (rootUnits.length > 1) {
            const split = Math.ceil(rootUnits.length / 2), placed = new Set();
            let left = -230, right = 230;
            const place = (unit, side) => {
                const children = [...new Set(unit.children)].sort(), width = (children.length - 1) * 218;
                const start = side < 0 ? left - width : right;
                children.forEach((id, i) => { positions.get(id).x = start + i * 218; placed.add(id); });
                if (side < 0) left = start - 340; else right = start + width + 340;
            };
            rootUnits.slice(0, split).reverse().forEach(u => place(u, -1)); rootUnits.slice(split).forEach(u => place(u, 1));
            const level = model.levels.get(model.root) + 1;
            for (const id of rows.get(level) || []) if (!placed.has(id)) { positions.get(id).x = right; right += 218; }
        }
        for (const level of [...levels].reverse()) {
            const outgoing = units.filter(u => u.level === level && !u.uncertain), counts = new Map(), targets = new Map();
            outgoing.forEach(u => u.parents.forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
            for (const unit of outgoing) {
                const centre = unit.children.reduce((sum, id) => sum + positions.get(id).x, 0) / unit.children.length;
                const movable = unit.parents.filter(id => id !== model.root && counts.get(id) === 1);
                movable.forEach((id, i) => targets.set(id, centre + (movable.length > 1 ? (i - (movable.length - 1) / 2) * 218 : 0)));
            }
            const order = [...rows.get(level)].sort((a, b) => (targets.get(a) ?? positions.get(a).x) - (targets.get(b) ?? positions.get(b).x) || a.localeCompare(b, "en"));
            if (order.includes(model.root)) {
                const centre = order.indexOf(model.root); positions.get(model.root).x = 0;
                for (let i = centre - 1; i >= 0; i--) positions.get(order[i]).x = Math.min(targets.get(order[i]) ?? positions.get(order[i]).x, positions.get(order[i + 1]).x - 218);
                for (let i = centre + 1; i < order.length; i++) positions.get(order[i]).x = Math.max(targets.get(order[i]) ?? positions.get(order[i]).x, positions.get(order[i - 1]).x + 218);
            } else order.forEach((id, i) => { positions.get(id).x = Math.max(targets.get(id) ?? positions.get(id).x, i ? positions.get(order[i - 1]).x + 218 : -Infinity); });
            rows.set(level, order);
        }
        const relatedLinks = model.edges.filter(e => ["spouse", "sibling"].includes(e.type)).sort((a, b) => edgeKey(a).localeCompare(edgeKey(b), "en"));
        // Stagger explicit co-parents within the generation band, never into a child generation.
        const offsets = new Map();
        if (rootUnits.length > 1) rootUnits.forEach((unit, index) => unit.parents.filter(id => id !== model.root).forEach(id => offsets.set(id, 65 + (index % 3) * 55)));
        const rowBottom = new Map(levels.map(l => [l, Math.max(...rows.get(l).map(id => positions.get(id).bottom + (offsets.get(id) || 0)))]));
        const band = level => (units.filter(u => u.level === level).length * 2 + relatedLinks.filter(e => model.levels.get(e.from) === level).length + 5) * 18 + 30;
        const rowY = new Map([[0, 0]]), min = Math.min(...levels), max = Math.max(...levels);
        for (let l = 1; l <= max; l++) rowY.set(l, rowY.get(l - 1) + (rowBottom.get(l - 1) || 100) + band(l - 1) + 40);
        for (let l = -1; l >= min; l--) rowY.set(l, rowY.get(l + 1) - (rowBottom.get(l) || 100) - band(l) - 40);
        for (const [id, point] of positions) point.y = rowY.get(point.level) + (offsets.get(id) || 0);
        for (const row of rows.values()) row.forEach((id, index) => {
            if (id === model.root || !overrides.has(id)) return;
            const minX = index ? positions.get(row[index - 1]).x + 200 : -Infinity;
            const maxX = index < row.length - 1 ? positions.get(row[index + 1]).x - 200 : Infinity;
            positions.get(id).x = Math.max(minX, Math.min(maxX, overrides.get(id)));
        });
        const routes = [], lane = new Map();
        const nextLane = level => { const value = (lane.get(level) || 0) + 1; lane.set(level, value); return value; };
        const pathThrough = points => points.map((p, i) => (i ? p.x === points[i - 1].x ? "V " + p.y : "H " + p.x : "M " + p.x + " " + p.y)).join(" ");
        const port = id => { const p = positions.get(id); return { x: p.x, y: p.y + p.bottom + 4 }; };
        const used = new Set();
        for (const edge of relatedLinks) {
            const pairKey = edge.type + "|" + [edge.from, edge.to].sort().join("|");
            if (used.has(pairKey)) continue; used.add(pairKey);
            const evidence = relatedLinks.filter(e => e.type === edge.type && [e.from, e.to].sort().join("|") === [edge.from, edge.to].sort().join("|"));
            if (edge.type === "sibling" && units.some(u => u.children.includes(edge.from) && u.children.includes(edge.to))) continue;
            const a = port(edge.from), b = port(edge.to), level = model.levels.get(edge.from);
            const y = Math.max(rowY.get(level) + rowBottom.get(level), rowY.get(model.levels.get(edge.to)) + rowBottom.get(model.levels.get(edge.to))) + nextLane(level) * 18;
            routes.push({ key: pairKey, kind: edge.type, edges: evidence, from: edge.from, to: edge.to,
                conflict: evidence.some(e => e.layout_conflict || e.source_difference), former: evidence.some(e => e.spouse_status === "former"),
                d: pathThrough([a, { x: a.x, y }, { x: b.x, y }, b]) });
        }
        const unitIndexes = new Map();
        for (const unit of units) {
            const parentPorts = unit.parents.map(port), children = [...new Set(unit.children)].sort((a, b) => positions.get(a).x - positions.get(b).x);
            const x = children.reduce((sum, id) => sum + positions.get(id).x, 0) / children.length;
            const junctionY = rowY.get(unit.level) + rowBottom.get(unit.level) + nextLane(unit.level) * 18;
            const index = (unitIndexes.get(unit.level) || 0) + 1; unitIndexes.set(unit.level, index);
            const busY = rowY.get(unit.level + 1) - 38 - index * 18;
            if (unit.uncertain) {
                for (const parent of unit.parents) for (const childId of children) {
                    const a = port(parent), child = positions.get(childId);
                    routes.push({ key: "candidate|" + parent + "|" + childId, kind: "conflict", conflict: true,
                        edges: unit.edges.filter(e => parentPair(e)?.parent === parent), label: "父母归属冲突候选 · 未组成家庭",
                        ...(parent === unit.parents[0] ? { caption: "父母归属冲突 · 待核实", captionPoint: { x: positions.get(childId).x, y: positions.get(childId).y - 48 } } : {}),
                        d: pathThrough([a, { x: a.x, y: junctionY }, { x: child.x, y: junctionY }, { x: child.x, y: child.y - 34 }]) });
                }
                continue;
            }
            const pieces = parentPorts.map(p => pathThrough([p, { x: p.x, y: junctionY }, { x, y: junctionY }]));
            pieces.push(pathThrough([{ x, y: junctionY }, { x, y: busY }]));
            for (const id of children) { const child = positions.get(id); pieces.push(pathThrough([{ x, y: busY }, { x: child.x, y: busY }, { x: child.x, y: child.y - 34 }])); }
            routes.push({ key: "family|" + unit.key, kind: "family", unit, edges: unit.edges, uncertain: unit.uncertain || unit.parents.length === 1 || unit.edges.some(e => e.derived),
                pending: unit.edges.some(e => e.verification_status !== "verified"), d: pieces.join(" "), junction: { x, y: junctionY },
                caption: `家庭 ${index} · ${unit.parents.map(id => model.nodes.find(n => n.id === id)?.name || id).join(" + ")} · ${unit.parents.length === 1 ? "另一方未知／待核实" : "双亲有记载"}`,
                captionPoint: { x, y: busY - 10 }, label: unit.parents.length === 1 ? "单亲资料 · 另一方未知" : "双亲声明 · 婚姻另行核验" });
        }
        // Keep contradictory constraints visible as outside evidence paths, never as a false family unit.
        const right = Math.max(...[...positions.values()].map(p => p.x)) + 140; let conflictIndex = 0;
        for (const edge of model.edges.filter(e => e.layout_conflict && parentPair(e))) {
            const a = port(edge.from), b = port(edge.to), x = right + (++conflictIndex) * 18;
            routes.push({ key: "conflict|" + edgeKey(edge), kind: "conflict", edges: [edge], conflict: true,
                d: pathThrough([a, { x, y: a.y }, { x, y: b.y }, b]) });
        }
        const points = [...positions.values()];
        return { model, positions, labels, rows, units, ambiguous, routes, bounds: {
            minX: Math.min(...points.map(p => p.x)) - 120, maxX: right + conflictIndex * 18,
            minY: Math.min(...points.map(p => p.y)) - 60, maxY: Math.max(...points.map(p => p.y + p.bottom + band(p.level))) + 30 } };
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
            if (depths.get(id) >= MAX_DEPTH) continue;
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
        const visibleEdges = edges.filter(e => visible.has(e.from) && visible.has(e.to));
        const generation = generations(root, nodes, visibleEdges);
        return { root, nodes, edges: visibleEdges.map(e => ({ ...e, layout_conflict: generation.conflicts.has(edgeKey(e)) })), depths, levels: generation.levels,
            generation_conflicts: generation.conflicts.size,
            paths: [...new Map(paths.filter(p => visible.has(p.to)).map(p => [p.to + "|" + p.via + "|" + p.type, p])).values()] };
    }
    function reset(data) {
        selectedId = null; viewTransform = null; manualX = new Map();
        const familyIds = new Set([data.qid, ...(data.family_relations || []).flatMap(e => [e.from, e.to]), ...(data.child_parent_relations || []).flatMap(e => [e.from, e.to])]);
        graphData = { ...data, nodes: [...new Map((data.nodes || []).filter(n => familyIds.has(n.id)).map(n => [n.id, n])).values()].slice(0, 100) };
        expanded = new Set([String(data.qid)]);
        return draw(graphData);
    }
    function merge(data) {
        if (!graphData) return reset(data);
        const before = buildModel(graphData), id = String(data.qid);
        if (!before.depths.has(id) || before.depths.get(id) >= MAX_DEPTH || expanded.has(id)) return { rendered: false, reason: "DEPTH_OR_DUPLICATE" };
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
        return { ...draw(graphData, true), limited };
    }
    function canExpand(id) {
        const depth = graphData && buildModel(graphData).depths.get(id);
        return /^Q[1-9]\d*$/.test(id || "") && depth !== undefined && depth < MAX_DEPTH && !expanded.has(id) && expanded.size < 20;
    }
    function draw(data, preserve = false) {
        const model = buildModel(data);
        if (!model.nodes.some(n => n.id === model.root)) throw new Error("Missing central person");
        if (externalSvg) d3.select(externalSvg).interrupt?.();
        const previousTransform = preserve ? viewTransform : null;
        const result = layout(model, manualX); lastLayout = result;
        show(); clear();
        const svg = d3.select(externalSvg);
        externalLayer = svg.append("g");
        externalZoom = d3.zoom().scaleExtent([0.04, 4]).on("zoom", event => {
            viewTransform = event.transform; externalLayer.attr("transform", event.transform);
        });
        svg.call(externalZoom).on("dblclick.zoom", null);
        const edgeLayer = externalLayer.append("g").attr("class", "pi-family-connectors");
        const nodeLayer = externalLayer.append("g");
        const lines = edgeLayer.selectAll("path.pi-family-route").data(result.routes, r => r.key).join("path")
            .attr("class", r => "pi-family-route pi-route-" + r.kind)
            .attr("d", r => r.d).attr("fill", "none")
            .attr("stroke", "#334b63")
            .attr("stroke-width", 1.7).attr("stroke-dasharray", null)
            .style("cursor", "pointer").on("click", (event, route) => {
                event.stopPropagation(); window.dispatchEvent(new CustomEvent("pi:external-evidence-selected", { detail: { edges: route.edges } }));
            });
        lines.append("title").text(r => r.label || r.edges.map(e => e.label || e.type).join("; "));
        const joins = edgeLayer.selectAll("g.pi-family-join").data(result.routes.filter(r => r.junction)).join("g")
            .attr("class", "pi-family-join").attr("transform", r => "translate(" + r.junction.x + "," + r.junction.y + ")")
            .style("cursor", "pointer").on("click", (event, r) => {
                event.stopPropagation(); window.dispatchEvent(new CustomEvent("pi:external-evidence-selected", { detail: { edges: r.edges } }));
            });
        joins.append("rect").attr("x", -4).attr("y", -4).attr("width", 8).attr("height", 8).attr("fill", "#fff").attr("stroke", "#64748b");
        joins.append("title").text(r => r.label);
        const captions = edgeLayer.selectAll("text.pi-family-caption").data(result.routes.filter(r => r.caption)).join("text")
            .attr("class", "pi-family-caption").attr("text-anchor", "middle").attr("font-size", 14).attr("fill", "#334b63")
            .attr("x", r => r.captionPoint.x).attr("y", r => r.captionPoint.y);
        captions.each(function (route) {
            const text = d3.select(this), parts = wrapName(route.caption, 210);
            parts.forEach((part, index) => text.append("tspan").attr("x", route.captionPoint.x).attr("dy", index ? 19 : -(parts.length - 1) * 19).text(part));
        });
        const groups = nodeLayer.selectAll("g.pi-person").data(model.nodes, n => n.id).join("g").attr("class", "pi-person")
            .attr("data-person-id", n => n.id).attr("data-generation", n => model.levels.get(n.id)).attr("data-selected", n => String(n.id === selectedId))
            .attr("transform", n => { const p = result.positions.get(n.id); return "translate(" + p.x + "," + p.y + ")"; })
            .attr("tabindex", 0).attr("role", "button").attr("aria-label", n => n.name || n.id).style("cursor", "pointer");
        const select = node => {
            selectedId = node.id; groups.attr("data-selected", n => String(n.id === selectedId));
            const paths = model.paths.filter(p => p.to === node.id);
            window.dispatchEvent(new CustomEvent("pi:external-person-selected", { detail: { qid: node.id, node, isCenter: node.id === model.root,
                relationship: relationshipLabel(model, node.id), perspective: model.nodes.find(n => n.id === model.root)?.name || model.root,
                edges: model.edges.filter(e => e.from === node.id || e.to === node.id), paths } }));
            window.dispatchEvent(new CustomEvent("pi:external-evidence-selected", { detail: { edges: model.edges.filter(e => e.from === node.id || e.to === node.id), paths } }));
        };
        const expand = node => { if (selectedId !== node.id) select(node); window.dispatchEvent(new CustomEvent("pi:external-expand", { detail: { qid: node.id } })); };
        groups.on("click", (event, node) => { if (event.detail < 2 || !event.detail) select(node); }).on("dblclick", (event, node) => { event.stopPropagation(); expand(node); })
            .on("keydown", (event, node) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(node); } if (event.key.toLowerCase() === "e") expand(node); });
        // Horizontal dragging keeps generations and non-overlapping card spacing intact.
        let dragged = false, dragStart = null;
        groups.call(d3.drag().clickDistance(5).subject((event, node) => result.positions.get(node.id))
            .on("start", event => { dragged = false; dragStart = { x: event.x, y: event.y }; event.sourceEvent?.stopPropagation(); }).on("drag", function (event, node) {
                if (!dragged && Math.hypot(event.x - dragStart.x, event.y - dragStart.y) <= 5) return;
                dragged = true;
                const point = result.positions.get(node.id), row = result.rows.get(point.level), index = row.indexOf(node.id);
                const min = index > 0 ? result.positions.get(row[index - 1]).x + 200 : -Infinity;
                const max = index < row.length - 1 ? result.positions.get(row[index + 1]).x - 200 : Infinity;
                if (node.id === model.root) return;
                manualX.set(node.id, Math.max(min, Math.min(max, event.x)));
                const revised = layout(model, manualX), byKey = new Map(revised.routes.map(r => [r.key, r]));
                groups.attr("transform", n => { const p = revised.positions.get(n.id); return "translate(" + p.x + "," + p.y + ")"; });
                lines.attr("d", r => byKey.get(r.key).d);
                joins.attr("transform", r => { const p = byKey.get(r.key).junction; return "translate(" + p.x + "," + p.y + ")"; });
                captions.attr("x", r => byKey.get(r.key).captionPoint.x).attr("y", r => byKey.get(r.key).captionPoint.y)
                    .selectAll("tspan").attr("x", function () { return byKey.get(this.parentNode.__data__.key).captionPoint.x; });
                lastLayout = revised;
            }).on("end", (event, node) => {
                // Keep horizontal adjustments while preserving generation and family constraints.
                // Mouseup also ends a zero-distance gesture. Replacing the target here
                // destroys the native click/dblclick sequence before it can select.
                if (dragged) draw(graphData, true);
            }));
        groups.each(function (node) {
            const group = d3.select(this), radius = 30, center = node.id === model.root;
            group.append("circle").attr("r", radius).attr("fill", "#fff").attr("stroke", center ? "#2454d6" : "#64748b").attr("stroke-width", center ? 3 : 2);
            if (typeof node.profile_image_url === "string" && node.profile_image_url.startsWith("https://commons.wikimedia.org/")) {
                const clip = "pi-avatar-" + model.nodes.indexOf(node);
                group.append("clipPath").attr("id", clip).append("circle").attr("r", radius - 2);
                group.append("image").attr("href", node.profile_image_url).attr("x", -radius + 2).attr("y", -radius + 2).attr("width", 56).attr("height", 56).attr("preserveAspectRatio", "xMidYMid slice").attr("clip-path", "url(#" + clip + ")");
            } else group.append("text").attr("text-anchor", "middle").attr("dy", ".35em").attr("font-size", 16).text(Array.from(node.name || node.id)[0]);
            const name = group.append("text").attr("class", "pi-person-fullname").attr("text-anchor", "middle").attr("font-size", 14).attr("fill", "#172033");
            result.labels.get(node.id).forEach((line, index) => name.append("tspan").attr("x", 0).attr("y", 51 + index * 18).text(line));
            const point = result.positions.get(node.id);
            const relationText = group.append("text").attr("class", "pi-person-relation").attr("text-anchor", "middle").attr("font-size", 16).attr("font-weight", 600).attr("fill", "#334b63");
            relationLines(relationshipLabel(model, node.id)).forEach((line, i) => relationText.append("tspan").attr("x", 0).attr("y", 63 + result.labels.get(node.id).length * 18 + i * 22).text(line));
            group.append("text").attr("class", "pi-person-hint").attr("text-anchor", "middle").attr("y", point.bottom - 2).attr("font-size", 10).attr("fill", "#64748b")
                .text(model.edges.some(e => e.source_difference || e.layout_conflict ? e.from === node.id || e.to === node.id : false) ? "! 来源冲突 · 查看证据" : canExpand(node.id) ? "双击或按 E 展开 · 待核验" : "来源可查 · 待核验");
            group.append("title").text((node.name || node.id) + "\n" + node.id);
        });
        const b = result.bounds;
        externalBounds = { width: b.maxX - b.minX, height: b.maxY - b.minY, centerX: (b.minX + b.maxX) / 2, centerY: (b.minY + b.maxY) / 2 };
        if (previousTransform) svg.call(externalZoom.transform, previousTransform); else fit(true);
        const notice = document.getElementById("piFamilyLayoutNotice");
        if (notice) notice.textContent = `家庭单元 ${result.units.length} 个；单亲资料不补齐另一方。${result.ambiguous.length ? ` ${result.ambiguous.length} 位人物父母归属待核对，保留候选证据。` : ""}${model.generation_conflicts ? ` ${model.generation_conflicts} 条世代矛盾边保留，未强行归组。` : ""}`;
        const perspective = document.getElementById("piFamilyPerspective");
        if (perspective) perspective.textContent = `关系视角：中心人物 ${model.nodes.find(n => n.id === model.root)?.name || model.root}`;
        return { rendered: true, family_node_count: model.nodes.length, relation_count: model.edges.length, derived_path_count: model.paths.length,
            family_unit_count: result.units.length, ambiguous_children: result.ambiguous.length, generation_conflicts: model.generation_conflicts };
    }
    window.PIExternalGraph = { render: reset, merge, buildModel, layout, wrapName, relationshipLabel, canExpand, hide, show, clear, fit,
        focus: () => {
            if (!externalZoom || !lastLayout) return;
            const point = lastLayout.positions.get(selectedId || lastLayout.model.root), rect = externalSvg.getBoundingClientRect();
            d3.select(externalSvg).call(externalZoom.transform, d3.zoomIdentity.translate(rect.width / 2 - point.x, rect.height / 2 - point.y).scale(1));
        },
        getState: () => ({ selectedId, transform: viewTransform && { x: viewTransform.x, y: viewTransform.y, k: viewTransform.k }, layout: lastLayout }),
        zoomIn: () => zoomBy(1.25), zoomOut: () => zoomBy(0.8), isActive: () => active };
})();
