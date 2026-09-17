import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv, writeCsvAtomically, writeTextAtomically } from './csv.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(HERE, '../../../../data/eccv26');
const DEFAULT_LIMIT = 25;
const OUTPUT_COLUMNS = ['review_id', 'priority', 'raw_affiliation', 'target_affiliation_segment', 'paper_weight', 'author_record_weight', 'proposal_type', 'proposed_canonical_organization', 'proposed_ror_id', 'proposed_country', 'candidate_organizations', 'candidate_method', 'candidate_score', 'evidence_status', 'evidence_url', 'evidence_note', 'review_action'];

function split(value) { return String(value ?? '').split(' || ').map((item) => item.trim()).filter(Boolean); }
function queueRank(queue) { return queue === 'alias_review' ? 0 : queue === 'context_or_evidence_review' ? 1 : 2; }

function candidateSummary(row) {
  const names = split(row.candidate_display_names);
  const rorIds = split(row.candidate_ror_ids);
  const countries = split(row.candidate_countries);
  return names.map((name, index) => `${name} [${countries[index] ?? 'country unknown'}] — ${rorIds[index] ?? 'ROR ID unavailable'}`).join(' || ');
}

export function buildDecisionRows(triageRows, limit = DEFAULT_LIMIT) {
  const selected = triageRows.filter((row) => row.triage_queue === 'alias_review' || row.triage_queue === 'context_or_evidence_review')
    .sort((left, right) => queueRank(left.triage_queue) - queueRank(right.triage_queue) || Number(right.paper_weight) - Number(left.paper_weight) || left.raw_affiliation_examples.localeCompare(right.raw_affiliation_examples))
    .slice(0, limit);
  return selected.map((row, index) => {
    const isAlias = row.triage_queue === 'alias_review';
    const names = split(row.candidate_display_names);
    const rorIds = split(row.candidate_ror_ids);
    const countries = split(row.candidate_countries);
    return {
      review_id: `ECCV26-${String(index + 1).padStart(4, '0')}`,
      priority: String(index + 1), raw_affiliation: row.raw_affiliation_examples, target_affiliation_segment: row.segment_examples,
      paper_weight: row.paper_weight, author_record_weight: row.author_record_weight,
      proposal_type: isAlias ? 'alias_candidate' : 'context_collision',
      proposed_canonical_organization: isAlias ? names[0] ?? '' : '',
      proposed_ror_id: isAlias ? rorIds[0] ?? '' : '',
      proposed_country: isAlias ? countries[0] ?? '' : '',
      candidate_organizations: candidateSummary(row), candidate_method: row.candidate_method,
      candidate_score: row.best_candidate_score, evidence_status: 'pending_primary_source',
      evidence_url: '', evidence_note: 'ROR candidate and string comparison identify a proposal, but do not yet prove the source affiliation mapping.',
      review_action: isAlias ? 'Verify with an official institution source, then approve or reject this alias proposal.' : 'Resolve from paper context and a primary source; do not select a ROR candidate by list order.'
    };
  });
}

function parseArgs(argv) {
  if (!argv.length) return { dataRoot: DEFAULT_DATA_ROOT, limit: DEFAULT_LIMIT };
  if (argv.length === 2 && argv[0] === '--limit' && Number.isInteger(Number(argv[1])) && Number(argv[1]) > 0) return { dataRoot: DEFAULT_DATA_ROOT, limit: Number(argv[1]) };
  if (argv.length === 2 && argv[0] === '--data-root') return { dataRoot: path.resolve(argv[1]), limit: DEFAULT_LIMIT };
  if (argv.length === 4 && argv[0] === '--data-root' && argv[2] === '--limit' && Number.isInteger(Number(argv[3])) && Number(argv[3]) > 0) return { dataRoot: path.resolve(argv[1]), limit: Number(argv[3]) };
  throw new Error('Usage: node build_decision_review_queue.mjs [--data-root DIR] [--limit N]');
}

async function main() {
  const { dataRoot, limit } = parseArgs(process.argv.slice(2));
  const normalizedDir = path.join(dataRoot, 'normalized');
  const triage = parseCsv(await fs.readFile(path.join(normalizedDir, 'resolution_triage.csv'), 'utf8'));
  const rows = buildDecisionRows(triage, limit);
  await writeCsvAtomically(path.join(normalizedDir, 'manual_decision_review_queue.csv'), rows, OUTPUT_COLUMNS);
  const report = { schema_version: 1, limit_requested: limit, rows_emitted: rows.length, queue_counts: Object.fromEntries([...new Set(rows.map((row) => row.proposal_type))].map((type) => [type, rows.filter((row) => row.proposal_type === type).length])) };
  await writeTextAtomically(path.join(normalizedDir, 'manual_decision_review_queue_report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
