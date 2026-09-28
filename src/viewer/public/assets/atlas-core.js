const numberFormat = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const codeIndex = (value) => [...value].reduce((sum, character) => sum + character.codePointAt(0), 0) % 8 + 1;

export const formatNumber = (value) => numberFormat.format(value);
export const escapeHtml = (value) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
export const countryColorToken = (code) => `--atlas-country-${codeIndex(code)}`;
export const organizationById = (atlas) => new Map(atlas.organizations.map((organization) => [organization.id, organization]));
export const personById = (atlas) => new Map(atlas.people.map((person) => [person.id, person]));

export function stateFromUrl(atlas) {
  const query = new URLSearchParams(location.search);
  const country = atlas.countries.some((entry) => entry.code === query.get('country')) ? query.get('country') : '';
  const organization = atlas.organizations.some((entry) => entry.id === query.get('organization')) ? query.get('organization') : '';
  return {
    counting: query.get('counting') === 'fractional' ? 'fractional' : 'full',
    country: organization ? organizationById(atlas).get(organization).countryCode : country,
    organization,
    search: '',
    selectedAuthor: ''
  };
}

export function writeUrl(state) {
  const query = new URLSearchParams();
  if (state.counting === 'fractional') query.set('counting', 'fractional');
  if (state.country) query.set('country', state.country);
  if (state.organization) query.set('organization', state.organization);
  history.replaceState({}, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
}

export function metricFor(country, counting) {
  return counting === 'fractional' ? country.fractionalPaperCount : country.paperCount;
}

export function selectedCountry(atlas, state) {
  return atlas.countries.find((country) => country.code === state.country) ?? null;
}

export function filteredOrganizations(atlas, state) {
  const needle = state.search.trim().toLocaleLowerCase();
  return atlas.organizations.filter((organization) => {
    const countryMatches = !state.country || organization.countryCode === state.country;
    const searchMatches = !needle || organization.name.toLocaleLowerCase().includes(needle);
    return countryMatches && searchMatches;
  });
}

export function scopePapers(atlas, state) {
  if (state.organization) return atlas.papers.filter((paper) => paper.organizationIds.includes(state.organization));
  if (state.country) return atlas.papers.filter((paper) => paper.countries.some((country) => country.code === state.country));
  return [];
}

export function countryGraph(atlas, state) {
  const ranked = [...atlas.countries].sort((left, right) => metricFor(right, state.counting) - metricFor(left, state.counting));
  const visible = ranked.slice(0, 28);
  const visibleCodes = new Set(visible.map((country) => country.code));
  return {
    kind: 'country',
    nodes: visible.map((country) => ({ id: country.code, label: country.name, weight: metricFor(country, state.counting), countryCode: country.code })),
    links: atlas.countryLinks.filter((link) => visibleCodes.has(link.source) && visibleCodes.has(link.target)),
    description: `Top ${visible.length} countries; links count papers with affiliations in both countries.`
  };
}

export function authorGraph(atlas, state) {
  const papers = scopePapers(atlas, state);
  const appearances = new Map();
  for (const paper of papers) {
    for (const authorId of paper.authorIds) appearances.set(authorId, (appearances.get(authorId) ?? 0) + 1);
  }
  const visibleIds = new Set([...appearances.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 180)
    .map(([authorId]) => authorId));
  const edges = new Map();
  for (const paper of papers) {
    const authors = paper.authorIds.filter((authorId) => visibleIds.has(authorId));
    for (let left = 0; left < authors.length; left += 1) {
      for (let right = left + 1; right < authors.length; right += 1) {
        const [source, target] = authors[left] < authors[right] ? [authors[left], authors[right]] : [authors[right], authors[left]];
        const key = `${source}\u0000${target}`;
        edges.set(key, { source, target, weight: (edges.get(key)?.weight ?? 0) + 1 });
      }
    }
  }
  const people = personById(atlas);
  return {
    kind: 'author',
    nodes: [...visibleIds].map((id) => ({ id, label: people.get(id)?.name ?? id, weight: appearances.get(id) ?? 0, countryCode: people.get(id)?.organizations[0]?.countryCode ?? '' })),
    links: [...edges.values()],
    hiddenAuthorCount: Math.max(0, appearances.size - visibleIds.size),
    paperCount: papers.length,
    description: `${papers.length} selected papers. Top ${visibleIds.size} authors by selected-paper appearances; links are shared selected papers.`
  };
}

export function scopeTitle(atlas, state) {
  if (state.organization) return organizationById(atlas).get(state.organization)?.name ?? 'Selected institution';
  if (state.country) return selectedCountry(atlas, state)?.name ?? 'Selected country';
  return 'Global overview';
}
