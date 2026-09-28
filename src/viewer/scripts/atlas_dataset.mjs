const valueList = (value) => String(value ?? '').split(' | ').map((entry) => entry.trim()).filter(Boolean);
const recordKey = (row) => `${row.paper_uid}\u0000${row.author_position}`;
const affiliationKey = (row) => `${row.paper_uid}\u0000${row.raw_affiliation ?? row.affiliation_raw}`;
const personKey = (row) => row.author_id_ecva ? `ecva:${row.author_id_ecva}` : `source:${row.paper_uid}:${row.author_position}`;
function stableId(value) {
  let hash = 14695981039346656037n;
  for (const character of value) hash = (hash ^ BigInt(character.codePointAt(0))) * 1099511628211n & 18446744073709551615n;
  return hash.toString(36);
}

const organizationKey = (organization) => `org-${stableId(`${organization.name}\u0000${organization.countryCode}`)}`;
const ordered = (items, compare) => [...items].sort(compare);

function contextualOrganizations(row) {
  const names = valueList(row.canonical_organizations);
  const codes = valueList(row.country_codes);
  const countries = valueList(row.country_names);
  return names.map((name, index) => ({
    name,
    countryCode: codes[index] ?? '',
    countryName: countries[index] ?? ''
  }));
}

function entityOrganizations(rows) {
  const unique = new Map();
  for (const row of rows ?? []) {
    if (!row.canonical_organization) continue;
    const organization = {
      name: row.canonical_organization,
      countryCode: row.organization_country_code ?? '',
      countryName: row.organization_country_name ?? ''
    };
    unique.set(organizationKey(organization), organization);
  }
  return [...unique.values()];
}

function indexedRows(rows, key) {
  const index = new Map();
  for (const row of rows) {
    const entries = index.get(key(row)) ?? [];
    entries.push(row);
    index.set(key(row), entries);
  }
  return index;
}

function addOrganization(stats, organization, paperId, authorId, firstAuthor) {
  const key = organizationKey(organization);
  const entry = stats.get(key) ?? {
    id: key,
    name: organization.name,
    countryCode: organization.countryCode,
    countryName: organization.countryName,
    paperIds: new Set(),
    authorIds: new Set(),
    firstAuthorPaperIds: new Set()
  };
  entry.paperIds.add(paperId);
  entry.authorIds.add(authorId);
  if (firstAuthor) entry.firstAuthorPaperIds.add(paperId);
  stats.set(key, entry);
}

function addCountry(stats, country, paperId, authorId, firstAuthor, international) {
  const entry = stats.get(country.code) ?? {
    code: country.code,
    name: country.name,
    paperIds: new Set(),
    authorIds: new Set(),
    organizationIds: new Set(),
    firstAuthorPaperIds: new Set(),
    internationalPaperIds: new Set()
  };
  entry.paperIds.add(paperId);
  entry.authorIds.add(authorId);
  if (firstAuthor) entry.firstAuthorPaperIds.add(paperId);
  if (international) entry.internationalPaperIds.add(paperId);
  stats.set(country.code, entry);
}

function pairs(values) {
  const output = [];
  for (let left = 0; left < values.length; left += 1) {
    for (let right = left + 1; right < values.length; right += 1) output.push([values[left], values[right]]);
  }
  return output;
}

export function buildAtlasDataset(input) {
  const options = { venue: 'ECCV', year: 2026, ...input.options };
  const entitiesByAffiliation = indexedRows(input.entities, affiliationKey);
  const contextByRecord = new Map(input.contextual.map((row) => [recordKey(row), row]));
  const papersById = new Map(input.papers.map((row) => [row.paper_uid, {
    ...row,
    authors: [],
    authorOrganizations: new Map(),
    countries: new Map(),
    organizations: new Map(),
    firstAuthorId: ''
  }]));
  const people = new Map();
  const organizationStats = new Map();
  const countryStats = new Map();

  for (const author of input.authors) {
    const paper = papersById.get(author.paper_uid);
    if (!paper) continue;
    const id = personKey(author);
    const person = people.get(id) ?? { id, name: author.author_name_raw, paperIds: new Set(), organizations: new Map() };
    const recovery = contextByRecord.get(recordKey(author));
    const organizations = recovery ? contextualOrganizations(recovery) : entityOrganizations(entitiesByAffiliation.get(affiliationKey(author)));
    person.paperIds.add(paper.paper_uid);
    paper.authors.push(id);
    if (Number(author.author_position) === 1) paper.firstAuthorId = id;
    const organizationsForAuthor = paper.authorOrganizations.get(id) ?? new Map();
    for (const organization of organizations) {
      person.organizations.set(organizationKey(organization), organization);
      organizationsForAuthor.set(organizationKey(organization), organization);
      paper.organizations.set(organizationKey(organization), organization);
      if (organization.countryCode) paper.countries.set(organization.countryCode, { code: organization.countryCode, name: organization.countryName });
    }
    paper.authorOrganizations.set(id, organizationsForAuthor);
    people.set(id, person);
  }

  const countryLinks = new Map();
  for (const paper of papersById.values()) {
    const countryList = ordered(paper.countries.values(), (left, right) => left.code.localeCompare(right.code));
    const international = countryList.length > 1;
    const firstAuthorId = paper.firstAuthorId;
    for (const authorId of new Set(paper.authors)) {
      for (const organization of paper.authorOrganizations.get(authorId)?.values() ?? []) addOrganization(organizationStats, organization, paper.paper_uid, authorId, authorId === firstAuthorId);
      for (const country of countryList) addCountry(countryStats, country, paper.paper_uid, authorId, authorId === firstAuthorId, international);
    }
    for (const country of countryList) countryStats.get(country.code).organizationIds = new Set([...countryStats.get(country.code).organizationIds, ...[...paper.organizations.values()].filter((organization) => organization.countryCode === country.code).map(organizationKey)]);
    for (const [source, target] of pairs(countryList.map((country) => country.code))) {
      const key = `${source}\u0000${target}`;
      countryLinks.set(key, { source, target, paperCount: (countryLinks.get(key)?.paperCount ?? 0) + 1 });
    }
  }

  const papers = ordered(papersById.values(), (left, right) => left.title_raw.localeCompare(right.title_raw)).map((paper) => ({
    id: paper.paper_uid,
    title: paper.title_raw,
    url: paper.paper_pdf_url,
    authorIds: [...new Set(paper.authors)],
    countries: ordered(paper.countries.values(), (left, right) => left.code.localeCompare(right.code)),
    organizationIds: ordered(paper.organizations.values(), (left, right) => left.name.localeCompare(right.name)).map(organizationKey)
  }));
  const countryAttributedPaperCount = papers.filter((paper) => paper.countries.length > 0).length;
  const serializedPeople = ordered(people.values(), (left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)).map((person) => ({
    id: person.id,
    name: person.name,
    paperIds: ordered(person.paperIds, (left, right) => left.localeCompare(right)),
    organizations: ordered(person.organizations.values(), (left, right) => left.name.localeCompare(right.name))
  }));
  const organizations = ordered(organizationStats.values(), (left, right) => right.paperIds.size - left.paperIds.size || left.name.localeCompare(right.name)).map((entry) => ({
    id: entry.id,
    name: entry.name,
    countryCode: entry.countryCode,
    countryName: entry.countryName,
    paperCount: entry.paperIds.size,
    authorCount: entry.authorIds.size,
    firstAuthorPaperCount: entry.firstAuthorPaperIds.size
  }));
  const countries = ordered(countryStats.values(), (left, right) => right.paperIds.size - left.paperIds.size || left.name.localeCompare(right.name)).map((entry) => ({
    code: entry.code,
    name: entry.name,
    paperCount: entry.paperIds.size,
    fractionalPaperCount: Number((entry.paperIds.size === 0 ? 0 : [...entry.paperIds].reduce((sum, paperId) => sum + 1 / papers.find((paper) => paper.id === paperId).countries.length, 0)).toFixed(4)),
    authorCount: entry.authorIds.size,
    organizationCount: entry.organizationIds.size,
    firstAuthorPaperCount: entry.firstAuthorPaperIds.size,
    internationalPaperCount: entry.internationalPaperIds.size
  }));

  return {
    schemaVersion: 1,
    metadata: {
      venue: options.venue,
      year: options.year,
      paperCount: papers.length,
      authorRecordCount: input.authors.length,
      authorCount: serializedPeople.length,
      organizationCount: organizations.length,
      countryAttributedPaperCount,
      countryUnattributedPaperCount: papers.length - countryAttributedPaperCount,
      countryMeasure: 'canonical organization country; not author nationality or inferred research-site country'
    },
    countries,
    organizations,
    countryLinks: ordered(countryLinks.values(), (left, right) => right.paperCount - left.paperCount || left.source.localeCompare(right.source)),
    papers,
    people: serializedPeople
  };
}
