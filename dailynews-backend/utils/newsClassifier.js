const CATEGORY_FALLBACK = "general";

const CATEGORY_PRIORITY = [
    "precious-metals",
    "crypto",
    "semiconductor",
    "military",
    "energy",
    "futures",
    "think-tank",
    "influencer",
    "politics-figure",
    "economy",
    "politics"
];

const CATEGORY_RULES = Object.freeze({
    politics: [
        ["government", 3], ["government policy", 4], ["politics", 3], ["political", 2],
        ["parliament", 3], ["congress", 3], ["senate", 3], ["election", 4],
        ["cabinet", 3], ["diplomacy", 3], ["foreign policy", 4], ["sanctions", 3],
        ["regulation", 2], ["legislation", 3], ["lawmakers", 3], ["white house", 3],
        ["政治", 4], ["政府", 3], ["政策", 2], ["议会", 3], ["国会", 3],
        ["参议院", 3], ["选举", 4], ["内阁", 3], ["外交", 3], ["制裁", 3], ["立法", 3]
    ],
    economy: [
        ["economy", 4], ["economic", 3], ["gdp", 4], ["inflation", 4], ["deflation", 4],
        ["recession", 4], ["jobs report", 4], ["employment", 3], ["unemployment", 4],
        ["consumer price index", 5], ["cpi", 4], ["producer price index", 5], ["ppi", 4],
        ["interest rate", 4], ["central bank", 4], ["federal reserve", 5],
        ["monetary policy", 5], ["trade deficit", 4], ["trade surplus", 4],
        ["tariff", 7], ["tariffs", 7], ["trade measure", 4], ["trade measures", 4], ["trade policy", 5], ["trade war", 6], ["exports", 3],
        ["经济", 4], ["国内生产总值", 5], ["通胀", 4], ["通缩", 4], ["衰退", 4],
        ["就业", 3], ["失业", 4], ["消费者价格指数", 5], ["生产者价格指数", 5],
        ["利率", 4], ["央行", 4], ["美联储", 5], ["货币政策", 5],
        ["贸易逆差", 4], ["贸易顺差", 4], ["关税", 3], ["出口", 3], ["进口", 3]
    ],
    military: [
        ["war", 5], ["warfare", 5], ["military", 4], ["army", 3], ["navy", 3],
        ["air force", 3], ["missile", 5], ["airstrike", 5], ["air strike", 5],
        ["drone strike", 5], ["bombing", 5], ["invasion", 5], ["troops", 4],
        ["battle", 4], ["ceasefire", 5], ["weapons", 4], ["defense ministry", 4],
        ["nuclear weapon", 5], ["military exercise", 4], ["attack", 5],
        ["attacks", 5],
        ["attacked", 5],
        ["strike", 5],
        ["strikes", 5],
        ["armed attack", 6],
        ["rebel", 4],
        ["rebels", 4],
        ["houthi", 6],
        ["houthis", 6],
        ["ballistic missile", 6],
        ["ballistic missiles", 6],
        ["military conflict", 6],
        ["armed conflict", 6],
        ["袭击", 6],
        ["攻击", 5],
        ["武装袭击", 6],
        ["武装冲突", 6],
        ["胡塞", 6],
        ["弹道导弹", 6],
        ["战争", 5], ["军事", 4], ["军队", 3], ["海军", 3], ["空军", 3],
        ["导弹", 5], ["空袭", 5], ["轰炸", 5], ["入侵", 5], ["部队", 4],
        ["战斗", 4], ["停火", 5], ["武器", 4], ["国防部", 4], ["核武器", 5], ["军演", 4]
    ],
    crypto: [
        ["bitcoin", 6], ["btc", 5], ["ethereum", 6], ["ether", 4], ["eth", 5],
        ["cryptocurrency", 6], ["crypto", 5], ["blockchain", 5], ["stablecoin", 5],
        ["usdt", 5], ["tether", 5], ["usdc", 5], ["solana", 5], ["xrp", 5],
        ["coinbase", 5], ["binance", 5], ["digital asset", 4],
        ["比特币", 6], ["以太坊", 6], ["加密货币", 6], ["数字货币", 6],
        ["区块链", 5], ["稳定币", 5], ["泰达币", 5], ["数字资产", 4]
    ],
    "politics-figure": [
        ["president", 3], ["prime minister", 4], ["donald trump", 6], ["trump", 5],
        ["xi jinping", 6], ["lawrence wong", 6], ["keir starmer", 6], ["vladimir putin", 6],
        ["putin", 5], ["volodymyr zelensky", 6], ["zelensky", 5], ["emmanuel macron", 6],
        ["macron", 5], ["narendra modi", 6], ["modi", 5], ["kim jong un", 6],
        ["benjamin netanyahu", 6], ["netanyahu", 5], ["ali khamenei", 6],
        ["总统", 3], ["总理", 4], ["首相", 4], ["国家主席", 5],
        ["特朗普", 6], ["习近平", 6], ["黄循财", 6], ["普京", 6],
        ["泽连斯基", 6], ["马克龙", 6], ["莫迪", 6], ["金正恩", 6],
        ["内塔尼亚胡", 6], ["哈梅内伊", 6]
    ],
    semiconductor: [
        ["semiconductor", 6], ["chip", 4], ["chips", 4], ["wafer", 5], ["foundry", 5],
        ["integrated circuit", 5], ["ai chip", 6], ["gpu", 5], ["nvidia", 6],
        ["amd", 5], ["intel", 5], ["tsmc", 6], ["taiwan semiconductor", 6],
        ["samsung electronics", 5], ["sk hynix", 5], ["micron", 5], ["qualcomm", 5],
        ["broadcom", 5], ["arm holdings", 5], ["asml", 6],
        ["半导体", 6], ["芯片", 5], ["晶圆", 5], ["集成电路", 5],
        ["人工智能芯片", 6], ["英伟达", 6], ["台积电", 6], ["三星电子", 5],
        ["海力士", 5], ["美光", 5], ["高通", 5], ["博通", 5], ["阿斯麦", 6]
    ],
    "think-tank": [
        ["think tank", 6], ["policy institute", 5], ["research institute", 4],
        ["strategic studies", 5], ["security forum", 5], ["economic forum", 5],
        ["world economic forum", 6], ["davos", 5], ["brookings", 6],
        ["rand corporation", 6], ["council on foreign relations", 6], ["csis", 6],
        ["chatham house", 6], ["carnegie endowment", 6], ["atlantic council", 6],
        ["shangri-la dialogue", 6], ["智库", 6], ["研究院", 4], ["政策研究", 5],
        ["战略研究", 5], ["安全论坛", 5], ["经济论坛", 5], ["世界经济论坛", 6],
        ["达沃斯", 5], ["布鲁金斯", 6], ["兰德公司", 6], ["大西洋理事会", 6], ["香格里拉对话", 6]
    ],
    influencer: [
        ["influencer", 6], ["blogger", 5], ["youtuber", 5], ["podcaster", 5],
        ["content creator", 5], ["social media personality", 5], ["online commentator", 4],
        ["independent commentator", 4], ["大v", 6], ["博主", 5], ["网红", 5],
        ["自媒体", 5], ["主播", 4], ["播客", 4], ["意见领袖", 5], ["内容创作者", 5]
    ],
    energy: [
        ["energy", 4], ["oil", 4], ["crude oil", 6], ["brent", 5], ["wti", 5],
        ["natural gas", 5], ["lng", 5], ["opec", 6], ["opec+", 6], ["petroleum", 5],
        ["refinery", 4], ["solar energy", 4], ["wind energy", 4], ["nuclear power", 4],
        ["uranium", 5], ["oil prices", 5],
        ["能源", 4], ["石油", 5], ["原油", 6], ["布伦特", 5], ["天然气", 5],
        ["液化天然气", 5], ["欧佩克", 6], ["炼油", 4], ["太阳能", 4],
        ["风能", 4], ["核电", 4], ["铀", 5], ["油价", 5]
    ],
    futures: [
        ["futures", 6], ["futures market", 6], ["futures contract", 6],
        ["commodity futures", 6], ["index futures", 6], ["stock futures", 6],
        ["s&p 500 futures", 6], ["nasdaq futures", 6], ["dow futures", 6],
        ["cme", 5], ["comex futures", 5],
        ["期货", 6], ["期货市场", 6], ["期货合约", 6], ["商品期货", 6],
        ["股指期货", 6], ["美股期货", 6], ["芝商所", 5]
    ],
    "precious-metals": [
        ["gold", 5], ["gold price", 6], ["silver", 5], ["silver price", 6],
        ["precious metal", 5], ["bullion", 5], ["spot gold", 6], ["spot silver", 6],
        ["xau", 5], ["xau/usd", 6], ["xag", 5], ["xag/usd", 6],
        ["comex gold", 6], ["comex silver", 6],
        ["黄金", 6], ["金价", 6], ["白银", 6], ["银价", 6], ["贵金属", 6],
        ["现货黄金", 6], ["现货白银", 6], ["黄金期货", 6], ["白银期货", 6]
    ]
});

const COUNTRY_RULES = Object.freeze({
    us: {
        name: "United States", region: "North America", terms: [["united states", 6], ["u.s.", 6], ["usa", 6], ["american", 4], ["washington", 3], ["white house", 5], ["donald trump", 6], ["trump", 5], ["美国", 6], ["美方", 4], ["华盛顿", 3], ["白宫", 5], ["特朗普", 6], ["new york", 6],
        ["new york city", 6], ["nyc", 5], ["nypd", 6], ["liberty island", 6], ["statue of liberty", 6],
        ["los angeles", 6], ["california", 5], ["san francisco", 5], ["chicago", 5],
        ["texas", 5], ["houston", 5], ["dallas", 5], ["florida", 5],
        ["miami", 5], ["pentagon", 6], ["u.s. coast guard", 6], ["us coast guard", 6],
        ["department of defense", 5], ["new york harbor", 6],
        ["纽约", 6], ["纽约市", 6], ["自由岛", 6], ["自由女神像", 6], ["洛杉矶", 6],
        ["加利福尼亚", 5], ["加州", 5], ["加州", 5], ["旧金山", 5], ["芝加哥", 5],
        ["得克萨斯", 5], ["德州", 5], ["佛罗里达", 5], ["五角大楼", 6], ["美国海岸警卫队", 6]]
    },
    cn: { name: "China", region: "Asia", terms: [["china", 6], ["chinese", 4], ["beijing", 4], ["xi jinping", 6], ["中国", 6], ["中方", 4], ["北京", 4], ["习近平", 6]] },
    sg: { name: "Singapore", region: "Asia", terms: [["singapore", 6], ["singaporean", 5], ["lawrence wong", 6], ["monetary authority of singapore", 6], ["新加坡", 6], ["黄循财", 6], ["新加坡金融管理局", 6]] },
    gb: { name: "United Kingdom", region: "Europe", terms: [["united kingdom", 6], ["britain", 6], ["british", 4], ["london", 3], ["downing street", 5], ["keir starmer", 6], ["英国", 6], ["伦敦", 3], ["唐宁街", 5], ["斯塔默", 6]] },
    my: { name: "Malaysia", region: "Asia", terms: [["malaysia", 6], ["malaysian", 5], ["kuala lumpur", 4], ["anwar ibrahim", 6], ["马来西亚", 6], ["吉隆坡", 4], ["安瓦尔", 6]] },
    jp: { name: "Japan", region: "Asia", terms: [["japan", 6], ["japanese", 5], ["tokyo", 4], ["bank of japan", 5], ["shigeru ishiba", 6], ["日本", 6], ["东京", 4], ["日本央行", 5], ["石破茂", 6]] },
    kr: { name: "South Korea", region: "Asia", terms: [["south korea", 6], ["south korean", 5], ["seoul", 4], ["韩国", 6], ["首尔", 4]] },
    kp: { name: "North Korea", region: "Asia", terms: [["north korea", 6], ["north korean", 5], ["pyongyang", 4], ["kim jong un", 6], ["朝鲜", 6], ["平壤", 4], ["金正恩", 6]] },
    tw: { name: "Taiwan", region: "Asia", terms: [["taiwan", 6], ["taiwanese", 5], ["taipei", 4], ["台湾", 6], ["台北", 4]] },
    hk: { name: "Hong Kong", region: "Asia", terms: [["hong kong", 6], ["hongkonger", 5], ["香港", 6]] },
    in: { name: "India", region: "Asia", terms: [["india", 6], ["indian", 5], ["new delhi", 4], ["narendra modi", 6], ["印度", 6], ["新德里", 4], ["莫迪", 6]] },
    id: { name: "Indonesia", region: "Asia", terms: [["indonesia", 6], ["indonesian", 5], ["jakarta", 4], ["印度尼西亚", 6], ["印尼", 6], ["雅加达", 4]] },
    ph: { name: "Philippines", region: "Asia", terms: [["philippines", 6], ["philippine", 5], ["manila", 4], ["菲律宾", 6], ["马尼拉", 4]] },
    th: { name: "Thailand", region: "Asia", terms: [["thailand", 6], ["thai", 4], ["bangkok", 4], ["泰国", 6], ["曼谷", 4]] },
    vn: { name: "Vietnam", region: "Asia", terms: [["vietnam", 6], ["vietnamese", 5], ["hanoi", 4], ["越南", 6], ["河内", 4]] },
    au: { name: "Australia", region: "Oceania", terms: [["australia", 6], ["australian", 5], ["canberra", 4], ["澳大利亚", 6], ["澳洲", 5], ["堪培拉", 4]] },
    ca: { name: "Canada", region: "North America", terms: [["canada", 6], ["canadian", 5], ["ottawa", 4], ["加拿大", 6], ["渥太华", 4]] },
    ru: { name: "Russia", region: "Europe", terms: [["russia", 6], ["russian", 5], ["moscow", 4], ["kremlin", 5], ["vladimir putin", 6], ["putin", 5], ["俄罗斯", 6], ["俄方", 4], ["莫斯科", 4], ["克里姆林宫", 5], ["普京", 6]] },
    ua: { name: "Ukraine", region: "Europe", terms: [["ukraine", 6], ["ukrainian", 5], ["kyiv", 4], ["kiev", 4], ["volodymyr zelensky", 6], ["zelensky", 5], ["乌克兰", 6], ["基辅", 4], ["泽连斯基", 6]] },
    de: { name: "Germany", region: "Europe", terms: [["germany", 6], ["german", 5], ["berlin", 4], ["德国", 6], ["柏林", 4]] },
    fr: { name: "France", region: "Europe", terms: [["france", 6], ["french", 5], ["paris", 4], ["emmanuel macron", 6], ["macron", 5], ["法国", 6], ["巴黎", 4], ["马克龙", 6]] },
    it: { name: "Italy", region: "Europe", terms: [["italy", 6], ["italian", 5], ["rome", 4], ["意大利", 6], ["罗马", 4]] },
    il: { name: "Israel", region: "Middle East", terms: [["israel", 6], ["israeli", 5], ["jerusalem", 4], ["benjamin netanyahu", 6], ["netanyahu", 5], ["以色列", 6], ["耶路撒冷", 4], ["内塔尼亚胡", 6]] },
    ir: { name: "Iran", region: "Middle East", terms: [["iran", 6], ["iranian", 5], ["tehran", 4], ["ali khamenei", 6], ["伊朗", 6], ["德黑兰", 4], ["哈梅内伊", 6]] },
    sa: { name: "Saudi Arabia", region: "Middle East", terms: [["saudi arabia", 6], ["saudi", 5], ["riyadh", 4], ["沙特阿拉伯", 6], ["沙特", 5], ["利雅得", 4]] },
    ae: { name: "United Arab Emirates", region: "Middle East", terms: [["united arab emirates", 6], ["uae", 6], ["abu dhabi", 4], ["dubai", 4], ["阿联酋", 6], ["阿布扎比", 4], ["迪拜", 4]] },
    ye: {
        name: "Yemen",
        region: "Middle East",
        terms: [
            ["yemen", 6],
            ["yemeni", 5],
            ["sanaa", 5],
            ["sana'a", 5],
            ["aden", 5],
            ["houthi", 6],
            ["houthis", 6],
            ["也门", 6],
            ["萨那", 5],
            ["亚丁", 5],
            ["胡塞", 6],
            ["胡塞武装", 6]
        ]
    },

    om: {
        name: "Oman",
        region: "Middle East",
        terms: [
            ["oman", 6],
            ["omani", 5],
            ["muscat", 5],
            ["阿曼", 6],
            ["马斯喀特", 5]
        ]
    },

    qa: {
        name: "Qatar",
        region: "Middle East",
        terms: [
            ["qatar", 6],
            ["qatari", 5],
            ["doha", 5],
            ["卡塔尔", 6],
            ["多哈", 5]
        ]
    },

    tr: {
        name: "Turkey",
        region: "Middle East",
        terms: [
            ["turkey", 6],
            ["turkish", 5],
            ["ankara", 5],
            ["istanbul", 5],
            ["recep tayyip erdogan", 6],
            ["erdogan", 5],
            ["土耳其", 6],
            ["安卡拉", 5],
            ["伊斯坦布尔", 5],
            ["埃尔多安", 6]
        ]
    },

    pk: {
        name: "Pakistan",
        region: "Asia",
        terms: [
            ["pakistan", 6],
            ["pakistani", 5],
            ["islamabad", 5],
            ["karachi", 5],
            ["巴基斯坦", 6],
            ["伊斯兰堡", 5],
            ["卡拉奇", 5]
        ]
    }
});

function normalizeText(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeForMatching(value) {
    return normalizeText(value).toLowerCase();
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text, term) {
    const normalizedText = normalizeForMatching(text);
    const normalizedTerm = normalizeForMatching(term);

    if (!normalizedText || !normalizedTerm) {
        return false;
    }

    if (/[\u3400-\u9fff]/.test(normalizedTerm)) {
        return normalizedText.includes(normalizedTerm);
    }

    const escapedTerm = escapeRegExp(normalizedTerm);
    const pattern = new RegExp(`(^|[^a-z0-9])${escapedTerm}([^a-z0-9]|$)`, "i");
    return pattern.test(normalizedText);
}

function scoreRules(text, rules, fieldWeight) {
    let score = 0;

    for (const [term, termWeight] of rules) {
        if (containsTerm(text, term)) {
            score += Number(termWeight || 0) * fieldWeight;
        }
    }

    return score;
}

function buildArticleFields(article = {}) {
    return {
        title: normalizeText(article.title),
        summary: normalizeText(article.summary || article.description),
        content: normalizeText(article.content)
    };
}

function scoreCategory(fields, rules) {
    return (
        scoreRules(fields.title, rules, 3) +
        scoreRules(fields.summary, rules, 2) +
        scoreRules(fields.content, rules, 1)
    );
}

function scoreCountry(fields, rules) {
    return (
        scoreRules(fields.title, rules, 4) +
        scoreRules(fields.summary, rules, 2) +
        scoreRules(fields.content, rules, 1)
    );
}

function confidenceFromScores(topScore, secondScore, minimumScore) {
    if (!Number.isFinite(topScore) || topScore < minimumScore) {
        return 0;
    }

    const separation = Math.max(topScore - secondScore, 0);
    const baseConfidence = topScore / (topScore + 12);
    const separationBoost = separation / (topScore + 12);

    return Number(
        Math.min(
            0.99,
            Math.max(0, baseConfidence + separationBoost * 0.35)
        ).toFixed(2)
    );
}

function classifyCategory(article = {}) {
    const fields = buildArticleFields(article);

    const scored = Object.entries(CATEGORY_RULES)
        .map(([categoryCode, rules]) => ({
            categoryCode,
            score: scoreCategory(fields, rules)
        }))
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            return (
                CATEGORY_PRIORITY.indexOf(a.categoryCode) -
                CATEGORY_PRIORITY.indexOf(b.categoryCode)
            );
        });

    const top = scored[0] || { categoryCode: CATEGORY_FALLBACK, score: 0 };
    const second = scored[1] || { categoryCode: CATEGORY_FALLBACK, score: 0 };
    const minimumScore = 8;

    if (top.score < minimumScore) {
        return {
            categoryCode: CATEGORY_FALLBACK,
            categoryConfidence: 0,
            categoryScore: top.score,
            categoryCandidates: scored.slice(0, 3)
        };
    }

    return {
        categoryCode: top.categoryCode,
        categoryConfidence: confidenceFromScores(top.score, second.score, minimumScore),
        categoryScore: top.score,
        categoryCandidates: scored.slice(0, 3)
    };
}

function classifyCountry(article = {}) {
    const fields = buildArticleFields(article);

    const scored = Object.entries(COUNTRY_RULES)
        .map(([countryCode, metadata]) => ({
            countryCode,
            countryName: metadata.name,
            region: metadata.region,
            score: scoreCountry(fields, metadata.terms)
        }))
        .sort((a, b) => b.score - a.score);

    const top = scored[0] || {
        countryCode: "",
        countryName: "",
        region: "",
        score: 0
    };

    const second = scored[1] || {
        countryCode: "",
        countryName: "",
        region: "",
        score: 0
    };

    const minimumScore = 12;

    if (top.score < minimumScore) {
        return {
            countryCode: "",
            countryName: "",
            region: "",
            countryConfidence: 0,
            countryScore: top.score,
            countryCandidates: scored.slice(0, 3)
        };
    }

    return {
        countryCode: top.countryCode,
        countryName: top.countryName,
        region: top.region,
        countryConfidence: confidenceFromScores(top.score, second.score, minimumScore),
        countryScore: top.score,
        countryCandidates: scored.slice(0, 3)
    };
}

function classifyNews(article = {}) {
    return {
        ...classifyCategory(article),
        ...classifyCountry(article)
    };
}

module.exports = {
    CATEGORY_FALLBACK,
    CATEGORY_PRIORITY,
    CATEGORY_RULES,
    COUNTRY_RULES,
    classifyCategory,
    classifyCountry,
    classifyNews
};