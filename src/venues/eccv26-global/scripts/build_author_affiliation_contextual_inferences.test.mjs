import assert from 'node:assert/strict';
import test from 'node:test';

import { validateResolutionRow } from './build_author_affiliation_contextual_inferences.mjs';

const resolved = {
  paper_uid: 'paper-1', author_name_raw: 'Example Author', source_segment_raw: 'Department of Something',
  decision_status: 'primary_source_resolved', canonical_organizations: 'Example University', canonical_ror_ids: 'https://ror.org/example',
  country_codes: 'US', country_names: 'United States', evidence_url: 'https://example.edu/'
};

test('author-context resolutions preserve an author-level multi-affiliation mapping', () => {
  assert.doesNotThrow(() => validateResolutionRow({
    ...resolved,
    canonical_organizations: 'Example Company | Example University',
    canonical_ror_ids: ' | https://ror.org/example',
    country_codes: 'US | US',
    country_names: 'United States | United States'
  }));
});

test('author-context resolutions require directly cited evidence for an asserted organization', () => {
  assert.throws(() => validateResolutionRow({ ...resolved, evidence_url: '' }), /HTTPS evidence URL/);
  assert.throws(() => validateResolutionRow({ ...resolved, country_codes: '', country_names: '' }), /country count/);
});

test('confirmed independent authors remain unassigned by design', () => {
  assert.doesNotThrow(() => validateResolutionRow({
    paper_uid: 'paper-1', author_name_raw: 'Example Author', source_segment_raw: 'Independent Researcher',
    decision_status: 'confirmed_independent', canonical_organizations: '', canonical_ror_ids: '', country_codes: '', country_names: '', evidence_url: 'https://example.org/'
  }));
  assert.throws(() => validateResolutionRow({
    paper_uid: 'paper-1', author_name_raw: 'Example Author', source_segment_raw: 'Independent Researcher',
    decision_status: 'confirmed_independent', canonical_organizations: 'Invented University', canonical_ror_ids: '', country_codes: '', country_names: '', evidence_url: 'https://example.org/'
  }), /cannot claim/);
});
