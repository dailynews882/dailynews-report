/**
 * 评论内容审核工具
 *
 * 返回状态：
 * published：正常发布
 * pending：等待管理员审核
 * rejected：直接拒绝
 *
 * 注意：
 * 这是第一版规则审核，后续可以继续接入 AI 审核服务。
 */

const REJECTED_WORDS = [
    // 中文辱骂和人身攻击
    "傻逼",
    "傻比",
    "狗东西",
    "王八蛋",
    "混蛋",
    "贱人",
    "去死",
    "不得好死",
    "垃圾人",
    "畜生",
    "人渣",

    // 英文辱骂
    "fuck you",
    "fucking idiot",
    "motherfucker",
    "son of a bitch",
    "piece of shit",
    "go die",
    "kill yourself"
];

const THREAT_PATTERNS = [
    /我要杀了你/i,
    /我会杀了你/i,
    /杀你全家/i,
    /弄死你/i,
    /打死你/i,
    /炸死/i,
    /放火烧/i,
    /kill\s+you/i,
    /i\s+will\s+kill/i,
    /bomb\s+(you|them|the)/i,
    /shoot\s+(you|him|her|them)/i
];

const PRIVACY_PATTERNS = [
    {
        type: "email",
        label: "电子邮箱",
        regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i
    },
    {
        type: "singapore_phone",
        label: "新加坡手机号码",
        regex: /(?:\+65[\s-]?)?[689]\d{3}[\s-]?\d{4}\b/
    },
    {
        type: "china_phone",
        label: "中国手机号码",
        regex: /(?:\+86[\s-]?)?1[3-9]\d{9}\b/
    },
    {
        type: "nric_fin",
        label: "新加坡身份证或准证号码",
        regex: /\b[STFGM]\d{7}[A-Z]\b/i
    },
    {
        type: "china_id",
        label: "中国身份证号码",
        regex: /\b\d{17}[\dX]\b/i
    },
    {
        type: "bank_card",
        label: "银行卡号码",
        regex: /\b(?:\d[\s-]?){15,19}\b/
    },
    {
        type: "passport",
        label: "护照信息",
        regex: /(?:护照号码|护照号|passport\s*(?:number|no)?)[：:\s]*[A-Z0-9]{5,15}/i
    },
    {
        type: "address",
        label: "详细住址",
        regex: /(?:家庭住址|详细地址|住在|地址是|home\s+address|residential\s+address)[：:\s]*.{6,80}/i
    }
];

const PENDING_PATTERNS = [
    {
        type: "government_secret",
        label: "疑似政府或机密信息",
        regex: /(?:国家机密|政府机密|军事机密|绝密文件|秘密行动|内部机密|classified\s+information|state\s+secret)/i
    },
    {
        type: "government_document",
        label: "疑似未公开政府文件",
        regex: /(?:未公开政府文件|政府内部文件|机密报告|内部情报|泄密文件|confidential\s+government\s+document)/i
    },
    {
        type: "public_official_attack",
        label: "疑似针对国家领导人或公共官员的人身攻击",
        regex: /(?:总统|总理|国家领导人|部长|president|prime\s+minister|government\s+minister).{0,25}(?:去死|畜生|人渣|傻逼|杀死|弄死|idiot|fuck|kill)/i
    },
    {
        type: "unverified_accusation",
        label: "疑似未经证实的严重指控",
        regex: /(?:贪污|受贿|叛国|间谍|恐怖分子|强奸犯|杀人犯|corrupt|traitor|spy|terrorist).{0,30}(?:总统|总理|部长|政府官员|president|prime\s+minister|minister|official)/i
    }
];

function cleanText(value) {
    return String(value || "")
        .replace(/\u200B/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function createCompactText(value) {
    return value
        .toLowerCase()
        .replace(/[\s\-_.，。！？、；：'"“”‘’()（）[\]{}]/g, "");
}

function containsRejectedWord(text) {
    const lowerText = text.toLowerCase();
    const compactText = createCompactText(text);

    return REJECTED_WORDS.find((word) => {
        const lowerWord = word.toLowerCase();
        const compactWord = createCompactText(word);

        return (
            lowerText.includes(lowerWord) ||
            compactText.includes(compactWord)
        );
    });
}

function findMatchingPattern(text, patterns) {
    for (const item of patterns) {
        if (item.regex.test(text)) {
            return item;
        }
    }

    return null;
}

function moderateComment(content) {
    const text = cleanText(content);

    if (!text) {
        return {
            allowed: false,
            status: "rejected",
            reason: "评论内容不能为空。",
            flags: ["empty"]
        };
    }

    if (text.length < 2) {
        return {
            allowed: false,
            status: "rejected",
            reason: "评论内容太短，请输入完整内容。",
            flags: ["too_short"]
        };
    }

    if (text.length > 1000) {
        return {
            allowed: false,
            status: "rejected",
            reason: "评论内容不能超过1000个字符。",
            flags: ["too_long"]
        };
    }

    const rejectedWord = containsRejectedWord(text);

    if (rejectedWord) {
        return {
            allowed: false,
            status: "rejected",
            reason: "评论包含辱骂、脏话或人身攻击内容，请修改后再提交。",
            flags: ["abusive_language"]
        };
    }

    const threatPattern = THREAT_PATTERNS.find((pattern) =>
        pattern.test(text)
    );

    if (threatPattern) {
        return {
            allowed: false,
            status: "rejected",
            reason: "评论包含威胁、暴力或伤害他人的内容，不能发布。",
            flags: ["threat_or_violence"]
        };
    }

    const privacyMatch = findMatchingPattern(text, PRIVACY_PATTERNS);

    if (privacyMatch) {
        return {
            allowed: false,
            status: "rejected",
            reason: `评论中疑似包含${privacyMatch.label}等个人隐私信息，请删除后重新提交。`,
            flags: ["personal_information", privacyMatch.type]
        };
    }

    const pendingMatch = findMatchingPattern(text, PENDING_PATTERNS);

    if (pendingMatch) {
        return {
            allowed: true,
            status: "pending",
            reason: "评论已提交，正在等待管理员审核。",
            flags: ["manual_review", pendingMatch.type]
        };
    }

    return {
        allowed: true,
        status: "published",
        reason: "评论发布成功。",
        flags: []
    };
}

module.exports = {
    moderateComment
};