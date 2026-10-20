"use strict";
// 100 named buckets = schema, NOT 100 guaranteed facts. Missing data stays missing.
(function () {
    const GROUPS = {
        "人物身份": [
            "姓名",
            "别名",
            "英文名",
            "人物描述",
            "出生日期",
            "逝世日期",
            "出生地点",
            "国籍",
            "居住地",
            "性别"
        ],
        "家族关系": [
            "父亲",
            "母亲",
            "配偶",
            "伴侣",
            "子女",
            "兄弟姐妹",
            "祖父母",
            "孙辈",
            "婚姻记录",
            "其他亲属"
        ],
        "教育经历": [
            "小学",
            "中学",
            "大学",
            "研究生院",
            "博士研究",
            "学位",
            "专业",
            "导师",
            "校友",
            "教育时间"
        ],
        "职业任职": [
            "雇主",
            "职位",
            "首席执行官",
            "董事",
            "董事长",
            "创办人",
            "顾问",
            "政府公职",
            "任职起止",
            "其他任职"
        ],
        "企业关联": [
            "关联公司",
            "拥有的实体",
            "创办企业",
            "控股企业",
            "子公司",
            "母公司",
            "合作企业",
            "关联品牌",
            "上市实体",
            "其他机构"
        ],
        "股权控制": [
            "持股比例",
            "投票权",
            "受益所有人",
            "实际控制人",
            "股权起始日期",
            "股权结束日期",
            "股权变更",
            "控制链",
            "股权证据",
            "其他权益"
        ],
        "资本金融": [
            "个人财富估值",
            "企业估值",
            "企业市值",
            "融资事件",
            "投资事件",
            "并购事件",
            "债务融资",
            "股权质押",
            "分红",
            "其他资本事件"
        ],
        "产业业务": [
            "半导体",
            "人工智能",
            "通信",
            "汽车",
            "航天",
            "金融",
            "能源",
            "生物科技",
            "零售消费",
            "其他行业"
        ],
        "公共信息": [
            "官方公告",
            "新闻事件",
            "政策关联",
            "诉讼案件",
            "监管处罚",
            "公共职务",
            "慈善公益",
            "专利发明",
            "公开讲话",
            "其他事件"
        ],
        "数据治理": [
            "来源链接",
            "来源平台",
            "资料更新时间",
            "查询时间",
            "数据声明属性",
            "核验状态",
            "数据冲突",
            "缺失信息",
            "历史版本",
            "其他未分类"
        ]
    };
    const P = { father: "父亲", mother: "母亲", spouse: "配偶", child: "子女", sibling: "兄弟姐妹", education: "大学", employer: "雇主", owned_entity: "拥有的实体" };
    function render(data) {
        const host = document.getElementById("piBucketsResults"); if (!host) return;
        host.replaceChildren();
        const nodes = new Map((data.nodes || []).map(n => [n.id, n]));
        const found = new Map();
        for (const r of (data.relations || [])) {
            const bucket = P[r.type] || "其他未分类";
            const node = nodes.get(r.to);
            const text = node?.name || r.to || "未命名";
            if (!found.has(bucket)) found.set(bucket, new Set());
            found.get(bucket).add(text);
        }
        const profile = data.profile || {};
        for (const [key, value] of [["姓名", profile.name], ["人物描述", profile.description], ["出生日期", profile.birth_date?.time || profile.birth_date], ["逝世日期", profile.death_date?.time || profile.death_date]]) {
            if (value) found.set(key, new Set([String(value)]));
        }
        const summary = document.createElement("p");
        summary.textContent = `100个固定栏目 · 本次有数据 ${found.size} 栏 · 其余未提供（不推断）`;
        host.appendChild(summary);
        for (const [group, labels] of Object.entries(GROUPS)) {
            const available = labels.filter(k => found.has(k));
            if (!available.length) continue;
            const details = document.createElement("details"); details.open = true;
            const title = document.createElement("summary"); title.textContent = `${group}（${available.length}/10）`;
            details.appendChild(title);
            for (const label of available) {
                const line = document.createElement("div"); line.style.cssText = "margin:8px 0;padding:8px;border-bottom:1px solid #e2e8f0;overflow-wrap:anywhere";
                const key = document.createElement("strong"); key.textContent = label + "：";
                line.appendChild(key);
                line.appendChild(document.createTextNode([...found.get(label)].join(" / ")));
                details.appendChild(line);
            }
            host.appendChild(details);
        }
        const footer = document.createElement("p"); footer.style.cssText = "font-size:12px;color:#64748b";
        footer.textContent = "来源：实时 Wikidata 声明；缺失字段不补造。雇主、拥有实体与实际持股比例不同。";
        host.appendChild(footer);
    }
    document.addEventListener("DOMContentLoaded", () => {
        const sidebar = document.querySelector(".g-info-body"); if (!sidebar) return;
        const section = document.createElement("section");
        section.style.cssText = "margin-top:20px;padding:14px;border:1px solid #dbe3ee;border-radius:8px;background:#fff";
        const title = document.createElement("h3"); title.textContent = "07 信息分类 · 100个标准栏目";
        title.style.cssText = "font-size:14px;margin:0 0 10px";
        const results = document.createElement("div"); results.id = "piBucketsResults";
        results.textContent = "实时查询人物后显示已匹配的栏目";
        section.append(title, results); sidebar.appendChild(section);
    });
    window.PIBuckets = { groups: GROUPS, render };
})();
