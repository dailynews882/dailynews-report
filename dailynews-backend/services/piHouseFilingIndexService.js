"use strict";
/** V11.3-B1: Read the House Clerk's official annual ZIP filing index, NOT PDF trade rows. */
const https = require("https");
const zlib = require("zlib");
const MAX_ZIP = 24 * 1024 * 1024;
const MAX_TEXT = 8 * 1024 * 1024;
const CACHE_MS = 4 * 60 * 60 * 1000;
const cache = new Map();
const pending = new Map();
const BASE = "https://disclosures-clerk.house.gov/public_disc";

function error(message, status = 502) { const e = new Error(message); e.status = status; return e; }
function fetchZip(year) {
    const url = `${BASE}/financial-pdfs/${year}FD.zip`;
    return new Promise((resolve, reject) => {
        const request = https.get(url, { timeout: 20000, headers: { "User-Agent": "DailyNews-PeopleIntelligence/11.3 (public disclosure research)", "Accept": "application/zip,application/octet-stream" } }, response => {
            if (response.statusCode !== 200) { response.resume(); return reject(error(`众议院官方目录 HTTP ${response.statusCode}`)); }
            const parts = []; let size = 0;
            response.on("data", part => {
                size += part.length;
                if (size > MAX_ZIP) { response.destroy(error("官方年度档案超过安全大小限制")); return; }
                parts.push(part);
            });
            response.on("end", () => resolve(Buffer.concat(parts)));
            response.on("error", reject);
        });
        request.on("timeout", () => request.destroy(error("官方档案下载超时", 504)));
        request.on("error", reject);
    });
}
function extractIndex(zip, year) {
    // Read ZIP central directory. Only extract the expected YYYYFD.txt member.
    let end = -1;
    for (let p = zip.length - 22; p >= Math.max(0, zip.length - 65557); p--) {
        if (zip.readUInt32LE(p) === 0x06054b50) { end = p; break; }
    }
    if (end < 0) throw error("官方 ZIP 缺少目录结束标记");
    const count = zip.readUInt16LE(end + 10);
    let p = zip.readUInt32LE(end + 16);
    const wanted = `${year}FD.txt`.toLowerCase();
    for (let i = 0; i < count; i++) {
        if (p + 46 > zip.length || zip.readUInt32LE(p) !== 0x02014b50) throw error("官方 ZIP 目录格式异常");
        const method = zip.readUInt16LE(p + 10);
        const compressed = zip.readUInt32LE(p + 20);
        const uncompressed = zip.readUInt32LE(p + 24);
        const nameLength = zip.readUInt16LE(p + 28);
        const extraLength = zip.readUInt16LE(p + 30);
        const commentLength = zip.readUInt16LE(p + 32);
        const offset = zip.readUInt32LE(p + 42);
        const name = zip.subarray(p + 46, p + 46 + nameLength).toString("utf8").toLowerCase();
        p += 46 + nameLength + extraLength + commentLength;
        if (name !== wanted) continue;
        if (uncompressed > MAX_TEXT || compressed > MAX_ZIP) throw error("官方索引超出安全解压限制");
        if (offset + 30 > zip.length || zip.readUInt32LE(offset) !== 0x04034b50) throw error("官方 ZIP 文件头异常");
        const dataStart = offset + 30 + zip.readUInt16LE(offset + 26) + zip.readUInt16LE(offset + 28);
        if (dataStart + compressed > zip.length) throw error("官方 ZIP 数据不完整");
        const payload = zip.subarray(dataStart, dataStart + compressed);
        const output = method === 0 ? payload : method === 8 ? zlib.inflateRawSync(payload, { maxOutputLength: MAX_TEXT }) : null;
        if (!output || output.length !== uncompressed) throw error("官方 ZIP 索引解压失败");
        return output.toString("utf8").replace(/^\uFEFF/, "");
    }
    throw error("官方 ZIP 中未找到年度 TXT 索引");
}
function parseIndex(text, year) {
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) throw error("官方索引没有记录");
    const keys = lines.shift().split("\t").map(s => s.trim());
    const required = ["Last", "First", "FilingType", "DocID", "FilingDate"];
    if (!required.every(k => keys.includes(k))) throw error("官方索引字段与预期不一致，已停止解析");
    return lines.map(line => {
        const values = line.split("\t");
        const obj = Object.fromEntries(keys.map((key, i) => [key, (values[i] || "").trim()]));
        return { last: obj.Last, first: obj.First, prefix: obj.Prefix || "", suffix: obj.Suffix || "", state_district: obj.StateDst || "", filing_type: obj.FilingType, filing_date: obj.FilingDate, doc_id: obj.DocID, year };
    }).filter(x => /^\d{4,12}$/.test(x.doc_id));
}
async function loadYear(year) {
    const current = cache.get(year);
    if (current && Date.now() - current.timestamp < CACHE_MS) return current.rows;
    if (pending.has(year)) return pending.get(year);
    const task = (async () => {
        const rows = parseIndex(extractIndex(await fetchZip(year), year), year);
        cache.set(year, { rows, timestamp: Date.now() });
        return rows;
    })();
    pending.set(year, task);
    try { return await task; } finally { pending.delete(year); }
}
function normalizeName(s) { return String(s).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim(); }
async function searchHouseFilings({ name, year, limit = 30 }) {
    const tokens = normalizeName(name).split(" ").filter(Boolean);
    if (tokens.length === 0) throw error("姓名格式无效", 400);
    const years = year ? [year] : [new Date().getUTCFullYear(), new Date().getUTCFullYear() - 1];
    const settled = await Promise.allSettled(years.map(loadYear));
    const failed = settled.flatMap((result, i) => result.status === "rejected" ? [{ year: years[i], message: result.reason.message }] : []);
    const loaded = settled.flatMap(result => result.status === "fulfilled" ? result.value : []);
    if (!loaded.length) throw error(`无法读取众议院官方索引：${failed.map(x => x.message).join("；")}`);
    const matched = loaded.filter(r => {
        if (r.filing_type !== "P") return false;
        const full = normalizeName(`${r.first} ${r.last}`);
        return tokens.every(token => full.split(" ").includes(token));
    });
    matched.sort((a, b) => String(b.filing_date).localeCompare(String(a.filing_date)) || String(b.doc_id).localeCompare(String(a.doc_id)));
    return {
        provider: "US_HOUSE_CLERK", mode: "official_ptr_filing_index", query: name,
        source_kind: "official_annual_zip_index", years_requested: years,
        years_loaded: settled.flatMap((result, i) => result.status === "fulfilled" ? [years[i]] : []), failed_years: failed,
        verified_person_match: false, matching: "name_only_unverified", transaction_rows_parsed: false,
        total_filing_matches: matched.length, results: matched.slice(0, limit).map(r => ({
            filer_name: `${r.first} ${r.last}`.trim(), chamber: "house", filing_type: "PTR", filing_date_raw: r.filing_date,
            state_district: r.state_district, filing_year: r.year, doc_id: r.doc_id,
            source_document_url: `${BASE}/ptr-pdfs/${r.year}/${r.doc_id}.pdf`,
            source_index_url: `${BASE}/financial-pdfs/${r.year}FD.zip`,
            verification_status: "official_index_document_not_person_verified"
        })),
        note: "仅列出众议院官方索引中的 PTR 申报文件，不代表已解析股票交易；姓名匹配未经身份核验。",
        legal_note: "5 U.S.C. §13107(c) 对财务披露信息的商业用途设有限制；请在商业化前取得法律意见。",
        retrieved_at: new Date().toISOString()
    };
}
module.exports = { searchHouseFilings, _parseIndexForTest: parseIndex, _extractIndexForTest: extractIndex };
