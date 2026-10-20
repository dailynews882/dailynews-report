"use strict";
/** V11.3-B3: evidence association and conservative identity assessment. No DB writes. */
const OWNER_LABELS = Object.freeze({ SP: "spouse", DC: "dependent_child", JT: "joint", null: "not_specified" });
function normName(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/\b(hon|honorable|representative|rep|mr|mrs|ms|dr)\.?\b/g, " ")
        .replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(name) { return normName(name).split(" ").filter(Boolean); }
function sameName(a, b) {
    const x = tokens(a), y = tokens(b);
    if (x.length < 2 || y.length < 2) return false;
    // Require matching first and last name; do not infer identity from surname only.
    return x[0] === y[0] && x[x.length - 1] === y[y.length - 1] ||
        x[0] === y[y.length - 1] && x[x.length - 1] === y[0];
}
function parseDistrict(value) {
    const m = String(value || "").toUpperCase().match(/\b([A-Z]{2})\s*[- ]?\s*(\d{1,2}|AL)\b/);
    return m ? { state: m[1], district: m[2].replace(/^0+(?=\d)/, "") } : null;
}
function validDocUrl(url, year, docId) {
    return url === `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${docId}.pdf`;
}
function assessIdentity({ profile, filing, pdf }) {
    const profileName = profile && profile.name;
    const filingName = filing && filing.filer_name;
    const pdfName = pdf && pdf.filer_name;
    const checks = {
        profile_name_matches_filing: sameName(profileName, filingName),
        pdf_name_matches_filing: pdfName ? sameName(pdfName, filingName) : null,
        jurisdiction_matches: null,
        wikidata_qid_present: /^Q[1-9]\d*$/.test(String(profile && profile.qid || "")),
        official_identifier_confirmed: false
    };
    const pDistrict = parseDistrict(profile && profile.state_district);
    const fDistrict = parseDistrict(filing && filing.state_district);
    if (pDistrict && fDistrict) checks.jurisdiction_matches = pDistrict.state === fDistrict.state && pDistrict.district === fDistrict.district;
    const conflicts = checks.profile_name_matches_filing === false || checks.pdf_name_matches_filing === false || checks.jurisdiction_matches === false;
    return {
        status: conflicts ? "identity_conflict_manual_review" : "identity_unverified", checks,
        reason: conflicts ? "姓名或选区信息冲突，需要人工核验" : "姓名/选区相符不等于身份确认；尚缺跨数据源官方唯一身份标识"
    };
}
function associateHousePtrEvidence({ profile = {}, filing = {}, pdf = {} } = {}) {
    const year = Number(pdf.filing_year || filing.filing_year);
    const docId = String(pdf.doc_id || filing.doc_id || "");
    if (!Number.isInteger(year) || year < 2008 || year > 2100 || !/^\d{4,12}$/.test(docId)) throw new Error("无效的官方申报年份或文件编号");
    if (filing.doc_id && String(filing.doc_id) !== docId) throw new Error("目录与 PDF 文件编号不一致");
    if (filing.filing_year && Number(filing.filing_year) !== year) throw new Error("目录与 PDF 年份不一致");
    const url = `https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/${year}/${docId}.pdf`;
    if (pdf.source_document_url && !validDocUrl(pdf.source_document_url, year, docId)) throw new Error("PDF 来源地址与官方文件编号不一致");
    if (filing.source_document_url && !validDocUrl(filing.source_document_url, year, docId)) throw new Error("申报目录来源地址与 PDF 不一致");
    const identity = assessIdentity({ profile, filing, pdf });
    const rows = Array.isArray(pdf.results) ? pdf.results.slice(0, 100) : [];
    return {
        success: true, provider: "US_HOUSE_CLERK", mode: "evidence_association_review_only",
        profile_reference: { qid: /^Q[1-9]\d*$/.test(String(profile.qid || "")) ? profile.qid : null, name: profile.name || null },
        filing_reference: { doc_id: docId, filing_year: year, filer_name: filing.filer_name || null, filing_date: filing.filing_date_raw || null, state_district: filing.state_district || null },
        source_document_url: url, identity_assessment: identity,
        verified_person_match: false, verified_transactions: false,
        total_review_candidates: rows.length,
        results: rows.map((r, i) => {
            const ownerCode = String(r.owner || "").toUpperCase();
            const ownerRole = OWNER_LABELS[ownerCode] || "unknown_code";
            return {
                evidence_id: `house-ptr-${year}-${docId}-${i + 1}`,
                candidate_id: r.candidate_id || null,
                security_name: r.security_name || null, ticker: r.ticker || null,
                transaction_direction_candidate: r.transaction_direction_candidate || null,
                transaction_date_candidate: r.transaction_date_candidate || null,
                notification_date_candidate: r.notification_date_candidate || null,
                amount_range_candidate: r.amount_range_candidate || null,
                owner_code: ownerCode || null, owner_role: ownerRole,
                attributed_to_filer_personally: false,
                source_document_url: url, doc_id: docId, filing_year: year,
                evidence_excerpt: String(r.evidence_excerpt || "").slice(0, 1000),
                verification_status: "requires_manual_review",
                warnings: [...(ownerRole === "spouse" ? ["配偶持有资产，不可归为申报人本人交易"] : []),
                ...(ownerRole === "joint" ? ["共同持有资产，不可归为申报人单独交易"] : []),
                ...(ownerRole === "not_specified" ? ["未标记所有人不等于申报人本人交易"] : []),
                ...(ownerRole === "unknown_code" ? ["无法识别所有人代码"] : []),
                    "自动提取字段尚未对照官方 PDF 人工核验"]
            };
        }),
        note: "只关联官方证据及候选交易；不自动确认人物身份、资产所有权或交易准确性。无数据库写入。"
    };
}
module.exports = { associateHousePtrEvidence, assessIdentity, normName };
