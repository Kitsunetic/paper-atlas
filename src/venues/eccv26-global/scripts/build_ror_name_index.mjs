import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { comparisonKey } from './affiliation_normalization.mjs';
import { parseCsv, writeCsvAtomically, writeTextAtomically } from './csv.mjs';

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(HERE, '../../../../data/eccv26');
const NAME_COLUMNS = ['comparison_key', 'ror_id', 'ror_display_name', 'ror_name_raw', 'name_type', 'country_code', 'country_name', 'city', 'ror_status', 'ror_types'];
const NAME_FIELDS = [['names.types.acronym', 'acronym'], ['names.types.alias', 'alias'], ['names.types.label', 'label'], ['names.types.ror_display', 'ror_display']];

function stripLanguagePrefix(value) {
  return String(value ?? '').replace(/^(?:[a-z]{2,3}(?:_[a-z]+)?|no_lang_code):\s*/iu, '').trim();
}

export function buildRorNameRows(records) {
  const rows = [];
  for (const record of records) {
    for (const [field, nameType] of NAME_FIELDS) {
      for (const value of String(record[field] ?? '').split(';').map(stripLanguagePrefix).filter(Boolean)) {
        const key = comparisonKey(value);
        if (!key) continue;
        rows.push({ comparison_key: key, ror_id: record.id, ror_display_name: stripLanguagePrefix(record['names.types.ror_display']), ror_name_raw: value, name_type: nameType, country_code: record['locations.geonames_details.country_code'], country_name: record['locations.geonames_details.country_name'], city: record['locations.geonames_details.name'], ror_status: record.status, ror_types: record.types });
      }
    }
  }
  return rows.sort((left, right) => left.comparison_key.localeCompare(right.comparison_key) || left.ror_id.localeCompare(right.ror_id) || left.name_type.localeCompare(right.name_type));
}

async function zipCsvText(zipPath) {
  const { stdout: listing } = await execFileAsync('unzip', ['-Z1', zipPath]);
  const names = listing.split(/\r?\n/u).filter((name) => name.endsWith('.csv'));
  if (names.length !== 1) throw new Error(`Expected exactly one ROR CSV in archive, found ${names.length}`);
  const { stdout } = await execFileAsync('unzip', ['-p', zipPath, names[0]], { maxBuffer: 128 * 1024 * 1024 });
  return stdout;
}

async function main() {
  const dataRoot = process.argv[2] === '--data-root' ? path.resolve(process.argv[3]) : DEFAULT_DATA_ROOT;
  if (process.argv.length > 2 && process.argv[2] !== '--data-root') throw new Error('Usage: node build_ror_name_index.mjs [--data-root DIR]');
  const zipPath = path.join(dataRoot, 'raw', 'ror-v2-release-2026-08-25.5779c7baf71771fd8ea829201e7bd4343a3c68ff36c595f480b3a00292f78931.zip');
  const records = parseCsv(await zipCsvText(zipPath));
  const rows = buildRorNameRows(records);
  const normalizedDir = path.join(dataRoot, 'normalized');
  await writeCsvAtomically(path.join(normalizedDir, 'ror_name_index.csv'), rows, NAME_COLUMNS);
  const report = { schema_version: 1, ror_records: records.length, ror_name_index_rows: rows.length, unique_comparison_keys: new Set(rows.map((row) => row.comparison_key)).size };
  await writeTextAtomically(path.join(normalizedDir, 'ror_name_index_report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
