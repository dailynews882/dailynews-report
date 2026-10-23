"use strict";

/*
 * V11.4.5 - evidence-based family-unit forest with local identity references.
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
                userSelect: "none",
                textSizeAdjust: "100%",
                WebkitTextSizeAdjust: "100%"
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
            readable === true ? 0.85 : 0.005,
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
        const { units, ambiguous } = familyUnits(model);
        const people = new Map(model.nodes.map(n => [n.id, n])), positions = new Map(), rows = new Map(), labels = new Map();
        const compare = (a, b) => a.localeCompare(b, "en");
        const order = ids => [...ids].sort((a, b) => (model.depths.get(a) ?? 99) - (model.depths.get(b) ?? 99) || compare(a, b));
        const pairKey = ids => [...ids].sort(compare).join("|");
        const blocks = [], incoming = new Map(), owned = new Map(), memberships = new Map();
        const add = (map, key, value) => { if (!map.has(key)) map.set(key, []); map.get(key).push(value); };
        const spouseEdges = model.edges.filter(e => e.type === "spouse" && !e.layout_conflict);
        for (const unit of units) {
            unit.kind = unit.uncertain ? "conflict" : "parentage";
            unit.members = [...unit.parents]; unit.owner = order(unit.parents)[0];
            unit.evidence_status = unit.uncertain ? "conflict" : unit.edges.some(e => e.verification_status !== "verified") ? "unverified" : "verified";
            unit.marriage_edges = unit.parents.length === 2 ? spouseEdges.filter(e => pairKey([e.from, e.to]) === pairKey(unit.parents)) : [];
            unit.marriage_status = !unit.marriage_edges.length ? "not_declared" : unit.marriage_edges.some(e => e.source_difference) ? "conflict" : [...new Set(unit.marriage_edges.map(e => e.spouse_status || "unknown"))].join("/");
            blocks.push(unit); unit.children.forEach(id => incoming.set(id, unit));
        }
        // A marriage without child evidence is a partnership block, never a parenting unit.
        const partnership = new Map();
        for (const edge of spouseEdges) {
            const key = pairKey([edge.from, edge.to]);
            if (units.some(u => !u.uncertain && pairKey(u.parents) === key)) continue;
            if (!partnership.has(key)) partnership.set(key, { key: "partnership|" + key, kind: "partnership", members: key.split("|"), parents: [], children: [], edges: [], level: model.levels.get(edge.from), owner: order([edge.from, edge.to])[0] });
            partnership.get(key).edges.push(edge);
        }
        blocks.push(...partnership.values());
        blocks.sort((a, b) => a.level - b.level || compare(a.key, b.key));
        for (const block of blocks) { add(owned, block.owner, block); block.members.forEach(id => add(memberships, id, block)); }
        for (const node of [...model.nodes].sort((a, b) => compare(a.id, b.id))) {
            labels.set(node.id, wrapName(node.name || node.id));
            if (!memberships.has(node.id) && !incoming.has(node.id)) {
                const block = { key: "person|" + node.id, kind: "person", owner: node.id, members: [node.id], parents: [], children: [], edges: [], level: model.levels.get(node.id) };
                blocks.push(block); add(owned, node.id, block); add(memberships, node.id, block);
            }
        }
        const home = new Map();
        const homeOrder = (a, b) => Number(!!a.uncertain) - Number(!!b.uncertain) || Number(b.parents.length === 2) - Number(a.parents.length === 2) || compare(a.key, b.key);
        for (const node of model.nodes) {
            const options = owned.get(node.id) || memberships.get(node.id) || [];
            if (options.length) home.set(node.id, [...options].sort(homeOrder)[0]);
        }
        // Ownership is a layout forest only. It creates no genealogical statement.
        for (const block of blocks) {
            block.parent = incoming.get(block.owner) || null;
            if (block.parent === block || block.parent?.level >= block.level) block.parent = null;
            block.descendants = [];
        }
        for (const block of blocks) if (block.parent) block.parent.descendants.push(block);
        const card = 230, gap = 90, padding = 35;
        function measure(block) {
            block.branches = [...block.children].sort(compare).map(id => {
                const descendants = block.descendants.filter(b => b.owner === id).sort(homeOrder);
                const width = descendants.length ? descendants.reduce((s, b) => s + measure(b), 0) + gap * (descendants.length - 1) : card;
                return { id, descendants, width };
            });
            block.width = Math.max(block.members.length * card + padding * 2, block.branches.reduce((s, b) => s + b.width, 0) + gap * Math.max(0, block.branches.length - 1) + padding * 2);
            return block.width;
        }
        const roots = blocks.filter(b => !b.parent).sort((a, b) => a.level - b.level || (a.owner === model.root ? -1 : b.owner === model.root ? 1 : compare(a.key, b.key)));
        roots.forEach(measure);
        const levels = [...new Set(model.nodes.map(n => model.levels.get(n.id)))].sort((a, b) => a - b);
        const cardBottom = id => 63 + labels.get(id).length * 18 + relationLines(relationshipLabel(model, id)).length * 22 + 28;
        const siblingEdges = model.edges.filter(e => e.type === "sibling");
        const extraEdges = model.edges.filter(e => e.layout_conflict);
        const peerEdges = [...new Map([...siblingEdges, ...extraEdges].map(e => [edgeKey(e), e])).values()].sort((a, b) => compare(edgeKey(a), edgeKey(b)));
        const peerExtra = new Map(); peerEdges.forEach(e => peerExtra.set(e.from, (peerExtra.get(e.from) || 0) + Math.max(100, labels.get(e.to).length * 18 + 50)));
        const rowBottom = new Map(levels.map(level => [level, Math.max(...model.nodes.filter(n => model.levels.get(n.id) === level).map(n => cardBottom(n.id) + (peerExtra.get(n.id) || 0)))]));
        const generationGap = level => 210 + Math.max(0, ...units.filter(u => u.uncertain && u.level === level).flatMap(u => u.children.map(id => labels.get(id).length * 18 + 42 - 92)));
        const rowY = new Map([[0, 0]]), min = Math.min(...levels), max = Math.max(...levels);
        for (let l = 1; l <= max; l++) rowY.set(l, rowY.get(l - 1) + (rowBottom.get(l - 1) || 170) + generationGap(l - 1));
        for (let l = -1; l >= min; l--) rowY.set(l, rowY.get(l + 1) - (rowBottom.get(l) || 170) - generationGap(l));
        const references = [];
        function put(id, x, block, isMember) {
            if (!positions.has(id) && (!home.has(id) || home.get(id) === block)) {
                positions.set(id, { x, y: rowY.get(model.levels.get(id)), level: model.levels.get(id), bottom: cardBottom(id), width: 190, home: block.key, minX: x - 12, maxX: x + 12 });
            }
            const port = { id, x, y: rowY.get(block.level), bottom: cardBottom(id), block: block.key };
            if (isMember) { block.ports.set(id, port); }
        }
        function place(block, left) {
            block.left = left; block.right = left + block.width; block.ports = new Map();
            block.members.forEach((id, index) => put(id, (block.left + block.right) / 2 + (index - (block.members.length - 1) / 2) * card, block, true));
            let cursor = block.left + (block.width - block.branches.reduce((s, b) => s + b.width, 0) - gap * Math.max(0, block.branches.length - 1)) / 2;
            for (const branch of block.branches) {
                branch.left = cursor; branch.right = cursor + branch.width;
                if (branch.descendants.length) {
                    let childLeft = cursor;
                    for (const descendant of branch.descendants) { place(descendant, childLeft); childLeft += descendant.width + gap; }
                } else put(branch.id, cursor + branch.width / 2, block, false);
                cursor += branch.width + gap;
            }
        }
        let cursor = 0;
        for (const block of roots) { place(block, cursor); cursor += block.width + gap * 2; }
        // All identities must have a single canonical card, including co-parents owned elsewhere.
        for (const node of model.nodes) if (!positions.has(node.id)) throw new Error("Unplaced family identity: " + node.id);
        const shift = positions.get(model.root).x;
        for (const block of blocks) {
            block.left -= shift; block.right -= shift;
            block.ports.forEach(p => { p.x -= shift; });
            block.branches.forEach(b => { b.left -= shift; b.right -= shift; });
            block.extent = { left: block.left, right: block.right, top: rowY.get(block.level) - 80, bottom: rowY.has(block.level + 1) ? rowY.get(block.level + 1) - 48 : rowY.get(block.level) + (rowBottom.get(block.level) || 170) + 80 };
        }
        for (const [id, p] of positions) {
            p.x -= shift; p.minX -= shift; p.maxX -= shift;
            if (id !== model.root && overrides.has(id)) p.x = Math.max(p.minX, Math.min(p.maxX, overrides.get(id)));
            add(rows, p.level, id);
        }
        for (const row of rows.values()) row.sort((a, b) => positions.get(a).x - positions.get(b).x);
        for (const block of blocks) for (const port of block.ports.values()) {
            const p = positions.get(port.id);
            if (p.home === block.key) { port.x = p.x; port.y = p.y; port.bottom += peerExtra.get(port.id) || 0; }
            else references.push({ ...port, key: block.key + "|" + port.id, kind: "participant", node: people.get(port.id), label: "同一人物引用 · " + port.id });
        }
        for (const block of blocks) {
            block.childPorts = new Map();
            for (const branch of block.branches) {
                const p = positions.get(branch.id), local = p.x >= branch.left && p.x <= branch.right;
                const port = local ? p : { id: branch.id, x: (branch.left + branch.right) / 2, y: rowY.get(block.level + 1), bottom: cardBottom(branch.id) };
                block.childPorts.set(branch.id, port);
                if (!local) references.push({ ...port, id: branch.id, key: block.key + "|child|" + branch.id, kind: "participant", node: people.get(branch.id), label: "同一子女引用 · " + branch.id });
            }
        }
        const pathThrough = points => points.map((p, i) => i === 0 ? "M " + p.x + " " + p.y : p.x === points[i - 1].x ? "V " + p.y : "H " + p.x).join(" ");
        const bottomPort = p => ({ x: p.x, y: p.y + p.bottom + 10 });
        const routes = [], frames = []; let number = 0;
        const marriageLabel = block => block.marriage_status === "conflict" ? "婚姻来源冲突；待核对" : block.marriage_status === "not_declared" ? "共同家长；婚姻未声明" : block.marriage_edges?.some(e => e.spouse_status === "former") ? "有前配偶声明；现状待核验" : "配偶声明；现状待核验";
        for (const block of blocks) {
            if (block.kind === "person") continue;
            const index = ++number; block.number = index;
            const localBottom = rowY.get(block.level) + (rowBottom.get(block.level) || 170);
            const busY = rowY.get(block.level + 1) - 62, junctionY = localBottom + 95;
            const children = [...block.children].sort((a, b) => positions.get(a).x - positions.get(b).x);
            const x = (block.left + block.right) / 2;
            frames.push({ ...block.extent, key: block.key, number: index, kind: block.kind, label: (block.kind === "partnership" ? "伴侣声明 " : block.uncertain ? "归属待核实 " : "家庭 ") + index });
            if (block.kind === "partnership") {
                const a = bottomPort(block.ports.get(block.members[0])), b = bottomPort(block.ports.get(block.members[1]));
                routes.push({ key: block.key, kind: "spouse", block: block.key, edges: block.edges, former: block.edges.some(e => e.spouse_status === "former"), from: block.members[0], to: block.members[1], d: pathThrough([a, { x: a.x, y: localBottom + 35 }, { x: b.x, y: localBottom + 35 }, b]), caption: block.edges.some(e => e.source_difference) ? "婚姻来源冲突；待核对；无子女归属推定" : block.edges.some(e => e.spouse_status === "former") ? "前配偶；无子女归属推定" : "配偶；婚姻现状待核验；无子女归属推定", captionPoint: { x, y: localBottom + 78 } });
                continue;
            }
            if (block.uncertain) {
                for (const parent of block.parents) for (const child of children) {
                    const a = bottomPort(block.ports.get(parent)), y = localBottom + 55, key = "candidate|" + parent + "|" + child;
                    references.push({ key, kind: "evidence", id: child, x: a.x, y, height: Math.max(92, labels.get(child).length * 18 + 42), node: people.get(child), label: "同一子女的归属候选；待核实" });
                    routes.push({ key, kind: "conflict", block: block.key, edges: block.edges.filter(e => parentPair(e)?.parent === parent), conflict: true, label: "父母候选；未组成共同家长家庭", d: pathThrough([a, { x: a.x, y: y - 8 }]) });
                }
                continue;
            }
            const pieces = [...block.ports.values()].map(p => { const a = bottomPort(p); return pathThrough([a, { x: a.x, y: junctionY }, { x, y: junctionY }]); });
            pieces.push(pathThrough([{ x, y: junctionY }, { x, y: busY }]));
            children.forEach(id => { const p = block.childPorts.get(id); pieces.push(pathThrough([{ x, y: busY }, { x: p.x, y: busY }, { x: p.x, y: p.y - 34 }])); });
            routes.push({ key: "family|" + block.key, kind: "family", block: block.key, unit: block, edges: block.edges, pending: block.evidence_status !== "verified", uncertain: block.parents.length === 1, d: pieces.join(" "), junction: { x, y: junctionY }, caption: "家庭 " + index + " · " + (block.parents.length === 1 ? "另一方未知／待核实" : marriageLabel(block)), captionPoint: { x, y: junctionY - 15 }, label: "仅依据明确亲子证据；" + block.evidence_status });
            if (block.marriage_edges.length) {
                const a = block.ports.get(block.parents[0]), b = block.ports.get(block.parents[1]);
                routes.push({ key: "marriage|" + block.key, kind: "spouse", block: block.key, edges: block.marriage_edges, former: block.marriage_edges.some(e => e.spouse_status === "former"), from: a.id, to: b.id, d: pathThrough([{ x: a.x + 34, y: a.y }, { x: b.x - 34, y: b.y }]), label: marriageLabel(block) });
            }
        }
        // Non-tree evidence stays visible via labelled identity references, not cross-branch buses.
        const peerIndex = new Map();
        for (const edge of peerEdges) {
            const p = positions.get(edge.from), offset = peerIndex.get(edge.from) || 0, height = Math.max(92, labels.get(edge.to).length * 18 + 42); peerIndex.set(edge.from, offset + height + 8);
            const y = p.y + p.bottom + 22 + offset, key = "peer|" + edgeKey(edge);
            references.push({ key, kind: "evidence", id: edge.to, x: p.x, y, height, node: people.get(edge.to), label: edge.layout_conflict ? "关系冲突候选 · " + edge.type : "兄弟姐妹声明引用", edges: [edge] });
            routes.push({ key, kind: edge.layout_conflict ? "conflict" : "sibling", conflict: !!edge.layout_conflict, edges: [edge], from: edge.from, to: edge.to, d: pathThrough([{ x: p.x, y: y - 20 }, { x: p.x, y: y - 8 }]) });
        }
        const points = [...positions.values()];
        return { model, people, positions, labels, rows, units, blocks, frames, references, ambiguous, routes, bounds: {
            minX: Math.min(...points.map(p => p.x - 115), ...frames.map(f => f.left)) - 30,
            maxX: Math.max(...points.map(p => p.x + 115), ...frames.map(f => f.right)) + 30,
            minY: Math.min(...points.map(p => p.y - 85), ...frames.map(f => f.top)) - 20,
            maxY: Math.max(...points.map(p => p.y + (rowBottom.get(p.level) || p.bottom)), ...frames.map(f => f.bottom)) + 90 } };
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
        externalZoom = d3.zoom().scaleExtent([0.005, 4]).on("zoom", event => {
            viewTransform = event.transform; externalLayer.attr("transform", event.transform);
        });
        svg.call(externalZoom).on("dblclick.zoom", null);
        const frameLayer = externalLayer.append("g").attr("class", "pi-family-blocks").attr("pointer-events", "none");
        const frames = frameLayer.selectAll("g.pi-family-block").data(result.frames, b => b.key).join("g").attr("class", "pi-family-block").attr("data-family-key", b => b.key);
        frames.append("rect").attr("x", b => b.left).attr("y", b => b.top).attr("width", b => b.right - b.left).attr("height", b => b.bottom - b.top).attr("rx", 14).attr("fill", "#f8fafc").attr("fill-opacity", 0.85).attr("stroke", "#cbd5e1");
        frames.append("text").attr("x", b => b.left + 16).attr("y", b => b.top + 23).attr("fill", "#334b63").attr("font-size", 15).attr("font-weight", 600).text(b => b.label);
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
        let refGroups = null;
        const select = node => {
            selectedId = node.id; groups.attr("data-selected", n => String(n.id === selectedId));
            refGroups?.attr("data-selected", r => String(r.id === selectedId));
            const paths = model.paths.filter(p => p.to === node.id);
            window.dispatchEvent(new CustomEvent("pi:external-person-selected", { detail: { qid: node.id, node, isCenter: node.id === model.root,
                relationship: relationshipLabel(model, node.id), perspective: model.nodes.find(n => n.id === model.root)?.name || model.root,
                edges: model.edges.filter(e => e.from === node.id || e.to === node.id), paths } }));
            window.dispatchEvent(new CustomEvent("pi:external-evidence-selected", { detail: { edges: model.edges.filter(e => e.from === node.id || e.to === node.id), paths } }));
        };
        const expand = node => { if (selectedId !== node.id) select(node); window.dispatchEvent(new CustomEvent("pi:external-expand", { detail: { qid: node.id } })); };
        groups.on("click", (event, node) => { if (event.detail < 2 || !event.detail) select(node); }).on("dblclick", (event, node) => { event.stopPropagation(); expand(node); })
            .on("keydown", (event, node) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(node); } if (event.key.toLowerCase() === "e") expand(node); });
        refGroups = nodeLayer.selectAll("g.pi-person-ref").data(result.references, r => r.key).join("g").attr("class", "pi-person-ref")
            .attr("data-ref-person-id", r => r.id).attr("data-selected", r => String(r.id === selectedId)).attr("transform", r => "translate(" + r.x + "," + r.y + ")")
            .attr("role", "button").attr("tabindex", 0).attr("aria-label", r => r.node.name + " · " + r.label).style("cursor", "pointer")
            .on("click", (event, r) => { event.stopPropagation(); if (event.detail < 2 || !event.detail) select(r.node); })
            .on("dblclick", (event, r) => { event.stopPropagation(); expand(r.node); })
            .on("keydown", (event, r) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(r.node); } if (event.key.toLowerCase() === "e") expand(r.node); });
        refGroups.each(function (r) {
            const group = d3.select(this), evidence = r.kind === "evidence", name = wrapName(r.node.name || r.id);
            group.append("rect").attr("x", -99).attr("y", evidence ? -7 : -28).attr("width", 198).attr("height", evidence ? r.height : r.bottom + 38).attr("rx", 8).attr("fill", "#fff").attr("stroke", "#94a3b8");
            const text = group.append("text").attr("class", "pi-reference-name").attr("text-anchor", "middle").attr("font-size", 14).attr("fill", "#172033");
            name.forEach((line, i) => text.append("tspan").attr("x", 0).attr("y", (evidence ? 12 : 30) + i * 18).text(line));
            group.append("text").attr("text-anchor", "middle").attr("y", evidence ? r.height - 24 : -7).attr("font-size", 11).attr("fill", "#334b63").text(evidence ? r.label : "↗ 同一人物引用");
            if (!evidence) {
                const relation = group.append("text").attr("text-anchor", "middle").attr("font-size", 16).attr("fill", "#334b63");
                relationLines(relationshipLabel(model, r.id)).forEach((line, i) => relation.append("tspan").attr("x", 0).attr("y", 48 + name.length * 18 + i * 22).text(line));
                group.append("text").attr("text-anchor", "middle").attr("y", r.bottom - 1).attr("font-size", 10).attr("fill", "#64748b").text(r.id.startsWith("wp:") ? "会话内同一身份 · 待核验" : r.id + " · 同一身份 · 待核验");
            }
            group.append("title").text(r.node.name + "\n" + r.id + "\n同一人物的引用，不是新增人物。单击查看资料，双击按 QID 展开。");
        });
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
                manualX.set(node.id, Math.max(point.minX, min, Math.min(point.maxX, max, event.x)));
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
            const block = lastLayout.blocks.find(b => b.key === point.home);
            const parentY = block ? lastLayout.positions.get(block.owner).y : point.y;
            const targetX = block && block.width + 100 <= rect.width ? (block.left + block.right) / 2 : point.x;
            const key = document.querySelector?.(".pi-family-layout-key"), keyBottom = key?.getBoundingClientRect().bottom;
            const top = Math.max(rect.width <= 600 ? 205 : 145, (keyBottom || rect.top || 0) - (rect.top || 0) + 45);
            d3.select(externalSvg).call(externalZoom.transform, d3.zoomIdentity.translate(rect.width / 2 - targetX, top - parentY).scale(1));
        },
        getState: () => ({ selectedId, transform: viewTransform && { x: viewTransform.x, y: viewTransform.y, k: viewTransform.k }, layout: lastLayout }),
        zoomIn: () => zoomBy(1.25), zoomOut: () => zoomBy(0.8), isActive: () => active };
})();
