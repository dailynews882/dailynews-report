"use strict";
/** V11.3-B3.3: Conservative Wikidata P39/P580/P582/P768 vs House index state/district.
 * This is THIRD-PARTY consistency only, not official tenure confirmation.
 */
const https = require("https");
const MAX_BYTES = 1024 * 1024;
const cache = new Map();
const STATE_NAMES = {
    AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california", CO: "colorado", CT: "connecticut", DE: "delaware", FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois", IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky", LA: "louisiana", ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan", MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana", NE: "nebraska", NV: "nevada", NH: "new hampshire", NJ: "new jersey", NM: "new mexico", NY: "new york", NC: "north carolina", ND: "north dakota", OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania", RI: "rhode island", SC: "south carolina", SD: "south dakota", TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia", WA: "washington", WV: "west virginia", WI: "wisconsin", WY: "wyoming", DC: "district of columbia", PR: "puerto rico", GU: "guam", VI: "virgin islands", AS: "american samoa", MP: "northern mariana islands"
};
function normalizeDistrict(s) {
    const m = String(s || "").toUpperCase().replace(/\s/g, "").match(/^([A-Z]{2})(?:[-:]?(\d{1,2}|AL))?$/);
    if (!m || !STATE_NAMES[m[1]]) return null;
    return { state: m[1], state_name: STATE_NAMES[m[1]], district: m[2] ? (m[2] === "AL" ? "at-large" : Number(m[2])) : null };
}
function parseFilingDate(s) {
    const raw = String(s || "").trim();
    let y, m, d;
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) { const p = raw.split('/').map(Number);[m, d, y] = p; }
    else if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) { const p = raw.split('-').map(Number);[y, m, d] = p; }
    else return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : null;
}
function wdDate(s) { const m = String(s || "").match(/^\+?(\d{4})-(\d{2})-(\d{2})T/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; }
function withinTerm(position, day) {
    if (!day) return "unknown";
    const a = wdDate(position.start_time), b = wdDate(position.end_time);
    if (!a) return "unknown";
    if (day < a || (b && day > b)) return "outside";
    return b ? "inside" : "possible_open_end";
}
function fetchDistrictLabel(qid) {
    if (!/^Q[1-9]\d{0,14}$/.test(qid)) return Promise.resolve(null);
    const old = cache.get(qid); if (old && Date.now() - old.t < 86400000) return Promise.resolve(old.label);
    return new Promise((resolve, reject) => {
        const req = https.get({ hostname: "www.wikidata.org", path: `/wiki/Special:EntityData/${qid}.json`, timeout: 12000, headers: { Accept: "application/json", "User-Agent": "DailyNews-PeopleIntelligence/11.3 (https://www.dailynews.report; research)" } }, res => {
            if (res.statusCode !== 200) { res.resume(); return reject(new Error(`Wikidata district HTTP ${res.statusCode}`)); }
            let size = 0; const chunks = [];
            res.on('data', c => { size += c.length; if (size > MAX_BYTES) { res.destroy(new Error('Wikidata district response too large')); return; } chunks.push(c); });
            res.on('error', reject);
            res.on('end', () => { try { const e = JSON.parse(Buffer.concat(chunks).toString('utf8')).entities?.[qid]; const label = e?.labels?.en?.value || null; cache.set(qid, { t: Date.now(), label }); resolve(label); } catch (e) { reject(e); } });
        }); req.on('timeout', () => req.destroy(new Error('Wikidata district timeout'))); req.on('error', reject);
    });
}
function districtLabelMatches(label, expected) {
    if (!label || !expected || expected.district === null) return null;
    const lower = label.toLowerCase().replace(/[’']/g, "").replace(/\s+/g, ' ');
    if (!lower.includes(expected.state_name)) return false;
    if (expected.district === 'at-large') return /at.large|congressional district/i.test(lower) ? /at.large/.test(lower) : null;
    const n = expected.district;
    const ordinal = new RegExp(`\\b${n}(?:st|nd|rd|th)?\\b`);
    return ordinal.test(lower) && /district/.test(lower);
}

/**
 * V11.3-B3.4: A historical P768 label must not become a proven conflict.
 * Open-ended P39 dates do not prove continued service or a current district.
 * Compare only P768 qualifiers on a temporally relevant P39 statement.
 * No automatic identity verification or person-level attribution.
 */
async function crosscheckTenureDistrict({ wikidata_crosscheck, filing }) {
    const day = parseFilingDate(filing?.filing_date_raw);
    const expected = normalizeDistrict(filing?.state_district);
    const positions = Array.isArray(wikidata_crosscheck?.positions_held)
        ? wikidata_crosscheck.positions_held.slice(0, 150) : [];
    const reviewed = positions.map(p => ({
        ...p, filing_date_overlap: withinTerm(p, day)
    }));
    const dated = reviewed.filter(p => p.filing_date_overlap === 'inside');
    const openEnded = reviewed.filter(p => p.filing_date_overlap === 'possible_open_end');
    // Prefer explicitly bounded statements; only use open-ended statements as
    // provisional evidence. A missing end date is not a confirmed current term.
    const eligible = dated.length ? dated : openEnded;
    const districtIds = [...new Set(eligible.flatMap(p =>
        Array.isArray(p.electoral_district_qids) ? p.electoral_district_qids : []
    ).filter(q => /^Q[1-9]\d{0,14}$/.test(String(q))))].slice(0, 8);
    const labels = await Promise.all(districtIds.map(async qid => {
        try { return { qid, label: await fetchDistrictLabel(qid), available: true }; }
        catch (e) { return { qid, label: null, available: false, error: e.message }; }
    }));
    const checks = labels.map(x => ({
        ...x,
        matches_official_index: x.available ? districtLabelMatches(x.label, expected) : null
    }));
    const matches = checks.some(x => x.matches_official_index === true);
    const mismatches = checks.filter(x => x.matches_official_index === false);
    const tenureStatus = dated.length ? 'date_within_declared_term'
        : openEnded.length ? 'date_within_open_ended_term_unverified'
            : reviewed.some(p => p.filing_date_overlap === 'unknown')
                ? 'insufficient_term_dates' : 'no_matching_term_on_filing_date';
    // Even a bounded P39 statement can carry stale or missing district data.
    // A discrepancy is a review flag, not a verified contradiction.
    const districtStatus = !day || !expected ? 'insufficient_temporal_evidence'
        : !eligible.length ? 'insufficient_temporal_evidence'
            : !checks.length ? 'insufficient_temporal_evidence'
                : matches ? (dated.length ? 'dated_statement_district_consistent_unverified'
                    : 'open_ended_statement_district_consistent_unverified')
                    : mismatches.length ? 'historical_or_stale_district_possible_manual_review'
                        : 'insufficient_temporal_evidence';
    const uncertainty = !day || !expected || !dated.length || !checks.length;
    return {
        provider: 'WIKIDATA_PLUS_US_HOUSE_INDEX',
        mode: 'tenure_district_temporal_review_v11_3_b3_4',
        filing_date: day,
        official_index_state_district: filing?.state_district || null,
        normalized_official_index_district: expected,
        tenure_status: tenureStatus,
        district_status: districtStatus,
        temporal_evidence_quality: !day ? 'invalid_filing_date'
            : dated.length ? 'bounded_position_dates' : openEnded.length ? 'open_ended_position_only'
                : 'no_usable_matching_position',
        positions_examined: reviewed.length,
        positions_overlapping_or_open_ended: dated.length + openEnded.length,
        bounded_positions_matching_date: dated.length,
        open_ended_positions_matching_date: openEnded.length,
        matching_position_qids: eligible.map(p => p.position_qid),
        district_labels_checked: checks,
        historical_district_difference_detected: mismatches.length > 0,
        district_difference_is_verified_conflict: false,
        official_tenure_verified: false,
        official_district_verified: false,
        verified_person_match: false,
        verified_transactions: false,
        status: mismatches.length ? 'temporal_district_difference_requires_review'
            : uncertainty ? 'insufficient_temporal_evidence'
                : 'cross_source_consistency_only',
        note: '仅按申报日筛选 P39 任职声明所附 P768；历史或开放结束日期的选区差异不能直接认定为身份冲突。缺少可独立核实的美国众议院官方任期/选区证据，所有人物和交易身份继续待人工核验。'
    };
}
module.exports = { crosscheckTenureDistrict, normalizeDistrict, parseFilingDate, withinTerm, districtLabelMatches };
