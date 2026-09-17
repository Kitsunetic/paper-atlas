import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRorNameRows } from './build_ror_name_index.mjs';

test('ROR index includes acronym, alias, label, and display names without language prefixes', () => {
  const rows = buildRorNameRows([{ id: 'https://ror.org/example', 'names.types.acronym': 'no_lang_code: EXU', 'names.types.alias': 'en: Example U', 'names.types.label': 'en: Example University', 'names.types.ror_display': 'Example University', 'locations.geonames_details.country_code': 'KR', 'locations.geonames_details.country_name': 'South Korea', 'locations.geonames_details.name': 'Seoul', status: 'active', types: 'education' }]);
  assert.deepEqual(rows.map((row) => row.ror_name_raw), ['Example U', 'Example University', 'Example University', 'EXU']);
  assert.deepEqual(rows.map((row) => row.name_type), ['alias', 'label', 'ror_display', 'acronym']);
  assert.ok(rows.every((row) => row.country_code === 'KR'));
});
