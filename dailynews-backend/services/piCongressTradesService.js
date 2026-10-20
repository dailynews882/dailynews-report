"use strict";
/** V11.3-A: Official STOCK Act disclosure discovery. No scraping or fabricated trade rows. */
const SOURCES = Object.freeze([
    { id: "house", label: "美国众议院 · 财务披露与 PTR", chamber: "house", url: "https://disclosures-clerk.house.gov/FinancialDisclosure", search_url: "https://disclosures-clerk.house.gov/FinancialDisclosure/ViewSearch", provider: "US_HOUSE_CLERK", format: "official_search_and_documents" },
    { id: "senate", label: "美国参议院 · 财务披露与 PTR", chamber: "senate", url: "https://efdsearch.senate.gov/search/home/", search_url: "https://efdsearch.senate.gov/search/home/", provider: "US_SENATE_EFD", format: "official_search_and_documents" }
]);
const FIELD_SCHEMA = Object.freeze({
    person_name: "申报人姓名", chamber: "众议院/参议院", transaction_date: "交易日期",
    filing_date: "申报日期", asset_name: "资产名称", ticker: "证券代码（若披露）",
    transaction_type: "买入/卖出/交换", amount_range: "披露金额区间",
    owner: "申报资产持有人", source_document_url: "官方原始文件",
    verification_status: "核验状态"
});
function getCongressDisclosureDiscovery(name) {
    const person = String(name || "").trim();
    return {
        provider: "US_CONGRESS_OFFICIAL_DISCLOSURES", query: person,
        data_category: "personal_securities_transactions_not_campaign_finance",
        mode: "official_source_discovery_only", live_trade_api: false,
        verified_person_match: false, results: [], total: 0,
        sources: SOURCES.map(s => ({ ...s })), field_schema: { ...FIELD_SCHEMA },
        verification_status: "no_person_specific_transactions_retrieved",
        message: "已提供众议院与参议院官方披露查询入口；尚未获取或解析该人物的具体交易记录。请在官方系统核验身份、申报文件及日期。",
        legal_note: "美国 5 U.S.C. §13107(c) 限制财务披露报告的商业用途；商业新闻传播例外的适用范围须结合实际产品和法律意见确认。不得用于信用评级或募捐。",
        source_law_url: "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title5-section13107",
        retrieved_at: new Date().toISOString()
    };
}
module.exports = { getCongressDisclosureDiscovery };
