import { mountCountryAuthorNetwork } from './author-network.js?version=country-renderer-9';

const root = document.getElementById('paper-atlas-network');
const status = root.querySelector('.network-status');
const countryAliases = new Map([
  ['KOREA', 'KR'],
  ['REPUBLIC OF KOREA', 'KR'],
  ['SOUTH KOREA', 'KR'],
]);

function normalizedCountryCode(value) {
  const normalized = (value ?? 'KR').trim().replaceAll('_', ' ').replaceAll('-', ' ').replace(/\s+/gu, ' ').toUpperCase();
  return countryAliases.get(normalized) ?? (/^[A-Z]{2}$/u.test(normalized) ? normalized : 'KR');
}

function renderCountryMetadata(payload) {
  const controls = payload.metadata.controls ?? {};
  root.querySelector('.network-search-label').textContent = controls.searchLabel ?? 'Find author';
  const input = root.querySelector('.network-search input');
  input.setAttribute('aria-label', controls.searchLabel ?? 'Find author');
  input.placeholder = controls.searchPlaceholder ?? 'Search an author';
}

const url = new URL(window.location.href);
const country = normalizedCountryCode(url.searchParams.get('country'));
const view = url.searchParams.get('view');
if (url.searchParams.get('country') !== country) {
  url.searchParams.set('country', country);
  window.history.replaceState(null, '', url);
}

try {
  if (view && (view !== 'simple' || country !== 'CN')) throw new Error(`No ${view} country network is published for ${country}.`);
  const payloadName = view === 'simple' ? 'CN-simple' : country;
  const response = await fetch(`./data/eccv-2026/countries/${payloadName}.json`);
  if (!response.ok) throw new Error(`No country network is published for ${country}.`);
  const payload = await response.json();
  renderCountryMetadata(payload);
  const viewLabel = payload.metadata.viewLabel ?? payload.metadata.countryName;
  document.title = `${payload.metadata.venue} ${payload.metadata.year}: ${viewLabel} coauthor network`;
  root.querySelector('#network-title').textContent = `${payload.metadata.venue} ${payload.metadata.year}: ${viewLabel} paper coauthor network`;
  root.querySelector('svg').setAttribute('aria-label', `Coauthor network for ${viewLabel} papers at ${payload.metadata.venue} ${payload.metadata.year}`);
  if (view === 'simple') root.querySelector('#network-svg-description').textContent = 'Each circle is a first or last listed author of a selected paper. A line connects the two listed authors when they share a paper. The last listed author is not necessarily the corresponding author.';
  mountCountryAuthorNetwork(root, payload);
} catch (error) {
  status.textContent = error.message;
  status.style.display = 'block';
}
