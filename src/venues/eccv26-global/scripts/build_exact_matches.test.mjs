import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

import { annotateOrganizationCountries, classifyArticleInsensitiveMatch, classifyContainedNameMatch, classifyExactMatch, organizationCountryIndex, paperContextIndex, resolveCompositeMatch, resolveMatch, resolvePaperContextMatch } from './build_exact_matches.mjs';
import { parseCsv } from './csv.mjs';

test('CSV parsing rejects rows with an unexpected column count', () => {
  assert.throws(() => parseCsv('name,value\nvalid,1\ninvalid,2,3\n'), /Malformed CSV row 3/);
});

test('CSV parsing rejects an unterminated quoted field', () => {
  assert.throws(() => parseCsv('name,value\nexample,"unterminated\n'), /unterminated quoted field/);
});

test('a repeated ROR name for one organization remains an exact single match', () => {
  const result = classifyExactMatch([
    { ror_id: 'https://ror.org/one', ror_display_name: 'Example University', country_code: 'KR', name_type: 'label' },
    { ror_id: 'https://ror.org/one', ror_display_name: 'Example University', country_code: 'KR', name_type: 'ror_display' }
  ]);
  assert.equal(result.status, 'exact_ror');
  assert.equal(result.ror_ids, 'https://ror.org/one');
});

test('multiple organizations sharing one comparison key remain ambiguous', () => {
  const result = classifyExactMatch([
    { ror_id: 'https://ror.org/one', ror_display_name: 'Example A', country_code: 'US', name_type: 'alias' },
    { ror_id: 'https://ror.org/two', ror_display_name: 'Example B', country_code: 'GB', name_type: 'alias' }
  ]);
  assert.equal(result.status, 'exact_ambiguous');
  assert.equal(result.ror_ids, 'https://ror.org/one;https://ror.org/two');
});

test('no ROR name candidate remains unresolved', () => {
  const result = classifyExactMatch([]);
  assert.equal(result.status, 'unresolved');
  assert.equal(result.ror_ids, '');
});

test('a leading article can resolve one otherwise exact ROR name in a non-composite source segment', () => {
  const result = classifyArticleInsensitiveMatch('the example university', [
    { ror_id: 'https://ror.org/example', comparison_key: 'example university', ror_display_name: 'Example University', country_code: 'US', country_name: 'United States', name_type: 'label' }
  ]);
  assert.equal(result.status, 'ror_article_variant');
  assert.equal(result.ror_ids, 'https://ror.org/example');
});

test('an omitted leading article can resolve one otherwise exact ROR name in a non-composite source segment', () => {
  const result = classifyArticleInsensitiveMatch('example university', [
    { ror_id: 'https://ror.org/example', comparison_key: 'the example university', ror_display_name: 'Example University', country_code: 'US', country_name: 'United States', name_type: 'label' }
  ]);
  assert.equal(result.status, 'ror_article_variant');
  assert.equal(result.ror_ids, 'https://ror.org/example');
});

test('article-insensitive matching does not collapse a composite source segment', () => {
  const result = classifyArticleInsensitiveMatch('the example university microsoft', [
    { ror_id: 'https://ror.org/example', comparison_key: 'example university', ror_display_name: 'Example University', country_code: 'US', country_name: 'United States', name_type: 'label' }
  ], true);
  assert.equal(result.status, 'unresolved');
});

test('a unique full ROR name embedded in a non-composite source segment resolves deterministically', () => {
  const result = classifyContainedNameMatch('department of computer science example university city', [
    { ror_id: 'https://ror.org/example', comparison_key: 'example university', ror_display_name: 'Example University', country_code: 'US', country_name: 'United States', name_type: 'label' }
  ]);
  assert.equal(result.status, 'ror_contained_name');
  assert.equal(result.ror_ids, 'https://ror.org/example');
});

test('contained-name matching requires whole normalized words rather than a prefix of a longer word', () => {
  const result = classifyContainedNameMatch('northwestern polytechnical university', [
    { ror_id: 'https://ror.org/canada', comparison_key: 'northwestern polytechnic', ror_display_name: 'Northwestern Polytechnic', country_code: 'CA', country_name: 'Canada', name_type: 'label' }
  ]);
  assert.equal(result.status, 'unresolved');
});

test('a composite source segment is not collapsed to one contained ROR name', () => {
  const result = classifyContainedNameMatch('example university microsoft', [
    { ror_id: 'https://ror.org/example', comparison_key: 'example university', ror_display_name: 'Example University', country_code: 'US', country_name: 'United States', name_type: 'label' }
  ], true);
  assert.equal(result.status, 'unresolved');
});

test('multiple full ROR names in one source segment are retained as multiple entities', () => {
  const result = classifyContainedNameMatch('example university example institute', [
    { ror_id: 'https://ror.org/university', comparison_key: 'example university', ror_display_name: 'Example University', country_code: 'US', country_name: 'United States', name_type: 'label' },
    { ror_id: 'https://ror.org/institute', comparison_key: 'example institute', ror_display_name: 'Example Institute', country_code: 'CA', country_name: 'Canada', name_type: 'label' }
  ], true);
  assert.equal(result.status, 'ror_multi_contained_name');
  assert.equal(result.normalized_entities.length, 2);
});

test('an embedded ROR-name collision is not mistaken for multiple explicit organizations', () => {
  const result = classifyContainedNameMatch('example university example company', [
    { ror_id: 'https://ror.org/us', comparison_key: 'example university', ror_display_name: 'Example University', country_code: 'US', country_name: 'United States', name_type: 'label' },
    { ror_id: 'https://ror.org/ca', comparison_key: 'example university', ror_display_name: 'Example University', country_code: 'CA', country_name: 'Canada', name_type: 'label' }
  ]);
  assert.equal(result.status, 'unresolved');
});

test('a verified alias overrides an otherwise unresolved key and retains its evidence', () => {
  const result = resolveMatch([], { canonical_ror_id: 'https://ror.org/alias', canonical_organization: 'Alias University', country_code: 'KR', country_name: 'South Korea', resolution_method: 'manual_verified_alias', evidence_url: 'https://example.edu/', evidence_note: 'Official name.' });
  assert.equal(result.status, 'manual_verified_alias');
  assert.equal(result.ror_ids, 'https://ror.org/alias');
  assert.equal(result.resolution_evidence_url, 'https://example.edu/');
});

test('an ECCV-scoped context decision resolves a globally ambiguous key without becoming a global alias', () => {
  const result = resolveMatch([
    { ror_id: 'https://ror.org/one', ror_display_name: 'Example University', country_code: 'US', country_name: 'United States', name_type: 'label' },
    { ror_id: 'https://ror.org/two', ror_display_name: 'Example University', country_code: 'CA', country_name: 'Canada', name_type: 'label' }
  ], { canonical_ror_id: 'https://ror.org/one', canonical_organization: 'Example University', country_code: 'US', country_name: 'United States', resolution_method: 'context_verified_eccv26', evidence_url: 'https://example.edu/', evidence_note: 'ECCV-specific primary evidence.' });
  assert.equal(result.status, 'context_verified_eccv26');
  assert.equal(result.ror_ids, 'https://ror.org/one');
});

test('a paper-scoped context decision takes precedence for only its matching paper occurrence', () => {
  const candidates = [
    { ror_id: 'https://ror.org/us', ror_display_name: 'Example University', country_code: 'US', country_name: 'United States', name_type: 'label' },
    { ror_id: 'https://ror.org/cn', ror_display_name: 'Example University', country_code: 'CN', country_name: 'China', name_type: 'label' }
  ];
  const context = { canonical_ror_id: 'https://ror.org/cn', canonical_organization: 'Example University', country_code: 'CN', country_name: 'China', resolution_method: 'paper_context_verified_eccv26', evidence_url: 'https://example.edu/', evidence_note: 'Paper-specific source context.' };
  const result = resolvePaperContextMatch(context, candidates, undefined);
  assert.equal(result.status, 'paper_context_verified_eccv26');
  assert.equal(result.ror_ids, 'https://ror.org/cn');
  assert.equal(resolvePaperContextMatch(undefined, candidates, undefined).status, 'exact_ambiguous');
});

test('paper-scoped decisions require one unique paper and comparison-key pair', () => {
  const rows = [{ paper_uid: 'paper-1', comparison_key: 'example university', canonical_organization: 'Example University', resolution_method: 'paper_context_verified_eccv26', evidence_url: 'https://example.edu/' }];
  const index = paperContextIndex(rows);
  assert.equal(index.get('paper-1\u0000example university')?.canonical_organization, 'Example University');
  assert.throws(() => paperContextIndex([...rows, ...rows]), /Duplicate paper context resolution/);
  assert.throws(() => paperContextIndex([{ ...rows[0], evidence_url: '' }]), /evidence URL/);
  assert.throws(() => paperContextIndex([{ ...rows[0], country_code: 'US', country_name: '' }]), /country code and country name/);
});

test('paper-scoped inferences require a cited public source and remain distinct from verification', () => {
  const rows = [{ paper_uid: 'paper-1', comparison_key: 'example university', canonical_ror_id: 'https://ror.org/example', canonical_organization: 'Example University', country_code: 'US', country_name: 'United States', resolution_method: 'paper_context_inferred_eccv26', evidence_url: 'https://example.edu/profile', evidence_note: 'A public author profile supports this inference.' }];
  assert.equal(paperContextIndex(rows).get('paper-1\u0000example university')?.resolution_method, 'paper_context_inferred_eccv26');
  assert.throws(() => paperContextIndex([{ ...rows[0], evidence_url: '' }]), /evidence URL/);
});

test('paper-scoped source literals preserve a named source organization without claiming a country or ROR', () => {
  const rows = [{ paper_uid: 'paper-1', comparison_key: 'example lab', canonical_organization: 'Example Lab', resolution_method: 'paper_context_source_literal_eccv26', evidence_note: 'Named only in the immutable ECCV snapshot.' }];
  assert.equal(paperContextIndex(rows).get('paper-1\u0000example lab')?.resolution_method, 'paper_context_source_literal_eccv26');
  assert.throws(() => paperContextIndex([{ ...rows[0], country_code: 'US', country_name: 'United States' }]), /cannot claim a ROR or country/);
  assert.throws(() => paperContextIndex([{ ...rows[0], canonical_ror_id: 'https://ror.org/example' }]), /cannot claim a ROR or country/);
});

test('paper-scoped identity-undetermined rows preserve the source label without inventing a country or ROR', () => {
  const rows = [{ paper_uid: 'paper-1', comparison_key: 'example university', canonical_organization: 'Example University', resolution_method: 'paper_context_identity_undetermined_eccv26', evidence_note: 'The source name collides and primary evidence did not decide.' }];
  assert.equal(paperContextIndex(rows).get('paper-1\u0000example university')?.resolution_method, 'paper_context_identity_undetermined_eccv26');
  assert.throws(() => paperContextIndex([{ ...rows[0], country_code: 'US', country_name: 'United States' }]), /cannot claim a ROR or country/);
});

test('a primary-source verified organization absent from ROR remains resolved without a ROR ID', () => {
  const result = resolveMatch([], { canonical_ror_id: '', canonical_organization: 'Independent Research Institute', country_code: 'BG', country_name: 'Bulgaria', resolution_method: 'manual_verified_no_ror', evidence_url: 'https://example.org/', evidence_note: 'Official name.' });
  assert.equal(result.status, 'manual_verified_no_ror');
  assert.equal(result.ror_ids, '');
  assert.equal(result.ror_display_names, 'Independent Research Institute');
});

test('a parent organization can be normalized while leaving an unstated research site country blank', () => {
  const result = resolveMatch([], { canonical_ror_id: '', canonical_organization: 'Example Company', parent_organization: 'Example Company', country_code: '', country_name: '', resolution_method: 'canonical_parent_country_undetermined', evidence_url: 'https://example.com/', evidence_note: 'Official company site.' });
  assert.equal(result.status, 'canonical_parent_country_undetermined');
  assert.equal(result.ror_display_names, 'Example Company');
  assert.equal(result.parent_organization, 'Example Company');
  assert.equal(result.ror_country_codes, '');
});

test('organization-country evidence fills a parent organization without overwriting source-level country fields', () => {
  const countries = organizationCountryIndex([{ canonical_organization: 'Example Company', organization_country_code: 'US', organization_country_name: 'United States', evidence_url: 'https://example.com/about', evidence_note: 'Official company page.' }]);
  const [entity] = annotateOrganizationCountries([{ canonical_organization: 'Example Company', country_code: '', country_name: '', resolution_evidence_url: 'https://example.com/', resolution_evidence_note: 'Identity evidence.' }], countries);
  assert.equal(entity.country_code, '');
  assert.equal(entity.organization_country_code, 'US');
  assert.equal(entity.organization_country_method, 'official_organization_country_evidence');
});

test('a ROR-backed entity falls back to its resolved entity country when no override is needed', () => {
  const [entity] = annotateOrganizationCountries([{ canonical_organization: 'Example University', country_code: 'KR', country_name: 'South Korea', resolution_evidence_url: '', resolution_evidence_note: '' }], new Map());
  assert.equal(entity.organization_country_code, 'KR');
  assert.equal(entity.organization_country_method, 'resolved_entity_country');
});

test('an identity-undetermined paper context never inherits an organization country', () => {
  const countries = organizationCountryIndex([{ canonical_organization: 'Example University', organization_country_code: 'CN', organization_country_name: 'China', evidence_url: 'https://example.edu/about', evidence_note: 'Official university page.' }]);
  const [entity] = annotateOrganizationCountries([{
    canonical_organization: 'Example University',
    match_status: 'paper_context_identity_undetermined_eccv26',
    country_code: 'CN',
    country_name: 'China',
    resolution_evidence_url: 'https://example.edu/',
    resolution_evidence_note: 'Must remain unresolved.'
  }], countries);
  assert.equal(entity.organization_country_code, '');
  assert.equal(entity.organization_country_method, '');
});

test('organization-country evidence rejects missing source URLs and conflicting decisions', () => {
  assert.throws(() => organizationCountryIndex([{ canonical_organization: 'Example Company', organization_country_code: 'US', organization_country_name: 'United States', evidence_url: '' }]), /Organization-country rows require/);
  assert.throws(() => organizationCountryIndex([
    { canonical_organization: 'Example Company', organization_country_code: 'US', organization_country_name: 'United States', evidence_url: 'https://example.com/us' },
    { canonical_organization: 'Example Company', organization_country_code: 'CA', organization_country_name: 'Canada', evidence_url: 'https://example.com/ca' }
  ]), /Conflicting organization-country decisions/);
});

test('a verified composite retains every explicit organization rather than collapsing it to one ROR', () => {
  const result = resolveCompositeMatch([
    { component_index: '2', canonical_ror_id: 'https://ror.org/two', canonical_organization: 'Example Company', country_code: '', country_name: '', resolution_method: 'context_decomposed_eccv26', evidence_url: 'https://example.com/', evidence_note: 'Official company source.' },
    { component_index: '1', canonical_ror_id: 'https://ror.org/one', canonical_organization: 'Example University', country_code: 'US', country_name: 'United States', resolution_method: 'context_decomposed_eccv26', evidence_url: 'https://example.edu/', evidence_note: 'Official university source.' }
  ]);
  assert.equal(result.status, 'context_decomposed_eccv26');
  assert.equal(result.ror_ids, 'https://ror.org/one;https://ror.org/two');
  assert.equal(result.ror_display_names, 'Example University;Example Company');
});

test('the INSAIT no-ROR dictionary entry retains its comma-bearing canonical organization', async () => {
  const aliases = parseCsv(await fs.readFile(new URL('../aliases/manual_aliases.csv', import.meta.url), 'utf8'));
  const entry = aliases.find((row) => row.comparison_key === 'institute for computer science ai and technology');
  assert.equal(entry.canonical_organization, 'Institute for Computer Science, Artificial Intelligence and Technology');
  assert.equal(entry.resolution_method, 'manual_verified_no_ror');
});

test('CityUHK DG remains the independent Dongguan institution rather than its Hong Kong parent', async () => {
  const aliases = parseCsv(await fs.readFile(new URL('../aliases/manual_aliases.csv', import.meta.url), 'utf8'));
  const entry = aliases.find((row) => row.comparison_key === 'city university of hong kong dg');
  assert.equal(entry.canonical_organization, 'City University of Hong Kong (Dongguan)');
  assert.equal(entry.country_code, 'CN');
  assert.equal(entry.resolution_method, 'manual_verified_no_ror');
});

test('N/A is retained as source-missing rather than assigned to a fuzzy organization candidate', async () => {
  const aliases = parseCsv(await fs.readFile(new URL('../aliases/manual_aliases.csv', import.meta.url), 'utf8'));
  const entry = aliases.find((row) => row.comparison_key === 'n a');
  assert.equal(entry.canonical_organization, '');
  assert.equal(entry.resolution_method, 'source_missing_affiliation');
});

test('every alias dictionary row preserves its country and resolution columns', async () => {
  const aliases = parseCsv(await fs.readFile(new URL('../aliases/manual_aliases.csv', import.meta.url), 'utf8'));
  for (const entry of aliases) {
    if (entry.resolution_method === 'source_missing_affiliation' || entry.resolution_method === 'not_institution' || entry.resolution_method === 'incomplete_affiliation') {
      assert.equal(entry.canonical_organization, '', entry.comparison_key);
    } else {
      assert.match(entry.country_code, /^[A-Z]{2}$/u, entry.comparison_key);
      assert.match(entry.resolution_method, /^manual_verified_/u, entry.comparison_key);
      assert.match(entry.evidence_url, /^https:\/\//u, entry.comparison_key);
    }
  }
});

test('every manual ROR identifier exists in the pinned local ROR index', async () => {
  const [aliases, index] = await Promise.all([
    fs.readFile(new URL('../aliases/manual_aliases.csv', import.meta.url), 'utf8').then(parseCsv),
    fs.readFile(new URL('../../../../data/eccv26/normalized/ror_name_index.csv', import.meta.url), 'utf8').then(parseCsv)
  ]);
  const rorIds = new Set(index.map((entry) => entry.ror_id));
  for (const entry of aliases.filter((row) => row.canonical_ror_id)) assert.equal(rorIds.has(entry.canonical_ror_id), true, entry.comparison_key);
});

test('high-confidence ROR name variants are tracked separately from primary-source manual aliases', async () => {
  const variants = parseCsv(await fs.readFile(new URL('../aliases/ror_name_variants.csv', import.meta.url), 'utf8'));
  const entry = variants.find((row) => row.comparison_key === 'great bay unversity');
  assert.equal(entry.resolution_method, 'ror_high_confidence_variant');
  assert.equal(entry.canonical_ror_id, 'https://ror.org/01hdgge16');
});

test('ROR variants retain comma-bearing official display names without shifting CSV fields', async () => {
  const variants = parseCsv(await fs.readFile(new URL('../aliases/ror_name_variants.csv', import.meta.url), 'utf8'));
  const entry = variants.find((row) => row.comparison_key === 'royal danish academy');
  assert.equal(entry.canonical_organization, 'Royal Danish Academy – Architecture, Design, Conservation');
  assert.equal(entry.country_code, 'DK');
  assert.equal(entry.resolution_method, 'ror_high_confidence_variant');
});

test('parent organization aliases preserve their evidence while intentionally omitting country', async () => {
  const aliases = parseCsv(await fs.readFile(new URL('../aliases/parent_entity_aliases.csv', import.meta.url), 'utf8'));
  const entry = aliases.find((row) => row.comparison_key === 'google deepmind');
  assert.equal(entry.canonical_organization, 'Google DeepMind');
  assert.equal(entry.parent_organization, 'Google');
  assert.equal(entry.country_code, '');
  assert.equal(entry.resolution_method, 'canonical_parent_country_undetermined');
  assert.match(entry.evidence_url, /^https:\/\//u);
});

test('parent organization aliases use valid source URLs and do not invent ROR identifiers', async () => {
  const aliases = parseCsv(await fs.readFile(new URL('../aliases/parent_entity_aliases.csv', import.meta.url), 'utf8'));
  for (const entry of aliases) {
    assert.equal(entry.resolution_method, 'canonical_parent_country_undetermined', entry.comparison_key);
    assert.ok(entry.canonical_organization, entry.comparison_key);
    assert.match(entry.evidence_url, /^https:\/\//u, entry.comparison_key);
    assert.ok(!entry.canonical_ror_id || /^https:\/\/ror\.org\//u.test(entry.canonical_ror_id), entry.comparison_key);
    assert.equal(Boolean(entry.country_code), Boolean(entry.country_name), entry.comparison_key);
  }
});

test('organization-country batch decisions are parseable, evidence-backed, and conflict-free', async () => {
  const directory = new URL('../aliases/organization_country_batches/', import.meta.url);
  const files = (await fs.readdir(directory)).filter((file) => file.endsWith('.csv')).sort();
  const rows = (await Promise.all(files.map((file) => fs.readFile(new URL(`../aliases/organization_country_batches/${file}`, import.meta.url), 'utf8').then(parseCsv)))).flat();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.ok(row.canonical_organization);
    assert.match(row.organization_country_code, /^[A-Z]{2}$/u, row.canonical_organization);
    assert.ok(row.organization_country_name);
    assert.match(row.evidence_url, /^https:\/\//u, row.canonical_organization);
  }
  assert.doesNotThrow(() => organizationCountryIndex(rows));
});

test('the ECCV context dictionary records an evidence-backed Korea University decision without turning it into a global alias', async () => {
  const contexts = parseCsv(await fs.readFile(new URL('../aliases/eccv26_context_resolutions.csv', import.meta.url), 'utf8'));
  const entry = contexts.find((row) => row.comparison_key === 'korea university');
  assert.equal(entry.canonical_ror_id, 'https://ror.org/047dqcg40');
  assert.equal(entry.resolution_method, 'context_verified_eccv26');
  assert.match(entry.evidence_url, /^https:\/\//u);
});

test('every composite decision has a unique component index and is event-scoped', async () => {
  const composites = parseCsv(await fs.readFile(new URL('../aliases/eccv26_composite_resolutions.csv', import.meta.url), 'utf8'));
  const keys = new Set();
  for (const entry of composites) {
    const key = `${entry.comparison_key}#${entry.component_index}`;
    assert.equal(keys.has(key), false, key);
    keys.add(key);
    assert.equal(entry.resolution_method, 'context_decomposed_eccv26');
    assert.ok(entry.canonical_organization, entry.comparison_key);
  }
});
