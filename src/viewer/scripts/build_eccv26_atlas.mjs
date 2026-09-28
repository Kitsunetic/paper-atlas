import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAtlasDataset } from './atlas_dataset.mjs';
import { parseCsv, writeTextAtomically } from '../../venues/eccv26-global/scripts/csv.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(HERE, '../../../data/eccv26');
const DEFAULT_OUTPUT = path.resolve(HERE, '../public/data/eccv26.json');

function cliOptions(argumentsList) {
  const options = { dataRoot: DEFAULT_DATA_ROOT, output: DEFAULT_OUTPUT };
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!value || !new Set(['--data-root', '--output']).has(flag)) throw new Error('Usage: node build_eccv26_atlas.mjs [--data-root DIR] [--output FILE]');
    if (flag === '--data-root') options.dataRoot = path.resolve(value);
    if (flag === '--output') options.output = path.resolve(value);
  }
  return options;
}

async function readDatasetInput(dataRoot) {
  const parsed = path.join(dataRoot, 'parsed');
  const normalized = path.join(dataRoot, 'normalized');
  const [papers, authors, entities, contextual] = await Promise.all([
    fs.readFile(path.join(parsed, 'papers_raw.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(parsed, 'author_affiliations_raw.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(normalized, 'affiliation_normalized_entities.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(normalized, 'author_affiliation_contextual_inferences.csv'), 'utf8').then(parseCsv)
  ]);
  return { papers, authors, entities, contextual, options: { venue: 'ECCV', year: 2026 } };
}

async function main() {
  const options = cliOptions(process.argv.slice(2));
  const atlas = buildAtlasDataset(await readDatasetInput(options.dataRoot));
  await writeTextAtomically(options.output, `${JSON.stringify(atlas)}\n`);
  const bytes = (await fs.stat(options.output)).size;
  console.log(JSON.stringify({ ...atlas.metadata, output: path.relative(process.cwd(), options.output), bytes }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
