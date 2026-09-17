import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(HERE, '../../../../data/eccv26');

export class EcvaParseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EcvaParseError';
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    throw new EcvaParseError(`Cannot read ${filePath}: ${error.message}`);
  }
}

function countBy(items) {
  const counts = new Map();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => String(left).localeCompare(String(right))));
}

function rankedRawAffiliations(posters) {
  const counts = new Map();
  for (const poster of posters) {
    const raw = String(poster.authors?.[0]?.institution ?? '').trim();
    if (raw) counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([affiliation, paperCount]) => ({ affiliation, paper_count: paperCount }))
    .sort((left, right) => right.paper_count - left.paper_count || left.affiliation.localeCompare(right.affiliation));
}

async function writeJsonAtomically(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw new EcvaParseError(`Cannot write ${filePath}: ${error.message}`);
  }
}

export async function buildEcvaSnapshotReport({ dataRoot }) {
  const rawDir = path.join(dataRoot, 'raw');
  const manifest = await readJson(path.join(rawDir, 'manifest.json'));
  const source = manifest?.sources?.['ecva-virtual-program'];
  if (!source?.file || path.basename(source.file) !== source.file) throw new EcvaParseError('Manifest has no safe ecva-virtual-program file');
  const payload = await readJson(path.join(rawDir, source.file));
  if (!Array.isArray(payload?.results)) throw new EcvaParseError('ECVA virtual-program payload has no results array');

  const posters = payload.results.filter((row) => row?.eventtype === 'Poster');
  const uniquePosterUids = new Set(posters.map((poster) => String(poster.uid ?? '')).filter(Boolean));
  const missingFirstAuthorAffiliation = posters.filter((poster) => !String(poster.authors?.[0]?.institution ?? '').trim()).length;
  const report = {
    schema_version: 1,
    source_file: source.file,
    source_sha256: source.sha256 ?? '',
    total_events: payload.results.length,
    event_counts: countBy(payload.results.map((row) => row?.eventtype ?? 'UNKNOWN')),
    poster_events: posters.length,
    poster_unique_paper_uids: uniquePosterUids.size,
    poster_first_author_affiliation_missing: missingFirstAuthorAffiliation,
    poster_first_author_affiliation_top_raw: rankedRawAffiliations(posters)
  };
  const reportPath = path.join(dataRoot, 'parsed', 'ecva-program-poc-report.json');
  await writeJsonAtomically(reportPath, report);
  return { reportPath, report };
}

function parseArgs(argv) {
  if (argv.length === 0) return { dataRoot: DEFAULT_DATA_ROOT };
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) return { help: true, dataRoot: DEFAULT_DATA_ROOT };
  if (argv.length === 2 && argv[0] === '--data-root') return { dataRoot: path.resolve(argv[1]) };
  throw new EcvaParseError('Usage: node parse_ecva_snapshot.mjs [--data-root DIR]');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log('Usage: node parse_ecva_snapshot.mjs [--data-root DIR]'); return; }
  const result = await buildEcvaSnapshotReport(args);
  console.log(JSON.stringify({ report_path: result.reportPath, ...result.report }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
