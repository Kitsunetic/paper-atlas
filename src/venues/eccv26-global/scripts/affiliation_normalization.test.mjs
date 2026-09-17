import assert from 'node:assert/strict';
import test from 'node:test';

import { comparisonKey, segmentAffiliation } from './affiliation_normalization.mjs';

test('comparison key removes presentation-only variation without changing source text', () => {
  assert.equal(comparisonKey('Korea Advanced Institute of Science &amp; Technology'), 'korea advanced institute of science and technology');
  assert.equal(comparisonKey('ETH Zürich'), 'eth zurich');
});

test('segmenter uses semicolons but preserves slash-containing institution names', () => {
  assert.deepEqual(segmentAffiliation('Waymo / UC Berkeley; University of Toronto'), [
    { index: 0, method: 'semicolon', raw: 'Waymo / UC Berkeley' },
    { index: 1, method: 'semicolon', raw: 'University of Toronto' }
  ]);
  assert.deepEqual(segmentAffiliation('ETH Zurich / Microsoft'), [
    { index: 0, method: 'whole_raw', raw: 'ETH Zurich / Microsoft' }
  ]);
});

test('segmenter does not split the semicolon that terminates an HTML entity', () => {
  assert.deepEqual(segmentAffiliation('Xi&#x27;an Jiaotong University; Peking University'), [
    { index: 0, method: 'semicolon', raw: 'Xi&#x27;an Jiaotong University' },
    { index: 1, method: 'semicolon', raw: 'Peking University' }
  ]);
  assert.deepEqual(segmentAffiliation('Beijing Jiaotong University &amp; Beijing Key Lab'), [
    { index: 0, method: 'whole_raw', raw: 'Beijing Jiaotong University &amp; Beijing Key Lab' }
  ]);
});
