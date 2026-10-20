"use strict";
/** V11.3-B2.4: Read official House PTR PDF; conservative candidate extraction, not verified trades. */
const https = require("https");
const BASE_HOST = "disclosures-clerk.house.gov";
const MAX_PDF_BYTES = 12 * 1024 * 1024;
const MAX_TEXT_CHARS = 350000;
const MAX_ROWS = 100;
function err(message, status = 502) { const e = new Error(message); e.status = status; return e; }
function fetchOfficialPdf(year, docId) {
    const url = `https://${BASE_HOST}/public_disc/ptr-pdfs/${year}/${docId}.pdf`;
    return new Promise((resolve, reject) => {
        const req = https.get(url, { timeout: 25000, headers: { "Accept": "application/pdf", "User-Agent": "DailyNews-PeopleIntelligence/11.3 (public disclosure research)" } }, res => {
            if (res.statusCode !== 200) { res.resume(); return reject(err(`众议院官方 PDF HTTP ${res.statusCode}`, res.statusCode === 404 ? 404 : 502)); }
            const contentType = String(res.headers["content-type"] || "").toLowerCase();
            if (contentType && !contentType.includes("pdf") && !contentType.includes("octet-stream")) { res.resume(); return reject(err("官方返回的不是 PDF 文件")); }
            const declaredSize = Number(res.headers["content-length"] || 0);
            if (declaredSize > MAX_PDF_BYTES) { res.resume(); return reject(err("PDF 文件超过安全大小限制", 413)); }
            let size = 0; const chunks = [];
            res.on("data", chunk => {
                size += chunk.length;
                if (size > MAX_PDF_BYTES) { res.destroy(err("PDF 文件超过安全大小限制", 413)); return; }
                chunks.push(chunk);
            });
            res.on("error", reject);
            res.on("end", () => {
                const pdf = Buffer.concat(chunks);
                if (pdf.subarray(0, 5).toString("ascii") !== "%PDF-") return reject(err("官方文件 PDF 签名不正确"));
                resolve({ pdf, url });
            });
        });
        req.on("timeout", () => req.destroy(err("官方 PDF 下载超时", 504)));
        req.on("error", reject);
    });
}
function getPdfParse() {
    try { return require("pdf-parse"); }
    catch (e) {
        if (e.code === "MODULE_NOT_FOUND") throw err("缺少 PDF 解析依赖。请在项目根目录执行 npm install pdf-parse@1.1.1", 503);
        throw e;
    }
}
function cleanPdfText(text) {
    return String(text || "")
        .replace(/\u0000/g, "")
        .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .replace(/\r\n?/g, "\n")
        .replace(/[\t\u00a0]+/g, " ")
        .replace(/ {2,}/g, " ");
}
function normalizedLines(text) {
    return cleanPdfText(text).split(/\n/).map(s => s.trim()).filter(Boolean);
}
const AMOUNT_RE = /\$\s*[\d,]+(?:\.\d{2})?\s*(?:-|–|—|to)\s*\$?\s*[\d,]+(?:\.\d{2})?/i;
const DATE_SOURCE = String.raw`(?:0?[1-9]|1[0-2])\s*\/\s*(?:0?[1-9]|[12]\d|3[01])\s*\/\s*(?:20\d{2}|\d{2})`;
const DATE_RE = new RegExp(DATE_SOURCE);
const CODE_DATE_RE = new RegExp(String.raw`([PSE])\s*(?:\(\s*(?:partial|full)\s*\))?\s*(${DATE_SOURCE})\s*(${DATE_SOURCE})`, 'gi');
const ASSET_TYPE_RE = /\[\s*([A-Z]{2,4})\s*\]/g;
const OWNER_CODES = new Set(['SP', 'JT', 'DC']);
function cleanAsset(raw) {
    return raw.replace(/(?:^|\s)(?:ID|Owner|Asset|Transaction|Type|Date|Notification|Amount|Cap\.?|Gains|Filing|Status|New)\b/gi, ' ')
        .replace(/\s+/g, ' ').trim();
}
function getAmountAfter(text) {
    const match = text.match(AMOUNT_RE);
    return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}
function dateValid(value) {
    const match = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!match) return false;
    const year = Number(match[3].length === 2 ? '20' + match[3] : match[3]);
    const d = new Date(Date.UTC(year, Number(match[1]) - 1, Number(match[2])));
    return d.getUTCFullYear() === year && d.getUTCMonth() === Number(match[1]) - 1 && d.getUTCDate() === Number(match[2]);
}
/**
 * PTR table rows are commonly flattened by pdf-parse. Anchor on the official
 * asset-type [ST]/[OT]/[MF] marker followed by a P/S/E code and TWO dates.
 * The amount must occur before the NEXT row's asset marker; otherwise omit it.
 * All extracted fields remain unverified until compared with the PDF visually.
 */
function extractReviewCandidates(text, docId, year, url) {
    const cleaned = cleanPdfText(text);
    // CRITICAL: Do not search for the generic word "Transactions".
    // House PTR certification contains "disclosed all transactions" AFTER the table;
    // selecting that match silently discards every trade row.
    // Work from the complete extracted text, and trim only a recognizable footer.
    let body = cleaned;
    const footer = body.search(/(?:For the complete list of asset type|Asset Class Details|Certification and Signature|I\s+CERTIFY\s+that)/i);
    if (footer >= 0) body = body.slice(0, footer);
    body = body.replace(/\s+/g, ' ').trim();

    // pdf-parse often removes ALL spaces between columns: [ST]P06/20/202506/20/2025$...
    // Anchor each row to its asset-type tag, then match the transaction code and TWO dates.
    // A greedy year (2025) must not swallow the month of the following date.
    const datePart = String.raw`(?:0?[1-9]|1[0-2])\s*\/\s*(?:0?[1-9]|[12]\d|3[01])\s*\/\s*(?:20\d{2}|\d{2})`;
    const rowStart = new RegExp(String.raw`\[\s*([A-Z]{2,4})\s*\]\s*(?:\b(?:SP|JT|DC)\b\s*)?([PSE])\s*(${datePart})\s*(${datePart})`, 'gi');
    const starts = [...body.matchAll(rowStart)];
    const candidates = [];
    for (let i = 0; i < starts.length && candidates.length < MAX_ROWS; i++) {
        const m = starts[i];
        const transactionDate = m[3].replace(/\s/g, '');
        const notificationDate = m[4].replace(/\s/g, '');
        if (!dateValid(transactionDate) || !dateValid(notificationDate)) continue;
        const next = i + 1 < starts.length ? starts[i + 1].index : body.length;
        const after = body.slice(m.index + m[0].length, next);
        // Do not borrow amounts from the next record. Require an amount immediately
        // after the paired dates (optionally with punctuation or whitespace).
        const amountMatch = after.match(/^\s*[:;,]?\s*(\$\s*[\d,]+(?:\.\d{2})?\s*(?:-|–|—|to)\s*\$?\s*[\d,]+(?:\.\d{2})?)/i);
        const amount = amountMatch ? amountMatch[1].replace(/\s+/g, ' ').trim() : null;

        // Security names appear BEFORE [ST]/[OT]. Prior-row descriptions can
        // contaminate this region; only emit a name when its boundary is clear.
        const prior = body.slice(i ? starts[i - 1].index + starts[i - 1][0].length : 0, m.index);
        let asset = null;
        let owner = null;
        let nameZone = prior;
        if (i) {
            // Cut off the previous row's value and its S:/D: explanatory notes.
            const prevAmount = nameZone.match(AMOUNT_RE);
            if (prevAmount) nameZone = nameZone.slice(prevAmount.index + prevAmount[0].length);
            const lastDescription = Math.max(nameZone.lastIndexOf(' D:'), nameZone.lastIndexOf(' S:'));
            if (lastDescription >= 0) nameZone = nameZone.slice(lastDescription);
        }
        // Prefer explicit owner prefix immediately before the security name.
        const owners = [...nameZone.matchAll(/(?:^|\s)(SP|JT|DC)\s*(?=[A-Z])/g)];
        if (owners.length) {
            const om = owners[owners.length - 1];
            owner = om[1];
            const raw = nameZone.slice(om.index + om[0].length).trim();
            if (raw.length >= 4 && raw.length <= 140 && !/\b(?:Date|Amount|Notification|Transaction|Description|Purchased|Sale of)\b/i.test(raw)) asset = raw;
        } else if (!i) {
            const raw = nameZone.replace(/^.*?(?:Amount\s*Cap\.?\s*Gains|ID\s*Owner\s*Asset\s*Transaction\s*Type\s*Date\s*Notification\s*Date)/i, '').trim();
            if (raw.length >= 5 && raw.length <= 130 && /\b(?:Inc\.|Corp\.|Fund|Stock|ETF|Trust|Shares)\b/i.test(raw)) asset = raw;
        }
        // A name with previous-row prose is less useful than an honest null.
        if (asset && /\b(?:Exercised|options purchased|strike price|expiration date|Sale of|units\.|Filing|New|Loss of)\b/i.test(asset)) asset = null;
        const tickerMatch = asset && asset.match(/\(([A-Z][A-Z0-9.\-]{0,9})\)/);
        const dir = { P: 'purchase', S: 'sale', E: 'exchange' }[m[2].toUpperCase()];
        candidates.push({
            candidate_id: `${docId}-${candidates.length + 1}`,
            transaction_direction_candidate: dir,
            transaction_date_candidate: transactionDate,
            notification_date_candidate: notificationDate,
            amount_range_candidate: amount,
            security_name: asset,
            ticker: tickerMatch ? tickerMatch[1] : null,
            owner,
            asset_type_candidate: m[1],
            evidence_excerpt: body.slice(Math.max(0, m.index - 155), Math.min(next, m.index + 470)).slice(0, 750),
            source_document_url: url, filing_year: year, doc_id: docId,
            extraction_method: 'asset_type_anchored_compact_two_dates_v11_3_b2_4',
            verification_status: 'requires_manual_review',
            note: '按资产类型及两日期定位交易候选；PDF 可能压缩表格列，资产、金额、交易人及日期仍需核对原始 PDF。'
        });
    }
    return candidates;
}
async function parseHousePtrPdf({ year, docId }) {
    if (!Number.isInteger(year) || year < 2008 || year > new Date().getUTCFullYear()) throw err("年份无效", 400);
    if (!/^\d{4,12}$/.test(String(docId))) throw err("文件编号无效", 400);
    const { pdf, url } = await fetchOfficialPdf(year, String(docId));
    const pdfParse = getPdfParse();
    let parsed;
    try { parsed = await pdfParse(pdf, { max: 30 }); }
    catch (e) { throw err(`PDF 文本解析失败：${e.message}`); }
    const text = cleanPdfText(String(parsed.text || "").slice(0, MAX_TEXT_CHARS));
    const candidates = extractReviewCandidates(text, String(docId), year, url);
    const scannedOrNoText = text.replace(/\s/g, "").length < 80;
    return {
        provider: "US_HOUSE_CLERK", mode: "official_ptr_pdf_text_review",
        source_document_url: url, filing_year: year, doc_id: String(docId),
        pages_parsed: parsed.numpages || null, text_characters: text.length,
        document_text_available: !scannedOrNoText,
        parse_status: scannedOrNoText ? "no_extractable_text_manual_review" : candidates.length ? "review_candidates_found" : "text_extracted_no_confident_candidates",
        verified_person_match: false, verified_transactions: false,
        total_review_candidates: candidates.length, results: candidates,
        text_preview: text.slice(0, 2500),
        note: "仅供核验的候选片段，不是已确认的证券交易；证券名、交易人、日期与金额必须对照原 PDF 人工确认。扫描 PDF 不自动 OCR。",
        retrieved_at: new Date().toISOString()
    };
}
module.exports = { parseHousePtrPdf, extractReviewCandidates, cleanPdfText };
