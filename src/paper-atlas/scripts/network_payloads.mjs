function splitList(value) {
  return String(value ?? '').split(' | ').map((item) => item.trim()).filter(Boolean);
}

function authorKey(row) {
  return `${row.paper_uid}\u0000${row.author_position}`;
}

function affiliationKey(row) {
  return `${row.paper_uid}\u0000${row.raw_affiliation ?? row.affiliation_raw}`;
}

function contextualOrganizations(row) {
  const names = splitList(row.canonical_organizations);
  const codes = splitList(row.country_codes);
  const countries = splitList(row.country_names);
  return names.map((name, index) => ({ name, code: codes[index] ?? '', country: countries[index] ?? '' }));
}

function entityOrganizations(rows) {
  const organizations = new Map();
  for (const row of rows ?? []) {
    if (!row.canonical_organization) continue;
    const organization = {
      name: row.canonical_organization,
      code: row.organization_country_code || row.country_code || '',
      country: row.organization_country_name || row.country_name || '',
    };
    organizations.set(`${organization.name}\u0000${organization.code}`, organization);
  }
  return [...organizations.values()];
}

function organizationMaps(input) {
  const entitiesByAffiliation = new Map();
  for (const entity of input.entities) {
    const key = affiliationKey(entity);
    const entries = entitiesByAffiliation.get(key) ?? [];
    entries.push(entity);
    entitiesByAffiliation.set(key, entries);
  }
  return {
    contextualByAuthor: new Map(input.contextual.map((row) => [authorKey(row), row])),
    entitiesByAffiliation,
  };
}

function organizationsForAuthor(author, maps) {
  const contextual = maps.contextualByAuthor.get(authorKey(author));
  return contextual ? contextualOrganizations(contextual) : entityOrganizations(maps.entitiesByAffiliation.get(affiliationKey(author)));
}

function organizationId(organization) {
  return `${organization.name}\u0000${organization.code || 'ZZ'}`;
}

function organizationRecord(organization) {
  return {
    id: organizationId(organization),
    name: organization.name,
    countryCode: organization.code || 'ZZ',
    countryName: organization.country || 'Country unavailable',
    papers: new Set(),
  };
}

export function buildWorldGraph(input) {
  const maps = organizationMaps(input);
  const papers = new Map(input.papers.map((paper) => [paper.paper_uid, { id: paper.paper_uid, title: paper.title_raw, organizations: new Map() }]));
  for (const author of input.authors) {
    const paper = papers.get(author.paper_uid);
    if (!paper) continue;
    const organizations = organizationsForAuthor(author, maps);
    for (const organization of organizations) {
      if (!organization.name) continue;
      const record = organizationRecord(organization);
      paper.organizations.set(record.id, record);
    }
  }
  const organizations = new Map();
  const links = new Map();
  for (const paper of papers.values()) {
    const paperOrganizations = [...paper.organizations.values()].sort((left, right) => left.id.localeCompare(right.id));
    for (const item of paperOrganizations) {
      const organization = organizations.get(item.id) ?? item;
      organization.papers.add(paper.id);
      organizations.set(item.id, organization);
    }
    for (let left = 0; left < paperOrganizations.length; left += 1) {
      for (let right = left + 1; right < paperOrganizations.length; right += 1) {
        const source = paperOrganizations[left].id;
        const target = paperOrganizations[right].id;
        const key = `${source}\u0000${target}`;
        const link = links.get(key) ?? { source, target, paperIds: new Set(), fractionalPaperWeight: 0 };
        if (!link.paperIds.has(paper.id)) link.fractionalPaperWeight += 1 / (paperOrganizations.length - 1);
        link.paperIds.add(paper.id);
        links.set(key, link);
      }
    }
  }
  const titleById = new Map([...papers.values()].map((paper) => [paper.id, paper.title]));
  const nodes = [...organizations.values()].map((organization) => ({
    id: organization.id,
    name: organization.name,
    countryCode: organization.countryCode,
    countryName: organization.countryName,
    paperCount: organization.papers.size,
    titles: [...organization.papers].map((id) => titleById.get(id)).sort(),
  })).sort((left, right) => right.paperCount - left.paperCount || left.name.localeCompare(right.name));
  const organizationById = new Map(nodes.map((node) => [node.id, node]));
  const serializedLinks = [...links.values()].map((link) => {
    const sourcePaperCount = organizationById.get(link.source)?.paperCount ?? 0;
    const targetPaperCount = organizationById.get(link.target)?.paperCount ?? 0;
    const sourceShare = sourcePaperCount ? link.fractionalPaperWeight / sourcePaperCount : 0;
    const targetShare = targetPaperCount ? link.fractionalPaperWeight / targetPaperCount : 0;
    return {
      source: link.source,
      target: link.target,
      paperCount: link.paperIds.size,
      fractionalPaperWeight: link.fractionalPaperWeight,
      sourceShare,
      targetShare,
      mutuality: sourcePaperCount + targetPaperCount ? (2 * link.fractionalPaperWeight) / (sourcePaperCount + targetPaperCount) : 0,
      asymmetry: Math.abs(sourceShare - targetShare),
      titles: [...link.paperIds].map((id) => titleById.get(id)).sort(),
    };
  }).filter((link) => organizationById.has(link.source) && organizationById.has(link.target))
    .sort((left, right) => right.paperCount - left.paperCount || left.source.localeCompare(right.source) || left.target.localeCompare(right.target));
  return {
    nodes,
    links: serializedLinks,
    paperCount: papers.size,
    organizationAttributedPaperCount: [...papers.values()].filter((paper) => paper.organizations.size > 0).length,
  };
}

const countryLabels = {
  KR: { name: 'Korea' },
  CN: { name: 'China' },
  US: { name: 'United States' },
};

function authorIdentity(author) {
  return author.author_id_ecva ? `ecva:${author.author_id_ecva}` : `source:${author.paper_uid}:${author.author_position}`;
}

function titleKey(value) {
  return String(value ?? '')
    .replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&#(?:x27|39);/giu, "'")
    .replace(/&lt;/gu, '<').replace(/&gt;/gu, '>');
}

function countryCodeFor(organization) {
  return String(organization?.code || 'ZZ').toUpperCase();
}

function countryNameFor(organization) {
  const code = countryCodeFor(organization);
  return organization?.country || countryLabels[code]?.name || 'Country unavailable';
}

function countryViewId(code) {
  return `country:${code}`;
}

function countryViews(organizations, domesticCountryCode) {
  const codes = new Set(organizations.map(countryCodeFor).filter((code) => code !== 'ZZ'));
  if (!codes.size) return ['country:ZZ'];
  const views = [];
  if (codes.has(domesticCountryCode)) views.push(countryViewId(domesticCountryCode));
  if ([...codes].some((code) => code !== domesticCountryCode)) views.push('other-countries');
  return views;
}

function countryViewDefinitions(countryNamesByCode, viewIds, defaultCountryCode) {
  const domesticId = countryViewId(defaultCountryCode);
  const definitions = [{
    id: domesticId,
    default: true,
    label: countryNamesByCode.get(defaultCountryCode) ?? countryLabels[defaultCountryCode]?.name ?? defaultCountryCode,
  }];
  if (viewIds.includes('other-countries')) definitions.push({ id: 'other-countries', default: false, label: 'Other countries' });
  if (viewIds.includes('country:ZZ')) definitions.push({ id: 'country:ZZ', default: false, label: 'Country unavailable' });
  return definitions;
}

function primaryOrganization(organizations, rawAffiliation) {
  return organizations[0]
    ?? { name: rawAffiliation || 'Unresolved affiliation', code: '', country: '' };
}

// Country inclusion is intentionally affiliation-based: a paper appears in every
// country represented among its first author's normalized organizations. This is
// explicit about multi-affiliated first authors instead of silently inventing one.
export function buildCountryAuthorPayload(input, countryCode, presentationTypesByPaper = new Map(), options = {}) {
  const normalizedCode = String(countryCode).toUpperCase();
  const labels = countryLabels[normalizedCode];
  if (!labels) throw new Error(`No country view definition exists for ${normalizedCode}.`);
  const authorSelection = options.authorSelection ?? 'all';
  if (!['all', 'first-last'].includes(authorSelection)) throw new Error(`Unknown author selection: ${authorSelection}.`);
  const maps = organizationMaps(input);
  const papersById = new Map(input.papers.map((paper) => [paper.paper_uid, paper]));
  const authorsByPaper = new Map();
  for (const author of input.authors) {
    const authors = authorsByPaper.get(author.paper_uid) ?? [];
    authors.push(author);
    authorsByPaper.set(author.paper_uid, authors);
  }
  const nodesById = new Map();
  const linksById = new Map();
  const selectedPaperIds = new Set();
  const countryNamesByCode = new Map();
  for (const [paperId, authors] of authorsByPaper) {
    const firstAuthor = authors.find((author) => Number(author.author_position) === 1);
    if (!firstAuthor || !organizationsForAuthor(firstAuthor, maps).some((organization) => organization.code === normalizedCode)) continue;
    const paper = papersById.get(paperId);
    if (!paper) continue;
    selectedPaperIds.add(paperId);
    const lastAuthor = authors.reduce((last, author) => Number(author.author_position) > Number(last.author_position) ? author : last, firstAuthor);
    const visibleAuthors = authorSelection === 'first-last'
      ? lastAuthor === firstAuthor ? [firstAuthor] : [firstAuthor, lastAuthor]
      : authors;
    const nodeIds = [];
    for (const author of visibleAuthors) {
      const id = authorIdentity(author);
      const organizations = organizationsForAuthor(author, maps);
      const primary = primaryOrganization(organizations, author.affiliation_raw);
      const views = countryViews(organizations, normalizedCode);
      for (const organization of organizations) countryNamesByCode.set(countryCodeFor(organization), countryNameFor(organization));
      if (!organizations.length) countryNamesByCode.set('ZZ', 'Country unavailable');
      let node = nodesById.get(id);
      if (!node) {
        node = {
          id,
          name: author.author_name_raw || 'Unnamed author',
          affiliation: primary.name,
          institution: primary.name,
          countryCode: countryCodeFor(primary),
          countryName: countryNameFor(primary),
          views,
          otherAffiliations: organizations.filter((organization) => organization.name !== primary.name).map((organization) => organization.name),
          paperIds: new Set(),
          firstAuthorPaperIds: new Set(),
          oralPaperIds: new Set(),
          spotlightPaperIds: new Set(),
          titles: new Set(),
          paperSummariesById: new Map(),
        };
        nodesById.set(id, node);
      } else {
        for (const view of views) if (!node.views.includes(view)) node.views.push(view);
        for (const organization of organizations) if (organization.name !== node.institution && !node.otherAffiliations.includes(organization.name)) node.otherAffiliations.push(organization.name);
      }
      node.paperIds.add(paperId);
      if (Number(author.author_position) === 1) node.firstAuthorPaperIds.add(paperId);
      const presentationTypes = presentationTypesByPaper.get(paperId) ?? new Set();
      if (presentationTypes.has('Oral')) node.oralPaperIds.add(paperId);
      if (presentationTypes.has('Spotlight')) node.spotlightPaperIds.add(paperId);
      node.titles.add(paper.title_raw);
      node.paperSummariesById.set(paperId, {
        title: paper.title_raw,
        isFirstAuthor: Number(author.author_position) === 1,
        presentationTypes: ['Oral', 'Spotlight'].filter((type) => presentationTypes.has(type)),
      });
      nodeIds.push(id);
    }
    for (let left = 0; left < nodeIds.length; left += 1) for (let right = left + 1; right < nodeIds.length; right += 1) {
      const source = nodeIds[left];
      const target = nodeIds[right];
      if (source === target) continue;
      const key = source < target ? `${source}\u0000${target}` : `${target}\u0000${source}`;
      const link = linksById.get(key) ?? { source: source < target ? source : target, target: source < target ? target : source, weight: 0 };
      link.weight += 1;
      linksById.set(key, link);
    }
  }
  const links = [...linksById.values()];
  const degree = new Map([...nodesById.keys()].map((id) => [id, { degree: 0, weightedDegree: 0 }]));
  for (const link of links) {
    for (const id of [link.source, link.target]) {
      const counts = degree.get(id);
      counts.degree += 1;
      counts.weightedDegree += link.weight;
    }
  }
  const nodes = [...nodesById.values()].map((node) => ({
    id: node.id,
    name: node.name,
    affiliation: node.affiliation,
    institution: node.institution,
    countryCode: node.countryCode,
    countryName: node.countryName,
    views: node.views.sort(),
    otherAffiliations: node.otherAffiliations.sort(),
    papers: node.paperIds.size,
    firstAuthorPapers: node.firstAuthorPaperIds.size,
    oralPapers: node.oralPaperIds.size,
    spotlightPapers: node.spotlightPaperIds.size,
    titles: [...node.titles].sort(),
    paperSummaries: [...node.paperSummariesById.values()].sort((left, right) => left.title.localeCompare(right.title)),
    degree: degree.get(node.id).degree,
    weightedDegree: degree.get(node.id).weightedDegree,
  })).sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  return {
    metadata: {
      venue: 'ECCV', year: 2026, countryCode: normalizedCode, countryName: labels.name,
      source: 'ECCV normalized affiliation snapshot',
      selectionRule: 'A paper is included when its first author has at least one normalized affiliation in this country.',
      authorSelectionRule: authorSelection === 'first-last' ? 'Only the first and last listed authors of each selected paper are shown. The last author is not necessarily the corresponding author.' : 'All listed authors of each selected paper are shown.',
      ...(authorSelection === 'first-last' ? { viewLabel: `${labels.name} (simple)` } : {}),
      controls: { viewLegend: 'Author affiliation countries', searchLabel: 'Find author', searchPlaceholder: 'Search an author' },
    },
    views: countryViewDefinitions(countryNamesByCode, nodes.flatMap((node) => node.views), normalizedCode),
    graph: { nodes, links },
    stats: { selectedPapers: selectedPaperIds.size },
  };
}

function enrichKoreaGraph(graph, input, presentationTypesByPaper, domesticCountryCode) {
  const selectedTitles = new Set(graph.nodes.flatMap((node) => node.titles.map(titleKey)));
  const selectedPaperIds = new Set(input.papers.filter((paper) => selectedTitles.has(titleKey(paper.title_raw))).map((paper) => paper.paper_uid));
  const papersById = new Map(input.papers.map((paper) => [paper.paper_uid, paper]));
  const maps = organizationMaps(input);
  const legacyTitleByKey = new Map();
  for (const node of graph.nodes) for (const title of node.titles) legacyTitleByKey.set(titleKey(title), title);
  const countryNamesByCode = new Map();
  const statsByAuthorId = new Map(graph.nodes.map((node) => [String(node.id), {
    firstAuthorPaperIds: new Set(), oralPaperIds: new Set(), spotlightPaperIds: new Set(), paperSummariesByTitle: new Map(), countryCodes: new Set(), primaryCountryCode: 'ZZ', primaryCountryName: 'Country unavailable',
  }]));
  for (const author of input.authors) {
    if (!selectedPaperIds.has(author.paper_uid)) continue;
    const stats = statsByAuthorId.get(String(author.author_id_ecva));
    if (!stats) continue;
    const organizations = organizationsForAuthor(author, maps);
    const primary = primaryOrganization(organizations, author.affiliation_raw);
    if (stats.countryCodes.size === 0) {
      stats.primaryCountryCode = countryCodeFor(primary);
      stats.primaryCountryName = countryNameFor(primary);
    }
    for (const organization of organizations) {
      const code = countryCodeFor(organization);
      stats.countryCodes.add(code);
      countryNamesByCode.set(code, countryNameFor(organization));
    }
    if (!organizations.length) { stats.countryCodes.add('ZZ'); countryNamesByCode.set('ZZ', 'Country unavailable'); }
    if (Number(author.author_position) === 1) stats.firstAuthorPaperIds.add(author.paper_uid);
    const presentationTypes = presentationTypesByPaper.get(author.paper_uid) ?? new Set();
    if (presentationTypes.has('Oral')) stats.oralPaperIds.add(author.paper_uid);
    if (presentationTypes.has('Spotlight')) stats.spotlightPaperIds.add(author.paper_uid);
    const paper = papersById.get(author.paper_uid);
    const title = legacyTitleByKey.get(titleKey(paper?.title_raw)) ?? paper?.title_raw;
    if (title) stats.paperSummariesByTitle.set(titleKey(title), {
      title,
      isFirstAuthor: Number(author.author_position) === 1,
      presentationTypes: ['Oral', 'Spotlight'].filter((type) => presentationTypes.has(type)),
    });
  }
  return {
    ...graph,
    countryNamesByCode,
    nodes: graph.nodes.map((node) => {
      const stats = statsByAuthorId.get(String(node.id));
      return {
        ...node,
        countryCode: stats?.primaryCountryCode ?? 'ZZ',
        countryName: stats?.primaryCountryName ?? 'Country unavailable',
        views: countryViews([...(stats?.countryCodes ?? new Set(['ZZ']))].map((code) => ({ code })), domesticCountryCode),
        firstAuthorPapers: stats?.firstAuthorPaperIds.size ?? 0,
        oralPapers: stats?.oralPaperIds.size ?? 0,
        spotlightPapers: stats?.spotlightPaperIds.size ?? 0,
        paperSummaries: node.titles.map((title) => stats?.paperSummariesByTitle.get(titleKey(title)) ?? {
          title, isFirstAuthor: false, presentationTypes: [],
        }).sort((left, right) => left.title.localeCompare(right.title)),
      };
    }),
  };
}

export function koreaPayload(graph, input, presentationTypesByPaper = new Map()) {
  const enrichedGraph = enrichKoreaGraph(graph, input, presentationTypesByPaper, 'KR');
  const selectedPapers = new Set(enrichedGraph.nodes.flatMap((node) => node.titles)).size;
  return {
    metadata: {
      venue: 'ECCV', year: 2026, countryCode: 'KR', countryName: 'Korea', source: 'Korea parity graph extracted from the existing ECCV network build',
      controls: { viewLegend: 'Author affiliation countries', searchLabel: 'Find author', searchPlaceholder: 'e.g. Kyungdon Joo' },
    },
    views: countryViewDefinitions(enrichedGraph.countryNamesByCode, enrichedGraph.nodes.flatMap((node) => node.views), 'KR'),
    graph: { nodes: enrichedGraph.nodes, links: enrichedGraph.links },
    stats: { selectedPapers },
  };
}
