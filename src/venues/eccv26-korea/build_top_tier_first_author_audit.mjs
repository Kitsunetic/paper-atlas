import fs from 'node:fs/promises';

const root = process.cwd();
const sourceFile = `${root}/eccv_2026_korean_first_author_affiliations_reaudited.csv`;
const auditFile = `${root}/eccv_2026_first_author_top_tier_audit.csv`;
const queueFile = `${root}/eccv_2026_first_author_identity_review_queue.csv`;
const evidenceFile = `${root}/eccv_2026_first_author_prior_work_evidence.csv`;
const reviewFile = `${root}/eccv_2026_first_author_manual_identity_reviews.csv`;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (character !== '\r') field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function serialize(rows) {
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\n') + '\n';
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function fnv1a(value) {
  let hash = 0x811c9dc5;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

const rawRows = parseCsv(await fs.readFile(sourceFile, 'utf8'));
const headers = rawRows.shift();
const records = rawRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
if (records.length !== 277) throw new Error(`Expected 277 selected ECCV papers; found ${records.length}`);

async function loadCsvObjects(file) {
  try {
    const rows = parseCsv(await fs.readFile(file, 'utf8'));
    const [fileHeaders, ...dataRows] = rows;
    if (!fileHeaders?.length) throw new Error(`Missing CSV headers in ${file}`);
    return dataRows
      .filter((row) => row.some((value) => value !== ''))
      .map((row) => Object.fromEntries(fileHeaders.map((header, index) => [header, row[index] ?? ''])));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

const [manualReviews, evidenceRows] = await Promise.all([loadCsvObjects(reviewFile), loadCsvObjects(evidenceFile)]);
const reviewsByCandidate = new Map(manualReviews.map((review) => [review.candidate_identity_key, review]));
const verifiedEvidenceByCandidate = new Map();
for (const evidence of evidenceRows.filter((row) => row.verification_status === 'verified')) {
  const group = verifiedEvidenceByCandidate.get(evidence.candidate_identity_key) ?? [];
  group.push(evidence);
  verifiedEvidenceByCandidate.set(evidence.candidate_identity_key, group);
}

const topTierVenues = 'CVPR; ICCV; ECCV; NeurIPS; ICLR; ICML; SIGGRAPH; SIGGRAPH Asia; IROS; ICRA; RA-L';
const cutoff = '2026-03-05T23:00:00+01:00';
const candidateKey = (record) => `cai_${fnv1a(`${normalize(record.first_author)}\u0000${normalize(record.first_author_affiliation_raw)}`)}`;
const groups = new Map();

for (const record of records) {
  const key = candidateKey(record);
  const group = groups.get(key) ?? [];
  group.push(record);
  groups.set(key, group);
}

const auditRows = records
  .sort((left, right) => Number(left.virtual_poster_id) - Number(right.virtual_poster_id))
  .map((record) => {
    const key = candidateKey(record);
    const review = reviewsByCandidate.get(key);
    const evidence = verifiedEvidenceByCandidate.get(key) ?? [];
    const uniqueConfirmedWorks = new Set(evidence.map((row) => `${row.venue}\u0000${row.eligible_prior_work_title}`));
    const minimumConfirmedCount = uniqueConfirmedWorks.size;
    const reviewComplete = review?.prior_work_review_completeness === 'complete';
    const exactCount = reviewComplete ? String(minimumConfirmedCount) : '';
    const firstPaper = minimumConfirmedCount > 0 ? 'no' : reviewComplete ? 'yes' : '';
    const determination = review?.identity_resolution_status === 'unresolved'
      ? 'blocked_on_identity_review'
      : minimumConfirmedCount > 0
        ? 'confirmed_not_first'
        : reviewComplete ? 'confirmed_first'
        : review ? 'identity_resolved_prior_work_review_incomplete' : 'blocked_on_identity_review';
    return {
      paper_uid: record.paper_uid,
      virtual_poster_id: record.virtual_poster_id,
      title: record.title,
      eccv_first_author_name: record.first_author,
      eccv_first_author_affiliation_raw: record.first_author_affiliation_raw,
      primary_affiliation_category: record.primary_affiliation_category,
      candidate_identity_key: key,
      identity_resolution_status: review?.identity_resolution_status ?? 'unreviewed',
      identity_profile_url: review?.identity_profile_url ?? '',
      identity_evidence_summary: review?.identity_evidence_summary ?? '',
      top_tier_venue_scope: topTierVenues,
      prior_work_cutoff: cutoff,
      prior_work_eligibility_rule: 'Main-conference full paper or RA-L journal article published on or before the cutoff; first-listed authorship only. Workshops, posters, demos, abstracts, and unverified identity matches are excluded.',
      minimum_confirmed_prior_eligible_top_tier_first_author_count: String(minimumConfirmedCount),
      previous_eligible_top_tier_first_author_count: exactCount,
      previous_explicit_cofirst_author_count: '',
      is_first_eligible_top_tier_first_author: firstPaper,
      first_paper_determination_status: determination,
      evidence_ledger_row_count: String(evidence.length),
      count_confidence: review?.count_confidence ?? 'unreviewed',
      official_ecva_record_url: record.official_ecva_record_url,
      notes: review?.notes ?? '',
    };
  });

const queueRows = [...groups.entries()]
  .map(([key, group]) => {
    const review = reviewsByCandidate.get(key);
    const verifiedEvidence = verifiedEvidenceByCandidate.get(key) ?? [];
    return {
      candidate_identity_key: key,
      eccv_first_author_name: group[0].first_author,
      eccv_first_author_affiliation_raw: group[0].first_author_affiliation_raw,
      primary_affiliation_category: group[0].primary_affiliation_category,
      eccv_selected_paper_count: String(group.length),
      eccv_virtual_poster_ids: group.map((record) => record.virtual_poster_id).sort((left, right) => Number(left) - Number(right)).join('; '),
      eccv_titles: group.map((record) => record.title).join(' || '),
      identity_resolution_status: review?.identity_resolution_status ?? 'unreviewed',
      identity_profile_url: review?.identity_profile_url ?? '',
      preferred_identity_evidence_source: 'Official personal CV, institutional profile, ORCID, then official proceedings or publisher metadata',
      prior_work_cutoff: cutoff,
      verified_prior_work_row_count: String(verifiedEvidence.length),
      review_status: review?.identity_resolution_status === 'unresolved'
        ? 'identity_unresolved_prior_work_incomplete'
        : review ? `identity_${review.identity_resolution_status}_prior_work_${review.prior_work_review_completeness}` : 'not_started',
      notes: review?.notes ?? '',
    };
  })
  .sort((left, right) => left.eccv_first_author_name.localeCompare(right.eccv_first_author_name, 'en'));

await Promise.all([
  fs.writeFile(auditFile, serialize(auditRows), 'utf8'),
  fs.writeFile(queueFile, serialize(queueRows), 'utf8'),
]);

console.log(JSON.stringify({
  source_papers: records.length,
  identity_review_candidates: queueRows.length,
  repeated_candidate_groups: queueRows.filter((row) => Number(row.eccv_selected_paper_count) > 1).length,
  resolved_identities: manualReviews.filter((review) => review.identity_resolution_status === 'resolved').length,
  confirmed_not_first_papers: auditRows.filter((row) => row.first_paper_determination_status === 'confirmed_not_first').length,
  outputs: [auditFile, queueFile, evidenceFile],
}, null, 2));
