import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv, writeCsvAtomically, writeTextAtomically } from './csv.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(HERE, '../../../../data/eccv26');
const GENERIC_TOKENS = new Set(['and', 'center', 'centre', 'college', 'department', 'for', 'in', 'institute', 'laboratory', 'lab', 'of', 'research', 'school', 'the', 'university']);
const NON_INSTITUTION = /^(?:independent researcher|unaffiliated|none|not applicable|unknown|n a)$/iu;
const MAX_TOKEN_FUZZY_KEYS = 250;
const MAX_TOKEN_FUZZY_ROWS = 500;
const OUTPUT_COLUMNS = ['input_status', 'triage_queue', 'comparison_key', 'raw_affiliation_examples', 'segment_examples', 'raw_variant_count', 'author_record_weight', 'paper_weight', 'candidate_method', 'best_candidate_score', 'candidate_ror_ids', 'candidate_display_names', 'candidate_countries', 'candidate_name_types', 'review_reason', 'suggested_action'];

function compactKey(value) { return String(value ?? '').replace(/\s+/gu, ''); }
function tokens(value) { return String(value ?? '').split(' ').filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token)); }

function levenshtein(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(current[rightIndex - 1] + 1, previous[rightIndex] + 1, previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[right.length];
}

function similarity(left, right) {
  const edit = 1 - levenshtein(left, right) / Math.max(left.length, right.length, 1);
  const leftTokens = new Set(tokens(left));
  const rightTokens = new Set(tokens(right));
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return Math.max(edit, (edit + (union ? intersection / union : 0)) / 2);
}

export function rankRorCandidates(comparisonKey, rows) {
  const byRor = new Map();
  for (const row of rows) {
    const score = similarity(comparisonKey, row.comparison_key);
    const current = byRor.get(row.ror_id);
    if (!current || score > current.score) byRor.set(row.ror_id, { ...row, score });
  }
  return [...byRor.values()].sort((left, right) => right.score - left.score || left.ror_id.localeCompare(right.ror_id)).slice(0, 3);
}

function isNonInstitution(text) { return NON_INSTITUTION.test(String(text ?? '').trim()); }

export function classifyQueue({ sourceStatus, bestMethod, bestScore, text }) {
  if (sourceStatus === 'source_missing') return 'source_missing_affiliation';
  if (sourceStatus === 'exact_ambiguous') return 'context_or_evidence_review';
  if (isNonInstitution(text)) return 'not_institution_review';
  if (bestMethod === 'compact_key' || bestScore >= 0.93) return 'alias_review';
  return 'paper_pdf_review';
}

export function buildRorLookup(rorRows) {
  const byKey = new Map();
  for (const row of rorRows) {
    const rows = byKey.get(row.comparison_key) ?? [];
    rows.push(row);
    byKey.set(row.comparison_key, rows);
  }
  const byCompact = new Map();
  const tokenIndex = new Map();
  for (const key of byKey.keys()) {
    const compact = compactKey(key);
    const compactRows = byCompact.get(compact) ?? [];
    compactRows.push(key);
    byCompact.set(compact, compactRows);
    for (const token of tokens(key)) {
      const keys = tokenIndex.get(token) ?? [];
      keys.push(key);
      tokenIndex.set(token, keys);
    }
  }
  return { byKey, byCompact, tokenIndex };
}

export function nearbyRows(key, lookup) {
  const compactMatches = lookup.byCompact.get(compactKey(key)) ?? [];
  if (compactMatches.length) return { method: 'compact_key', rows: compactMatches.flatMap((match) => lookup.byKey.get(match) ?? []) };
  const keyTokens = tokens(key).map((token) => [token, lookup.tokenIndex.get(token) ?? []]).filter(([, matches]) => matches.length && matches.length <= 5000).sort((left, right) => left[1].length - right[1].length).slice(0, 3);
  const overlaps = new Map();
  for (const [, matches] of keyTokens) for (const match of matches) overlaps.set(match, (overlaps.get(match) ?? 0) + 1);
  const rankedKeys = [...overlaps.entries()]
    .sort(([leftKey, leftOverlap], [rightKey, rightOverlap]) => rightOverlap - leftOverlap || Math.abs(leftKey.length - key.length) - Math.abs(rightKey.length - key.length) || leftKey.localeCompare(rightKey))
    .slice(0, MAX_TOKEN_FUZZY_KEYS)
    .map(([match]) => match);
  const rows = rankedKeys.flatMap((match) => lookup.byKey.get(match) ?? []).slice(0, MAX_TOKEN_FUZZY_ROWS);
  return { method: rankedKeys.length ? 'token_fuzzy' : '', rows };
}

function addGroupedRow(groups, row) {
  const group = groups.get(row.comparison_key) ?? { comparisonKey: row.comparison_key, raw: new Set(), segments: new Set(), authorWeight: 0, paperWeight: 0, statuses: new Set(), candidates: [] };
  group.raw.add(row.raw_affiliation);
  group.segments.add(row.segment_raw);
  group.authorWeight += Number(row.author_record_count);
  group.paperWeight += Number(row.paper_count);
  group.statuses.add(row.match_status);
  if (row.match_status === 'exact_ambiguous') group.candidates.push(...String(row.ror_ids).split(';').map((rorId, index) => ({ ror_id: rorId, ror_display_name: String(row.ror_display_names).split(';')[index] ?? '', country_code: String(row.ror_country_codes).split(';')[index] ?? '', country_name: String(row.ror_country_names).split(';')[index] ?? '', name_type: String(row.ror_name_types), score: 1 })));
  groups.set(row.comparison_key, group);
}

function joinCandidates(candidates, field) { return candidates.map((candidate) => candidate[field]).filter(Boolean).filter((value, index, values) => values.indexOf(value) === index).join(' || '); }

function triageRow(group, lookup) {
  const sourceStatus = group.statuses.has('exact_ambiguous') ? 'exact_ambiguous' : 'unresolved';
  let candidates = group.candidates;
  let method = sourceStatus === 'exact_ambiguous' ? 'exact_key_collision' : '';
  if (sourceStatus === 'unresolved') {
    const nearby = nearbyRows(group.comparisonKey, lookup);
    method = nearby.method;
    candidates = rankRorCandidates(group.comparisonKey, nearby.rows);
  }
  const bestScore = candidates[0]?.score ?? 0;
  const sample = [...group.segments][0] ?? '';
  const queue = classifyQueue({ sourceStatus, bestMethod: method, bestScore, text: sample });
  const reason = sourceStatus === 'exact_ambiguous' ? 'Multiple active ROR organizations share this exact comparison key.' : queue === 'not_institution_review' ? 'The raw segment looks explicitly non-institutional.' : candidates.length ? 'Candidate similarity is for review only; source text did not exact-match ROR.' : 'No locally generated ROR candidate passed the token gate.';
  const action = queue === 'alias_review' ? 'Verify an alias or typo against a primary institution source, then add a versioned alias decision.' : queue === 'context_or_evidence_review' ? 'Resolve from paper-level affiliation context; use the PDF or an official source if context is insufficient.' : queue === 'not_institution_review' ? 'Confirm no institution is asserted, then mark not_an_institution.' : 'Check the paper PDF, project page, ORCID, or official institutional profile.';
  return { input_status: sourceStatus, triage_queue: queue, comparison_key: group.comparisonKey, raw_affiliation_examples: [...group.raw].slice(0, 3).join(' || '), segment_examples: [...group.segments].slice(0, 3).join(' || '), raw_variant_count: group.raw.size, author_record_weight: group.authorWeight, paper_weight: group.paperWeight, candidate_method: method, best_candidate_score: bestScore ? bestScore.toFixed(3) : '', candidate_ror_ids: joinCandidates(candidates, 'ror_id'), candidate_display_names: joinCandidates(candidates, 'ror_display_name'), candidate_countries: joinCandidates(candidates, 'country_name'), candidate_name_types: joinCandidates(candidates, 'name_type'), review_reason: reason, suggested_action: action };
}

async function main() {
  const dataRoot = process.argv[2] === '--data-root' ? path.resolve(process.argv[3]) : DEFAULT_DATA_ROOT;
  if (process.argv.length > 2 && process.argv[2] !== '--data-root') throw new Error('Usage: node build_resolution_triage.mjs [--data-root DIR]');
  const parsedDir = path.join(dataRoot, 'parsed');
  const normalizedDir = path.join(dataRoot, 'normalized');
  const [matches, rorRows, authors] = await Promise.all([
    fs.readFile(path.join(normalizedDir, 'affiliation_exact_match_candidates.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(normalizedDir, 'ror_name_index.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(parsedDir, 'author_affiliations_raw.csv'), 'utf8').then(parseCsv)
  ]);
  const groups = new Map();
  for (const row of matches) if (row.match_status === 'unresolved' || row.match_status === 'exact_ambiguous') addGroupedRow(groups, row);
  const lookup = buildRorLookup(rorRows);
  const rows = [...groups.values()].map((group) => triageRow(group, lookup));
  const missing = authors.filter((author) => !String(author.affiliation_raw).trim());
  if (missing.length) rows.push({ input_status: 'source_missing', triage_queue: 'source_missing_affiliation', comparison_key: '', raw_affiliation_examples: '', segment_examples: '', raw_variant_count: 1, author_record_weight: missing.length, paper_weight: new Set(missing.map((author) => author.paper_uid)).size, candidate_method: '', best_candidate_score: '', candidate_ror_ids: '', candidate_display_names: '', candidate_countries: '', candidate_name_types: '', review_reason: 'ECVA has no affiliation text for these author records.', suggested_action: 'Check the paper PDF or an official author/institutional profile.' });
  rows.sort((left, right) => left.triage_queue.localeCompare(right.triage_queue) || Number(right.paper_weight) - Number(left.paper_weight) || left.comparison_key.localeCompare(right.comparison_key));
  await writeCsvAtomically(path.join(normalizedDir, 'resolution_triage.csv'), rows, OUTPUT_COLUMNS);
  const queueCounts = Object.fromEntries([...new Set(rows.map((row) => row.triage_queue))].sort().map((queue) => [queue, rows.filter((row) => row.triage_queue === queue).length]));
  const report = { schema_version: 1, triage_groups: rows.length, queue_counts: queueCounts, input_weights: { unresolved_segments: matches.filter((row) => row.match_status === 'unresolved').length, exact_ambiguous_segments: matches.filter((row) => row.match_status === 'exact_ambiguous').length, source_missing_author_records: missing.length } };
  await writeTextAtomically(path.join(normalizedDir, 'resolution_triage_report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
