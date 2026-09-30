/* =========================================================
   People Intelligence V1.3 (Integrated Dynamic Graph Engine)
   File: public/people-intelligence.js

   中文显示版
   底层关系代码仍保留英文，便于未来 API / 数据库 / 多语言扩展
   ========================================================= */

const PEOPLE_INTELLIGENCE_PUBLIC_API = "/api/people-intelligence/search";

document.addEventListener("DOMContentLoaded", async () => {
    initPeopleTabs();
    initNetworkFilters();
    initPeopleCorrection();

    const query = new URLSearchParams(window.location.search)
        .get("q")
        ?.trim();

    if (!query) {
        renderPeopleNetwork("all");
        return;
    }

    await loadPublicPeopleIntelligence(query);
});


/* =========================================================
   Runtime state
   ========================================================= */

const peopleNetworkState = {
    activeFilter: "all",
    selectedNodeId: null,
    expandedNodeIds: new Set()
};

let currentPublicEntityType = "person";
let currentPublicEntity = null;
let echartsGraphInstance = null;


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
    RELATED_TO: "关联关系",
    founder_of: "创始人",
    cofounder_of: "联合创始人",
    ceo_of: "首席执行官",
    chairman_of: "董事长",
    director_of: "董事",
    executive_of: "高管",
    employee_of: "任职",
    advisor_of: "顾问",
    owner_of: "所有人",
    shareholder_of: "股东",
    beneficial_owner_of: "最终受益人",
    controls: "控制",
    invested_in: "投资",
    parent_company_of: "母公司",
    subsidiary_of: "子公司"
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
    organization: "机构",
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
                // 切换到关系网络 Tab 时重新适配图谱容器
                setTimeout(() => {
                    renderPeopleNetwork(peopleNetworkState.activeFilter);
                    if (echartsGraphInstance) {
                        echartsGraphInstance.resize();
                    }
                }, 60);
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
   动态确保 ECharts 脚本载入
   ========================================================= */

function ensureEchartsLoaded() {
    return new Promise((resolve) => {
        if (window.echarts) {
            return resolve(window.echarts);
        }

        const script = document.createElement("script");
        script.src = "https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js";
        script.onload = () => resolve(window.echarts);
        script.onerror = () => {
            console.error("Failed to load ECharts engine from CDN.");
            resolve(null);
        };
        document.head.appendChild(script);
    });
}


/* =========================================================
   Main network rendering (真实力导向星系图引擎)
   ========================================================= */

async function renderPeopleNetwork(filter = "all") {
    const networkContainer = document.getElementById("peopleNetwork");
    if (!networkContainer) {
        return;
    }

    const echartsLib = await ensureEchartsLoaded();

    // 如果因极端网络情况未载入 ECharts，使用基础卡片占位，不卡崩页面
    if (!echartsLib) {
        networkContainer.innerHTML = `
            <div class="pi-network-empty">
                图谱可视化引擎正在加载中，请刷新重试……
            </div>
        `;
        return;
    }

    if (!echartsGraphInstance) {
        networkContainer.innerHTML = "";
        echartsGraphInstance = echartsLib.init(networkContainer);

        window.addEventListener("resize", () => {
            if (echartsGraphInstance) {
                echartsGraphInstance.resize();
            }
        });

        // 点击节点联动右侧证据资料面板展示详情
        echartsGraphInstance.on("click", (params) => {
            if (params.dataType === "node") {
                peopleNetworkState.selectedNodeId = params.data.id;
                showRelationshipDetails(
                    peopleIntelligenceDemo.center,
                    params.data
                );
            }
        });
    }

    const allNodes = peopleIntelligenceDemo.nodes || [];
    const visibleNodes = filter === "all"
        ? allNodes
        : allNodes.filter((node) => node.category === filter);

    const centerNode = peopleIntelligenceDemo.center;

    // 构建力导向图谱节点与连线数据
    const graphNodes = [];
    const graphLinks = [];

    // 1. 核心中心节点
    graphNodes.push({
        id: String(centerNode.id),
        name: centerNode.name,
        category: 0,
        symbolSize: 72,
        itemStyle: {
            color: "#1769e0",
            borderColor: "#ffffff",
            borderWidth: 3,
            shadowColor: "rgba(23, 105, 224, 0.35)",
            shadowBlur: 16
        },
        label: {
            show: true,
            position: "bottom",
            fontWeight: 800,
            fontSize: 13,
            color: "#172033"
        },
        ...centerNode
    });

    // 2. 周边关联节点
    visibleNodes.forEach((node) => {
        const isOrg = node.type === "company" || node.category === "business";
        const isFamily = node.category === "family";
        const isOwnership = node.category === "ownership";

        // 按类型赋色：紫色(家族)、绿色(企业/机构)、橙色(股权/行业)
        const nodeColor = isFamily ? "#7357d9" : (isOrg ? "#159455" : "#e98416");

        graphNodes.push({
            id: String(node.id),
            name: node.name,
            symbolSize: isOrg ? 54 : 48,
            itemStyle: {
                color: nodeColor,
                borderColor: "#ffffff",
                borderWidth: 2,
                shadowColor: "rgba(0,0,0,0.08)",
                shadowBlur: 8
            },
            label: {
                show: true,
                position: "bottom",
                fontSize: 11,
                color: "#475467"
            },
            ...node
        });

        // 建立与中心节点的边
        const relationLabel = node.relationLabel || node.subtitle || "";
        graphLinks.push({
            source: String(centerNode.id),
            target: String(node.id),
            value: relationLabel,
            lineStyle: {
                color: "#cbd5e1",
                width: 1.8,
                curveness: 0.08
            },
            label: {
                show: true,
                formatter: relationLabel,
                fontSize: 10,
                color: "#64748b"
            }
        });

        // 如果存在二级节点并且已被展开
        if (
            peopleNetworkState.expandedNodeIds.has(node.id) &&
            Array.isArray(node.children)
        ) {
            node.children.forEach((child) => {
                graphNodes.push({
                    id: String(child.id),
                    name: child.name,
                    symbolSize: 40,
                    itemStyle: {
                        color: "#94a3b8",
                        borderColor: "#ffffff",
                        borderWidth: 2
                    },
                    label: {
                        show: true,
                        position: "bottom",
                        fontSize: 10,
                        color: "#64748b"
                    },
                    ...child
                });

                graphLinks.push({
                    source: String(node.id),
                    target: String(child.id),
                    value: child.relationLabel || "",
                    lineStyle: {
                        color: "#94a3b8",
                        width: 1.2,
                        type: "dashed"
                    },
                    label: {
                        show: true,
                        formatter: child.relationLabel || "",
                        fontSize: 9,
                        color: "#94a3b8"
                    }
                });
            });
        }
    });

    const option = {
        tooltip: {
            trigger: "item",
            backgroundColor: "rgba(17, 34, 64, 0.95)",
            borderColor: "#233554",
            textStyle: { color: "#ffffff", fontSize: 12 },
            formatter: (params) => {
                if (params.dataType === "node") {
                    return `<strong>${escapeHtml(params.data.name)}</strong><br/><span style="color:#94a3b8;">${escapeHtml(params.data.subtitle || "")}</span>`;
                }
                return params.data.value ? `关系：${escapeHtml(params.data.value)}` : "";
            }
        },
        series: [
            {
                type: "graph",
                layout: "force",
                roam: true,
                draggable: true,
                data: graphNodes,
                links: graphLinks,
                force: {
                    repulsion: 420,
                    edgeLength: [120, 200],
                    gravity: 0.12
                },
                emphasis: {
                    focus: "adjacency",
                    lineStyle: {
                        width: 3.5,
                        color: "#1769e0"
                    }
                }
            }
        ]
    };

    echartsGraphInstance.setOption(option);
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
        ${targetNode.rawRelationship ? "公开核验证据" : "原型关系数据"}
      </strong>

      <p>
        ${targetNode.rawRelationship
            ? "已接入后端关系数据库，包含可核验证据支撑。"
            : "当前为演示节点。数据库接入后将显示真实来源、文件引用与审计记录。"}
      </p>
    </div>

    ${targetNode.name
            ? `
      <button
        type="button"
        class="pi-expand-connections-btn"
        id="openEntityIntelligenceButton"
        style="
          width:100%;
          margin-top:14px;
          background:#1769df;
          border-color:#1769df;
          color:#ffffff;
        "
      >
        查看该实体完整情报 →
      </button>
    `
            : ""
        }

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

    const openEntityButton =
        document.getElementById(
            "openEntityIntelligenceButton"
        );

    if (openEntityButton) {
        openEntityButton.addEventListener(
            "click",
            () => {
                const entityName =
                    String(
                        targetNode.name || ""
                    ).trim();

                if (!entityName) {
                    return;
                }

                const targetUrl =
                    new URL(
                        "/people-intelligence.html",
                        window.location.origin
                    );

                targetUrl.searchParams.set(
                    "q",
                    entityName
                );

                window.open(
                    targetUrl.pathname +
                    targetUrl.search,
                    "_blank",
                    "noopener,noreferrer"
                );
            }
        );
    }

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


/* =========================================================
   Public read-only API integration
   ========================================================= */

async function loadPublicPeopleIntelligence(query) {
    setPageLoadingState(query);

    try {
        const response = await fetch(
            `${PEOPLE_INTELLIGENCE_PUBLIC_API}?q=${encodeURIComponent(query)}`,
            {
                method: "GET",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        const data = await response.json().catch(() => null);

        if (data && data.found === false) {
            renderPublicNotFound(
                query,
                data.message
            );
            return;
        }

        if (!response.ok) {
            throw new Error(
                data?.message ||
                `公开情报接口请求失败（HTTP ${response.status}）`
            );
        }

        if (
            !data?.success ||
            !data?.entity
        ) {
            throw new Error(
                data?.message ||
                "公开情报接口返回的数据格式不完整"
            );
        }

        applyPublicIntelligenceData(data);
    } catch (error) {
        console.error("[People Intelligence] Public API error:", error);
        renderPublicLoadError(query, error);
    }
}

function applyPublicIntelligenceData(data) {
    const entity = data.entity || {};

    currentPublicEntityType =
        normalizeEntityType(
            data.entity_type ||
            entity.entity_type ||
            "person"
        );

    currentPublicEntity = {
        ...entity,
        entity_type:
            currentPublicEntityType
    };

    const relationships = Array.isArray(data.relationships)
        ? data.relationships
        : [];

    applyEntityPageMode(
        currentPublicEntity
    );
    updateProfileHero(entity);
    updateMetrics(entity, relationships);
    updateOverview(entity);
    updateEvidencePanel(entity, relationships);
    updateDataStatus(entity);
    updateNetworkFromPublicData(entity, relationships);

    document.title = `${getEntityDisplayName(entity)} | 人谱情报 | Daily News`;
}

function applyEntityPageMode(entity) {
    currentPublicEntityType = normalizeEntityType(entity.entity_type || "person");
    const isOrganization = currentPublicEntityType === "organization";

    document.body.dataset.entityType = currentPublicEntityType;

    updateTopNavigationMode(isOrganization);
    updateMetricLabels(isOrganization);
    updateOverviewLabels(isOrganization);
    updateTabLabels(isOrganization);
}

function updateTopNavigationMode(isOrganization) {
    const navigationItems = Array.from(
        document.querySelectorAll("header a, header button, nav a, nav button")
    );

    navigationItems.forEach((item) => {
        const label = String(item.textContent || "").trim();

        if (label === "人物" || label === "企业") {
            item.classList.remove("active");
        }

        if (
            (!isOrganization && label === "人物") ||
            (isOrganization && label === "企业")
        ) {
            item.classList.add("active");
        }
    });
}

function updateMetricLabels(isOrganization) {
    const labels = document.querySelectorAll(".pi-metric-card span");

    const metricLabels = isOrganization
        ? ["关联人物", "关联机构", "股权关系", "关联行业", "重要事件", "风险事件"]
        : ["家族成员", "关联企业", "股权关系", "关联行业", "重要事件", "风险事件"];

    labels.forEach((item, index) => {
        if (index < metricLabels.length) {
            item.textContent = metricLabels[index];
        }
    });
}

function updateOverviewLabels(isOrganization) {
    const terms = document.querySelectorAll(".pi-info-list dt");

    const labels = isOrganization
        ? ["机构名称", "国家/地区", "行业", "成立日期", "上市状态", "股票代码"]
        : ["姓名", "国籍", "主要身份", "核心关系网络"];

    terms.forEach((item, index) => {
        if (index < labels.length) {
            item.textContent = labels[index];
        }
    });
}

function updateTabLabels(isOrganization) {
    const tabs = document.querySelectorAll(".pi-tab");

    const labels = isOrganization
        ? ["概览", "关系网络", "关联人物", "商业", "股权控制", "资产", "事件", "风险"]
        : ["概览", "关系网络", "家族", "商业", "股权控制", "资产", "事件", "风险"];

    tabs.forEach((item, index) => {
        if (index < labels.length) {
            item.textContent = labels[index];
        }
    });
}

function translateListedStatus(value) {
    const status = String(value || "").trim().toLowerCase();

    if (!status) return "暂无公开数据";
    if (["listed", "public", "上市"].includes(status)) return "已上市";
    if (["private", "unlisted", "未上市"].includes(status)) return "未上市";

    return value;
}

function updateProfileHero(entity) {
    const displayName = getEntityDisplayName(entity);
    const englishName = entity.name_en || "";
    const title = englishName && !displayName.includes(englishName)
        ? `${displayName}（${englishName}）`
        : displayName;

    setText(".pi-profile-title-row h1", title);
    setText(".pi-profile-role", entity.primary_role || entity.industry || "公开情报实体");

    const badge = document.querySelector(".pi-verified-badge");
    if (badge) {
        badge.textContent = "已核验";
    }

    const meta = document.querySelector(".pi-profile-meta");
    if (meta) {
        const items = [];
        const region = entity.country_region || entity.nationality;

        if (region) items.push(region);
        if (entity.birth_date) items.push(`出生：${formatDate(entity.birth_date)}`);
        if (entity.founded_date) items.push(`成立：${formatDate(entity.founded_date)}`);

        const updated = entity.data_updated_at || entity.updated_at;
        if (updated) items.push(`更新：${formatDate(updated)}`);

        meta.innerHTML = items
            .map((item) => `<span>${escapeHtml(item)}</span>`)
            .join("");
    }

    const tags = normalizeTags(entity.tags);
    const tagsBox = document.querySelector(".pi-profile-tags");
    if (tagsBox) {
        tagsBox.innerHTML = tags.length
            ? tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")
            : "";
    }

    const avatar = document.querySelector(".pi-avatar-placeholder");
    if (avatar) {
        avatar.textContent = makeInitials(displayName, englishName);
    }

    const summary = document.querySelector(".pi-profile-summary p");
    if (summary) {
        summary.textContent = entity.biography || entity.description ||
            "该页面展示已经审核并公开发布的人谱关系情报数据。";
    }
}

function updateMetrics(entity, relationships) {
    const cards = document.querySelectorAll(".pi-metric-card strong");
    if (!cards.length) return;

    const entityType = normalizeEntityType(entity.entity_type || "person");

    const familyCount = relationships.filter((item) =>
        isFamilyRelationship(item)
    ).length;

    const organizationCount = new Set(
        relationships
            .filter((item) =>
                normalizeEntityType(item.source_entity_type) === "organization" ||
                normalizeEntityType(item.target_entity_type) === "organization"
            )
            .map((item) =>
                normalizeEntityType(item.source_entity_type) === "organization"
                    ? item.source_entity_id
                    : item.target_entity_id
            )
            .filter(Boolean)
    ).size;

    const personCount = new Set(
        relationships
            .filter((item) =>
                normalizeEntityType(item.source_entity_type) === "person" ||
                normalizeEntityType(item.target_entity_type) === "person"
            )
            .map((item) =>
                normalizeEntityType(item.source_entity_type) === "person"
                    ? item.source_entity_id
                    : item.target_entity_id
            )
            .filter(Boolean)
    ).size;

    const ownershipCount = relationships.filter((item) =>
        Number(item.ownership_percentage || 0) > 0 ||
        /owner|shareholder|control|founder|持股|股东|控制|创始/i.test(
            `${item.relationship_type || ""} ${item.relationship_name_zh || ""}`
        )
    ).length;

    const industryCount = new Set(
        relationships
            .filter((item) =>
                normalizeEntityType(item.source_entity_type) === "industry" ||
                normalizeEntityType(item.target_entity_type) === "industry"
            )
            .map((item) =>
                normalizeEntityType(item.source_entity_type) === "industry"
                    ? item.source_entity_id
                    : item.target_entity_id
            )
            .filter(Boolean)
    ).size;

    const values = entityType === "organization"
        ? [
            personCount,
            Math.max(0, organizationCount - 1),
            ownershipCount,
            industryCount,
            0,
            0
        ]
        : [
            familyCount,
            organizationCount,
            ownershipCount,
            industryCount,
            0,
            0
        ];

    cards.forEach((card, index) => {
        card.textContent = String(values[index] ?? 0);
    });
}

function updateOverview(entity) {
    const displayName = getEntityDisplayName(entity);
    const entityType = normalizeEntityType(entity.entity_type || "person");

    setText('[data-panel="overview"] .pi-section-heading h2', `关于${displayName}`);

    const overview = document.querySelector(".pi-overview-text");
    if (overview) {
        overview.textContent = entity.biography || entity.description ||
            (entityType === "organization"
                ? `${displayName}的公开机构、人物与关系情报资料。`
                : `${displayName}的公开人物、机构与关系情报资料。`);
    }

    const values = document.querySelectorAll(".pi-info-list dd");

    const keyValues = entityType === "organization"
        ? [
            joinNames(entity.name_zh, entity.name_en),
            entity.country_region || entity.nationality || "暂无公开数据",
            entity.industry || entity.primary_role || "暂无公开数据",
            entity.founded_date ? formatDate(entity.founded_date) : "暂无公开数据",
            translateListedStatus(entity.listed_status),
            entity.ticker_symbol || "暂无公开数据"
        ]
        : [
            joinNames(entity.name_zh, entity.name_en),
            entity.nationality || entity.country_region || "暂无公开数据",
            entity.primary_role || entity.industry || "暂无公开数据",
            entity.core_organization || entity.name_zh || entity.name_en || "暂无公开数据"
        ];

    values.forEach((item, index) => {
        if (index < keyValues.length) {
            item.textContent = keyValues[index];
        }
    });

    const relationshipSummaryCenter =
        document.getElementById(
            "relationshipSummaryCenter"
        );

    if (relationshipSummaryCenter) {
        relationshipSummaryCenter.textContent =
            displayName;
    }
}

function updateEvidencePanel(entity, relationships) {
    const evidencePanel = document.querySelector(
        ".pi-side-panel .pi-section-card"
    );

    if (!evidencePanel) return;

    const evidence = collectEvidence(relationships);
    const confidence = translateConfidence(
        entity.confidence_level || "medium"
    );

    const evidenceHtml = evidence.length
        ? evidence.slice(0, 8).map((item) => `
            <div class="pi-evidence-item">
                <div class="pi-evidence-type">
                    ${escapeHtml(item.source_tier || item.evidence_type || "来源")}
                </div>
                <strong>${escapeHtml(item.source_title || item.source_name || "证据资料")}</strong>
                <p>${escapeHtml(item.evidence_summary || item.publisher || "已收录公开证据资料")}</p>
            </div>
        `).join("")
        : `
            <div class="pi-evidence-item">
                <div class="pi-evidence-type">证据</div>
                <strong>暂无公开证据明细</strong>
                <p>当前实体已经公开发布，但尚未返回可展示的证据明细。</p>
            </div>
        `;

    evidencePanel.innerHTML = `
        <div class="pi-section-heading">
            <div>
                <span class="pi-eyebrow">数据质量</span>
                <h2>证据资料</h2>
            </div>
        </div>
        <div class="pi-confidence-box">
            <span>资料可信度</span>
            <strong>${escapeHtml(confidence)}</strong>
        </div>
        ${evidenceHtml}
    `;
}

function updateDataStatus(entity) {
    const statusValues =
        document.querySelectorAll(
            "#peopleDataStatus dd"
        );

    const values = [
        "已公开发布",
        entity.verification_status === "verified"
            ? "已核验"
            : "已发布",
        formatDate(
            entity.data_updated_at ||
            entity.updated_at ||
            ""
        ) || "暂无"
    ];

    statusValues.forEach((item, index) => {
        item.textContent =
            values[index] || "暂无";
    });
}

function updateNetworkFromPublicData(entity, relationships) {
    const centerName = getEntityDisplayName(entity);

    peopleIntelligenceDemo.center = {
        id: String(entity.id || entity.slug || "public-entity"),
        type: normalizeEntityType(entity.entity_type || "person"),
        category: normalizeEntityType(entity.entity_type || "person") === "organization"
            ? "business"
            : "person",
        name: centerName,
        englishName: entity.name_en || "",
        subtitle: entity.primary_role || entity.industry || "核心实体"
    };

    peopleIntelligenceDemo.nodes = relationships
        .map((relationship, index) =>
            relationshipToNetworkNode(relationship, entity, index)
        )
        .filter(Boolean);

    peopleNetworkState.activeFilter = "all";
    peopleNetworkState.selectedNodeId = null;
    peopleNetworkState.expandedNodeIds.clear();

    renderPeopleNetwork("all");
}

function relationshipToNetworkNode(relationship, entity, index) {
    const centerId = String(entity.id ?? "");
    const sourceId = String(relationship.source_entity_id ?? "");
    const targetId = String(relationship.target_entity_id ?? "");
    const centerType = normalizeEntityType(entity.entity_type || "person");

    const entityIsSource =
        sourceId === centerId &&
        normalizeEntityType(relationship.source_entity_type) === centerType;

    const relatedType = entityIsSource
        ? relationship.target_entity_type
        : relationship.source_entity_type;

    const relatedId = entityIsSource
        ? relationship.target_entity_id
        : relationship.source_entity_id;

    const relatedName = entityIsSource
        ? relationship.target_entity_name
        : relationship.source_entity_name;

    if (!relatedName) return null;

    const normalizedType = normalizeEntityType(relatedType);
    const category = relationshipCategory(relationship, normalizedType);
    const ownership = Number(relationship.ownership_percentage || 0);
    const role = relationship.role_title || "";
    const relationName = relationship.relationship_name_zh ||
        relationship.relationship_type || "关联关系";

    const subtitleParts = [relationName];
    if (role) subtitleParts.push(role);
    if (ownership > 0) subtitleParts.push(`持股 ${ownership}%`);

    return {
        id: `${normalizedType}-${relatedId || index}`,
        type: normalizedType === "organization" ? "company" : normalizedType,
        category,
        name: relatedName,
        englishName: "",
        subtitle: subtitleParts.join(" · "),
        relation: relationship.relationship_type || "RELATED_TO",
        relationLabel: relationName,
        status: relationship.relationship_status === "current" ? "Current" : "Historical",
        confidence: normalizeConfidenceForNetwork(relationship.confidence_level),
        children: [],
        rawRelationship: relationship
    };
}

function setPageLoadingState(query) {
    setText(".pi-profile-title-row h1", `正在搜索：${query}`);
    setText(".pi-profile-role", "正在读取已核验并公开发布的情报数据……");
}

function renderPublicNotFound(query, message) {
    currentPublicEntityType = "person";
    currentPublicEntity = null;
    document.body.dataset.entityType = "person";

    updateMetricLabels(false);
    updateOverviewLabels(false);
    updateTabLabels(false);

    setText(".pi-profile-title-row h1", `未找到：${query}`);
    setText(".pi-profile-role", message || "暂未找到已核验并已发布的公开情报数据");

    const badge = document.querySelector(".pi-verified-badge");
    if (badge) badge.textContent = "暂无公开数据";

    const avatar = document.querySelector(".pi-avatar-placeholder");
    if (avatar) avatar.textContent = "--";

    const meta = document.querySelector(".pi-profile-meta");
    if (meta) meta.innerHTML = "";

    const tags = document.querySelector(".pi-profile-tags");
    if (tags) tags.innerHTML = "";

    const summary = document.querySelector(".pi-profile-summary p");
    if (summary) summary.textContent = "当前公开数据库中暂无该实体的已核验公开情报。";

    const metricCards = document.querySelectorAll(".pi-metric-card strong");
    metricCards.forEach((card) => { card.textContent = "0"; });

    setText('[data-panel="overview"] .pi-section-heading h2', `关于${query}`);

    const overview = document.querySelector(".pi-overview-text");
    if (overview) {
        overview.textContent = "当前公开数据库中没有匹配结果。未审核、未发布、已回收或已归档的数据不会通过公开 API 返回。";
    }

    const infoValues = document.querySelectorAll(".pi-info-list dd");
    infoValues.forEach((item) => { item.textContent = "暂无公开数据"; });

    const relationshipSummaryCenter = document.getElementById("relationshipSummaryCenter");
    if (relationshipSummaryCenter) relationshipSummaryCenter.textContent = query;

    const evidencePanel = document.querySelector(".pi-side-panel .pi-section-card");
    if (evidencePanel) {
        evidencePanel.innerHTML = `
            <div class="pi-section-heading">
                <div>
                    <span class="pi-eyebrow">数据质量</span>
                    <h2>证据资料</h2>
                </div>
            </div>
            <div class="pi-confidence-box">
                <span>资料可信度</span>
                <strong>暂无</strong>
            </div>
            <div class="pi-evidence-item">
                <div class="pi-evidence-type">暂无数据</div>
                <strong>暂无公开证据资料</strong>
                <p>当前数据库尚未找到该实体的已核验并公开发布的证据资料。</p>
            </div>
        `;
    }

    const statusValues = document.querySelectorAll("#peopleDataStatus dd");
    statusValues.forEach((item) => { item.textContent = "暂无公开数据"; });

    peopleIntelligenceDemo.nodes = [];
    peopleIntelligenceDemo.center = {
        id: "not-found",
        type: "person",
        category: "person",
        name: query,
        englishName: "",
        subtitle: "暂无公开数据"
    };

    peopleNetworkState.selectedNodeId = null;
    peopleNetworkState.expandedNodeIds.clear();

    renderPeopleNetwork("all");

    document.title = `${query} | 暂无公开人谱情报 | Daily News`;
}

function renderPublicLoadError(query, error) {
    setText(".pi-profile-title-row h1", `读取失败：${query}`);
    setText(
        ".pi-profile-role",
        error?.message || "公开情报接口暂时无法访问，请稍后重试"
    );
}

function collectEvidence(relationships) {
    const evidenceMap = new Map();

    relationships.forEach((relationship) => {
        const evidence = Array.isArray(relationship.evidence)
            ? relationship.evidence
            : [];

        evidence.forEach((item, index) => {
            const key = item.id ||
                `${item.source_title || "evidence"}-${item.source_url || index}`;
            evidenceMap.set(String(key), item);
        });
    });

    return Array.from(evidenceMap.values());
}

function isFamilyRelationship(relationship) {
    return /parent|child|spouse|sibling|family|父|母|子|女|配偶|兄|弟|姐|妹|家族/i.test(
        `${relationship.relationship_type || ""} ${relationship.relationship_name_zh || ""}`
    );
}

function relationshipCategory(relationship, relatedType) {
    if (isFamilyRelationship(relationship)) return "family";

    if (
        Number(relationship.ownership_percentage || 0) > 0 ||
        /owner|shareholder|control|持股|股东|控制/i.test(
            `${relationship.relationship_type || ""} ${relationship.relationship_name_zh || ""}`
        )
    ) {
        return "ownership";
    }

    if (relatedType === "organization") return "business";
    return "business";
}

function normalizeEntityType(value) {
    const type = String(value || "").toLowerCase();
    if (type === "organization" || type === "company") return "organization";
    if (type === "industry") return "industry";
    return "person";
}

function normalizeConfidenceForNetwork(value) {
    const confidence = String(value || "medium").toLowerCase();
    if (confidence === "high") return "High";
    if (confidence === "low") return "Low";
    return "Medium";
}

function translateConfidence(value) {
    const confidence = String(value || "medium").toLowerCase();
    if (confidence === "high") return "高";
    if (confidence === "low") return "低";
    return "中";
}

function normalizeTags(value) {
    if (Array.isArray(value)) {
        return value.map(String).map((item) => item.trim()).filter(Boolean);
    }

    if (!value) return [];

    return String(value)
        .split(/[,，|、]/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function getEntityDisplayName(entity) {
    return entity.name_zh || entity.name_en || entity.slug || "未命名实体";
}

function joinNames(nameZh, nameEn) {
    if (nameZh && nameEn) return `${nameZh}（${nameEn}）`;
    return nameZh || nameEn || "暂无公开数据";
}

function makeInitials(nameZh, nameEn) {
    if (nameEn) {
        const words = String(nameEn).trim().split(/\s+/).filter(Boolean);
        if (words.length >= 2) {
            return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
        }
        return words[0]?.slice(0, 2).toUpperCase() || "PI";
    }

    return String(nameZh || "PI").slice(0, 2);
}

function formatDate(value) {
    if (!value) return "";

    const raw = String(value);
    const date = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));

    if (Number.isNaN(date.getTime())) {
        return raw.slice(0, 10);
    }

    return new Intl.DateTimeFormat("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(date);
}

function setText(selector, value) {
    const element = document.querySelector(selector);
    if (element) element.textContent = value || "";
}

/* =========================================================
   People Intelligence V1.4
   Public correction interaction
   ========================================================= */

function initPeopleCorrection() {
    const openButton = document.getElementById("peopleCorrectionOpenButton");
    const modal = document.getElementById("peopleCorrectionModal");
    const form = document.getElementById("peopleCorrectionForm");
    const fieldOptions = document.getElementById("peopleCorrectionFieldOptions");
    const closeButtons = document.querySelectorAll("[data-correction-close]");
    const closeButton = document.getElementById("peopleCorrectionCloseButton");

    if (!openButton || !modal || !form || !fieldOptions) {
        return;
    }

    openButton.addEventListener("click", () => {
        openPeopleCorrectionModal();
    });

    fieldOptions.addEventListener("change", (event) => {
        const checkbox = event.target.closest('input[name="correction_fields"]');
        if (!checkbox) return;
        updatePeopleCorrectionItems();
    });

    closeButtons.forEach((button) => {
        button.addEventListener("click", () => closePeopleCorrectionModal());
    });

    if (closeButton) {
        closeButton.addEventListener("click", () => closePeopleCorrectionModal());
    }

    modal.addEventListener("click", (event) => {
        if (event.target === modal) closePeopleCorrectionModal();
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !modal.hidden) closePeopleCorrectionModal();
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const selectedFields = getSelectedPeopleCorrectionFields();
        const message = document.getElementById("peopleCorrectionMessage");
        const submitButton = document.getElementById("peopleCorrectionSubmitButton");

        if (!selectedFields.length) {
            if (message) message.textContent = "请至少选择一个需要纠错的字段。";
            return;
        }

        if (!currentPublicEntity || !currentPublicEntity.id) {
            if (message) message.textContent = "当前资料不存在，暂时无法提交纠错。";
            return;
        }

        const items = selectedFields.map((field) => {
            const fieldName = field.name;
            const input = document.querySelector(`[data-correction-suggested="${fieldName}"]`);
            return {
                field_name: fieldName,
                proposed_value: input ? input.value.trim() : ""
            };
        });

        const hasEmptySuggestedValue = items.some((item) => !item.proposed_value);
        if (hasEmptySuggestedValue) {
            if (message) message.textContent = "请填写所有已选择字段的建议修改内容。";
            return;
        }

        const reasonInput = document.getElementById("peopleCorrectionReason");
        const evidenceUrlInput = document.getElementById("peopleCorrectionEvidenceUrl");
        const correctionReason = reasonInput ? reasonInput.value.trim() : "";
        const evidenceUrl = evidenceUrlInput ? evidenceUrlInput.value.trim() : "";

        if (!correctionReason) {
            if (message) message.textContent = "请填写纠错原因。";
            if (reasonInput) reasonInput.focus();
            return;
        }

        const payload = {
            entity_type: currentPublicEntityType || "person",
            entity_id: currentPublicEntity.id,
            items,
            correction_reason: correctionReason,
            evidence_url: evidenceUrl
        };

        if (submitButton) {
            submitButton.disabled = true;
            submitButton.textContent = "提交中...";
        }

        if (message) {
            message.textContent = `正在提交 ${items.length} 项纠错...`;
        }

        try {
            const response = await fetch(
                `${PEOPLE_INTELLIGENCE_PUBLIC_API.replace(/\/search$/, "")}/corrections`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                }
            );

            const result = await response.json();
            if (!response.ok || !result.success) {
                throw new Error(result.message || "提交纠错申请失败");
            }

            if (message) {
                message.textContent = `提交成功！已提交 ${result.count || items.length} 项纠错，等待管理员审核。`;
            }

            form.reset();
            updatePeopleCorrectionItems();

            window.setTimeout(() => {
                closePeopleCorrectionModal();
            }, 1800);
        } catch (error) {
            console.error("Submit public correction error:", error);
            if (message) {
                message.textContent = error.message || "提交纠错申请失败，请稍后重试。";
            }
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = "提交纠错";
            }
        }
    });
}

function openPeopleCorrectionModal() {
    const modal = document.getElementById("peopleCorrectionModal");
    const entityName = document.getElementById("peopleCorrectionEntityName");
    const form = document.getElementById("peopleCorrectionForm");
    const message = document.getElementById("peopleCorrectionMessage");

    if (!modal) return;
    if (!currentPublicEntity || !currentPublicEntity.id) {
        window.alert("当前没有可提交纠错的人物资料。");
        return;
    }

    if (form) form.reset();
    renderPeopleCorrectionFieldOptions();
    if (message) message.textContent = "";

    if (entityName) {
        const nameZh = currentPublicEntity.name_zh || "";
        const nameEn = currentPublicEntity.name_en || "";
        let displayName = nameZh || nameEn || `ID ${currentPublicEntity.id}`;
        if (nameZh && nameEn) displayName = `${nameZh} / ${nameEn}`;
        entityName.textContent = `当前资料：${displayName}`;
    }

    updatePeopleCorrectionItems();
    modal.hidden = false;
    document.body.style.overflow = "hidden";

    const firstCheckbox = document.querySelector(
        '#peopleCorrectionFieldOptions input[name="correction_fields"]'
    );
    if (firstCheckbox) firstCheckbox.focus();
}

function closePeopleCorrectionModal() {
    const modal = document.getElementById("peopleCorrectionModal");
    if (!modal) return;
    modal.hidden = true;
    document.body.style.overflow = "";
}

function getPeopleCorrectionFieldDefinitions() {
    if (currentPublicEntityType === "organization") {
        return [
            { name: "name_zh", label: "中文名称" },
            { name: "name_en", label: "英文名称" },
            { name: "aliases", label: "其他名称 / 别名" },
            { name: "organization_type", label: "机构类型" },
            { name: "country_region", label: "国家 / 地区" },
            { name: "headquarters", label: "总部" },
            { name: "founded_date", label: "成立日期" },
            { name: "industry", label: "所属行业" },
            { name: "description", label: "机构简介" },
            { name: "website_url", label: "官方网站" },
            { name: "listed_status", label: "上市状态" },
            { name: "ticker_symbol", label: "股票代码" },
            { name: "other", label: "其他" }
        ];
    }

    return [
        { name: "name_zh", label: "中文姓名" },
        { name: "name_en", label: "英文姓名" },
        { name: "aliases", label: "其他姓名 / 别名" },
        { name: "birth_date", label: "出生日期" },
        { name: "country_region", label: "国家 / 地区" },
        { name: "primary_role", label: "主要身份" },
        { name: "biography", label: "人物简介" },
        { name: "tags", label: "人物标签" },
        { name: "other", label: "其他" }
    ];
}

function renderPeopleCorrectionFieldOptions() {
    const container = document.getElementById("peopleCorrectionFieldOptions");
    if (!container) return;

    const fields = getPeopleCorrectionFieldDefinitions();
    container.innerHTML = fields.map((field) => `
        <label class="pi-correction-field-option">
            <input type="checkbox" name="correction_fields" value="${escapeHtml(field.name)}">
            <span>${escapeHtml(field.label)}</span>
        </label>
    `).join("");
}

function getSelectedPeopleCorrectionFields() {
    return Array.from(
        document.querySelectorAll(
            '#peopleCorrectionFieldOptions input[name="correction_fields"]:checked'
        )
    ).map((checkbox) => ({
        name: checkbox.value,
        label: checkbox.closest(".pi-correction-field-option")?.querySelector("span")?.textContent?.trim() || checkbox.value
    }));
}

function updatePeopleCorrectionItems() {
    const container = document.getElementById("peopleCorrectionItems");
    const submitButton = document.getElementById("peopleCorrectionSubmitButton");
    if (!container) return;

    const previousValues = {};
    container.querySelectorAll("[data-correction-suggested]").forEach((input) => {
        previousValues[input.dataset.correctionSuggested] = input.value;
    });

    const selectedFields = getSelectedPeopleCorrectionFields();
    if (!selectedFields.length) {
        container.innerHTML = `
            <div class="pi-correction-items-empty" id="peopleCorrectionItemsEmpty">
                请先选择需要纠错的字段，系统将在这里显示对应的当前资料和修改输入框。
            </div>
        `;
        if (submitButton) submitButton.textContent = "提交纠错";
        return;
    }

    container.innerHTML = selectedFields.map((field, index) => {
        const originalValue = getPeopleCorrectionFieldValue(currentPublicEntity, field.name);
        const suggestedValue = previousValues[field.name] || "";

        return `
            <section class="pi-correction-item" data-correction-item="${escapeHtml(field.name)}">
                <div class="pi-correction-item-heading">
                    <div>
                        <span class="pi-correction-item-number">${index + 1}</span>
                        <strong>${escapeHtml(field.label)}</strong>
                    </div>
                    <span class="pi-correction-item-status">待填写</span>
                </div>
                <div class="pi-correction-item-grid">
                    <div class="pi-correction-form-group">
                        <label>当前资料</label>
                        <textarea rows="3" readonly>${escapeHtml(originalValue)}</textarea>
                    </div>
                    <div class="pi-correction-form-group">
                        <label for="peopleCorrectionSuggested_${escapeHtml(field.name)}">建议修改为 *</label>
                        <textarea id="peopleCorrectionSuggested_${escapeHtml(field.name)}" rows="3" required data-correction-suggested="${escapeHtml(field.name)}" placeholder="请输入您认为正确的资料">${escapeHtml(suggestedValue)}</textarea>
                    </div>
                </div>
            </section>
        `;
    }).join("");

    if (submitButton) {
        submitButton.textContent = selectedFields.length === 1
            ? "提交 1 项纠错"
            : `提交 ${selectedFields.length} 项纠错`;
    }
}

function getPeopleCorrectionFieldValue(entity, fieldName) {
    if (!entity) return "";

    switch (fieldName) {
        case "name_zh": return entity.name_zh || "";
        case "name_en": return entity.name_en || "";
        case "aliases": return formatPeopleCorrectionValue(entity.aliases);
        case "birth_date": return entity.birth_date || "";
        case "country_region": return entity.country_region || entity.nationality || "";
        case "primary_role": return entity.primary_role || entity.industry || "";
        case "biography": return entity.biography || entity.description || "";
        case "tags": return formatPeopleCorrectionValue(entity.tags);
        case "organization_type": return entity.organization_type || "";
        case "headquarters": return entity.headquarters || "";
        case "founded_date": return entity.founded_date || "";
        case "industry": return entity.industry || entity.industry_primary || "";
        case "description": return entity.description || "";
        case "website_url": return entity.website_url || "";
        case "listed_status": return entity.listed_status || "";
        case "ticker_symbol": return entity.ticker_symbol || "";
        case "other": return "";
        default: return formatPeopleCorrectionValue(entity[fieldName]);
    }
}

function formatPeopleCorrectionValue(value) {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.join(" / ");
    if (typeof value === "object") {
        try { return JSON.stringify(value); } catch (e) { return ""; }
    }
    const text = String(value).trim();
    if (!text) return "";
    if ((text.startsWith("[") && text.endsWith("]")) || (text.startsWith("{") && text.endsWith("}"))) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) return parsed.join(" / ");
        } catch (e) { }
    }
    return text;
}