import assert from 'node:assert/strict';
import test from 'node:test';

import { buildRorLookup, classifyQueue, nearbyRows, rankRorCandidates } from './build_resolution_triage.mjs';

test('a compacted ROR key is an alias-review candidate, never an automatic resolution', () => {
  assert.equal(classifyQueue({ sourceStatus: 'unresolved', bestMethod: 'compact_key', bestScore: 1, text: 'Sung Kyun Kwan University' }), 'alias_review');
});

test('clear non-institution text is separated from institution review', () => {
  assert.equal(classifyQueue({ sourceStatus: 'unresolved', bestMethod: '', bestScore: 0, text: 'Independent Researcher' }), 'not_institution_review');
});

test('candidate ranking prefers a closer institution name and deduplicates organizations', () => {
  const candidates = rankRorCandidates('czech technical univeresity in prague', [
    { comparison_key: 'czech technical university in prague', ror_id: 'ror:one', ror_display_name: 'Czech Technical University in Prague', country_code: 'CZ', country_name: 'Czechia', name_type: 'label' },
    { comparison_key: 'czech technical university in prague', ror_id: 'ror:one', ror_display_name: 'Czech Technical University in Prague', country_code: 'CZ', country_name: 'Czechia', name_type: 'ror_display' },
    { comparison_key: 'prague city university', ror_id: 'ror:two', ror_display_name: 'Prague City University', country_code: 'CZ', country_name: 'Czechia', name_type: 'label' }
  ]);
  assert.equal(candidates[0].ror_id, 'ror:one');
  assert.equal(candidates.filter((candidate) => candidate.ror_id === 'ror:one').length, 1);
});

test('fuzzy lookup bounds broad token candidates while retaining the strongest token-overlap match', () => {
  // Given: a broad token with many names and one exact multi-token candidate.
  const broadRows = Array.from({ length: 400 }, (_, index) => ({ comparison_key: `alpha institute ${index}`, ror_id: `ror:broad-${index}`, ror_display_name: `Alpha Institute ${index}`, country_code: 'US', country_name: 'United States', name_type: 'label' }));
  const preciseRow = { comparison_key: 'alpha beta gamma university', ror_id: 'ror:precise', ror_display_name: 'Alpha Beta Gamma University', country_code: 'US', country_name: 'United States', name_type: 'label' };

  // When: the three-token source name is used to retrieve fuzzy candidates.
  const nearby = nearbyRows('alpha beta gamma university', buildRorLookup([...broadRows, preciseRow]));

  // Then: the precise candidate remains, but a broad token cannot inflate the review set.
  assert.ok(nearby.rows.some((row) => row.ror_id === 'ror:precise'));
  assert.ok(nearby.rows.length <= 250);
});
