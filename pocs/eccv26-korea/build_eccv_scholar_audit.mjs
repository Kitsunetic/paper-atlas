import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  EXPECTED_CANDIDATE_COUNT,
  EXPECTED_PAPER_COUNT,
  parseCsv,
  validateScholarDataset
} from './eccv_scholar_validator.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SHARD_IDS = Object.freeze(Array.from({ length: 8 }, (_, index) => `shard-${String(index + 1).padStart(2, '0')}`));
const CANDIDATE_COLUMNS = Object.freeze([
  'candidate_identity_key', 'eccv_first_author_name',
  'eccv_first_author_affiliation_raw', 'eccv_selected_paper_count',
  'eccv_virtual_poster_ids', 'eccv_titles', 'source_policy',
  'scholar_status', 'scholar_profile_url', 'scholar_search_url',
  'scholar_identity_evidence_url', 'unknown_reason',
  'eligible_prior_work_count', 'first_listed_unmarked_count',
  'explicit_equal_contribution_first_count', 'contribution_marker_unknown_count'
]);
const WORK_COLUMNS = Object.freeze([
  'candidate_identity_key', 'work_id', 'title', 'venue', 'publication_date',
  'work_type', 'author_position', 'contribution_marker_status',
  'contribution_type', 'scholar_marker_text', 'scholar_work_url',
  'scholar_marker_url', 'source_policy'
]);
const IMMUTABLE_CANDIDATE_FIELDS = Object.freeze([
  'candidate_identity_key', 'eccv_first_author_name',
  'eccv_first_author_affiliation_raw', 'eccv_selected_paper_count',
  'eccv_virtual_poster_ids', 'eccv_titles'
]);

export class ScholarMergeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ScholarMergeError';
  }
}

function usage() {
  return [
    'Usage: node build_eccv_scholar_audit.mjs [options]',
    '',
    '  --shard-dir DIR             directory containing shard-01..shard-08/',
    '  --baseline-candidates CSV   immutable 271-row candidate baseline',
    '  --baseline-papers CSV       immutable 277-row paper baseline',
    '  --output-dir DIR            destination for the two new product CSVs'
  ].join('\n');
}

function parseArgs(argv) {
  const args = {
    shardDir: path.join(HERE, 'scholar-shards'),
    baselineCandidates: path.join(HERE, 'eccv_2026_first_author_identity_review_queue.csv'),
    baselinePapers: path.join(HERE, 'eccv_2026_first_author_top_tier_audit.csv'),
    outputDir: HERE
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { help: true, ...args };
    const key = {
      '--shard-dir': 'shardDir',
      '--baseline-candidates': 'baselineCandidates',
      '--baseline-papers': 'baselinePapers',
      '--output-dir': 'outputDir'
    }[flag];
    if (!key || !argv[index + 1]) throw new ScholarMergeError(`Unknown or incomplete option: ${flag}`);
    args[key] = path.resolve(argv[index + 1]);
    index += 1;
  }
  return args;
}

async function readRows(filePath) {
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new ScholarMergeError(`Cannot read ${filePath}: ${error.message}`);
  }
  const rows = parseCsv(text);
  if (rows.length === 0) {
    const firstLine = text.split(/\r?\n/u).find((line) => line.trim() !== '') ?? '';
    if (!firstLine) throw new ScholarMergeError(`CSV has no header/data rows: ${filePath}`);
    rows.headers = firstLine.split(',').map((header) => header.trim());
  } else {
    rows.headers = Object.keys(rows[0]);
  }
  return rows;
}

function requireColumns(rows, columns, filePath) {
  const headers = new Set(rows.headers ?? Object.keys(rows[0] ?? {}));
  const missing = columns.filter((column) => !headers.has(column));
  if (missing.length > 0) throw new ScholarMergeError(`${filePath}: missing required columns ${missing.join(', ')}`);
}

function project(row, columns) {
  return Object.fromEntries(columns.map((column) => [column, row[column] ?? '']));
}

async function readShards(shardDir) {
  const candidates = [];
  const works = [];
  for (const shardId of SHARD_IDS) {
    const directory = path.join(shardDir, shardId);
    const candidatePath = path.join(directory, 'candidates.csv');
    const workPath = path.join(directory, 'works.csv');
    let candidateRows = await readRows(candidatePath);
    let workRows = await readRows(workPath);
    requireColumns(candidateRows, CANDIDATE_COLUMNS, candidatePath);
    requireColumns(workRows, WORK_COLUMNS, workPath);
    candidates.push(...candidateRows.map((row) => project(row, CANDIDATE_COLUMNS)));
    works.push(...workRows.map((row) => project(row, WORK_COLUMNS)));
  }
  return { candidates, works };
}

function deduplicateRows(rows, field, kind) {
  const seen = new Map();
  for (const [index, row] of rows.entries()) {
    const id = String(row[field] ?? '').trim();
    if (!id) throw new ScholarMergeError(`${kind}[${index}] has an empty ${field}`);
    if (seen.has(id)) {
      throw new ScholarMergeError(`duplicate ${kind} ${field} ${id} (rows ${seen.get(id)} and ${index}); refusing merge`);
    }
    seen.set(id, index);
  }
  return rows;
}

function assertImmutableFields(candidates, baselineCandidates) {
  const baseline = new Map(baselineCandidates.map((row) => [row.candidate_identity_key, row]));
  for (const [index, row] of candidates.entries()) {
    const expected = baseline.get(row.candidate_identity_key);
    if (!expected) continue;
    for (const field of IMMUTABLE_CANDIDATE_FIELDS) {
      if ((row[field] ?? '') !== (expected[field] ?? '')) {
        throw new ScholarMergeError(`candidate[${index}].${field} differs byte-for-byte from immutable baseline`);
      }
    }
  }
}

function sortRows(rows, kind) {
  const sorted = [...rows];
  sorted.sort((left, right) => {
    const candidateOrder = String(left.candidate_identity_key).localeCompare(String(right.candidate_identity_key));
    if (candidateOrder !== 0) return candidateOrder;
    if (kind === 'candidate') return 0;
    for (const field of ['publication_date', 'venue', 'title', 'work_id']) {
      const order = String(left[field]).localeCompare(String(right[field]));
      if (order !== 0) return order;
    }
    return 0;
  });
  return sorted;
}

function csvCell(raw) {
  const value = String(raw ?? '');
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function serialize(rows, columns) {
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

async function writeAtomically(filePath, text) {
  const temporary = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(temporary, text, 'utf8');
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw new ScholarMergeError(`Atomic write failed for ${filePath}: ${error.message}`);
  }
}

export async function mergeScholarShards({ shardDir, baselineCandidatesPath, baselinePapersPath, outputDir }) {
  const baselineCandidates = await readRows(baselineCandidatesPath);
  const baselinePapers = await readRows(baselinePapersPath);
  if (baselineCandidates.length !== EXPECTED_CANDIDATE_COUNT) {
    throw new ScholarMergeError(`immutable candidate baseline must have ${EXPECTED_CANDIDATE_COUNT} rows, found ${baselineCandidates.length}`);
  }
  if (baselinePapers.length !== EXPECTED_PAPER_COUNT) {
    throw new ScholarMergeError(`immutable paper baseline must have ${EXPECTED_PAPER_COUNT} rows, found ${baselinePapers.length}`);
  }
  requireColumns(baselineCandidates, IMMUTABLE_CANDIDATE_FIELDS, baselineCandidatesPath);
  if (!(baselinePapers.headers ?? Object.keys(baselinePapers[0] ?? {})).includes('virtual_poster_id')) {
    throw new ScholarMergeError(`${baselinePapersPath}: missing required column virtual_poster_id`);
  }
  const { candidates: inputCandidates, works: inputWorks } = await readShards(shardDir);
  const uniqueCandidates = deduplicateRows(inputCandidates, 'candidate_identity_key', 'candidate');
  const uniqueWorks = deduplicateRows(inputWorks, 'work_id', 'work');
  assertImmutableFields(uniqueCandidates, baselineCandidates);
  const candidates = sortRows(uniqueCandidates, 'candidate');
  const works = sortRows(uniqueWorks, 'work');
  const validation = validateScholarDataset({
    candidates,
    works,
    baselineCandidates,
    baselinePapers,
    expectedCandidateCount: EXPECTED_CANDIDATE_COUNT,
    expectedPaperCount: EXPECTED_PAPER_COUNT
  });
  if (!validation.ok) throw new ScholarMergeError(`validator rejected merged dataset:\n${validation.issues.join('\n')}`);
  await fs.mkdir(outputDir, { recursive: true });
  const candidatePath = path.join(outputDir, 'eccv_2026_first_author_google_scholar_audit.csv');
  const workPath = path.join(outputDir, 'eccv_2026_first_author_google_scholar_works.csv');
  await writeAtomically(candidatePath, serialize(candidates, CANDIDATE_COLUMNS));
  await writeAtomically(workPath, serialize(works, WORK_COLUMNS));
  return { candidatePath, workPath, candidateCount: candidates.length, workCount: works.length };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return; }
  const result = await mergeScholarShards({
    shardDir: path.resolve(args.shardDir),
    baselineCandidatesPath: path.resolve(args.baselineCandidates),
    baselinePapersPath: path.resolve(args.baselinePapers),
    outputDir: path.resolve(args.outputDir)
  });
  console.log(JSON.stringify({ ok: true, ...result }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'unknown merge failure');
    process.exitCode = 1;
  });
}
