import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXPECTED_CANDIDATE_COUNT = 271;
export const EXPECTED_PAPER_COUNT = 277;
export const CUTOFF_DATE = '2026-03-05';
export const SCHOLAR_HOST = 'scholar.google.com';
export const ALLOWED_VENUES = Object.freeze([
  'CVPR', 'ICCV', 'ECCV', 'NeurIPS', 'ICLR', 'ICML', 'SIGGRAPH',
  'SIGGRAPH Asia', 'IROS', 'ICRA', 'RA-L'
]);
export const CONTRIBUTION_TYPES = Object.freeze([
  'first_listed_unmarked',
  'explicit_equal_contribution_first',
  'contribution_marker_unknown'
]);

const ALLOWED_WORK_TYPES = new Set(['main_conference_full_paper', 'journal_article']);
const CONTRIBUTION_MARKERS = new Set(['explicit_equal', 'no_marker', 'bare_glyph', 'unavailable']);

export class ScholarValidationError extends Error {
  constructor(issues) {
    super(`Scholar output validation failed with ${issues.length} issue(s)`);
    this.name = 'ScholarValidationError';
    this.issues = Object.freeze([...issues]);
  }
}

function issue(issues, scope, message) {
  issues.push(`${scope}: ${message}`);
}

function value(row, key) {
  return typeof row?.[key] === 'string' ? row[key].trim() : '';
}

function splitList(raw) {
  return raw.split(';').map((item) => item.trim()).filter(Boolean);
}

function integer(raw) {
  return /^\d+$/.test(raw) ? Number(raw) : null;
}

function assertScholarUrls(row, scope, issues) {
  for (const [field, raw] of Object.entries(row)) {
    const text = String(raw ?? '');
    const urls = text.match(/https?:\/\/[^\s,;"')]+/g) ?? [];
    for (const rawUrl of urls) {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== SCHOLAR_HOST) {
          issue(issues, `${scope}.${field}`, `non-Scholar URL ${rawUrl}`);
        }
      } catch {
        issue(issues, `${scope}.${field}`, `malformed URL ${rawUrl}`);
      }
    }
  }
}

function requiredScholarUrl(raw, scope, issues) {
  if (!raw) {
    issue(issues, scope, 'required Scholar URL is empty');
    return;
  }
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'https:' || parsed.hostname.toLowerCase() !== SCHOLAR_HOST) {
      issue(issues, scope, 'URL must use https://scholar.google.com');
    }
  } catch {
    issue(issues, scope, 'URL is malformed');
  }
}

function publicationDateKey(raw) {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T.*)?$/.exec(raw);
  if (!match) return null;
  const month = Number(match[2] ?? '01');
  const day = Number(match[3] ?? '01');
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(Number(match[1]), month - 1, day));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (raw.includes('T') && Number.isNaN(Date.parse(raw))) return null;
  return `${match[1]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function contributionTypeFor(marker) {
  if (marker === 'explicit_equal') return 'explicit_equal_contribution_first';
  if (marker === 'no_marker') return 'first_listed_unmarked';
  return 'contribution_marker_unknown';
}

export function classifyScholarWork(work) {
  const venue = value(work, 'venue');
  const workType = value(work, 'work_type');
  const authorPosition = value(work, 'author_position');
  const marker = value(work, 'contribution_marker_status');
  const publicationDate = publicationDateKey(value(work, 'publication_date'));
  if (!ALLOWED_VENUES.includes(venue)) return { eligible: false, reason: 'venue_out_of_scope' };
  if (!ALLOWED_WORK_TYPES.has(workType) || (venue !== 'RA-L' && workType !== 'main_conference_full_paper')) {
    return { eligible: false, reason: 'work_type_out_of_scope' };
  }
  if (authorPosition !== 'first') return { eligible: false, reason: 'not_first_listed' };
  if (!publicationDate) return { eligible: false, reason: 'invalid_publication_date' };
  if (publicationDate > CUTOFF_DATE) return { eligible: false, reason: 'post_cutoff' };
  if (!CONTRIBUTION_MARKERS.has(marker)) return { eligible: false, reason: 'invalid_contribution_marker_status' };
  return { eligible: true, contributionType: contributionTypeFor(marker) };
}

function baselineMap(rows, expectedCount, issues) {
  const map = new Map();
  for (const [index, row] of rows.entries()) {
    const key = value(row, 'candidate_identity_key');
    if (!key) issue(issues, `baseline.candidate[${index}]`, 'candidate_identity_key is empty');
    if (map.has(key)) issue(issues, `baseline.candidate[${index}]`, `duplicate key ${key}`);
    map.set(key, row);
  }
  if (map.size !== expectedCount) issue(issues, 'baseline.candidate', `expected ${expectedCount} unique rows, found ${map.size}`);
  return map;
}

function validateBaselinePapers(rows, expectedCount, issues) {
  const ids = new Set();
  for (const [index, row] of rows.entries()) {
    const id = value(row, 'virtual_poster_id');
    if (!id) issue(issues, `baseline.paper[${index}]`, 'virtual_poster_id is empty');
    if (ids.has(id)) issue(issues, `baseline.paper[${index}]`, `duplicate virtual_poster_id ${id}`);
    ids.add(id);
  }
  if (ids.size !== expectedCount) issue(issues, 'baseline.paper', `expected ${expectedCount} unique papers, found ${ids.size}`);
  return ids;
}

function validateCandidates(rows, baseline, expectedPaperCount, issues) {
  const seen = new Set();
  let selectedPaperTotal = 0;
  for (const [index, row] of rows.entries()) {
    const scope = `candidate[${index}]`;
    const key = value(row, 'candidate_identity_key');
    const expected = baseline.get(key);
    if (!key || seen.has(key)) issue(issues, scope, !key ? 'candidate_identity_key is empty' : `duplicate key ${key}`);
    seen.add(key);
    if (!expected) issue(issues, scope, `key ${key} is absent from immutable baseline`);
    assertScholarUrls(row, scope, issues);
    if (value(row, 'source_policy') !== 'google_scholar_only') issue(issues, `${scope}.source_policy`, 'must be google_scholar_only');
    if (expected) {
      for (const field of ['eccv_first_author_name', 'eccv_first_author_affiliation_raw', 'eccv_selected_paper_count', 'eccv_virtual_poster_ids', 'eccv_titles']) {
        if (value(row, field) !== value(expected, field)) issue(issues, `${scope}.${field}`, 'differs from immutable baseline');
      }
    }
    const status = value(row, 'scholar_status');
    if (status !== 'matched' && status !== 'unknown') issue(issues, scope, 'scholar_status must be matched or unknown');
    const countFields = ['eligible_prior_work_count', ...CONTRIBUTION_TYPES.map((type) => `${type}_count`)];
    if (status === 'unknown') {
      if (value(row, 'scholar_profile_url') || value(row, 'scholar_identity_evidence_url')) issue(issues, scope, 'unknown row cannot contain a profile/evidence URL');
      if (!value(row, 'unknown_reason')) issue(issues, scope, 'unknown row requires unknown_reason');
      requiredScholarUrl(value(row, 'scholar_search_url'), `${scope}.scholar_search_url`, issues);
      for (const field of countFields) if (value(row, field)) issue(issues, `${scope}.${field}`, 'unknown counts must be empty, not zero');
    }
    if (status === 'matched') {
      requiredScholarUrl(value(row, 'scholar_profile_url'), `${scope}.scholar_profile_url`, issues);
      if (value(row, 'unknown_reason')) issue(issues, scope, 'matched row cannot contain unknown_reason');
      for (const field of countFields) {
        const count = integer(value(row, field));
        if (count === null) issue(issues, `${scope}.${field}`, 'matched count must be a non-negative integer');
      }
    }
    selectedPaperTotal += integer(value(row, 'eccv_selected_paper_count')) ?? 0;
  }
  const baselineKeys = new Set(baseline.keys());
  for (const key of baselineKeys) if (!seen.has(key)) issue(issues, 'candidate', `missing baseline key ${key}`);
  if (selectedPaperTotal !== expectedPaperCount) issue(issues, 'candidate', `selected paper total must be ${expectedPaperCount}, found ${selectedPaperTotal}`);
}

function validateWorks(rows, candidates, issues) {
  const seen = new Set();
  const grouped = new Map();
  for (const [index, row] of rows.entries()) {
    const scope = `work[${index}]`;
    const key = value(row, 'candidate_identity_key');
    const workId = value(row, 'work_id');
    if (!candidates.has(key)) issue(issues, scope, `candidate key ${key} is missing or unknown`);
    if (!workId || seen.has(workId)) issue(issues, scope, !workId ? 'work_id is empty' : `duplicate work_id ${workId}`);
    seen.add(workId);
    assertScholarUrls(row, scope, issues);
    requiredScholarUrl(value(row, 'scholar_work_url'), `${scope}.scholar_work_url`, issues);
    if (value(row, 'source_policy') !== 'google_scholar_only') issue(issues, `${scope}.source_policy`, 'must be google_scholar_only');
    const classification = classifyScholarWork(row);
    const marker = value(row, 'contribution_marker_status');
    if (!classification.eligible) issue(issues, scope, `ineligible work: ${classification.reason}`);
    if (!CONTRIBUTION_TYPES.includes(value(row, 'contribution_type'))) issue(issues, scope, 'invalid contribution_type');
    if (classification.eligible && value(row, 'contribution_type') !== classification.contributionType) issue(issues, scope, 'contribution_type disagrees with Scholar marker status');
    const markerText = value(row, 'scholar_marker_text');
    if (marker === 'explicit_equal' && !/(equal contribution|contributed equally|co[- ]first author)/i.test(markerText)) issue(issues, `${scope}.scholar_marker_text`, 'explicit equality requires a literal Scholar equality phrase');
    if (marker === 'no_marker' && markerText) issue(issues, `${scope}.scholar_marker_text`, 'no_marker rows must have empty marker text');
    if (marker === 'bare_glyph' && !markerText) issue(issues, `${scope}.scholar_marker_text`, 'bare_glyph rows must preserve the visible glyph');
    if (value(row, 'contribution_type') === 'explicit_equal_contribution_first') requiredScholarUrl(value(row, 'scholar_marker_url'), `${scope}.scholar_marker_url`, issues);
    if (value(row, 'contribution_type') !== 'explicit_equal_contribution_first' && value(row, 'scholar_marker_url')) issue(issues, `${scope}.scholar_marker_url`, 'only explicit equality may have marker evidence');
    const prior = grouped.get(key) ?? [];
    prior.push(value(row, 'contribution_type'));
    grouped.set(key, prior);
  }
  return grouped;
}

function validateCounts(candidates, worksByCandidate, issues) {
  for (const [key, row] of candidates.entries()) {
    const workTypes = worksByCandidate.get(key) ?? [];
    if (value(row, 'scholar_status') === 'unknown' && workTypes.length > 0) issue(issues, `candidate.${key}`, 'unknown candidate cannot have work evidence');
    const expectedCounts = Object.fromEntries(CONTRIBUTION_TYPES.map((type) => [type, workTypes.filter((item) => item === type).length]));
    for (const type of CONTRIBUTION_TYPES) {
      const actual = value(row, `${type}_count`);
      if (value(row, 'scholar_status') === 'matched' && actual !== String(expectedCounts[type])) issue(issues, `candidate.${key}.${type}_count`, `expected ${expectedCounts[type]}, found ${actual}`);
    }
    if (value(row, 'scholar_status') === 'matched') {
      const total = integer(value(row, 'eligible_prior_work_count'));
      if (total !== workTypes.length) issue(issues, `candidate.${key}.eligible_prior_work_count`, `expected ${workTypes.length}, found ${value(row, 'eligible_prior_work_count')}`);
    }
  }
}

export function validateScholarDataset({ candidates, works, baselineCandidates, baselinePapers, expectedCandidateCount = EXPECTED_CANDIDATE_COUNT, expectedPaperCount = EXPECTED_PAPER_COUNT }) {
  const issues = [];
  const baseline = baselineMap(baselineCandidates, expectedCandidateCount, issues);
  const baselinePaperIds = validateBaselinePapers(baselinePapers, expectedPaperCount, issues);
  validateCandidates(candidates, baseline, expectedPaperCount, issues);
  const joinedPaperIds = new Set(candidates.flatMap((row) => splitList(value(row, 'eccv_virtual_poster_ids'))));
  if (joinedPaperIds.size !== baselinePaperIds.size || [...baselinePaperIds].some((id) => !joinedPaperIds.has(id))) {
    issue(issues, 'baseline.join', 'candidate poster-ID union differs from immutable baseline paper IDs');
  }
  const candidateMap = new Map(candidates.map((row) => [value(row, 'candidate_identity_key'), row]));
  const worksByCandidate = validateWorks(works, candidateMap, issues);
  validateCounts(candidateMap, worksByCandidate, issues);
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

export function assertValidScholarDataset(input) {
  const result = validateScholarDataset(input);
  if (!result.ok) throw new ScholarValidationError(result.issues);
  return result;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted && char === '"' && text[index + 1] === '"') { field += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === ',') { row.push(field); field = ''; continue; }
    if (!quoted && (char === '\n' || char === '\r')) {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field); field = '';
      if (row.some((item) => item !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const headers = rows.shift() ?? [];
  return rows.map((items) => Object.fromEntries(headers.map((header, index) => [header, items[index] ?? ''])));
}

export async function readCsv(path) {
  return parseCsv(await fs.readFile(path, 'utf8'));
}

async function main() {
  const [candidatePath, workPath, baselineCandidatePath, baselinePaperPath] = process.argv.slice(2);
  if (!candidatePath || !workPath || !baselineCandidatePath || !baselinePaperPath) {
    throw new Error('Usage: node eccv_scholar_validator.mjs CANDIDATES.csv WORKS.csv BASELINE_CANDIDATES.csv BASELINE_PAPERS.csv');
  }
  const result = assertValidScholarDataset({
    candidates: await readCsv(candidatePath),
    works: await readCsv(workPath),
    baselineCandidates: await readCsv(baselineCandidatePath),
    baselinePapers: await readCsv(baselinePaperPath)
  });
  console.log(JSON.stringify({ ok: result.ok, candidate_count: EXPECTED_CANDIDATE_COUNT, paper_count: EXPECTED_PAPER_COUNT }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    if (error instanceof ScholarValidationError) {
      console.error(JSON.stringify({ ok: false, issues: error.issues }, null, 2));
    } else if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error('unknown validation failure');
    }
    process.exitCode = 1;
  });
}
