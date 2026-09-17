import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv, writeCsvAtomically, writeTextAtomically } from './csv.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(HERE, '../../../../data/eccv26');
const DEFAULT_ALIAS_PATH = path.resolve(HERE, '../aliases/manual_aliases.csv');
const DEFAULT_ROR_VARIANT_PATH = path.resolve(HERE, '../aliases/ror_name_variants.csv');
const DEFAULT_PARENT_ENTITY_PATH = path.resolve(HERE, '../aliases/parent_entity_aliases.csv');
const DEFAULT_CONTEXT_RESOLUTION_PATH = path.resolve(HERE, '../aliases/eccv26_context_resolutions.csv');
const DEFAULT_PAPER_CONTEXT_RESOLUTION_PATH = path.resolve(HERE, '../aliases/eccv26_paper_context_resolutions.csv');
const DEFAULT_COMPOSITE_RESOLUTION_PATH = path.resolve(HERE, '../aliases/eccv26_composite_resolutions.csv');
const DEFAULT_ORGANIZATION_COUNTRY_DIRECTORY = path.resolve(HERE, '../aliases/organization_country_batches');
const OUTPUT_COLUMNS = ['paper_uid', 'raw_affiliation', 'segment_raw', 'comparison_key', 'segmentation_method', 'segment_index', 'author_record_count', 'paper_count', 'match_status', 'resolution_method', 'resolution_evidence_url', 'resolution_evidence_note', 'ror_ids', 'ror_display_names', 'parent_organization', 'ror_country_codes', 'ror_country_names', 'ror_name_types'];
const ENTITY_OUTPUT_COLUMNS = ['paper_uid', 'raw_affiliation', 'segment_raw', 'comparison_key', 'segmentation_method', 'segment_index', 'author_record_count', 'paper_count', 'normalized_entity_index', 'match_status', 'resolution_method', 'resolution_evidence_url', 'resolution_evidence_note', 'ror_id', 'canonical_organization', 'parent_organization', 'country_code', 'country_name', 'ror_name_type', 'organization_country_code', 'organization_country_name', 'organization_country_method', 'organization_country_evidence_url', 'organization_country_evidence_note'];
const GENERIC_TOKENS = new Set(['and', 'center', 'centre', 'college', 'department', 'for', 'in', 'institute', 'laboratory', 'lab', 'of', 'research', 'school', 'the', 'university', 'technology', 'science', 'engineering', 'artificial', 'intelligence', 'information', 'national', 'international']);

function joined(items, field) {
  return [...new Set(items.map((item) => String(item[field] ?? '')).filter(Boolean))].join(';');
}

export function classifyExactMatch(candidates) {
  const byRorId = new Map();
  for (const candidate of candidates) if (!byRorId.has(candidate.ror_id)) byRorId.set(candidate.ror_id, candidate);
  const unique = [...byRorId.values()].sort((left, right) => left.ror_id.localeCompare(right.ror_id));
  return {
    status: unique.length === 0 ? 'unresolved' : unique.length === 1 ? 'exact_ror' : 'exact_ambiguous',
    ror_ids: joined(unique, 'ror_id'), ror_display_names: joined(unique, 'ror_display_name'),
    parent_organization: '',
    ror_country_codes: joined(unique, 'country_code'), ror_country_names: joined(unique, 'country_name'),
    ror_name_types: joined(candidates, 'name_type'), resolution_method: '', resolution_evidence_url: '', resolution_evidence_note: ''
  };
}

export function resolveMatch(candidates, alias) {
  if (!alias) return classifyExactMatch(candidates);
  return { status: alias.resolution_method, ror_ids: alias.canonical_ror_id ?? '', ror_display_names: alias.canonical_organization ?? '', parent_organization: alias.parent_organization ?? '', ror_country_codes: alias.country_code ?? '', ror_country_names: alias.country_name ?? '', ror_name_types: 'manual_alias', resolution_method: alias.resolution_method, resolution_evidence_url: alias.evidence_url ?? '', resolution_evidence_note: alias.evidence_note ?? '' };
}

export function resolvePaperContextMatch(paperContext, candidates, alias) {
  return resolveMatch(candidates, paperContext ?? alias);
}

export function resolveCompositeMatch(compositeRows) {
  const ordered = [...compositeRows].sort((left, right) => Number(left.component_index) - Number(right.component_index));
  return {
    status: 'context_decomposed_eccv26', ror_ids: joined(ordered, 'canonical_ror_id'), ror_display_names: joined(ordered, 'canonical_organization'), parent_organization: joined(ordered, 'parent_organization'), ror_country_codes: joined(ordered, 'country_code'), ror_country_names: joined(ordered, 'country_name'), ror_name_types: 'context_composite_component', resolution_method: 'context_decomposed_eccv26', resolution_evidence_url: joined(ordered, 'evidence_url'), resolution_evidence_note: joined(ordered, 'evidence_note')
  };
}

function stripLeadingThe(comparisonKey) {
  const value = String(comparisonKey ?? '');
  return value.startsWith('the ') ? value.slice(4) : value;
}

export function classifyArticleInsensitiveMatch(comparisonKey, candidates, isComposite = false) {
  if (isComposite || (stripLeadingThe(comparisonKey) === comparisonKey && !candidates.some((candidate) => stripLeadingThe(candidate.comparison_key) !== candidate.comparison_key))) return classifyExactMatch([]);
  const resolved = classifyExactMatch(candidates);
  if (resolved.status !== 'exact_ror') return classifyExactMatch([]);
  return {
    ...resolved,
    status: 'ror_article_variant',
    resolution_method: 'ror_article_variant',
    resolution_evidence_note: 'The only difference from one unique registered ROR name is a leading article in this non-composite source segment.'
  };
}

function specificTokenCount(comparisonKey) {
  return new Set(String(comparisonKey ?? '').split(' ').filter((token) => token.length >= 4 && !GENERIC_TOKENS.has(token))).size;
}

function containsWholePhrase(source, phrase) {
  return ` ${String(source ?? '')} `.includes(` ${String(phrase ?? '')} `);
}

export function classifyContainedNameMatch(comparisonKey, candidates, isComposite = false) {
  const contained = candidates.filter((candidate) => {
    const name = String(candidate.comparison_key ?? '');
    return name.length >= 12 && specificTokenCount(name) >= 1 && containsWholePhrase(comparisonKey, name);
  });
  const byComparisonKey = new Map();
  for (const candidate of contained) {
    const rorIds = byComparisonKey.get(candidate.comparison_key) ?? new Set();
    rorIds.add(candidate.ror_id);
    byComparisonKey.set(candidate.comparison_key, rorIds);
  }
  if ([...byComparisonKey.values()].some((rorIds) => rorIds.size > 1)) return classifyExactMatch([]);
  const byRorId = new Map();
  for (const candidate of contained) if (!byRorId.has(candidate.ror_id)) byRorId.set(candidate.ror_id, candidate);
  const unique = [...byRorId.values()].sort((left, right) => left.ror_id.localeCompare(right.ror_id));
  if (unique.length > 1) return {
    status: 'ror_multi_contained_name', ror_ids: joined(unique, 'ror_id'), ror_display_names: joined(unique, 'ror_display_name'),
    parent_organization: '', ror_country_codes: joined(unique, 'country_code'), ror_country_names: joined(unique, 'country_name'),
    ror_name_types: joined(contained, 'name_type'), resolution_method: 'ror_multi_contained_name',
    resolution_evidence_url: '', resolution_evidence_note: 'Multiple distinct registered ROR names occur as complete normalized phrases in this source segment; each is retained as a normalized entity.',
    normalized_entities: unique
  };
  if (isComposite) return classifyExactMatch([]);
  if (unique.length !== 1) return classifyExactMatch([]);
  return {
    status: 'ror_contained_name', ror_ids: joined(unique, 'ror_id'), ror_display_names: joined(unique, 'ror_display_name'),
    parent_organization: '',
    ror_country_codes: joined(unique, 'country_code'), ror_country_names: joined(unique, 'country_name'),
    ror_name_types: joined(contained, 'name_type'), resolution_method: 'ror_contained_name',
    resolution_evidence_url: '', resolution_evidence_note: 'A single registered ROR name is contained as a complete normalized phrase in this non-composite source segment.'
  };
}

function containedNameIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    for (const token of new Set(String(row.comparison_key ?? '').split(' ').filter((item) => item.length >= 4 && !GENERIC_TOKENS.has(item)))) {
      const matches = index.get(token) ?? [];
      matches.push(row);
      index.set(token, matches);
    }
  }
  return index;
}

function articleInsensitiveIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const key = stripLeadingThe(row.comparison_key);
    const matches = index.get(key) ?? [];
    matches.push(row);
    index.set(key, matches);
  }
  return index;
}

function containedNameCandidates(comparisonKey, index) {
  const tokens = [...new Set(String(comparisonKey ?? '').split(' ').filter((token) => token.length >= 4 && !GENERIC_TOKENS.has(token)))].sort((left, right) => (index.get(left)?.length ?? 0) - (index.get(right)?.length ?? 0));
  const candidates = new Set();
  for (const token of tokens) for (const candidate of index.get(token) ?? []) candidates.add(candidate);
  return [...candidates];
}

function aliasIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const allowsEmptyCanonicalOrganization = new Set(['source_missing_affiliation', 'not_institution', 'incomplete_affiliation']).has(row.resolution_method);
    if (!row.comparison_key || (!row.canonical_organization && !allowsEmptyCanonicalOrganization)) throw new Error('Alias rows require comparison_key and canonical_organization unless they explicitly record a source-missing, non-institution, or incomplete-affiliation status');
    if (index.has(row.comparison_key)) throw new Error(`Duplicate alias comparison key: ${row.comparison_key}`);
    index.set(row.comparison_key, row);
  }
  return index;
}

export function paperContextIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (!row.paper_uid || !row.comparison_key || !row.canonical_organization) throw new Error('Paper context rows require paper_uid, comparison_key, and canonical_organization');
    if (!new Set(['paper_context_verified_eccv26', 'paper_context_inferred_eccv26', 'paper_context_source_literal_eccv26', 'paper_context_identity_undetermined_eccv26']).has(row.resolution_method)) throw new Error(`Unsupported paper context resolution method: ${row.resolution_method}`);
    if (new Set(['paper_context_verified_eccv26', 'paper_context_inferred_eccv26']).has(row.resolution_method) && !String(row.evidence_url ?? '').startsWith('https://')) throw new Error(`Verified or inferred paper context rows require an HTTPS evidence URL: ${row.paper_uid}/${row.comparison_key}`);
    if (new Set(['paper_context_source_literal_eccv26', 'paper_context_identity_undetermined_eccv26']).has(row.resolution_method) && (row.canonical_ror_id || row.country_code || row.country_name)) throw new Error(`Non-verified paper context rows cannot claim a ROR or country: ${row.paper_uid}/${row.comparison_key}`);
    if (Boolean(row.country_code) !== Boolean(row.country_name)) throw new Error(`Paper context rows require both country code and country name or neither: ${row.paper_uid}/${row.comparison_key}`);
    const key = `${row.paper_uid}\u0000${row.comparison_key}`;
    if (index.has(key)) throw new Error(`Duplicate paper context resolution: ${row.paper_uid}/${row.comparison_key}`);
    index.set(key, row);
  }
  return index;
}

function compositeIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (!row.comparison_key || !row.component_index || !row.canonical_organization) throw new Error('Composite resolution rows require comparison_key, component_index, and canonical_organization');
    if (row.resolution_method !== 'context_decomposed_eccv26') throw new Error(`Unsupported composite resolution method: ${row.resolution_method}`);
    const components = index.get(row.comparison_key) ?? [];
    if (components.some((component) => component.component_index === row.component_index)) throw new Error(`Duplicate composite component index: ${row.comparison_key}#${row.component_index}`);
    components.push(row);
    index.set(row.comparison_key, components);
  }
  return index;
}

function isCompositeSourceSegment(segmentRaw) {
  return /[\/&]/u.test(String(segmentRaw ?? ''));
}

function entityRowsForMatch(row, composites) {
  const components = composites.get(row.comparison_key);
  if (components) return [...components].sort((left, right) => Number(left.component_index) - Number(right.component_index)).map((component) => ({ ...row, normalized_entity_index: component.component_index, match_status: 'context_decomposed_eccv26', resolution_method: component.resolution_method, resolution_evidence_url: component.evidence_url ?? '', resolution_evidence_note: component.evidence_note ?? '', ror_id: component.canonical_ror_id ?? '', canonical_organization: component.canonical_organization ?? '', parent_organization: component.parent_organization ?? '', country_code: component.country_code ?? '', country_name: component.country_name ?? '', ror_name_type: 'context_composite_component' }));
  if (row.normalized_entities) return row.normalized_entities.map((entity, index) => ({ ...row, normalized_entity_index: String(index + 1), ror_id: entity.ror_id, canonical_organization: entity.ror_display_name, country_code: entity.country_code, country_name: entity.country_name, ror_name_type: entity.name_type }));
  return [{ ...row, normalized_entity_index: '1', ror_id: row.ror_ids, canonical_organization: row.ror_display_names, country_code: row.ror_country_codes, country_name: row.ror_country_names, ror_name_type: row.ror_name_types }];
}

export function organizationCountryIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    if (!row.canonical_organization || !row.organization_country_code || !row.organization_country_name || !String(row.evidence_url ?? '').startsWith('https://')) throw new Error('Organization-country rows require canonical organization, ISO code, country name, and HTTPS evidence URL');
    const existing = index.get(row.canonical_organization);
    const normalized = {
      organization_country_code: row.organization_country_code,
      organization_country_name: row.organization_country_name,
      organization_country_method: 'official_organization_country_evidence',
      organization_country_evidence_url: row.evidence_url,
      organization_country_evidence_note: row.evidence_note ?? ''
    };
    if (existing && (existing.organization_country_code !== normalized.organization_country_code || existing.organization_country_name !== normalized.organization_country_name)) throw new Error(`Conflicting organization-country decisions for ${row.canonical_organization}`);
    index.set(row.canonical_organization, normalized);
  }
  return index;
}

export function annotateOrganizationCountries(entities, organizationCountries) {
  return entities.map((entity) => {
    // These labels were deliberately retained as raw strings because the paper
    // context did not establish a unique institution.  A matching display name
    // or inherited country must not turn that unresolved identity into a fact.
    if (entity.match_status === 'paper_context_identity_undetermined_eccv26') {
      return {
        ...entity,
        organization_country_code: '',
        organization_country_name: '',
        organization_country_method: '',
        organization_country_evidence_url: '',
        organization_country_evidence_note: ''
      };
    }
    const explicit = organizationCountries.get(entity.canonical_organization);
    if (explicit) return { ...entity, ...explicit };
    if (entity.country_code && entity.country_name) {
      return {
        ...entity,
        organization_country_code: entity.country_code,
        organization_country_name: entity.country_name,
        organization_country_method: 'resolved_entity_country',
        organization_country_evidence_url: entity.resolution_evidence_url ?? '',
        organization_country_evidence_note: entity.resolution_evidence_note ?? ''
      };
    }
    return {
      ...entity,
      organization_country_code: '',
      organization_country_name: '',
      organization_country_method: '',
      organization_country_evidence_url: '',
      organization_country_evidence_note: ''
    };
  });
}

async function readOrganizationCountryRows(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => error.code === 'ENOENT' ? [] : Promise.reject(error));
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.csv')).map((entry) => entry.name).sort();
  return (await Promise.all(files.map((file) => fs.readFile(path.join(directory, file), 'utf8').then(parseCsv)))).flat();
}

async function main() {
  const dataRoot = process.argv[2] === '--data-root' ? path.resolve(process.argv[3]) : DEFAULT_DATA_ROOT;
  if (process.argv.length > 2 && process.argv[2] !== '--data-root') throw new Error('Usage: node build_exact_matches.mjs [--data-root DIR]');
  const parsedDir = path.join(dataRoot, 'parsed');
  const normalizedDir = path.join(dataRoot, 'normalized');
  const [segments, rorRows, aliasRows, rorVariantRows, parentEntityRows, contextRows, paperContextRows, compositeRows, organizationCountryRows] = await Promise.all([
    fs.readFile(path.join(parsedDir, 'affiliation_segment_candidates.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(normalizedDir, 'ror_name_index.csv'), 'utf8').then(parseCsv),
    fs.readFile(DEFAULT_ALIAS_PATH, 'utf8').then(parseCsv),
    fs.readFile(DEFAULT_ROR_VARIANT_PATH, 'utf8').then(parseCsv),
    fs.readFile(DEFAULT_PARENT_ENTITY_PATH, 'utf8').then(parseCsv),
    fs.readFile(DEFAULT_CONTEXT_RESOLUTION_PATH, 'utf8').then(parseCsv),
    fs.readFile(DEFAULT_PAPER_CONTEXT_RESOLUTION_PATH, 'utf8').then(parseCsv),
    fs.readFile(DEFAULT_COMPOSITE_RESOLUTION_PATH, 'utf8').then(parseCsv),
    readOrganizationCountryRows(DEFAULT_ORGANIZATION_COUNTRY_DIRECTORY)
  ]);
  const index = new Map();
  for (const row of rorRows) {
    const matches = index.get(row.comparison_key) ?? [];
    matches.push(row);
    index.set(row.comparison_key, matches);
  }
  const aliases = aliasIndex([...aliasRows, ...rorVariantRows, ...parentEntityRows, ...contextRows]);
  const paperContexts = paperContextIndex(paperContextRows);
  const composites = compositeIndex(compositeRows);
  const containedAliasRows = [...aliasRows, ...rorVariantRows, ...contextRows]
    .filter((row) => row.canonical_ror_id)
    .map((row) => ({ comparison_key: row.comparison_key, ror_id: row.canonical_ror_id, ror_display_name: row.canonical_organization, country_code: row.country_code, country_name: row.country_name, name_type: 'manual_alias' }));
  const contained = containedNameIndex([...rorRows, ...containedAliasRows]);
  const articleInsensitive = articleInsensitiveIndex(rorRows);
  const output = segments.map((segment) => {
    if (!segment.comparison_key) {
      return {
        ...segment,
        status: 'source_missing_affiliation',
        resolution_method: 'source_missing_affiliation',
        resolution_evidence_url: '',
        resolution_evidence_note: 'The source segment is an empty placeholder rather than an affiliation.',
        ror_ids: '',
        ror_display_names: '',
        parent_organization: '',
        ror_country_codes: '',
        ror_country_names: '',
        ror_name_types: ''
      };
    }
    const composite = composites.get(segment.comparison_key);
    const paperContext = paperContexts.get(`${segment.paper_uid}\u0000${segment.comparison_key}`);
    const resolved = paperContext ? resolvePaperContextMatch(paperContext, index.get(segment.comparison_key) ?? [], aliases.get(segment.comparison_key)) : composite ? resolveCompositeMatch(composite) : resolveMatch(index.get(segment.comparison_key) ?? [], aliases.get(segment.comparison_key));
    const isComposite = isCompositeSourceSegment(segment.segment_raw);
    const articleResolved = resolved.status === 'unresolved' ? classifyArticleInsensitiveMatch(segment.comparison_key, articleInsensitive.get(stripLeadingThe(segment.comparison_key)) ?? [], isComposite) : resolved;
    const containedResolved = articleResolved.status === 'unresolved' ? classifyContainedNameMatch(segment.comparison_key, containedNameCandidates(segment.comparison_key, contained), isComposite) : articleResolved;
    return { ...segment, match_status: '', ...containedResolved };
  });
  const counts = Object.fromEntries([...new Set(output.map((row) => row.status))].sort().map((status) => [status, output.filter((row) => row.status === status).length]));
  const rows = output.map(({ status, ...row }) => ({ ...row, match_status: status }));
  await writeCsvAtomically(path.join(normalizedDir, 'affiliation_exact_match_candidates.csv'), rows, OUTPUT_COLUMNS);
  const entities = annotateOrganizationCountries(rows.flatMap((row) => entityRowsForMatch(row, composites)), organizationCountryIndex(organizationCountryRows));
  await writeCsvAtomically(path.join(normalizedDir, 'affiliation_normalized_entities.csv'), entities, ENTITY_OUTPUT_COLUMNS);
  const resolvedRows = rows.filter((row) => row.match_status === 'exact_ror' || row.match_status === 'ror_article_variant' || row.match_status === 'ror_contained_name' || row.match_status === 'ror_multi_contained_name' || row.match_status === 'ror_high_confidence_variant' || row.match_status === 'canonical_parent_country_undetermined' || row.match_status === 'context_verified_eccv26' || row.match_status === 'paper_context_verified_eccv26' || row.match_status === 'paper_context_inferred_eccv26' || row.match_status === 'context_decomposed_eccv26' || row.match_status.startsWith('manual_verified_'));
  const report = { schema_version: 4, segment_candidates: rows.length, normalized_entity_rows: entities.length, alias_dictionary_rows: aliasRows.length + rorVariantRows.length + parentEntityRows.length + contextRows.length, manual_alias_dictionary_rows: aliasRows.length, ror_variant_dictionary_rows: rorVariantRows.length, parent_entity_dictionary_rows: parentEntityRows.length, eccv26_context_resolution_rows: contextRows.length, eccv26_paper_context_resolution_rows: paperContextRows.length, eccv26_composite_resolution_rows: compositeRows.length, organization_country_evidence_rows: organizationCountryRows.length, ...counts, matched_author_records: resolvedRows.reduce((sum, row) => sum + Number(row.author_record_count), 0), matched_paper_weights: resolvedRows.reduce((sum, row) => sum + Number(row.paper_count), 0) };
  await writeTextAtomically(path.join(normalizedDir, 'exact_match_report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
