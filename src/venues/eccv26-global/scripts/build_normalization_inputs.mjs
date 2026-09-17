import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { comparisonKey, segmentAffiliation } from './affiliation_normalization.mjs';
import { writeCsvAtomically, writeTextAtomically } from './csv.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(HERE, '../../../../data/eccv26');
const PAPER_COLUMNS = ['paper_uid', 'poster_id', 'title_raw', 'source_id', 'paper_pdf_url'];
const AUTHOR_COLUMNS = [...PAPER_COLUMNS, 'author_position', 'author_id_ecva', 'author_name_raw', 'affiliation_raw'];
const VARIANT_COLUMNS = ['raw_affiliation', 'comparison_key', 'author_record_count', 'paper_count', 'semicolon_segment_count'];
const SEGMENT_COLUMNS = ['paper_uid', 'raw_affiliation', 'author_record_count', 'paper_count', 'segmentation_method', 'segment_index', 'segment_raw', 'comparison_key'];

function sourceProgramFile(manifest) {
  const source = manifest?.sources?.['ecva-virtual-program'];
  if (!source?.file || path.basename(source.file) !== source.file) throw new Error('Manifest has no safe ecva-virtual-program file');
  return source.file;
}

export function buildNormalizationInputs(payload) {
  if (!Array.isArray(payload?.results)) throw new Error('ECVA virtual-program payload has no results array');
  const posters = payload.results.filter((event) => event?.eventtype === 'Poster');
  const seenUids = new Set();
  const papers = [];
  const authors = [];
  const affiliations = new Map();
  const segmentOccurrences = new Map();
  for (const poster of posters) {
    const paperUid = String(poster.uid ?? '').trim();
    if (!paperUid || seenUids.has(paperUid)) throw new Error(`Poster UID is missing or duplicated: ${paperUid || '(blank)'}`);
    seenUids.add(paperUid);
    const paper = {
      paper_uid: paperUid, poster_id: String(poster.id ?? ''), title_raw: String(poster.name ?? ''),
      source_id: String(poster.sourceid ?? ''), paper_pdf_url: String(poster.paper_pdf_url ?? '')
    };
    papers.push(paper);
    for (const [index, author] of (poster.authors ?? []).entries()) {
      const affiliation = String(author?.institution ?? '').trim();
      authors.push({ ...paper, author_position: String(index + 1), author_id_ecva: String(author?.id ?? ''), author_name_raw: String(author?.fullname ?? ''), affiliation_raw: affiliation });
      if (!affiliation) continue;
      const aggregate = affiliations.get(affiliation) ?? { raw_affiliation: affiliation, paperUids: new Set(), authorRecordCount: 0 };
      aggregate.authorRecordCount += 1;
      aggregate.paperUids.add(paperUid);
      affiliations.set(affiliation, aggregate);
      for (const segment of segmentAffiliation(affiliation)) {
        const key = `${paperUid}\u0000${affiliation}\u0000${segment.index}`;
        const occurrence = segmentOccurrences.get(key) ?? { paper_uid: paperUid, raw_affiliation: affiliation, author_record_count: 0, paper_count: '1', segmentation_method: segment.method, segment_index: segment.index, segment_raw: segment.raw, comparison_key: comparisonKey(segment.raw) };
        occurrence.author_record_count += 1;
        segmentOccurrences.set(key, occurrence);
      }
    }
  }
  const variants = [...affiliations.values()].map((item) => ({
    raw_affiliation: item.raw_affiliation, comparison_key: comparisonKey(item.raw_affiliation),
    author_record_count: item.authorRecordCount, paper_count: item.paperUids.size,
    semicolon_segment_count: segmentAffiliation(item.raw_affiliation).length
  })).sort((left, right) => left.raw_affiliation.localeCompare(right.raw_affiliation));
  const segments = [...segmentOccurrences.values()].sort((left, right) => left.paper_uid.localeCompare(right.paper_uid) || left.raw_affiliation.localeCompare(right.raw_affiliation) || left.segment_index - right.segment_index);
  return { papers, authors, variants, segments, posterCount: posters.length };
}

async function main() {
  const dataRoot = process.argv[2] === '--data-root' ? path.resolve(process.argv[3]) : DEFAULT_DATA_ROOT;
  if (process.argv.length > 2 && process.argv[2] !== '--data-root') throw new Error('Usage: node build_normalization_inputs.mjs [--data-root DIR]');
  const rawDir = path.join(dataRoot, 'raw');
  const manifest = JSON.parse(await fs.readFile(path.join(rawDir, 'manifest.json'), 'utf8'));
  const sourceFile = sourceProgramFile(manifest);
  const payload = JSON.parse(await fs.readFile(path.join(rawDir, sourceFile), 'utf8'));
  const result = buildNormalizationInputs(payload);
  const parsedDir = path.join(dataRoot, 'parsed');
  await Promise.all([
    writeCsvAtomically(path.join(parsedDir, 'papers_raw.csv'), result.papers, PAPER_COLUMNS),
    writeCsvAtomically(path.join(parsedDir, 'author_affiliations_raw.csv'), result.authors, AUTHOR_COLUMNS),
    writeCsvAtomically(path.join(parsedDir, 'affiliation_variants.csv'), result.variants, VARIANT_COLUMNS),
    writeCsvAtomically(path.join(parsedDir, 'affiliation_segment_candidates.csv'), result.segments, SEGMENT_COLUMNS)
  ]);
  const report = { schema_version: 1, source_file: sourceFile, poster_papers: result.posterCount, author_records: result.authors.length, unique_raw_affiliations: result.variants.length, segment_candidates: result.segments.length };
  await writeTextAtomically(path.join(parsedDir, 'normalization_input_report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
