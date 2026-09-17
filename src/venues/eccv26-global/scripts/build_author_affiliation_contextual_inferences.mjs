import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv, writeCsvAtomically, writeTextAtomically } from './csv.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(HERE, '../../../../data/eccv26');
const DEFAULT_RESOLUTION_PATH = path.resolve(HERE, '../aliases/eccv26_author_context_resolutions.csv');
const ISSUE_STATUSES = new Set(['not_institution', 'incomplete_affiliation', 'source_missing_affiliation']);
const RESOLVED_STATUSES = new Set(['primary_source_resolved', 'paper_context_inferred', 'resolved_identity_country_pending']);
const NO_ASSIGNMENT_STATUSES = new Set(['confirmed_independent', 'source_artifact_no_assignment', 'declared_undisclosed_organization', 'needs_more_evidence']);
const OUTPUT_COLUMNS = [
  'paper_uid', 'author_position', 'author_name_raw', 'source_affiliation_raw', 'source_segment_raw', 'source_classification',
  'decision_status', 'canonical_organizations', 'canonical_ror_ids', 'country_codes', 'country_names', 'evidence_kind', 'evidence_url', 'evidence_note'
];

function values(value) {
  return value === '' ? [] : String(value).split(' | ');
}

function rowKey(row) {
  return `${row.paper_uid}\u0000${row.author_name_raw}\u0000${row.source_segment_raw}`;
}

export function validateResolutionRow(row) {
  if (!row.paper_uid || !row.author_name_raw || !row.source_segment_raw || !row.decision_status) throw new Error('Author-context rows require paper_uid, author_name_raw, source_segment_raw, and decision_status');
  if (!RESOLVED_STATUSES.has(row.decision_status) && !NO_ASSIGNMENT_STATUSES.has(row.decision_status)) throw new Error(`Unsupported author-context decision status: ${row.decision_status}`);
  const organizations = values(row.canonical_organizations);
  const rorIds = values(row.canonical_ror_ids);
  const countryCodes = values(row.country_codes);
  const countryNames = values(row.country_names);
  const hasOrganizations = organizations.length > 0;
  if (RESOLVED_STATUSES.has(row.decision_status) && !hasOrganizations) throw new Error(`Resolved author-context row requires an organization: ${rowKey(row)}`);
  if (NO_ASSIGNMENT_STATUSES.has(row.decision_status) && (hasOrganizations || rorIds.length || countryCodes.length || countryNames.length)) throw new Error(`No-assignment author-context row cannot claim an organization, ROR, or country: ${rowKey(row)}`);
  if (hasOrganizations && rorIds.length && rorIds.length !== organizations.length) throw new Error(`Author-context ROR count must align with organization count: ${rowKey(row)}`);
  if (countryCodes.length !== countryNames.length) throw new Error(`Author-context country codes and names must align: ${rowKey(row)}`);
  if (row.decision_status === 'resolved_identity_country_pending' && (countryCodes.length || countryNames.length)) throw new Error(`Country-pending author-context row cannot claim a country: ${rowKey(row)}`);
  if (row.decision_status !== 'resolved_identity_country_pending' && hasOrganizations && countryCodes.length !== organizations.length) throw new Error(`Resolved author-context country count must align with organization count: ${rowKey(row)}`);
  if (new Set(['primary_source_resolved', 'paper_context_inferred', 'confirmed_independent', 'resolved_identity_country_pending']).has(row.decision_status) && !String(row.evidence_url ?? '').startsWith('https://')) throw new Error(`Author-context row requires an HTTPS evidence URL: ${rowKey(row)}`);
}

function authorIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const key = `${row.paper_uid}\u0000${row.author_name_raw}`;
    const entries = index.get(key) ?? [];
    entries.push(row);
    index.set(key, entries);
  }
  return index;
}

function issueIndex(rows) {
  const index = new Map();
  for (const row of rows.filter((entry) => ISSUE_STATUSES.has(entry.match_status))) {
    const key = `${row.paper_uid}\u0000${row.raw_affiliation}\u0000${row.segment_raw}`;
    index.set(key, row);
  }
  return index;
}

async function main() {
  const dataRoot = process.argv[2] === '--data-root' ? path.resolve(process.argv[3]) : DEFAULT_DATA_ROOT;
  if (process.argv.length > 2 && process.argv[2] !== '--data-root') throw new Error('Usage: node build_author_affiliation_contextual_inferences.mjs [--data-root DIR]');
  const [authors, entities, resolutions] = await Promise.all([
    fs.readFile(path.join(dataRoot, 'parsed/author_affiliations_raw.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(dataRoot, 'normalized/affiliation_normalized_entities.csv'), 'utf8').then(parseCsv),
    fs.readFile(DEFAULT_RESOLUTION_PATH, 'utf8').then(parseCsv)
  ]);
  const authorsByKey = authorIndex(authors);
  const issuesByKey = issueIndex(entities);
  const seen = new Set();
  const output = resolutions.map((resolution) => {
    validateResolutionRow(resolution);
    const resolutionKey = rowKey(resolution);
    if (seen.has(resolutionKey)) throw new Error(`Duplicate author-context resolution: ${resolutionKey}`);
    seen.add(resolutionKey);
    const candidates = authorsByKey.get(`${resolution.paper_uid}\u0000${resolution.author_name_raw}`) ?? [];
    if (candidates.length !== 1) throw new Error(`Author-context resolution must identify exactly one raw author row: ${resolutionKey}`);
    const author = candidates[0];
    const issue = issuesByKey.get(`${resolution.paper_uid}\u0000${author.affiliation_raw}\u0000${resolution.source_segment_raw}`);
    if (!issue) throw new Error(`Author-context resolution does not point to a current incomplete/non-institution/source-missing entity: ${resolutionKey}`);
    return {
      paper_uid: resolution.paper_uid,
      author_position: author.author_position,
      author_name_raw: author.author_name_raw,
      source_affiliation_raw: author.affiliation_raw,
      source_segment_raw: resolution.source_segment_raw,
      source_classification: issue.match_status,
      decision_status: resolution.decision_status,
      canonical_organizations: resolution.canonical_organizations,
      canonical_ror_ids: resolution.canonical_ror_ids,
      country_codes: resolution.country_codes,
      country_names: resolution.country_names,
      evidence_kind: resolution.evidence_kind,
      evidence_url: resolution.evidence_url,
      evidence_note: resolution.evidence_note
    };
  });
  const expected = new Set();
  for (const issue of issuesByKey.values()) {
    for (const author of authors.filter((entry) => entry.paper_uid === issue.paper_uid && entry.affiliation_raw === issue.raw_affiliation)) {
      expected.add(`${issue.paper_uid}\u0000${author.author_name_raw}\u0000${issue.segment_raw}`);
    }
  }
  const missing = [...expected].filter((key) => !seen.has(key));
  const unexpected = [...seen].filter((key) => !expected.has(key));
  if (missing.length || unexpected.length) throw new Error(`Author-context resolution coverage mismatch: ${missing.length} missing, ${unexpected.length} unexpected`);
  await writeCsvAtomically(path.join(dataRoot, 'normalized/author_affiliation_contextual_inferences.csv'), output, OUTPUT_COLUMNS);
  const report = {
    schema_version: 1,
    author_context_rows: output.length,
    by_decision_status: Object.fromEntries([...new Set(output.map((row) => row.decision_status))].sort().map((status) => [status, output.filter((row) => row.decision_status === status).length])),
    resolved_named_organization_rows: output.filter((row) => RESOLVED_STATUSES.has(row.decision_status)).length,
    no_assignment_rows: output.filter((row) => NO_ASSIGNMENT_STATUSES.has(row.decision_status)).length
  };
  await writeTextAtomically(path.join(dataRoot, 'normalized/author_affiliation_contextual_inference_report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
