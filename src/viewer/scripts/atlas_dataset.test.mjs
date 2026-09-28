import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAtlasDataset } from './atlas_dataset.mjs';

const paper = (paper_uid, title_raw) => ({ paper_uid, title_raw, paper_pdf_url: `https://example.test/${paper_uid}.pdf` });
const author = (paper_uid, author_position, author_id_ecva, author_name_raw, affiliation_raw) => ({ paper_uid, author_position, author_id_ecva, author_name_raw, affiliation_raw });
const entity = (paper_uid, raw_affiliation, canonical_organization, organization_country_code, organization_country_name) => ({ paper_uid, raw_affiliation, canonical_organization, organization_country_code, organization_country_name });

test('counts a multi-country paper once per country and fractionally across its country set', () => {
  const result = buildAtlasDataset({
    papers: [paper('p1', 'One paper')],
    authors: [author('p1', '1', 'a1', 'Ada', 'Alpha'), author('p1', '2', 'b1', 'Bea', 'Beta')],
    entities: [entity('p1', 'Alpha', 'Alpha University', 'KR', 'South Korea'), entity('p1', 'Beta', 'Beta Lab', 'US', 'United States')],
    contextual: []
  });
  assert.deepEqual(result.countries.map(({ code, paperCount, fractionalPaperCount }) => [code, paperCount, fractionalPaperCount]), [['KR', 1, 0.5], ['US', 1, 0.5]]);
  assert.deepEqual(result.countryLinks, [{ source: 'KR', target: 'US', paperCount: 1 }]);
});

test('uses author-context recovery in preference to the malformed raw-affiliation mapping', () => {
  const result = buildAtlasDataset({
    papers: [paper('p1', 'Recovered author')],
    authors: [author('p1', '1', 'a1', 'Ada', 'N/A')],
    entities: [],
    contextual: [{ paper_uid: 'p1', author_position: '1', canonical_organizations: 'Gamma Institute', country_codes: 'SG', country_names: 'Singapore' }]
  });
  assert.deepEqual(result.countries.map(({ code, paperCount }) => [code, paperCount]), [['SG', 1]]);
  assert.equal(result.people[0].organizations[0].name, 'Gamma Institute');
});

test('retains papers without an attributed country as coverage gaps rather than assigning a guess', () => {
  const result = buildAtlasDataset({
    papers: [paper('p1', 'Unknown')],
    authors: [author('p1', '1', 'a1', 'Ada', 'Independent Researcher')],
    entities: [],
    contextual: []
  });
  assert.equal(result.metadata.paperCount, 1);
  assert.equal(result.metadata.countryAttributedPaperCount, 0);
  assert.equal(result.metadata.countryUnattributedPaperCount, 1);
  assert.deepEqual(result.countries, []);
});
