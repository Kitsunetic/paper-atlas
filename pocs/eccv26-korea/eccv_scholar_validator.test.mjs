import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertValidScholarDataset,
  classifyScholarWork,
  ScholarValidationError,
  validateScholarDataset
} from './eccv_scholar_validator.mjs';

const fixture = JSON.parse(await readFile(new URL('./eccv_scholar_validator.fixtures.json', import.meta.url), 'utf8'));

function dataset(overrides = {}) {
  return {
    ...fixture,
    ...overrides,
    expectedCandidateCount: 2,
    expectedPaperCount: 3
  };
}

test('valid Scholar-only matched and unknown rows pass the immutable join', () => {
  const result = validateScholarDataset(dataset());
  assert.deepEqual(result, { ok: true, issues: [] });
});

test('non-Scholar evidence URL is rejected', () => {
  const works = structuredClone(fixture.works);
  works[0].scholar_work_url = 'https://openaccess.thecvf.com/content/CVPR2025/paper.pdf';
  const result = validateScholarDataset(dataset({ works }));
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.includes('non-Scholar URL')));
});

test('every counted work requires a valid HTTPS Scholar work URL', () => {
  for (const scholarWorkUrl of ['', 'not-a-url', 'http://scholar.google.com/scholar?cluster=demo', 'https://example.invalid/work']) {
    const works = structuredClone(fixture.works);
    works[0].scholar_work_url = scholarWorkUrl;
    const result = validateScholarDataset(dataset({ works }));
    assert.equal(result.ok, false, `expected rejection for ${JSON.stringify(scholarWorkUrl)}`);
    assert.ok(result.issues.some((item) => item.includes('scholar_work_url')), `missing work URL issue for ${JSON.stringify(scholarWorkUrl)}`);
  }

  const valid = validateScholarDataset(dataset());
  assert.equal(valid.ok, true);
});

test('unknown candidates require blank counts, a reason, and Scholar search URL', () => {
  const candidates = structuredClone(fixture.candidates);
  candidates[1].eligible_prior_work_count = '0';
  const result = validateScholarDataset(dataset({ candidates }));
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.includes('unknown counts must be empty')));
});

test('contribution buckets are non-overlapping and marker-driven', () => {
  const equal = classifyScholarWork(fixture.works[1]);
  const unmarked = classifyScholarWork(fixture.works[0]);
  assert.equal(equal.contributionType, 'explicit_equal_contribution_first');
  assert.equal(unmarked.contributionType, 'first_listed_unmarked');
  const bareGlyph = classifyScholarWork({ ...fixture.works[0], contribution_marker_status: 'bare_glyph' });
  assert.equal(bareGlyph.contributionType, 'contribution_marker_unknown');
  const unavailable = classifyScholarWork({ ...fixture.works[0], contribution_marker_status: 'unavailable' });
  assert.equal(unavailable.contributionType, 'contribution_marker_unknown');
  const invalidExplicit = { ...fixture.works[1], scholar_marker_text: '*' };
  const invalid = validateScholarDataset(dataset({ works: [fixture.works[0], invalidExplicit] }));
  assert.equal(invalid.ok, false);
  assert.ok(invalid.issues.some((item) => item.includes('literal Scholar equality phrase')));
});

test('WACV, workshop, non-first, and post-cutoff leads are excluded', () => {
  const base = fixture.works[0];
  const cases = [
    { venue: 'WACV', expected: 'venue_out_of_scope' },
    { venue: 'CVPR Workshop', expected: 'venue_out_of_scope' },
    { author_position: 'second', expected: 'not_first_listed' },
    { publication_date: '2026-03-06', expected: 'post_cutoff' }
  ];
  for (const candidate of cases) {
    const result = classifyScholarWork({ ...base, ...candidate });
    assert.deepEqual(result, { eligible: false, reason: candidate.expected });
  }
  assert.equal(classifyScholarWork({ ...base, publication_date: '2026-03-05' }).eligible, true);
});

test('baseline identity fields are immutable', () => {
  const candidates = structuredClone(fixture.candidates);
  candidates[0].eccv_first_author_name = 'Changed Name';
  const result = validateScholarDataset(dataset({ candidates }));
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.includes('differs from immutable baseline')));
});

test('assertValidScholarDataset exposes structured validation errors', () => {
  const candidates = structuredClone(fixture.candidates);
  candidates[1].scholar_search_url = 'https://example.invalid/search';
  assert.throws(() => assertValidScholarDataset(dataset({ candidates })), (error) => {
    assert.ok(error instanceof ScholarValidationError);
    assert.ok(error.issues.some((item) => item.includes('non-Scholar URL')));
    return true;
  });
});
