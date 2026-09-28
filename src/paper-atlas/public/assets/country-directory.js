const directory = document.getElementById('country-directory');

function countryRoute(country) {
  const code = String(country.countryCode ?? '').toUpperCase();
  const link = document.createElement('a');
  link.className = 'route-item';
  const params = new URLSearchParams({ country: code });
  if (country.view) params.set('view', country.view);
  link.href = `./country.html?${params}`;
  const codeText = document.createElement('span');
  codeText.className = 'route-code';
  codeText.textContent = code;
  const name = document.createElement('strong');
  name.textContent = country.countryName;
  const description = document.createElement('span');
  description.textContent = `${country.description ?? `${country.venue ?? 'ECCV'} ${country.year ?? 2026} author coauthor network`}${country.selectedPapers === null || country.selectedPapers === undefined ? '' : ` · ${country.selectedPapers} papers`}`;
  link.append(codeText, name, description);
  return link;
}

try {
  const response = await fetch('./data/eccv-2026/countries/index.json');
  if (!response.ok) throw new Error('Published country routes are unavailable.');
  const catalog = await response.json();
  const countries = [...(catalog.countries ?? [])].sort((left, right) => left.countryName.localeCompare(right.countryName));
  directory.replaceChildren(...countries.map((country) => countryRoute({ ...country, venue: catalog.venue, year: catalog.year })));
  if (countries.length === 0) directory.textContent = 'No country routes are published yet.';
} catch (error) {
  directory.textContent = error.message;
  directory.classList.add('directory-error');
}
