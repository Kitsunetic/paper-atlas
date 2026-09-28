import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCountryAuthorPayload, buildWorldGraph, koreaPayload } from './network_payloads.mjs';

test('builds canonical organization nodes and size-normalized collaboration metrics', () => {
  const result = buildWorldGraph({
    papers: [{ paper_uid: 'p1', title_raw: 'Shared work' }, { paper_uid: 'p2', title_raw: 'Domestic work' }],
    authors: [
      { paper_uid: 'p1', author_position: '1', affiliation_raw: 'Alpha' },
      { paper_uid: 'p1', author_position: '2', affiliation_raw: 'Beta' },
      { paper_uid: 'p2', author_position: '1', affiliation_raw: 'Alpha' },
    ],
    entities: [
      { paper_uid: 'p1', raw_affiliation: 'Alpha', canonical_organization: 'Alpha University', organization_country_code: 'KR', organization_country_name: 'South Korea' },
      { paper_uid: 'p1', raw_affiliation: 'Beta', canonical_organization: 'Beta Lab', organization_country_code: 'US', organization_country_name: 'United States' },
      { paper_uid: 'p2', raw_affiliation: 'Alpha', canonical_organization: 'Alpha University', organization_country_code: 'KR', organization_country_name: 'South Korea' },
    ],
    contextual: [],
  });
  assert.deepEqual(result.nodes.map(({ name, countryCode, paperCount }) => [name, countryCode, paperCount]), [['Alpha University', 'KR', 2], ['Beta Lab', 'US', 1]]);
  assert.deepEqual(result.links.map(({ source, target, paperCount, fractionalPaperWeight, sourceShare, targetShare, mutuality, asymmetry }) => [source, target, paperCount, fractionalPaperWeight, sourceShare, targetShare, mutuality, asymmetry]), [[
    'Alpha University\u0000KR', 'Beta Lab\u0000US', 1, 1, .5, 1, 2 / 3, .5,
  ]]);
});

test('fractionalizes each multi-institution paper across its partner institutions', () => {
  const result = buildWorldGraph({
    papers: [{ paper_uid: 'p1', title_raw: 'Three-way work' }],
    authors: [
      { paper_uid: 'p1', author_position: '1', affiliation_raw: 'Alpha' },
      { paper_uid: 'p1', author_position: '2', affiliation_raw: 'Beta' },
      { paper_uid: 'p1', author_position: '3', affiliation_raw: 'Gamma' },
    ],
    entities: [
      { paper_uid: 'p1', raw_affiliation: 'Alpha', canonical_organization: 'Alpha University', organization_country_code: 'KR', organization_country_name: 'South Korea' },
      { paper_uid: 'p1', raw_affiliation: 'Beta', canonical_organization: 'Beta Lab', organization_country_code: 'US', organization_country_name: 'United States' },
      { paper_uid: 'p1', raw_affiliation: 'Gamma', canonical_organization: 'Gamma Institute', organization_country_code: 'JP', organization_country_name: 'Japan' },
    ],
    contextual: [],
  });
  assert.deepEqual(result.links.map(({ paperCount, fractionalPaperWeight, sourceShare, targetShare, mutuality }) => [paperCount, fractionalPaperWeight, sourceShare, targetShare, mutuality]), [
    [1, .5, .5, .5, .5], [1, .5, .5, .5, .5], [1, .5, .5, .5, .5],
  ]);
});

test('builds a country author graph from first-author affiliation country without discarding foreign coauthors', () => {
  const result = buildCountryAuthorPayload({
    papers: [{ paper_uid: 'p1', title_raw: 'China-led work' }, { paper_uid: 'p2', title_raw: 'United States-led work' }],
    authors: [
      { paper_uid: 'p1', author_position: '1', author_id_ecva: 'a1', author_name_raw: 'First Author', affiliation_raw: 'China University' },
      { paper_uid: 'p1', author_position: '2', author_id_ecva: 'a2', author_name_raw: 'Foreign Coauthor', affiliation_raw: 'United States Lab' },
      { paper_uid: 'p1', author_position: '3', author_id_ecva: '', author_name_raw: 'Unknown Coauthor', affiliation_raw: 'Unknown' },
      { paper_uid: 'p2', author_position: '1', author_id_ecva: 'a3', author_name_raw: 'United States First Author', affiliation_raw: 'United States Lab' },
    ],
    entities: [
      { paper_uid: 'p1', raw_affiliation: 'China University', canonical_organization: 'China University', organization_country_code: 'CN', organization_country_name: 'China' },
      { paper_uid: 'p1', raw_affiliation: 'United States Lab', canonical_organization: 'United States Lab', organization_country_code: 'US', organization_country_name: 'United States' },
      { paper_uid: 'p1', raw_affiliation: 'Unknown', canonical_organization: '', organization_country_code: '', organization_country_name: '' },
      { paper_uid: 'p2', raw_affiliation: 'United States Lab', canonical_organization: 'United States Lab', organization_country_code: 'US', organization_country_name: 'United States' },
    ],
    contextual: [],
  }, 'CN', new Map([['p1', new Set(['Oral'])]]));
  assert.equal(result.stats.selectedPapers, 1);
  assert.deepEqual(result.graph.nodes.map((node) => [node.id, node.views, node.countryCode, node.countryName]), [
    ['ecva:a1', ['country:CN'], 'CN', 'China'],
    ['ecva:a2', ['other-countries'], 'US', 'United States'],
    ['source:p1:3', ['country:ZZ'], 'ZZ', 'Country unavailable'],
  ]);
  assert.deepEqual(result.views, [
    { id: 'country:CN', default: true, label: 'China' },
    { id: 'other-countries', default: false, label: 'Other countries' },
    { id: 'country:ZZ', default: false, label: 'Country unavailable' },
  ]);
  assert.equal(result.graph.links.length, 3);
  assert.deepEqual(result.graph.nodes.map((node) => [node.id, node.papers, node.firstAuthorPapers, node.oralPapers, node.spotlightPapers]), [
    ['ecva:a1', 1, 1, 1, 0],
    ['ecva:a2', 1, 0, 1, 0],
    ['source:p1:3', 1, 0, 1, 0],
  ]);
  assert.deepEqual(result.graph.nodes.map((node) => [node.id, node.paperSummaries]), [
    ['ecva:a1', [{ title: 'China-led work', isFirstAuthor: true, presentationTypes: ['Oral'] }]],
    ['ecva:a2', [{ title: 'China-led work', isFirstAuthor: false, presentationTypes: ['Oral'] }]],
    ['source:p1:3', [{ title: 'China-led work', isFirstAuthor: false, presentationTypes: ['Oral'] }]],
  ]);
});

test('China simple keeps the same papers but only first and last listed authors, including foreign last authors', () => {
  const input = {
    papers: [
      { paper_uid: 'p1', title_raw: 'Three authors' },
      { paper_uid: 'p2', title_raw: 'Solo author' },
      { paper_uid: 'p3', title_raw: 'Another country' },
    ],
    authors: [
      { paper_uid: 'p1', author_position: '2', author_id_ecva: 'middle', author_name_raw: 'Middle', affiliation_raw: 'China University' },
      { paper_uid: 'p1', author_position: '3', author_id_ecva: 'last', author_name_raw: 'Last', affiliation_raw: 'United States Lab' },
      { paper_uid: 'p1', author_position: '1', author_id_ecva: 'first', author_name_raw: 'First', affiliation_raw: 'China University' },
      { paper_uid: 'p2', author_position: '1', author_id_ecva: 'first', author_name_raw: 'First', affiliation_raw: 'China University' },
      { paper_uid: 'p3', author_position: '1', author_id_ecva: 'other', author_name_raw: 'Other', affiliation_raw: 'United States Lab' },
    ],
    entities: [
      { paper_uid: 'p1', raw_affiliation: 'China University', canonical_organization: 'China University', organization_country_code: 'CN', organization_country_name: 'China' },
      { paper_uid: 'p1', raw_affiliation: 'United States Lab', canonical_organization: 'United States Lab', organization_country_code: 'US', organization_country_name: 'United States' },
      { paper_uid: 'p2', raw_affiliation: 'China University', canonical_organization: 'China University', organization_country_code: 'CN', organization_country_name: 'China' },
      { paper_uid: 'p3', raw_affiliation: 'United States Lab', canonical_organization: 'United States Lab', organization_country_code: 'US', organization_country_name: 'United States' },
    ],
    contextual: [],
  };
  const full = buildCountryAuthorPayload(input, 'CN');
  const simple = buildCountryAuthorPayload(input, 'CN', new Map(), { authorSelection: 'first-last' });
  assert.equal(simple.stats.selectedPapers, full.stats.selectedPapers);
  assert.equal(simple.stats.selectedPapers, 2);
  assert.deepEqual(simple.graph.nodes.map((node) => [node.id, node.papers, node.firstAuthorPapers]), [
    ['ecva:first', 2, 2], ['ecva:last', 1, 0],
  ]);
  assert.deepEqual(simple.graph.links.map(({ source, target, weight }) => [source, target, weight]), [
    ['ecva:first', 'ecva:last', 1],
  ]);
  assert.equal(simple.graph.nodes.find((node) => node.id === 'ecva:last').countryCode, 'US');
  assert.equal(simple.metadata.viewLabel, 'China (simple)');
  assert.match(simple.metadata.authorSelectionRule, /not necessarily the corresponding author/);
  assert.equal(full.graph.nodes.length, 3);
  assert.equal(full.graph.links.length, 3);
});

test('enriches the legacy Korea graph with first-author and presentation paper counts', () => {
  const graph = {
    nodes: [{ id: 'a1', name: 'First', titles: ['Korea-led & work'], papers: 1 }, { id: 'a2', name: 'Coauthor', titles: ['Korea-led & work'], papers: 1 }],
    links: [{ source: 'a1', target: 'a2', weight: 1 }],
  };
  const result = koreaPayload(graph, {
    papers: [{ paper_uid: 'p1', title_raw: 'Korea-led &amp; work' }],
    authors: [
      { paper_uid: 'p1', author_position: '1', author_id_ecva: 'a1', affiliation_raw: 'Korea University' },
      { paper_uid: 'p1', author_position: '2', author_id_ecva: 'a2', affiliation_raw: 'Foreign Lab' },
    ],
    entities: [
      { paper_uid: 'p1', raw_affiliation: 'Korea University', canonical_organization: 'Korea University', organization_country_code: 'KR', organization_country_name: 'Korea' },
      { paper_uid: 'p1', raw_affiliation: 'Foreign Lab', canonical_organization: 'Foreign Lab', organization_country_code: 'US', organization_country_name: 'United States' },
    ],
    contextual: [],
  }, new Map([['p1', new Set(['Spotlight'])]]));
  assert.deepEqual(result.graph.nodes.map((node) => [node.id, node.firstAuthorPapers, node.oralPapers, node.spotlightPapers]), [
    ['a1', 1, 0, 1], ['a2', 0, 0, 1],
  ]);
  assert.deepEqual(result.graph.nodes.map((node) => [node.id, node.views, node.countryCode, node.countryName]), [
    ['a1', ['country:KR'], 'KR', 'Korea'], ['a2', ['other-countries'], 'US', 'United States'],
  ]);
  assert.deepEqual(result.views, [
    { id: 'country:KR', default: true, label: 'Korea' },
    { id: 'other-countries', default: false, label: 'Other countries' },
  ]);
  assert.deepEqual(result.graph.nodes.map((node) => [node.id, node.paperSummaries]), [
    ['a1', [{ title: 'Korea-led & work', isFirstAuthor: true, presentationTypes: ['Spotlight'] }]],
    ['a2', [{ title: 'Korea-led & work', isFirstAuthor: false, presentationTypes: ['Spotlight'] }]],
  ]);
});
