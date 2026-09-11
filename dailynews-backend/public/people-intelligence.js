/* =========================================================
   People Intelligence V1.3
   File: public/people-intelligence.js

   中文显示版
   底层关系代码仍保留英文，便于未来 API / 数据库 / 多语言扩展
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    initPeopleTabs();
    initNetworkFilters();
    renderPeopleNetwork("all");
});


/* =========================================================
   Runtime state
   ========================================================= */

const peopleNetworkState = {
    activeFilter: "all",
    selectedNodeId: null,
    expandedNodeIds: new Set()
};


/* =========================================================
   中文显示字典
   ========================================================= */

const relationTextMap = {
    CHILD_OF: "子女关系",
    PARENT_OF: "父母子女关系",
    SPOUSE_OF: "配偶关系",
    FORMER_SPOUSE_OF: "前配偶关系",
    ASSOCIATED_WITH: "商业关联",
    EXPOSED_TO: "行业关联",
    RELATED_ENTITY: "关联实体",
    RELATED_TO: "关联关系"
};

const categoryTextMap = {
    family: "家族",
    business: "商业",
    ownership: "股权 / 行业",
    person: "人物"
};

const entityTypeTextMap = {
    person: "人物",
    company: "企业",
    industry: "行业"
};

const statusTextMap = {
    Current: "当前",
    Historical: "历史",
    Prototype: "原型测试"
};

const confidenceTextMap = {
    Demo: "演示数据",
    High: "高",
    Medium: "中",
    Low: "低"
};


/* =========================================================
   Tab switching
   ========================================================= */

function initPeopleTabs() {
    const tabs = document.querySelectorAll(".pi-tab");
    const panels = document.querySelectorAll(".pi-tab-panel");

    if (!tabs.length || !panels.length) {
        return;
    }

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const targetName = tab.dataset.tab;

            tabs.forEach((item) => {
                item.classList.remove("active");
            });

            panels.forEach((panel) => {
                panel.classList.remove("active");
                panel.hidden = true;
            });

            tab.classList.add("active");

            const targetPanel = document.querySelector(
                `.pi-tab-panel[data-panel="${targetName}"]`
            );

            if (!targetPanel) {
                return;
            }

            targetPanel.hidden = false;
            targetPanel.classList.add("active");

            if (targetName === "network") {
                renderPeopleNetwork(
                    peopleNetworkState.activeFilter
                );
            }
        });
    });
}


/* =========================================================
   Network filters
   ========================================================= */

function initNetworkFilters() {
    const filterButtons = document.querySelectorAll(
        "[data-network-filter]"
    );

    if (!filterButtons.length) {
        return;
    }

    filterButtons.forEach((button) => {
        button.addEventListener("click", () => {
            filterButtons.forEach((item) => {
                item.classList.remove("active");
            });

            button.classList.add("active");

            const filter =
                button.dataset.networkFilter || "all";

            peopleNetworkState.activeFilter = filter;
            peopleNetworkState.selectedNodeId = null;

            renderPeopleNetwork(filter);
            resetRelationshipPanel();
        });
    });
}


/* =========================================================
   Prototype demo data
   ========================================================= */

const peopleIntelligenceDemo = {
    center: {
        id: "donald-trump",
        type: "person",
        category: "person",
        name: "唐纳德·特朗普",
        englishName: "Donald Trump",
        subtitle: "核心人物"
    },

    nodes: [
        {
            id: "fred-trump",
            type: "person",
            category: "family",
            name: "弗雷德·特朗普",
            englishName: "Fred Trump",
            subtitle: "父亲",
            relation: "CHILD_OF",
            relationLabel: "父亲",
            status: "Historical",
            confidence: "Demo",
            children: []
        },

        {
            id: "mary-anne-macleod-trump",
            type: "person",
            category: "family",
            name: "玛丽·安妮·麦克劳德·特朗普",
            englishName: "Mary Anne MacLeod Trump",
            subtitle: "母亲",
            relation: "CHILD_OF",
            relationLabel: "母亲",
            status: "Historical",
            confidence: "Demo",
            children: []
        },

        {
            id: "ivana-trump",
            type: "person",
            category: "family",
            name: "伊万娜·特朗普",
            englishName: "Ivana Trump",
            subtitle: "前配偶",
            relation: "FORMER_SPOUSE_OF",
            relationLabel: "前配偶",
            status: "Historical",
            confidence: "Demo",
            children: []
        },

        {
            id: "melania-trump",
            type: "person",
            category: "family",
            name: "梅拉尼娅·特朗普",
            englishName: "Melania Trump",
            subtitle: "配偶",
            relation: "SPOUSE_OF",
            relationLabel: "配偶",
            status: "Current",
            confidence: "Demo",
            children: []
        },

        {
            id: "donald-trump-jr",
            type: "person",
            category: "family",
            name: "小唐纳德·特朗普",
            englishName: "Donald Trump Jr.",
            subtitle: "儿子",
            relation: "PARENT_OF",
            relationLabel: "儿子",
            status: "Current",
            confidence: "Demo",
            children: []
        },

        {
            id: "ivanka-trump",
            type: "person",
            category: "family",
            name: "伊万卡·特朗普",
            englishName: "Ivanka Trump",
            subtitle: "女儿",
            relation: "PARENT_OF",
            relationLabel: "女儿",
            status: "Current",
            confidence: "Demo",

            children: [
                {
                    id: "jared-kushner",
                    type: "person",
                    category: "family",
                    name: "贾里德·库什纳",
                    englishName: "Jared Kushner",
                    subtitle: "伊万卡·特朗普的配偶",
                    relation: "SPOUSE_OF",
                    relationLabel: "配偶",
                    status: "Current",
                    confidence: "Demo"
                }
            ]
        },

        {
            id: "eric-trump",
            type: "person",
            category: "family",
            name: "埃里克·特朗普",
            englishName: "Eric Trump",
            subtitle: "儿子",
            relation: "PARENT_OF",
            relationLabel: "儿子",
            status: "Current",
            confidence: "Demo",
            children: []
        },

        {
            id: "trump-organization",
            type: "company",
            category: "business",
            name: "特朗普集团",
            englishName: "Trump Organization",
            subtitle: "企业",
            relation: "ASSOCIATED_WITH",
            relationLabel: "商业关联",
            status: "Current",
            confidence: "Demo",

            children: [
                {
                    id: "trump-org-business-network",
                    type: "company",
                    category: "business",
                    name: "商业关系网络",
                    englishName: "Business Network",
                    subtitle: "二级演示节点",
                    relation: "RELATED_ENTITY",
                    relationLabel: "关联实体",
                    status: "Prototype",
                    confidence: "Demo"
                }
            ]
        },

        {
            id: "trump-media",
            type: "company",
            category: "business",
            name: "特朗普媒体与科技集团",
            englishName: "Trump Media & Technology Group",
            subtitle: "上市公司",
            relation: "ASSOCIATED_WITH",
            relationLabel: "商业关联",
            status: "Current",
            confidence: "Demo",
            children: []
        },

        {
            id: "real-estate",
            type: "industry",
            category: "ownership",
            name: "房地产",
            englishName: "Real Estate",
            subtitle: "行业关联",
            relation: "EXPOSED_TO",
            relationLabel: "行业关联",
            status: "Current",
            confidence: "Demo",
            children: []
        },

        {
            id: "media-industry",
            type: "industry",
            category: "ownership",
            name: "媒体",
            englishName: "Media",
            subtitle: "行业关联",
            relation: "EXPOSED_TO",
            relationLabel: "行业关联",
            status: "Current",
            confidence: "Demo",
            children: []
        }
    ]
};


/* =========================================================
   Main network rendering
   ========================================================= */

function renderPeopleNetwork(filter = "all") {
    const networkContainer =
        document.getElementById("peopleNetwork");

    if (!networkContainer) {
        return;
    }

    const allNodes = peopleIntelligenceDemo.nodes;

    const visibleNodes =
        filter === "all"
            ? allNodes
            : allNodes.filter(
                (node) => node.category === filter
            );

    networkContainer.innerHTML = "";

    const stage = document.createElement("div");
    stage.className = "pi-demo-network-stage";

    const centerPosition = {
        x: 50,
        y: 50
    };

    const centerNode = createNetworkNode(
        peopleIntelligenceDemo.center,
        "center"
    );

    centerNode.style.left =
        `${centerPosition.x}%`;

    centerNode.style.top =
        `${centerPosition.y}%`;

    stage.appendChild(centerNode);

    visibleNodes.forEach((node, index) => {
        const position = calculateNodePosition(
            index,
            visibleNodes.length
        );

        const line = createNetworkLine(
            centerPosition,
            position,
            "primary"
        );

        const nodeElement = createNetworkNode(
            node,
            node.type
        );

        nodeElement.style.left =
            `${position.x}%`;

        nodeElement.style.top =
            `${position.y}%`;

        nodeElement.dataset.nodeId =
            node.id;

        if (
            peopleNetworkState.selectedNodeId ===
            node.id
        ) {
            nodeElement.classList.add("selected");
        }

        nodeElement.addEventListener(
            "click",
            () => {
                peopleNetworkState.selectedNodeId =
                    node.id;

                renderPeopleNetwork(
                    peopleNetworkState.activeFilter
                );

                showRelationshipDetails(
                    peopleIntelligenceDemo.center,
                    node
                );
            }
        );

        stage.appendChild(line);
        stage.appendChild(nodeElement);

        if (
            peopleNetworkState.expandedNodeIds.has(
                node.id
            )
        ) {
            renderChildConnections(
                stage,
                node,
                position
            );
        }
    });

    networkContainer.appendChild(stage);
}


/* =========================================================
   Second-level connection rendering
   ========================================================= */

function renderChildConnections(
    stage,
    parentNode,
    parentPosition
) {
    const children = parentNode.children || [];

    if (!children.length) {
        return;
    }

    children.forEach((child, index) => {
        const childPosition =
            calculateChildPosition(
                parentPosition,
                index,
                children.length
            );

        const line = createNetworkLine(
            parentPosition,
            childPosition,
            "secondary"
        );

        const relationshipLabel =
            createRelationshipLabel(
                parentPosition,
                childPosition,
                child.relation || "RELATED_TO"
            );

        const childElement =
            createNetworkNode(
                child,
                child.type
            );

        childElement.classList.add(
            "pi-demo-network-child"
        );

        childElement.style.left =
            `${childPosition.x}%`;

        childElement.style.top =
            `${childPosition.y}%`;

        childElement.dataset.nodeId =
            child.id;

        if (
            peopleNetworkState.selectedNodeId ===
            child.id
        ) {
            childElement.classList.add(
                "selected"
            );
        }

        childElement.addEventListener(
            "click",
            (event) => {
                event.stopPropagation();

                peopleNetworkState.selectedNodeId =
                    child.id;

                renderPeopleNetwork(
                    peopleNetworkState.activeFilter
                );

                showRelationshipDetails(
                    parentNode,
                    child
                );
            }
        );

        stage.appendChild(line);
        stage.appendChild(
            relationshipLabel
        );
        stage.appendChild(childElement);
    });
}


/* =========================================================
   Position calculations
   ========================================================= */

function calculateNodePosition(index, total) {
    const centerX = 50;
    const centerY = 50;

    const radiusX =
        total <= 4 ? 34 : 40;

    const radiusY =
        total <= 4 ? 32 : 38;

    const angle =
        (Math.PI * 2 * index) /
        Math.max(total, 1) -
        Math.PI / 2;

    return {
        x:
            centerX +
            Math.cos(angle) * radiusX,

        y:
            centerY +
            Math.sin(angle) * radiusY
    };
}


function calculateChildPosition(
    parentPosition,
    index,
    total
) {
    const centerX = 50;
    const centerY = 50;

    const directionX =
        parentPosition.x - centerX;

    const directionY =
        parentPosition.y - centerY;

    const distance = Math.sqrt(
        directionX * directionX +
        directionY * directionY
    );

    const normalizedX =
        distance === 0
            ? 1
            : directionX / distance;

    const normalizedY =
        distance === 0
            ? 0
            : directionY / distance;

    const perpendicularX =
        -normalizedY;

    const perpendicularY =
        normalizedX;

    const outwardDistance =
        total <= 1
            ? 30
            : 21;

    const spacing =
        total <= 2
            ? 14
            : 11;

    const offset =
        (index - (total - 1) / 2) *
        spacing;

    let x =
        parentPosition.x +
        normalizedX * outwardDistance +
        perpendicularX * offset;

    let y =
        parentPosition.y +
        normalizedY * outwardDistance +
        perpendicularY * offset;

    if (parentPosition.y > 75) {
        y -= 4;

        x +=
            normalizedX >= 0
                ? 4
                : -4;
    }

    if (parentPosition.y < 25) {
        y += 4;

        x +=
            normalizedX >= 0
                ? 4
                : -4;
    }

    if (parentPosition.x > 78) {
        x -= 5;
    }

    if (parentPosition.x < 22) {
        x += 5;
    }

    x = clamp(x, 8, 92);
    y = clamp(y, 10, 90);

    return {
        x,
        y
    };
}


function clamp(value, min, max) {
    return Math.min(
        Math.max(value, min),
        max
    );
}


/* =========================================================
   Network nodes
   ========================================================= */

function createNetworkNode(node, type) {
    const element =
        document.createElement("button");

    element.type = "button";

    element.className =
        `pi-demo-network-node pi-demo-network-node-${type}`;

    const title =
        document.createElement("strong");

    title.textContent =
        node.name;

    const englishName =
        document.createElement("span");

    englishName.textContent =
        node.englishName || "";

    const subtitle =
        document.createElement("span");

    subtitle.textContent =
        node.subtitle || "";

    element.appendChild(title);

    if (node.englishName) {
        element.appendChild(
            englishName
        );
    }

    element.appendChild(subtitle);

    return element;
}


/* =========================================================
   Connection lines
   ========================================================= */

function createNetworkLine(
    startPosition,
    endPosition,
    level = "primary"
) {
    const deltaX =
        endPosition.x -
        startPosition.x;

    const deltaY =
        endPosition.y -
        startPosition.y;

    const length = Math.sqrt(
        deltaX * deltaX +
        deltaY * deltaY
    );

    const angle =
        Math.atan2(
            deltaY,
            deltaX
        ) *
        (180 / Math.PI);

    const line =
        document.createElement("div");

    line.className =
        `pi-demo-network-line pi-demo-network-line-${level}`;

    line.style.width =
        `${length}%`;

    line.style.left =
        `${startPosition.x}%`;

    line.style.top =
        `${startPosition.y}%`;

    line.style.transform =
        `rotate(${angle}deg)`;

    return line;
}


/* =========================================================
   Relationship labels
   ========================================================= */

function createRelationshipLabel(
    startPosition,
    endPosition,
    relation
) {
    const label =
        document.createElement("div");

    label.className =
        "pi-network-relation-label";

    label.textContent =
        getRelationText(relation);

    const midpointX =
        (startPosition.x +
            endPosition.x) /
        2;

    const midpointY =
        (startPosition.y +
            endPosition.y) /
        2;

    label.style.left =
        `${midpointX}%`;

    label.style.top =
        `${midpointY}%`;

    return label;
}


/* =========================================================
   Relationship details
   ========================================================= */

function showRelationshipDetails(
    sourceNode,
    targetNode
) {
    const evidencePanel =
        document.querySelector(
            ".pi-side-panel .pi-section-card"
        );

    if (!evidencePanel) {
        return;
    }

    const hasChildren =
        Array.isArray(
            targetNode.children
        ) &&
        targetNode.children.length > 0;

    const isExpanded =
        peopleNetworkState.expandedNodeIds.has(
            targetNode.id
        );

    const relationshipText =
        `${sourceNode.name}` +
        ` → ${getRelationText(
            targetNode.relation
        )}` +
        ` → ${targetNode.name}`;

    evidencePanel.innerHTML = `
    <div class="pi-section-heading">
      <div>
        <span class="pi-eyebrow">
          关系详情
        </span>

        <h2>
          ${escapeHtml(targetNode.name)}
        </h2>

        ${targetNode.englishName
            ? `
              <p style="
                margin:4px 0 0;
                color:#7a8596;
                font-size:11px;
              ">
                ${escapeHtml(
                targetNode.englishName
            )}
              </p>
            `
            : ""
        }
      </div>
    </div>

    <div class="pi-relationship-path">
      ${escapeHtml(
            relationshipText
        )}
    </div>

    <div class="pi-confidence-box">
      <span>
        可信度
      </span>

      <strong>
        ${escapeHtml(
            getConfidenceText(
                targetNode.confidence
            )
        )}
      </strong>
    </div>

    <div class="pi-relationship-detail-list">

      <div>
        <span>关系</span>
        <strong>
          ${escapeHtml(
            targetNode.relationLabel ||
            getRelationText(
                targetNode.relation
            )
        )}
        </strong>
      </div>

      <div>
        <span>分类</span>
        <strong>
          ${escapeHtml(
            getCategoryText(
                targetNode.category
            )
        )}
        </strong>
      </div>

      <div>
        <span>状态</span>
        <strong>
          ${escapeHtml(
            getStatusText(
                targetNode.status
            )
        )}
        </strong>
      </div>

      <div>
        <span>实体类型</span>
        <strong>
          ${escapeHtml(
            getEntityTypeText(
                targetNode.type
            )
        )}
        </strong>
      </div>

    </div>

    <div class="pi-evidence-item">
      <div class="pi-evidence-type">
        证据
      </div>

      <strong>
        原型关系数据
      </strong>

      <p>
        当前仍为演示数据。
        后续接入数据库后，这里将显示真实来源、
        文件引用、证据日期、可信度和历史核验记录。
      </p>
    </div>

    ${hasChildren
            ? `
          <button
            type="button"
            class="pi-expand-connections-btn"
            id="expandConnectionsButton"
          >
            ${isExpanded
                ? "收起关联关系"
                : `展开关联关系（${targetNode.children.length}）`
            }
          </button>
        `
            : ""
        }
  `;

    const expandButton =
        document.getElementById(
            "expandConnectionsButton"
        );

    if (expandButton) {
        expandButton.addEventListener(
            "click",
            () => {
                toggleNodeExpansion(
                    targetNode.id
                );

                showRelationshipDetails(
                    sourceNode,
                    targetNode
                );
            }
        );
    }
}


/* =========================================================
   Expand / Collapse second-level nodes
   ========================================================= */

function toggleNodeExpansion(nodeId) {
    if (
        peopleNetworkState.expandedNodeIds.has(
            nodeId
        )
    ) {
        peopleNetworkState.expandedNodeIds.delete(
            nodeId
        );
    } else {
        peopleNetworkState.expandedNodeIds.add(
            nodeId
        );
    }

    renderPeopleNetwork(
        peopleNetworkState.activeFilter
    );
}


/* =========================================================
   Restore default Evidence panel
   ========================================================= */

function resetRelationshipPanel() {
    const evidencePanel =
        document.querySelector(
            ".pi-side-panel .pi-section-card"
        );

    if (!evidencePanel) {
        return;
    }

    evidencePanel.innerHTML = `
    <div class="pi-section-heading">
      <div>
        <span class="pi-eyebrow">
          数据质量
        </span>

        <h2>
          证据资料
        </h2>
      </div>
    </div>

    <div class="pi-confidence-box">
      <span>
        人物资料可信度
      </span>

      <strong>
        高
      </strong>
    </div>

    <div class="pi-evidence-item">
      <div class="pi-evidence-type">
        官方
      </div>

      <strong>
        第一手来源
      </strong>

      <p>
        官方文件、监管披露和已核验记录将在这里显示。
      </p>
    </div>

    <div class="pi-evidence-item">
      <div class="pi-evidence-type">
        媒体
      </div>

      <strong>
        可信媒体报道
      </strong>

      <p>
        经过筛选的可信媒体证据将在这里显示。
      </p>
    </div>
  `;
}


/* =========================================================
   Translation helpers
   ========================================================= */

function getRelationText(value) {
    return (
        relationTextMap[value] ||
        value ||
        "关联关系"
    );
}


function getCategoryText(value) {
    return (
        categoryTextMap[value] ||
        value ||
        "未知"
    );
}


function getEntityTypeText(value) {
    return (
        entityTypeTextMap[value] ||
        value ||
        "未知"
    );
}


function getStatusText(value) {
    return (
        statusTextMap[value] ||
        value ||
        "未知"
    );
}


function getConfidenceText(value) {
    return (
        confidenceTextMap[value] ||
        value ||
        "未知"
    );
}


/* =========================================================
   HTML safety helper
   ========================================================= */

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}