import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNormalizationInputs } from './build_normalization_inputs.mjs';

test('normalization inputs retain raw affiliations while producing semicolon-only candidates', () => {
  const result = buildNormalizationInputs({ results: [{ eventtype: 'Poster', uid: 'paper-1', id: 1, name: 'A Paper', sourceid: 3, paper_pdf_url: '', authors: [
    { id: 10, fullname: 'First Author', institution: 'Lab / University; Company' },
    { id: 11, fullname: 'Second Author', institution: 'Lab / University; Company' }
  ] }] });
  assert.equal(result.authors[0].affiliation_raw, 'Lab / University; Company');
  assert.equal(result.variants[0].author_record_count, 2);
  assert.deepEqual(result.segments.map((row) => row.segment_raw), ['Lab / University', 'Company']);
  assert.deepEqual(result.segments.map((row) => row.segmentation_method), ['semicolon', 'semicolon']);
  assert.deepEqual(result.segments.map((row) => row.paper_uid), ['paper-1', 'paper-1']);
});
