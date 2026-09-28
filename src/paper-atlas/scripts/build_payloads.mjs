import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseCsv, writeTextAtomically } from '../../venues/eccv26-global/scripts/csv.mjs';
import { edgeMetricsAuditMarkdown } from './edge_metrics_audit.mjs';
import { buildCountryAuthorPayload, buildWorldGraph, koreaPayload } from './network_payloads.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(here, '../../..');
const dataRoot = path.join(repository, 'data/eccv26');
const publicData = path.join(here, '../public/data/eccv-2026');
const koreaSource = path.join(repository, 'src/venues/eccv26-korea/eccv_2026_korean_first_author_coauthor_network.html');

async function readInput() {
  const parsed = path.join(dataRoot, 'parsed');
  const normalized = path.join(dataRoot, 'normalized');
  const [papers, authors, entities, contextual] = await Promise.all([
    fs.readFile(path.join(parsed, 'papers_raw.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(parsed, 'author_affiliations_raw.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(normalized, 'affiliation_normalized_entities.csv'), 'utf8').then(parseCsv),
    fs.readFile(path.join(normalized, 'author_affiliation_contextual_inferences.csv'), 'utf8').then(parseCsv),
  ]);
  return { papers, authors, entities, contextual };
}

async function readPresentationTypes() {
  const manifest = JSON.parse(await fs.readFile(path.join(dataRoot, 'raw/manifest.json'), 'utf8'));
  const filename = manifest?.sources?.['ecva-virtual-program']?.file;
  if (!filename || path.basename(filename) !== filename) throw new Error('The ECVA presentation snapshot is unavailable.');
  const snapshot = JSON.parse(await fs.readFile(path.join(dataRoot, 'raw', filename), 'utf8'));
  const presentationTypesByPaper = new Map();
  for (const event of snapshot.results ?? []) {
    const type = String(event.eventtype ?? '');
    if (type !== 'Oral' && type !== 'Spotlight') continue;
    const paperId = String(event.uid ?? '');
    if (!paperId) continue;
    const types = presentationTypesByPaper.get(paperId) ?? new Set();
    types.add(type);
    presentationTypesByPaper.set(paperId, types);
  }
  return presentationTypesByPaper;
}

async function existingKoreaGraph() {
  const html = await fs.readFile(koreaSource, 'utf8');
  const match = html.match(/const allGraph = (\{[\s\S]*?\});\n    const esc/u);
  if (!match) throw new Error('Could not extract the Korea graph payload from its published source.');
  return JSON.parse(match[1]);
}

const input = await readInput();
const presentationTypesByPaper = await readPresentationTypes();
const world = buildWorldGraph(input);
const korea = koreaPayload(await existingKoreaGraph(), input, presentationTypesByPaper);
const china = buildCountryAuthorPayload(input, 'CN', presentationTypesByPaper);
const chinaSimple = buildCountryAuthorPayload(input, 'CN', presentationTypesByPaper, { authorSelection: 'first-last' });
const unitedStates = buildCountryAuthorPayload(input, 'US', presentationTypesByPaper);
const { nodes, links, ...worldMetadata } = world;
await Promise.all([
  writeTextAtomically(path.join(publicData, 'world.json'), `${JSON.stringify({ metadata: { venue: 'ECCV', year: 2026, ...worldMetadata }, graph: { nodes, links } })}\n`),
  writeTextAtomically(path.join(publicData, 'countries/KR.json'), `${JSON.stringify(korea)}\n`),
  writeTextAtomically(path.join(publicData, 'countries/CN.json'), `${JSON.stringify(china)}\n`),
  writeTextAtomically(path.join(publicData, 'countries/CN-simple.json'), `${JSON.stringify(chinaSimple)}\n`),
  writeTextAtomically(path.join(publicData, 'countries/US.json'), `${JSON.stringify(unitedStates)}\n`),
  writeTextAtomically(path.join(publicData, 'countries/index.json'), `${JSON.stringify({ schemaVersion: 1, venue: 'ECCV', year: 2026, countries: [korea, china, chinaSimple, unitedStates].map((payload) => ({ countryCode: payload.metadata.countryCode, countryName: payload.metadata.viewLabel ?? payload.metadata.countryName, ...(payload.metadata.viewLabel ? { view: 'simple', description: 'First and last listed authors only' } : {}), selectedPapers: payload.stats?.selectedPapers ?? null })) })}\n`),
  writeTextAtomically(path.join(publicData, 'catalog.json'), `${JSON.stringify({ schemaVersion: 1, snapshots: [{ venue: 'ECCV', year: 2026, routes: ['index.html', 'world.html', 'country.html?country=KR', 'country.html?country=CN', 'country.html?country=CN&view=simple', 'country.html?country=US'] }] })}\n`),
  writeTextAtomically(path.join(here, '../EDGE_METRICS.md'), edgeMetricsAuditMarkdown(world)),
]);
console.log(JSON.stringify({ globalInstitutions: world.nodes.length, institutionLinks: world.links.length, worldPapers: world.paperCount, organizationAttributedPapers: world.organizationAttributedPaperCount, koreaAuthors: korea.graph.nodes.length, koreaLinks: korea.graph.links.length, china: { ...china.stats, authors: china.graph.nodes.length, links: china.graph.links.length }, chinaSimple: { ...chinaSimple.stats, authors: chinaSimple.graph.nodes.length, links: chinaSimple.graph.links.length }, unitedStates: unitedStates.stats }, null, 2));
