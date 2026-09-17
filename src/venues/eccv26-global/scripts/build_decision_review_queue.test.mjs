import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDecisionRows } from './build_decision_review_queue.mjs';

test('review queue proposes only the leading alias candidate and marks evidence as pending', () => {
  const rows = buildDecisionRows([{ triage_queue: 'alias_review', raw_affiliation_examples: 'Company; Sung Kyun Kwan University', segment_examples: 'Sung Kyun Kwan University', candidate_display_names: 'Sungkyunkwan University', candidate_ror_ids: 'https://ror.org/example', candidate_countries: 'South Korea', candidate_method: 'compact_key', best_candidate_score: '1.000', paper_weight: '16', author_record_weight: '16' }], 10);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].proposed_canonical_organization, 'Sungkyunkwan University');
  assert.equal(rows[0].target_affiliation_segment, 'Sung Kyun Kwan University');
  assert.equal(rows[0].evidence_status, 'pending_primary_source');
  assert.equal(rows[0].review_action, 'Verify with an official institution source, then approve or reject this alias proposal.');
});

test('exact collisions retain all candidates rather than proposing an arbitrary first ROR record', () => {
  const rows = buildDecisionRows([{ triage_queue: 'context_or_evidence_review', raw_affiliation_examples: 'Korea University', segment_examples: 'Korea University', candidate_display_names: 'Korea University || Korea University', candidate_ror_ids: 'https://ror.org/kr || https://ror.org/jp', candidate_countries: 'South Korea || Japan', candidate_method: 'exact_key_collision', best_candidate_score: '1.000', paper_weight: '37', author_record_weight: '75' }], 10);
  assert.equal(rows[0].proposed_canonical_organization, '');
  assert.match(rows[0].candidate_organizations, /South Korea/);
  assert.equal(rows[0].review_action, 'Resolve from paper context and a primary source; do not select a ROR candidate by list order.');
});
