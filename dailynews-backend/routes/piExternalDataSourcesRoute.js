"use strict";
const express = require("express");
const {
    gleifSearch, gleifByLei, secFindCompany, secSubmissions, politicalDisclosureSources, fecCandidateSearch
} = require("../services/piExternalDataSourcesService");
const { getCongressDisclosureDiscovery } = require("../services/piCongressTradesService");
const { searchHouseFilings } = require("../services/piHouseFilingIndexService");
const { parseHousePtrPdf } = require("../services/piHousePtrParserService");
const { associateHousePtrEvidence } = require("../services/piHousePtrEvidenceService");
const { crosscheckWikidata } = require("../services/piWikidataIdentityCrosscheckService");
const { crosscheckTenureDistrict } = require("../services/piHouseTenureDistrictCrosscheckService");
const router = express.Router();
function fail(res, err) {
    const status = Number.isInteger(err.status) && err.status >= 400 && err.status < 600 ? err.status : 502;
    console.error("[PI EXTERNAL DATA]", err.message);
    return res.status(status).json({ success: false, message: err.message || "外部数据暂不可用" });
}
router.get("/gleif/search", async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (name.length < 2 || name.length > 120) return res.status(400).json({ success: false, message: "企业名称须为 2 至 120 字符" });
    try { return res.json({ success: true, ...(await gleifSearch(name)) }); } catch (err) { return fail(res, err); }
});
router.get("/gleif/lei/:lei", async (req, res) => {
    const lei = String(req.params.lei || "").toUpperCase();
    if (!/^[A-Z0-9]{20}$/.test(lei)) return res.status(400).json({ success: false, message: "LEI 格式无效" });
    try { return res.json({ success: true, ...(await gleifByLei(lei)) }); } catch (err) { return fail(res, err); }
});
router.get("/sec/search", async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 1 || q.length > 100) return res.status(400).json({ success: false, message: "企业名或股票代码无效" });
    try { return res.json({ success: true, ...(await secFindCompany(q)) }); } catch (err) { return fail(res, err); }
});
router.get("/sec/company/:cik", async (req, res) => {
    const cik = String(req.params.cik || "");
    if (!/^\d{1,10}$/.test(cik)) return res.status(400).json({ success: false, message: "CIK 格式无效" });
    try { return res.json({ success: true, result: await secSubmissions(cik) }); } catch (err) { return fail(res, err); }
});
router.get("/politics/us/disclosures", (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (name.length < 2 || name.length > 100) return res.status(400).json({ success: false, message: "姓名须为 2 至 100 字符" });
    return res.json({ success: true, ...politicalDisclosureSources(name) });
});

router.get(["/politics/us/fec/candidates", "/fec/candidates"], async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (name.length < 2 || name.length > 100) return res.status(400).json({ success: false, message: "姓名须为 2 至 100 字符" });
    try { return res.json({ success: true, ...(await fecCandidateSearch(name)) }); } catch (err) { return fail(res, err); }
});

// V11.3-A: disclosure discovery only; no transaction rows are invented.
router.get("/politics/us/trades", (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (name.length < 2 || name.length > 100) return res.status(400).json({ success: false, message: "姓名须为 2 至 100 字符" });
    res.set("Cache-Control", "no-store");
    return res.json({ success: true, ...getCongressDisclosureDiscovery(name) });
});

// V11.3-B1: Live House Clerk annual filing index (PTR documents, not extracted trades).
router.get("/politics/us/house/filings", async (req, res) => {
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    if (name.length < 2 || name.length > 100) return res.status(400).json({ success: false, message: "姓名须为 2 至 100 字符" });
    const yearText = req.query.year === undefined ? "" : String(req.query.year);
    const year = yearText ? Number(yearText) : undefined;
    const maxYear = new Date().getUTCFullYear();
    if (yearText && (!/^\d{4}$/.test(yearText) || year < 2008 || year > maxYear)) return res.status(400).json({ success: false, message: "申报年份无效" });
    res.set("Cache-Control", "no-store");
    try { return res.json({ success: true, ...(await searchHouseFilings({ name, year })) }); }
    catch (err) { return fail(res, err); }
});

// V11.3-B2: parse a specific official House PTR PDF into UNVERIFIED review candidates.
router.get("/politics/us/house/ptr/:year/:docId", async (req, res) => {
    const yearText = String(req.params.year || "");
    const docId = String(req.params.docId || "");
    if (!/^\d{4}$/.test(yearText) || !/^\d{4,12}$/.test(docId)) return res.status(400).json({ success: false, message: "年份或文件编号格式无效" });
    res.set("Cache-Control", "no-store");
    try { return res.json({ success: true, ...(await parseHousePtrPdf({ year: Number(yearText), docId })) }); }
    catch (err) { return fail(res, err); }
});


// V11.3-B3: Link a House PTR document to its official filing index entry.
// Name/QID are research inputs only: this endpoint NEVER verifies person identity.
router.get("/politics/us/house/evidence/:year/:docId", async (req, res) => {
    const yearText = String(req.params.year || "");
    const docId = String(req.params.docId || "");
    const name = typeof req.query.name === "string" ? req.query.name.trim() : "";
    const qid = typeof req.query.qid === "string" ? req.query.qid.trim() : "";
    const district = typeof req.query.state_district === "string" ? req.query.state_district.trim() : "";
    const maxYear = new Date().getUTCFullYear();
    const year = Number(yearText);
    if (!/^\d{4}$/.test(yearText) || year < 2008 || year > maxYear || !/^\d{4,12}$/.test(docId)) {
        return res.status(400).json({ success: false, message: "年份或文件编号格式无效" });
    }
    if (name.length < 2 || name.length > 100 || !/[A-Za-z]/.test(name)) {
        return res.status(400).json({ success: false, message: "请输入 2 至 100 字符的英文申报人姓名" });
    }
    if (qid && !/^Q[1-9]\d*$/.test(qid)) {
        return res.status(400).json({ success: false, message: "Wikidata QID 格式无效" });
    }
    if (district.length > 30) {
        return res.status(400).json({ success: false, message: "选区字段过长" });
    }
    res.set("Cache-Control", "no-store");
    try {
        const index = await searchHouseFilings({ name, year, limit: 100 });
        // Do not associate a PDF with a person unless the exact document is
        // present in the official index returned for the supplied name.
        const filing = index.results.find(row => String(row.doc_id) === docId && Number(row.filing_year) === year);
        if (!filing) {
            return res.status(404).json({
                success: false,
                message: "该姓名的官方 PTR 索引中未找到指定文件编号；已停止证据关联，避免错配人物",
                doc_id: docId, filing_year: year
            });
        }
        const pdf = await parseHousePtrPdf({ year, docId });
        const association = associateHousePtrEvidence({
            profile: { name, qid, state_district: district },
            filing,
            pdf
        });
        let wikidata_crosscheck = {
            status: "not_requested", verified_person_match: false,
            note: "请提供真实人物 QID 才会执行 Wikidata 在线交叉核验"
        };
        if (qid) {
            try { wikidata_crosscheck = await crosscheckWikidata({ qid, name, filing }); }
            catch (wdError) {
                wikidata_crosscheck = {
                    status: "wikidata_unavailable_or_invalid", qid,
                    verified_person_match: false, message: wdError.message,
                    note: "Wikidata 查询失败不影响官方 PTR 证据关联；不可据此确认或否定人物身份"
                };
            }
        }
        let tenure_district_crosscheck = { status: "not_requested", note: "提供 Wikidata QID 后执行任期和选区一致性检查" };
        if (qid && wikidata_crosscheck.status === "cross_source_consistent_unverified") {
            try { tenure_district_crosscheck = await crosscheckTenureDistrict({ wikidata_crosscheck, filing }); }
            catch (crossError) {
                tenure_district_crosscheck = {
                    status: "crosscheck_unavailable", message: crossError.message,
                    note: "任期/选区查询不可用，不影响已有官方申报文件证据；不得视为身份确认"
                };
            }
        }
        return res.json({
            ...association,
            wikidata_crosscheck,
            tenure_district_crosscheck,
            source_index_url: filing.source_index_url,
            index_name_match_only: true,
            document_text_available: pdf.document_text_available,
            parse_status: pdf.parse_status,
            official_pdf_filer_name_verified: false,
            note: association.note + " 官方索引与 PDF 文件编号已关联，但姓名搜索不是身份核验；QID 如提供则在线交叉核验，但不自动确认官方身份。"
        });
    } catch (err) { return fail(res, err); }
});

module.exports = router;
