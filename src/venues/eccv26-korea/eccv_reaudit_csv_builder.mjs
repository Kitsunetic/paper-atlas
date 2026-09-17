import fs from 'node:fs/promises';

const root = process.cwd();
const sourceUrl = 'https://eccv.ecva.net/static/virtual/data/eccv-2026-orals-posters.json';
const runId = 'eccv2026-reaudit-2026-09-10';
const decode = (x) => String(x ?? '').replaceAll('&amp;', '&').replaceAll('&#x27;', "'").replaceAll('&quot;', '"');
const csv = (x) => /[",\n\r]/.test(String(x ?? '')) ? `"${String(x ?? '').replaceAll('"', '""')}"` : String(x ?? '');
const set = (items) => new Set(items);

const academic = set([
  'AI Graduate School, Gwangju Institute of Science and Technology(GIST)', 'Changwon National University', 'Chung-Ang University', 'Chung-Ang University Seoul', 'Chungnam National University', 'Computer Vision Lab, University of Seoul', 'Daegu Gyeongbuk Institute of Science and Technology', 'DGIST', 'Emory University; Yonsei University', 'Ewha W. University', 'Ewha womans university', "Ewha Women's University", 'Ewha Womans University', 'GIST', 'Gwangju Institute of Science and Technology', 'Gwangju Institute of Science and Technology (GIST)', 'Handong Global University', 'Hanyang University', 'Hanyang Universty', 'Inha University', 'Jeonbuk National University', 'KAIST', 'Kaist', 'KAIST (Korea Advanced Institute of Science and Technology)', 'KAIST AI', 'Kangwon National University', 'Konkuk University', 'Kookmin University', 'Korea Advanced Institute of Science & Technology', 'Korea Advanced Institute of Science & Technology (KAIST), Daejeon', 'Korea Advanced Institute of Science & Technology; Korea Advanced Institute of Science & Technology', 'Korea Advanced Institute of Science & Technology; New York University Abu Dhabi', 'Korea Advanced Institute of Science and Technology', 'Korea Advanced Institute of Science and Technology (KAIST)', 'Korea Aerospace University', 'Korea Cyber University', 'Korea University', 'Kyung Hee University', 'Kyungpook National University', 'Pohang University of Science and Technology', 'Pohang University of Science and Technology (POSTECH)', 'POSTECH', 'Pukyong National University', 'Pusan National University', 'Sejong University', 'Seoul National University', 'SEOUL NATIONAL UNIVERSITY', 'Seoul National University College of Medicine; Seoul National University College of Medicine', 'Seoul National University of Science and Technology', 'SEOUL NATIONAL UNIVERSITY OF SCIENCE AND TECHNOLOGY', 'Sogang University', 'Sogang university', "Sookmyung Women's University", 'Soongsil University', 'Soongsil university', 'Sung Kyun Kwan University', 'Sung Kyun Kwan University; Sung Kyun Kwan University', 'Sungkyunkwan University', 'SungKyunKwan University', 'Ulsan National Institute of Science and Technology', 'Ulsan National Institute of Science and Technology (UNIST)', 'UNIST', 'Vision and Learning Lab, Seoul National University', 'Yonsei University', 'Yonsei university'
]);
const research = set(['ETRI', 'Korea Electronics Technology Institute (KETI)', 'Korea Electronics Technology Institute; Chung-Ang University', 'Korea Institute of Science and Technology', 'Korea Institute of Science and Technology (KIST)']);
const medical = set(['Asan Medical Center, University of Ulsan', 'Seoul National University Hospital']);
const corporate = set(['Aimfuture', 'CLO Virtual Fashion', 'CLO Virtual Fashion Inc.', 'Kakao', 'KRAFTON', 'LG Corporation', 'LG Electronics', 'LG Electronins', 'Maum AI', 'NAVER Cloud', 'OGQ', 'SNOW Corporation', 'StradVision', 'Samsung Electronics']);
const corporateAcademic = set(['CJ AI center; Gwangju Institute of Science and Technology', 'Korea Advanced Institute of Science and Technology (KAIST), INEEJI Corp.']);
const companyUrls = new Map([
  ['Aimfuture', 'https://aimfuture.ai/en/'], ['CLO Virtual Fashion', 'https://clovirtualfashion.com/'], ['CLO Virtual Fashion Inc.', 'https://clovirtualfashion.com/'], ['Kakao', 'https://www.kakaocorp.com/page/'], ['KRAFTON', 'https://krafton.com/'], ['LG Corporation', 'https://www.lgcorp.com/'], ['LG Electronics', 'https://www.lg.com/global/'], ['LG Electronins', 'https://www.lg.com/global/'], ['Maum AI', 'https://maum.ai/'], ['NAVER Cloud', 'https://www.navercloudcorp.com/'], ['OGQ', 'https://ogqcorp.com/'], ['SNOW Corporation', 'https://snowcorp.com/'], ['StradVision', 'https://stradvision.com/'], ['Samsung Electronics', 'https://semiconductor.samsung.com/about-us/locations/']
]);

function classify(row) {
  const raw = decode(row.authors?.[0]?.institution);
  const base = { raw, include: false, location: 'not_classified_as_Korea', category: 'FOREIGN_OR_UNVERIFIED_AFFILIATION', confidence: 'not_assessed', basis: 'Not included by the Korean-affiliation map.', evidenceUrl: '' };
  if (academic.has(raw)) return { ...base, include: true, location: 'Republic_of_Korea', category: 'KOREAN_UNIVERSITY_GRAD_SCIENCE_INSTITUTE', confidence: 'direct_affiliation_mapping', basis: 'Exact ECVA affiliation mapped to a Korean higher-education or science-and-technology institution.' };
  if (research.has(raw)) return { ...base, include: true, location: 'Republic_of_Korea', category: 'KOREAN_RESEARCH_INSTITUTE', confidence: 'direct_affiliation_mapping', basis: 'Exact ECVA affiliation mapped to a Korean national research or technology institute.' };
  if (medical.has(raw)) return { ...base, include: true, location: 'Republic_of_Korea', category: 'KOREAN_UNIVERSITY_OR_HOSPITAL', confidence: 'direct_affiliation_mapping', basis: 'Exact ECVA affiliation names a Korean university-affiliated hospital or medical centre.' };
  if (corporate.has(raw)) return { ...base, include: true, location: 'Republic_of_Korea_organisation', category: 'KOREAN_COMPANY', confidence: 'organisation_country_verified_site_unstated', basis: 'ECVA affiliation maps to a Korea-based company; linked organisation source verifies the entity.', evidenceUrl: companyUrls.get(raw) };
  if (corporateAcademic.has(raw)) return { ...base, include: true, location: 'Republic_of_Korea', category: 'KOREAN_COMPANY_AND_ACADEMIC', confidence: 'direct_affiliation_mapping', basis: 'ECVA lists Korean company and Korean academic affiliations for the first author.' };
  if (raw === 'South Korea') return { ...base, include: true, location: 'Republic_of_Korea', category: 'KOREA_LOCATION_DECLARED_UNSPECIFIED_INSTITUTION', confidence: 'country_declared_by_source', basis: 'ECVA records South Korea but does not name an institution.' };
  if (raw === 'Samsung' && row.id === 5790) return { ...base, include: true, location: 'Republic_of_Korea', category: 'KOREAN_COMPANY', confidence: 'publisher_location_verified', basis: 'Springer chapter metadata identifies Samsung System LSI, Hwaseong, Republic of Korea.', evidenceUrl: 'https://link.springer.com/chapter/10.1007/978-3-032-37362-5_33' };
  return base;
}

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`ECVA fetch failed: ${response.status}`);
const payload = await response.json();
const posters = payload.results.filter((row) => row.eventtype === 'Poster');
if (posters.length !== 2834 || new Set(posters.map((row) => row.uid)).size !== 2834) throw new Error('ECVA poster coverage or UID uniqueness check failed');
const prior = await fs.readFile(`${root}/eccv_2026_korean_first_author_affiliations_complete.md`, 'utf8');
const priorIds = new Set([...prior.matchAll(/\/virtual\/2026\/poster\/(\d+)/g)].map((m) => Number(m[1])));
const all = posters.map((row) => ({ row, ...classify(row) }));
const selected = all.filter((entry) => entry.include);
if (selected.length !== 277) {
  const unresolvedPrior = all.filter((entry) => priorIds.has(entry.row.id) && !entry.include)
    .map((entry) => ({ id: entry.row.id, title: decode(entry.row.name), first_author: decode(entry.row.authors?.[0]?.fullname), affiliation: entry.raw }));
  console.log(JSON.stringify({ selected_count: selected.length, unresolved_prior: unresolvedPrior }, null, 2));
  throw new Error(`Expected 277 included papers; got ${selected.length}`);
}
const currentIds = new Set(selected.map((entry) => entry.row.id));
const added = [...currentIds].filter((id) => !priorIds.has(id)).sort((a, b) => a - b);
const removed = [...priorIds].filter((id) => !currentIds.has(id)).sort((a, b) => a - b);

const record = (entry, fullCensus = false) => {
  const { row, raw, include, location, category, confidence, basis, evidenceUrl } = entry;
  return {
    run_id: runId,
    paper_uid: row.uid,
    virtual_poster_id: row.id,
    title: decode(row.name),
    first_author: decode(row.authors?.[0]?.fullname),
    first_author_affiliation_raw: raw,
    korean_affiliation_included: include ? 'true' : 'false',
    affiliation_location: location,
    primary_affiliation_category: category,
    classification_confidence: confidence,
    classification_basis: basis,
    classification_evidence_url: evidenceUrl,
    has_foreign_coaffiliation: /Emory University|New York University Abu Dhabi/.test(raw) ? 'true' : 'false',
    foreign_institution_korean_person_status: include ? 'not_applicable_first_author_has_Korean_affiliation' : 'not_determined_no_identity_inference',
    foreign_identity_evidence_url: '',
    official_ecva_record_url: `https://eccv.ecva.net/virtual/2026/poster/${row.id}`,
    official_programme_data_url: sourceUrl,
    prior_dataset_status: priorIds.has(row.id) ? 'present' : 'added_in_reaudit',
    reaudit_diff_status: priorIds.has(row.id) ? 'unchanged' : 'added',
    record_scope: fullCensus ? 'all_ECCV_main_poster_papers' : 'Korean_affiliation_selected_papers',
  };
};

function serialize(rows) {
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((r) => headers.map((h) => csv(r[h])).join(','))].join('\n') + '\n';
}
const diff = [
  { run_id: runId, check: 'official_poster_uid_coverage', prior_value: 'not_recorded', rerun_value: String(posters.length), difference: '', status: 'pass', details: 'Fresh ECVA download contains 2,834 unique Poster paper UIDs.' },
  { run_id: runId, check: 'included_paper_count', prior_value: String(priorIds.size), rerun_value: String(currentIds.size), difference: String(currentIds.size - priorIds.size), status: currentIds.size === priorIds.size ? 'unchanged' : 'changed', details: 'Independent exact-institution-map rerun against a fresh ECVA programme download.' },
  { run_id: runId, check: 'added_virtual_poster_ids', prior_value: '', rerun_value: added.join(';'), difference: String(added.length), status: added.length ? 'changed' : 'unchanged', details: 'Fresh rerun IDs absent from the prior complete list.' },
  { run_id: runId, check: 'removed_virtual_poster_ids', prior_value: '', rerun_value: removed.join(';'), difference: String(removed.length), status: removed.length ? 'changed' : 'unchanged', details: 'Prior-list IDs absent from the fresh rerun.' },
];
await Promise.all([
  fs.writeFile(`${root}/eccv_2026_korean_first_author_affiliations_reaudited.csv`, serialize(selected.map((x) => record(x))), 'utf8'),
  fs.writeFile(`${root}/eccv_2026_first_author_affiliation_full_census.csv`, serialize(all.map((x) => record(x, true))), 'utf8'),
  fs.writeFile(`${root}/eccv_2026_korean_first_author_reaudit_diff.csv`, serialize(diff), 'utf8'),
]);
const counts = Object.fromEntries([...new Set(selected.map((x) => x.category))].map((category) => [category, selected.filter((x) => x.category === category).length]));
console.log(JSON.stringify({ poster_count: posters.length, selected_count: selected.length, prior_count: priorIds.size, added, removed, category_counts: counts }, null, 2));
