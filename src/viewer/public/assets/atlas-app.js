import {
  authorGraph, countryGraph, escapeHtml, filteredOrganizations, formatNumber, metricFor,
  organizationById, personById, scopeTitle, selectedCountry, stateFromUrl, writeUrl
} from './atlas-core.js';
import { mountNetwork } from './atlas-network.js';

const app = document.querySelector('#app');
let atlas;
let state;

const metricCard = ({ label, value, note, selected = false }) => `<article class="metric-card${selected ? ' is-selected' : ''}"><span class="metric-label">${label}</span><strong>${value}</strong><small>${note}</small></article>`;
const selected = (condition) => condition ? ' selected' : '';
const pressed = (condition) => condition ? 'true' : 'false';

function countryRows(countries) {
  const maximum = Math.max(...countries.map((country) => metricFor(country, state.counting)), 1);
  return countries.map((country, index) => `<button class="ranking-row country-row" type="button" data-country="${country.code}" aria-pressed="${pressed(country.code === state.country)}"><span class="rank">${String(index + 1).padStart(2, '0')}</span><span class="ranking-name">${escapeHtml(country.name)}</span><span class="bar-track"><span class="bar-fill" style="--bar-width:${metricFor(country, state.counting) / maximum * 100}%"></span></span><strong>${formatNumber(metricFor(country, state.counting))}</strong></button>`).join('');
}

function organizationRows(organizations) {
  const maximum = Math.max(...organizations.map((organization) => organization.paperCount), 1);
  return organizations.slice(0, 80).map((organization, index) => `<button class="ranking-row organization-row" type="button" data-organization="${escapeHtml(organization.id)}" aria-pressed="${pressed(organization.id === state.organization)}"><span class="rank">${String(index + 1).padStart(2, '0')}</span><span class="ranking-name">${escapeHtml(organization.name)}</span><span class="bar-track"><span class="bar-fill" style="--bar-width:${organization.paperCount / maximum * 100}%"></span></span><strong>${formatNumber(organization.paperCount)}</strong></button>`).join('');
}

function scopeDetail() {
  const country = selectedCountry(atlas, state);
  const organization = state.organization ? organizationById(atlas).get(state.organization) : null;
  if (organization) return `<div class="details"><div class="detail-line"><span>Institution</span><strong>${escapeHtml(organization.name)}</strong></div><div class="detail-line"><span>Country</span><strong>${escapeHtml(organization.countryName || 'Unassigned')}</strong></div><div class="detail-line"><span>Papers</span><strong>${formatNumber(organization.paperCount)}</strong></div><div class="detail-line"><span>First-author papers</span><strong>${formatNumber(organization.firstAuthorPaperCount)}</strong></div><div class="detail-line"><span>Authors</span><strong>${formatNumber(organization.authorCount)}</strong></div></div>`;
  if (country) return `<div class="details"><div class="detail-line"><span>Country</span><strong>${escapeHtml(country.name)}</strong></div><div class="detail-line"><span>Full-count papers</span><strong>${formatNumber(country.paperCount)}</strong></div><div class="detail-line"><span>Fractional papers</span><strong>${formatNumber(country.fractionalPaperCount)}</strong></div><div class="detail-line"><span>Institutions</span><strong>${formatNumber(country.organizationCount)}</strong></div><div class="detail-line"><span>International papers</span><strong>${formatNumber(country.internationalPaperCount)}</strong></div></div>`;
  return `<div class="details"><p class="muted">Choose a country from the ranking or an institution below. The author graph then uses only that explicit scope.</p></div>`;
}

function authorDetail() {
  if (!state.selectedAuthor) return '';
  const person = personById(atlas).get(state.selectedAuthor);
  if (!person) return '';
  const organizations = person.organizations.map((organization) => escapeHtml(organization.name)).join(' · ');
  return `<section class="author-detail" aria-live="polite"><p class="eyebrow">Selected author</p><h3>${escapeHtml(person.name)}</h3><p class="muted">${organizations || 'No attributable organization'} · ${formatNumber(person.paperIds.length)} atlas papers</p></section>`;
}

function render() {
  writeUrl(state);
  const countries = [...atlas.countries].sort((left, right) => metricFor(right, state.counting) - metricFor(left, state.counting) || left.name.localeCompare(right.name));
  const country = selectedCountry(atlas, state);
  const organizations = filteredOrganizations(atlas, state);
  const showingOrganizations = Boolean(state.country || state.search.trim());
  const graph = state.country || state.organization ? authorGraph(atlas, state) : countryGraph(atlas, state);
  const scope = scopeTitle(atlas, state);
  const coverage = `${formatNumber(atlas.metadata.countryAttributedPaperCount)} of ${formatNumber(atlas.metadata.paperCount)} papers`;
  app.className = '';
  app.innerHTML = `
    <section aria-labelledby="atlas-title">
      <p class="eyebrow">${escapeHtml(atlas.metadata.venue)} ${atlas.metadata.year} · global pilot</p>
      <h1 id="atlas-title">Conference research, mapped by evidence.</h1>
      <p class="lede">Compare countries and institutions from normalized affiliations, then open a bounded coauthor context only when a scope is selected.</p>
    </section>
    <section class="scope-bar" aria-label="Atlas controls">
      <div class="control-card"><label for="country-select">Country scope</label><select id="country-select"><option value="">All countries</option>${atlas.countries.map((entry) => `<option value="${entry.code}"${selected(entry.code === state.country)}>${escapeHtml(entry.name)}</option>`).join('')}</select></div>
      <div class="segmented" role="group" aria-label="Paper counting method"><button type="button" data-counting="full" class="${state.counting === 'full' ? 'is-active' : ''}" aria-pressed="${pressed(state.counting === 'full')}">Full count</button><button type="button" data-counting="fractional" class="${state.counting === 'fractional' ? 'is-active' : ''}" aria-pressed="${pressed(state.counting === 'fractional')}">Fractional</button></div>
      <div class="control-card"><label for="organization-search">Find institution</label><input id="organization-search" value="${escapeHtml(state.search)}" placeholder="Search canonical institution"></div>
    </section>
    <section class="metrics-grid" aria-label="ECCV global metrics">
      ${metricCard({ label: 'Conference papers', value: formatNumber(atlas.metadata.paperCount), note: 'Official ECCV 2026 program snapshot' })}
      ${metricCard({ label: 'Countries', value: formatNumber(atlas.countries.length), note: `${coverage} with an attributable organization country` })}
      ${metricCard({ label: 'Institutions', value: formatNumber(atlas.metadata.organizationCount), note: 'Canonical organizations after normalization' })}
      ${metricCard({ label: state.counting === 'full' ? 'Selected-paper count' : 'Fractional paper count', value: country ? formatNumber(metricFor(country, state.counting)) : formatNumber(countries.reduce((sum, entry) => sum + metricFor(entry, state.counting), 0)), note: country ? `${country.name} in the current measure` : 'Summed across country memberships', selected: Boolean(country) })}
    </section>
    <section class="content-grid" aria-label="Atlas results">
      <article class="panel"><div class="panel-heading"><div><p class="eyebrow">${showingOrganizations ? state.country ? 'Institution ranking' : 'Institution search' : 'Country ranking'}</p><h2>${escapeHtml(state.search.trim() && !state.country ? `Matches for “${state.search.trim()}”` : scope)}</h2></div>${state.country || state.organization ? '<button type="button" id="clear-scope">Clear scope</button>' : ''}</div><div class="ranking-list">${showingOrganizations ? organizationRows(organizations) || '<p class="muted">No institutions match this search.</p>' : countryRows(countries)}</div></article>
      <article class="panel"><div class="panel-heading"><div><p class="eyebrow">Current scope</p><h2>Counting context</h2></div></div>${scopeDetail()}</article>
    </section>
    <section class="content-grid" aria-label="Network exploration">
      <article class="panel"><div class="panel-heading"><div><p class="eyebrow">${graph.kind === 'country' ? 'Country collaboration' : 'Local coauthor context'}</p><h2>${graph.kind === 'country' ? 'Cross-country paper links' : escapeHtml(scope)}</h2></div></div><canvas id="atlas-network" class="atlas-canvas" aria-describedby="network-note"></canvas><p id="network-note" class="canvas-note">${escapeHtml(graph.description)} Scroll to zoom; drag blank space to pan; select a node to inspect it.</p></article>
      <article class="panel"><div class="panel-heading"><div><p class="eyebrow">Interpretation</p><h2>What this view claims</h2></div></div><p class="muted">Country means the verified country of a canonical organization. It is not author nationality, and it does not infer a research-site country when the source does not establish one.</p>${graph.kind === 'author' && graph.hiddenAuthorCount ? `<p class="muted">${formatNumber(graph.hiddenAuthorCount)} further scoped authors are omitted from this canvas to keep the graph readable; the scope paper count remains complete.</p>` : ''}${authorDetail()}</article>
    </section>
    <aside class="provenance"><strong>Data boundary.</strong> This viewer is generated from an immutable official ECVA snapshot plus offline affiliation normalization. ${formatNumber(atlas.metadata.countryUnattributedPaperCount)} paper remains without an attributable organization country and is excluded from country measures. Read the <a href="methods.html">methods and country semantics</a>.</aside>`;
  bind(graph);
}

function bind(graph) {
  document.querySelector('#country-select').addEventListener('change', (event) => { state.country = event.target.value; state.organization = ''; state.selectedAuthor = ''; render(); });
  document.querySelectorAll('[data-counting]').forEach((button) => button.addEventListener('click', () => { state.counting = button.dataset.counting; render(); }));
  document.querySelector('#organization-search').addEventListener('input', (event) => { state.search = event.target.value; render(); document.querySelector('#organization-search').focus(); });
  document.querySelectorAll('.country-row').forEach((button) => button.addEventListener('click', () => { state.country = button.dataset.country; state.organization = ''; state.selectedAuthor = ''; render(); }));
  document.querySelectorAll('.organization-row').forEach((button) => button.addEventListener('click', () => { state.organization = button.dataset.organization; state.country = organizationById(atlas).get(state.organization).countryCode; state.selectedAuthor = ''; render(); }));
  document.querySelector('#clear-scope')?.addEventListener('click', () => { state.country = ''; state.organization = ''; state.selectedAuthor = ''; render(); });
  mountNetwork({
    canvas: document.querySelector('#atlas-network'),
    model: graph,
    onHover: () => {},
    onSelect: (node) => {
      if (graph.kind === 'country') { state.country = node.id; state.organization = ''; state.selectedAuthor = ''; }
      else state.selectedAuthor = node.id;
      render();
    }
  });
}

fetch('data/eccv26.json').then((response) => response.ok ? response.json() : Promise.reject(new Error(`Atlas data request failed: ${response.status}`))).then((data) => {
  atlas = data;
  state = stateFromUrl(atlas);
  render();
}).catch((error) => { app.textContent = `Unable to load atlas data: ${error.message}`; });
