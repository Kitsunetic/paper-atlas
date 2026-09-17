import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseCsv } from './eccv_scholar_validator.mjs';
import { mergeScholarShards, ScholarMergeError } from './build_eccv_scholar_audit.mjs';

const SHARD_IDS = Array.from({ length: 8 }, (_, index) => `shard-${String(index + 1).padStart(2, '0')}`);
const CANDIDATE_COLUMNS = [
  'candidate_identity_key', 'eccv_first_author_name', 'eccv_first_author_affiliation_raw',
  'eccv_selected_paper_count', 'eccv_virtual_poster_ids', 'eccv_titles', 'source_policy',
  'scholar_status', 'scholar_profile_url', 'scholar_search_url', 'scholar_identity_evidence_url',
  'unknown_reason', 'eligible_prior_work_count', 'first_listed_unmarked_count',
  'explicit_equal_contribution_first_count', 'contribution_marker_unknown_count'
];
const WORK_COLUMNS = [
  'candidate_identity_key', 'work_id', 'title', 'venue', 'publication_date', 'work_type',
  'author_position', 'contribution_marker_status', 'contribution_type', 'scholar_marker_text',
  'scholar_work_url', 'scholar_marker_url', 'source_policy'
];
const BASELINE_CANDIDATE_COLUMNS = [
  'candidate_identity_key', 'eccv_first_author_name', 'eccv_first_author_affiliation_raw',
  'eccv_selected_paper_count', 'eccv_virtual_poster_ids', 'eccv_titles'
];

function csvCell(raw) {
  const value = String(raw ?? '');
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csv(rows, columns) {
  return `${columns.join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

function syntheticDataset() {
  const baselineCandidates = [];
  const baselinePapers = [];
  const candidates = [];
  const works = [];
  let paperNumber = 0;

  for (let index = 0; index < 271; index += 1) {
    const candidateIdentityKey = `candidate-${String(index).padStart(3, '0')}`;
    const paperCount = index < 6 ? 2 : 1;
    const posterIds = [];
    const titles = [];
    for (let offset = 0; offset < paperCount; offset += 1) {
      paperNumber += 1;
      const paperId = `paper-${String(paperNumber).padStart(3, '0')}`;
      const title = `Prior paper ${String(paperNumber).padStart(3, '0')}`;
      posterIds.push(paperId);
      titles.push(title);
      baselinePapers.push({ virtual_poster_id: paperId });
      works.push({
        candidate_identity_key: candidateIdentityKey,
        work_id: `work-${String(paperNumber).padStart(3, '0')}`,
        title,
        venue: 'CVPR',
        publication_date: '2020',
        work_type: 'main_conference_full_paper',
        author_position: 'first',
        contribution_marker_status: 'no_marker',
        contribution_type: 'first_listed_unmarked',
        scholar_marker_text: '',
        scholar_work_url: `https://scholar.google.com/scholar?cluster=${paperNumber}`,
        scholar_marker_url: '',
        source_policy: 'google_scholar_only'
      });
    }
    const baseline = {
      candidate_identity_key: candidateIdentityKey,
      eccv_first_author_name: `Author ${String(index).padStart(3, '0')}`,
      eccv_first_author_affiliation_raw: 'Test University',
      eccv_selected_paper_count: String(paperCount),
      eccv_virtual_poster_ids: posterIds.join(';'),
      eccv_titles: titles.join(';')
    };
    baselineCandidates.push(baseline);
    candidates.push({
      ...baseline,
      source_policy: 'google_scholar_only',
      scholar_status: 'matched',
      scholar_profile_url: `https://scholar.google.com/citations?user=${candidateIdentityKey}`,
      scholar_search_url: '',
      scholar_identity_evidence_url: `https://scholar.google.com/citations?user=${candidateIdentityKey}`,
      unknown_reason: '',
      eligible_prior_work_count: String(paperCount),
      first_listed_unmarked_count: String(paperCount),
      explicit_equal_contribution_first_count: '0',
      contribution_marker_unknown_count: '0'
    });
  }
  return { baselineCandidates, baselinePapers, candidates, works };
}

async function writeCase(root, input, { candidateRows = input.candidates, workRows = input.works } = {}) {
  const shardDir = path.join(root, 'shards');
  const outputDir = path.join(root, 'output');
  const baselineCandidatesPath = path.join(root, 'baseline-candidates.csv');
  const baselinePapersPath = path.join(root, 'baseline-papers.csv');
  await mkdir(outputDir, { recursive: true });
  await writeFile(baselineCandidatesPath, csv(input.baselineCandidates, BASELINE_CANDIDATE_COLUMNS));
  await writeFile(baselinePapersPath, csv(input.baselinePapers, ['virtual_poster_id']));
  for (const [shardIndex, shardId] of SHARD_IDS.entries()) {
    const directory = path.join(shardDir, shardId);
    await mkdir(directory, { recursive: true });
    await writeFile(directory + '/candidates.csv', csv(candidateRows.filter((_, index) => index % 8 === shardIndex), CANDIDATE_COLUMNS));
    await writeFile(directory + '/works.csv', csv(workRows.filter((_, index) => index % 8 === shardIndex), WORK_COLUMNS));
  }
  return { shardDir, baselineCandidatesPath, baselinePapersPath, outputDir };
}

async function withCase(callback, options) {
  const root = await mkdtemp(path.join(tmpdir(), 'eccv-scholar-builder-'));
  try {
    const input = syntheticDataset();
    const paths = await writeCase(root, input, options);
    await callback({ input, paths, root });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function merge(paths) {
  return mergeScholarShards(paths);
}

test('missing shard is refused without creating output files', async () => {
  await withCase(async ({ paths }) => {
    await rm(path.join(paths.shardDir, 'shard-08'), { recursive: true });
    await assert.rejects(() => merge(paths), (error) => {
      assert.ok(error instanceof ScholarMergeError);
      assert.match(error.message, /Cannot read/);
      return true;
    });
    assert.deepEqual(await readdir(paths.outputDir), []);
  });
});

test('duplicate candidate identity is refused', async () => {
  await withCase(async ({ paths, input }) => {
    await assert.rejects(() => merge(paths), /duplicate candidate candidate_identity_key candidate-000/);
  }, { candidateRows: [...syntheticDataset().candidates, syntheticDataset().candidates[0]] });
});

test('duplicate work identity is refused', async () => {
  const input = syntheticDataset();
  await withCase(async ({ paths }) => {
    await assert.rejects(() => merge(paths), /duplicate work work_id work-001/);
  }, { workRows: [...input.works, input.works[0]] });
});

test('immutable baseline mismatch is refused', async () => {
  const input = syntheticDataset();
  const candidates = structuredClone(input.candidates);
  candidates[0].eccv_titles = 'Changed title';
  await withCase(async ({ paths }) => {
    await assert.rejects(() => merge(paths), /differs byte-for-byte from immutable baseline/);
  }, { candidateRows: candidates });
});

test('successful output is sorted and byte-identical on repeat', async () => {
  const input = syntheticDataset();
  await withCase(async ({ paths }) => {
    const first = await merge(paths);
    const candidateBytes = await readFile(first.candidatePath);
    const workBytes = await readFile(first.workPath);
    const candidateRows = parseCsv(candidateBytes.toString('utf8'));
    const workRows = parseCsv(workBytes.toString('utf8'));
    assert.deepEqual(candidateRows.map((row) => row.candidate_identity_key), input.candidates
      .map((row) => row.candidate_identity_key).sort((left, right) => left.localeCompare(right)));
    assert.deepEqual(workRows.map((row) => row.work_id), input.works
      .map((row) => row.work_id).sort((left, right) => left.localeCompare(right)));

    await merge(paths);
    assert.deepEqual(await readFile(first.candidatePath), candidateBytes);
    assert.deepEqual(await readFile(first.workPath), workBytes);
    assert.deepEqual(await stat(first.candidatePath).then((entry) => entry.isFile()), true);
  }, {
    candidateRows: syntheticDataset().candidates.toReversed(),
    workRows: syntheticDataset().works.toReversed()
  });
});
