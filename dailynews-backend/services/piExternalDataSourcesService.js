"use strict";

// Read-only, live requests. No persistence and no database writes.
const GLEIF = "https://api.gleif.org/api/v1";
const SEC_DATA = "https://data.sec.gov";
const SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json";
const TIMEOUT_MS = 12000;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
let lastSecRequestAt = 0;
let secQueue = Promise.resolve();

function error(message, status = 502) {
    const e = new Error(message);
    e.status = status;
    return e;
}
function safeString(value, max = 120) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function secAgent() {
    const contact = safeString(process.env.SEC_CONTACT_EMAIL || "", 160);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) {
        throw error("SEC_CONTACT_EMAIL 未配置有效联系邮箱；暂不向 SEC 发送请求", 503);
    }
    return `DailyNewsPeopleIntelligence/1.0 ${contact}`;
}
async function secThrottle() {
    const previous = secQueue;
    let release;
    secQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try {
        const wait = Math.max(0, 250 - (Date.now() - lastSecRequestAt));
        if (wait) await new Promise(resolve => setTimeout(resolve, wait));
        lastSecRequestAt = Date.now();
    } finally { release(); }
}
async function getJson(url, provider) {
    const parsed = new URL(url);
    const allowed = provider === "SEC"
        ? ["data.sec.gov", "www.sec.gov"] : ["api.gleif.org"];
    if (parsed.protocol !== "https:" || !allowed.includes(parsed.hostname)) {
        throw error("上游地址未获允许", 400);
    }
    if (provider === "SEC") await secThrottle();
    const headers = { Accept: "application/json" };
    if (provider === "SEC") headers["User-Agent"] = secAgent();
    const response = await fetch(parsed.toString(), {
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
        redirect: "error"
    });
    if (response.status === 404) throw error(`${provider} 未找到对应记录`, 404);
    if (response.status === 429) throw error(`${provider} 请求频率受限，请稍后重试`, 503);
    if (!response.ok) throw error(`${provider} 上游 HTTP ${response.status}`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_RESPONSE_BYTES) throw error(`${provider} 响应超过安全限制`);
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) throw error(`${provider} 响应超过安全限制`);
    try { return JSON.parse(body); } catch { throw error(`${provider} 返回了无效 JSON`); }
}
function gleifRecord(row) {
    const a = row?.attributes || {};
    const entity = a.entity || {};
    const registration = a.registration || {};
    return {
        provider: "GLEIF",
        entity_id: a.lei || row?.id || null,
        legal_name: entity.legalName?.name || null,
        jurisdiction: entity.legalJurisdiction || null,
        legal_address: entity.legalAddress || null,
        headquarters_address: entity.headquartersAddress || null,
        entity_status: entity.status || null,
        registration_status: registration.status || null,
        relationships: [],
        source_url: a.lei ? `https://search.gleif.org/#/record/${encodeURIComponent(a.lei)}` : null,
        retrieved_at: new Date().toISOString(),
        as_of_date: registration.lastUpdateDate || null,
        verification_status: "external_official_unreviewed",
        note: "LEI 注册资料；不据此推断自然人股权或控制权"
    };
}
async function gleifSearch(name) {
    const url = new URL(`${GLEIF}/lei-records`);
    url.searchParams.set("filter[entity.legalName]", name);
    url.searchParams.set("page[size]", "10");
    const data = await getJson(url.toString(), "GLEIF");
    return {
        provider: "GLEIF", query: name, results: (data.data || []).map(gleifRecord),
        meta: { matching: "name_candidates_not_verified", live: true, total: data.meta?.pagination?.total || null }
    };
}
async function gleifByLei(lei) {
    const data = await getJson(`${GLEIF}/lei-records/${encodeURIComponent(lei)}`, "GLEIF");
    return { provider: "GLEIF", result: gleifRecord(data.data), meta: { live: true } };
}
function normalizeCik(value) { return String(value).padStart(10, "0"); }
async function secFindCompany(term) {
    const data = await getJson(SEC_TICKERS, "SEC");
    const query = term.toLowerCase();
    const entries = Object.values(data).filter(v => v && typeof v === "object");
    const exact = entries.filter(v => String(v.ticker || "").toLowerCase() === query || String(v.title || "").toLowerCase() === query);
    const matches = exact.length ? exact : entries.filter(v => String(v.title || "").toLowerCase().includes(query)).slice(0, 10);
    return {
        provider: "SEC", query: term, results: matches.slice(0, 10).map(v => ({
            provider: "SEC", entity_id: normalizeCik(v.cik_str), cik: normalizeCik(v.cik_str),
            ticker: v.ticker || null, legal_name: v.title || null,
            source_url: `https://www.sec.gov/edgar/browse/?CIK=${normalizeCik(v.cik_str)}`,
            retrieved_at: new Date().toISOString(), verification_status: "external_official_unreviewed"
        })), meta: { live: true, matching: "candidate_list_not_identity_proof" }
    };
}
async function secSubmissions(cik) {
    const padded = normalizeCik(cik);
    const data = await getJson(`${SEC_DATA}/submissions/CIK${padded}.json`, "SEC");
    const recent = data.filings?.recent || {};
    const filings = (recent.form || []).slice(0, 20).map((form, index) => ({
        form, filing_date: recent.filingDate?.[index] || null,
        accession_number: recent.accessionNumber?.[index] || null,
        primary_document: recent.primaryDocument?.[index] || null
    }));
    return {
        provider: "SEC", entity_id: padded, cik: padded,
        legal_name: data.name || null, tickers: data.tickers || [], exchanges: data.exchanges || [],
        sic: data.sic || null, sic_description: data.sicDescription || null,
        jurisdiction: data.stateOfIncorporation || null,
        entity_status: null, filings, relationships: [],
        source_url: `https://www.sec.gov/edgar/browse/?CIK=${padded}`,
        retrieved_at: new Date().toISOString(), as_of_date: filings[0]?.filing_date || null,
        verification_status: "external_official_unreviewed",
        note: "申报记录不等于现时持股或最终控制权；具体股权需按文件、日期独立核验"
    };
}

// V11.2: independent official-source discovery, no scraping of disclosure portals.
// Congressional STOCK Act transaction records are NOT the same as FEC donations.
function politicalDisclosureSources(name) {
    const query = safeString(name, 100);
    return {
        provider: "US_PUBLIC_DISCLOSURES", query,
        trades: [], // No licensed transaction feed has been connected.
        trade_data_status: "not_connected",
        sources: [
            { type: "house_periodic_transaction_reports", label: "美国众议院财务披露查询", url: "https://disclosures-clerk.house.gov/FinancialDisclosure", api_connected: false },
            { type: "senate_periodic_transaction_reports", label: "美国参议院财务披露查询", url: "https://efdsearch.senate.gov/search/", api_connected: false },
            { type: "executive_financial_disclosure", label: "美国政府道德办公室 OGE", url: "https://www.oge.gov/web/oge.nsf/Resources/Financial+Disclosure", api_connected: false },
            { type: "campaign_finance", label: "FEC 竞选资金数据库（政治献金，非股票交易）", url: "https://www.fec.gov/data/", api_connected: false }
        ],
        license_note: "议员交易披露的商业再利用与批量抓取须独立审查来源条款；当前只提供官方查询入口，不抓取、不存储、不宣称已核实交易。",
        retrieved_at: new Date().toISOString()
    };
}

// Optional FEC OpenFEC live lookup. FEC data is campaign-finance information,
// not personal securities transactions. Never use contributor details for commercial solicitation.
async function fecCandidateSearch(name) {
    const key = safeString(process.env.FEC_API_KEY || "", 200);
    if (!key) return {
        provider: "FEC", query: name, results: [], configured: false,
        message: "未配置 FEC_API_KEY；可先使用 FEC 官方网站。",
        source_url: "https://www.fec.gov/data/",
        data_category: "campaign_finance_not_stock_trades"
    };
    const url = new URL("https://api.open.fec.gov/v1/candidates/search/");
    url.searchParams.set("api_key", key);
    url.searchParams.set("q", name);
    url.searchParams.set("per_page", "10");
    const response = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: "error" });
    if (!response.ok) throw error(`FEC 上游 HTTP ${response.status}`, response.status === 429 ? 503 : 502);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_RESPONSE_BYTES) throw error("FEC 响应超过安全限制");
    const body = await response.text();
    if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) throw error("FEC 响应超过安全限制");
    let data;
    try { data = JSON.parse(body); } catch { throw error("FEC 返回无效 JSON"); }
    return {
        provider: "FEC", query: name, configured: true,
        data_category: "campaign_finance_not_stock_trades",
        results: (data.results || []).slice(0, 10).map(row => ({
            candidate_id: row.candidate_id || null,
            name: row.name || null,
            party: row.party || null,
            office: row.office || null,
            state: row.state || null,
            election_years: Array.isArray(row.election_years) ? row.election_years : [],
            source_url: row.candidate_id ? `https://www.fec.gov/data/candidate/${encodeURIComponent(row.candidate_id)}/` : "https://www.fec.gov/data/",
            verification_status: "external_official_unreviewed"
        })),
        meta: { live: true, matching: "name_candidates_not_verified", retrieved_at: new Date().toISOString() }
    };
}

module.exports = { gleifSearch, gleifByLei, secFindCompany, secSubmissions, politicalDisclosureSources, fecCandidateSearch };
