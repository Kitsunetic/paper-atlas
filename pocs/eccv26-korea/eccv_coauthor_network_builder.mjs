import fs from 'node:fs/promises';

const root = process.cwd();
const selectedCsv = `${root}/eccv_2026_korean_first_author_affiliations_reaudited.csv`;
const output = process.env.ECCV_NETWORK_OUTPUT || `${root}/eccv_2026_korean_first_author_coauthor_network.html`;
const directoryOutput = process.env.ECCV_AFFILIATION_DIRECTORY_OUTPUT || `${root}/eccv_2026_coauthor_institution_directory.csv`;
const sourceUrl = 'https://eccv.ecva.net/static/virtual/data/eccv-2026-orals-posters.json';

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(field); field = ''; }
    else if (char === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (char !== '\r') field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function decode(value) {
  return String(value ?? '')
    .replaceAll('&amp;', '&').replaceAll('&quot;', '"')
    .replaceAll('&#x27;', "'").replaceAll('&#39;', "'");
}

function safeJson(value) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')
    .replace(/[\u007f-\uffff]/g, (character) => '\\u' + character.codePointAt(0).toString(16).padStart(4, '0'));
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n') + '\n';
}

const selectedRows = parseCsv(await fs.readFile(selectedCsv, 'utf8'));
const header = selectedRows.shift();
const idColumn = header.indexOf('virtual_poster_id');
const affiliationColumn = header.indexOf('first_author_affiliation_raw');
const categoryColumn = header.indexOf('primary_affiliation_category');
if (idColumn < 0) throw new Error('Selected-paper CSV lacks virtual_poster_id');
if (affiliationColumn < 0 || categoryColumn < 0) throw new Error('Selected-paper CSV lacks affiliation classifications');
const selectedIds = new Set(selectedRows.map((row) => Number(row[idColumn])));
if (selectedIds.size !== 277) throw new Error(`Expected 277 selected papers; got ${selectedIds.size}`);

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`ECVA fetch failed: ${response.status}`);
const payload = await response.json();
const papers = payload.results.filter((row) => row.eventtype === 'Poster' && selectedIds.has(Number(row.id)));
if (papers.length !== 277) throw new Error(`Expected 277 official selected Posters; got ${papers.length}`);

const people = new Map();
const edges = new Map();
const parent = new Map();
const find = (x) => {
  if (parent.get(x) !== x) parent.set(x, find(parent.get(x)));
  return parent.get(x);
};
const union = (a, b) => {
  const left = find(a), right = find(b);
  if (left !== right) parent.set(right, left);
};

for (const paper of papers) {
  const paperAuthors = [];
  for (const author of paper.authors ?? []) {
    const name = decode(author.fullname).trim() || 'Unnamed author';
    const affiliation = decode(author.institution).trim() || 'Unspecified affiliation';
    const id = String(author.id ?? `${name}::${affiliation}`);
    if (!people.has(id)) {
      people.set(id, { id, name, affiliationCounts: new Map(), paperIds: new Set(), paperTitles: new Set(), degree: 0, weightedDegree: 0 });
      parent.set(id, id);
    }
    const person = people.get(id);
    person.affiliationCounts.set(affiliation, (person.affiliationCounts.get(affiliation) ?? 0) + 1);
    person.paperIds.add(paper.id);
    person.paperTitles.add(decode(paper.name));
    paperAuthors.push(id);
  }
  const uniqueAuthors = [...new Set(paperAuthors)];
  for (let i = 0; i < uniqueAuthors.length; i += 1) {
    for (let j = i + 1; j < uniqueAuthors.length; j += 1) {
      const [source, target] = uniqueAuthors[i] < uniqueAuthors[j]
        ? [uniqueAuthors[i], uniqueAuthors[j]] : [uniqueAuthors[j], uniqueAuthors[i]];
      const key = `${source}\u0000${target}`;
      const edge = edges.get(key) ?? { source, target, weight: 0 };
      edge.weight += 1;
      edges.set(key, edge);
      union(source, target);
    }
  }
}

function normalizeInstitution(affiliation) {
  const normalized = affiliation.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
  const rules = [
    ['KETI', /\bketi\b|korea electronics technology institute/],
    ['ETRI', /\betri\b|electronics? and telecommunication(?:s)? research institute/],
    ['KIST', /\bkist\b|korea institute of science and technology/],
    ['KITECH', /\bkitech\b|korea institute of industrial technology/],
    ['KAIST', /\bkaist\b|korea advanced institute of science (?:&|and) technology/],
    ['POSTECH', /\bpostech\b|pohang university of science (?:&|and) technology/],
    ['DGIST', /\bdgist\b|daegu[- ]?gyeongbuk institute of science (?:&|and) technology/],
    ['UNIST', /\bunist\b|ulsan national institute of science (?:&|and) technology/],
    ['GIST', /\bgist\b|gwangju institute of science (?:&|and) technology/],
    ['SeoulTech', /seoul(?: national)? university of science (?:&|and) technology|seoultech/],
    ['Seoul National University Hospital', /seoul national university hospital/],
    ['Seoul National University', /\bseoul national university\b|\bsnu\b|snu\/cvlab/],
    ['Yonsei University', /\byonsei (?:university|univ\.?|univercity)\b/],
    ['Sungkyunkwan University', /\bsung\s*kyun\s*kwan university\b|\bsungkyunkwan university\b|\bskku\b/],
    ['Korea University', /\bkorea university\b/],
    ['Chung-Ang University', /\bchung[- ]?ang university\b/],
    ['Hanyang University', /\bhanyang univer(?:sity|sty)\b/],
    ['Kyung Hee University', /\bkyung\s*hee university\b/],
    ['Kyungpook National University', /\bkyungpook national university\b|\bknu\b/],
    ['Pusan National University', /\bpusan national university\b/],
    ['Chungnam National University', /\bchungnam national university\b/],
    ['Jeonbuk National University', /\bje(?:o|ou)nbuk national university\b/],
    ['University of Seoul', /\buniversity of seoul\b|\bseoul city university\b/],
    ['University of Ulsan College of Medicine', /university of ulsan college of medicine/],
    ['University of Ulsan', /\bulsan university\b|\buniversity of ulsan\b/],
    ['Ewha Womans University', /\bewha (?:womans|women\x27s|w\.) university\b/],
    ['Sogang University', /\bsogang university\b/],
    ['Soongsil University', /\bsoongsil (?:university|univ\.?)\b/],
    ['Sejong University', /\bsejong university\b/],
    ['Korea Aerospace University', /\bkorea aerospace university\b/],
    ['Korea Cyber University', /\bkorea cyber university\b/],
    ['Korea Institute of Energy Technology', /\bkorea institute of energy technology\b/],
    ['Asan Medical Center', /\basan medical center\b/],
    ['Catholic University of Korea', /\b(?:the )?catholic university of korea\b/],
    ['LG Electronics', /\blg (?:electronics|electronins)\b/],
    ['LG Corporation', /\blg corporation\b/],
    ['LG AI Research', /\blg ai research\b/],
    ['NAVER AI Lab', /\bnaver ai lab\b/],
    ['NAVER Cloud', /\bnaver cloud\b/],
    ['NAVER LABS', /\bnaver ?labs?\b/],
    ['CLO Virtual Fashion', /\bclo virtual fashion\b/],
    ['KRAFTON', /\bkrafton\b/],
    ['Kakao', /\bkakao\b/],
    ['Samsung', /\bsamsung\b/],
    ['SNOW Corporation', /\bsnow (?:corp\.?|corporation)\b/],
    ['SK Telecom', /\bsk telecom\b/],
    ['SK hynix', /\bsk hynix\b/],
    ['Hyundai Motor Company', /\bhyundai motor company\b/],
    ['POSCO DX', /\bposco dx\b/],
    ['StradVision', /\bstradvision\b/],
    ['AiM Future', /\baim ?future\b/],
    ['CJ Corp.', /\bcj (?:ai center|corp\.?)\b/],
  ];
  const matched = rules.find(([, pattern]) => pattern.test(normalized));
  return matched ? matched[0] : affiliation;
}

const companyAffiliations = new Set(selectedRows
  .filter((row) => row[categoryColumn] === 'KOREAN_COMPANY' || row[categoryColumn] === 'KOREAN_COMPANY_AND_ACADEMIC')
  .map((row) => decode(row[affiliationColumn]).toLocaleLowerCase()));
const universityAffiliations = new Set(selectedRows
  .filter((row) => ['KOREAN_UNIVERSITY_GRAD_SCIENCE_INSTITUTE', 'KOREAN_UNIVERSITY_OR_HOSPITAL'].includes(row[categoryColumn]))
  .map((row) => decode(row[affiliationColumn]).toLocaleLowerCase()));
const researchAffiliations = new Set(selectedRows
  .filter((row) => row[categoryColumn] === 'KOREAN_RESEARCH_INSTITUTE')
  .map((row) => decode(row[affiliationColumn]).toLocaleLowerCase()));
const universityPatterns = /\b(?:kaist|korea advanced institute of science (?:&|and) technology|postech|pohang university of science (?:&|and) technology|unist|ulsan national institute of science (?:&|and) technology|dgist|daegu[- ]?gyeongbuk institute of science (?:&|and) technology|gist|gwangju institute of science (?:&|and) technology|seoul national|yonsei|korea university|sungkyunkwan|sung kyun kwan|chung-ang|chungnam|hanyang|kyung[ -]?hee|kyungpook|pukyong|pusan|sejong|sogang|soongsil|sookmyung|ewha|jeonbuk|jeounbuk|kangwon|konkuk|kookmin|inha|handong|changwon|korea aerospace|korea cyber|university of seoul|seoul(?: ?national)? ?tech|seoul city university|snu\/cvlab|asan medical center|university of ulsan|ulsan university|catholic university of korea|ajou university|dankook university|kwangwoon university|\bknu\b|korea institute of energy technology)\b/;
const researchPatterns = /\b(?:keti|korea electronics technology institute|etri|electronics? and telecommunication(?:s)? research institute|kist|korea institute of science and technology|kitech|korea institute of industrial technology)\b/;
const companyPatterns = /\b(?:aim ?future|clo virtual fashion|kakao|krafton|lg(?: electronics| corporation)?|maum ai|naver(?: ?(?:ai )?labs?| cloud)?|ogq|snow(?: corporation)?|stradvision|samsung|ineeji|cj (?:ai|corp)|sk (?:telecom|hynix)|posco dx|hyundai motor company)\b/;
const affiliationViews = (affiliation) => {
  const normalized = affiliation.toLocaleLowerCase();
  const views = [];
  if (companyAffiliations.has(normalized) || companyPatterns.test(normalized)) views.push('company');
  if (researchAffiliations.has(normalized) || researchPatterns.test(normalized)) views.push('research');
  if (universityAffiliations.has(normalized) || universityPatterns.test(normalized)) views.push('university');
  return views.length ? views : ['foreign'];
};

const nodes = [...people.values()].map((person) => {
  const affiliations = [...person.affiliationCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return {
    id: person.id,
    name: person.name,
    affiliation: affiliations[0][0],
    institution: normalizeInstitution(affiliations[0][0]),
    views: affiliationViews(affiliations[0][0]),
    otherAffiliations: affiliations.slice(1).map(([name]) => name),
    papers: person.paperIds.size,
    titles: [...person.paperTitles].sort(),
    degree: 0,
    weightedDegree: 0,
  };
});
const categoryForNode = (node) => {
  if (node.views.includes('research')) return ['KOREAN_RESEARCH_INSTITUTE', '한국 연구기관'];
  if (node.views.includes('university')) return ['KOREAN_UNIVERSITY_GRAD_SCIENCE_INSTITUTE', '한국 대학·대학원·과학기술원'];
  if (node.views.includes('company')) return ['KOREAN_COMPANY', '한국 기업'];
  return ['FOREIGN_INSTITUTION', '외국 기관'];
};
const directoryByInstitution = new Map();
for (const node of nodes) {
  const [categoryId, categoryKo] = categoryForNode(node);
  const key = `${categoryId}\u0000${node.institution}`;
  const entry = directoryByInstitution.get(key) ?? {
    categoryId,
    categoryKo,
    institution: node.institution,
    authors: 0,
    dualAffiliationAuthors: 0,
    matchedViews: new Set(),
    paperTitles: new Set(),
    rawAffiliations: new Set(),
  };
  entry.authors += 1;
  if (node.views.length > 1) entry.dualAffiliationAuthors += 1;
  node.views.forEach((view) => entry.matchedViews.add(view));
  node.titles.forEach((title) => entry.paperTitles.add(title));
  entry.rawAffiliations.add(node.affiliation);
  directoryByInstitution.set(key, entry);
}
const affiliationDirectory = [...directoryByInstitution.values()]
  .sort((left, right) => left.categoryKo.localeCompare(right.categoryKo, 'ko') || right.authors - left.authors || left.institution.localeCompare(right.institution))
  .map((entry) => ({
    category_id: entry.categoryId,
    category_ko: entry.categoryKo,
    normalized_institution: entry.institution,
    author_count: entry.authors,
    selected_paper_count: entry.paperTitles.size,
    matched_filter_views: ['university', 'research', 'company', 'foreign'].filter((view) => entry.matchedViews.has(view)).join('|'),
    dual_affiliation_author_count: entry.dualAffiliationAuthors,
    raw_affiliation_variants: [...entry.rawAffiliations].sort((left, right) => left.localeCompare(right)).join(' | '),
  }));
const byId = new Map(nodes.map((node) => [node.id, node]));
for (const edge of edges.values()) {
  byId.get(edge.source).degree += 1;
  byId.get(edge.target).degree += 1;
  byId.get(edge.source).weightedDegree += edge.weight;
  byId.get(edge.target).weightedDegree += edge.weight;
}

const institutionCounts = new Map();
for (const node of nodes) institutionCounts.set(node.institution, (institutionCounts.get(node.institution) ?? 0) + 1);
const institutions = [...institutionCounts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  .map(([name, authors]) => ({ name, authors }));
const componentSizes = new Map();
for (const node of nodes) {
  const representative = find(node.id);
  componentSizes.set(representative, (componentSizes.get(representative) ?? 0) + 1);
}
const largestComponent = Math.max(...componentSizes.values());
const allGraph = { nodes, links: [...edges.values()] };
const stats = {
  papers: papers.length,
  authors: nodes.length,
  coauthorLinks: edges.size,
  components: componentSizes.size,
  largestComponent,
  institutions: institutions.length,
};
const topLegend = institutions.slice(0, 12);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ECCV 2026 coauthor network</title>
</head>
<body>
<section id="eccv-coauthor-network" aria-labelledby="eccv-network-title">
  <style>
    body { margin: 0; }
    #eccv-coauthor-network { --network-foreground: light-dark(#17191d, #f3f4f6); --network-background: light-dark(#ffffff, #121212); --network-muted: light-dark(#4b5563, #c2c7d0); --network-border: light-dark(#d2d6dc, #363b43); --network-card: light-dark(#ffffff, #17191d); --network-popover: light-dark(#ffffff, #23262c); --network-popover-foreground: light-dark(#17191d, #f3f4f6); --network-c1: light-dark(#d92d20, #ff6b61); --network-c2: light-dark(#e66a00, #ff9f1c); --network-c3: light-dark(#a86c00, #ffd166); --network-c4: light-dark(#5f9400, #a3e635); --network-c5: light-dark(#198754, #4ade80); --network-c6: light-dark(#008c83, #2dd4bf); --network-c7: light-dark(#007fc4, #38bdf8); --network-c8: light-dark(#2563eb, #60a5fa); --network-c9: light-dark(#5b4cc4, #818cf8); --network-c10: light-dark(#8129a6, #c084fc); --network-c11: light-dark(#c2185b, #f472b6); --network-c12: light-dark(#8b5a2b, #d6a56f); background: var(--network-background) !important; color: var(--network-foreground) !important; color-scheme: light dark; display: grid; font-family: var(--font-sans, system-ui, sans-serif); grid-template-rows: auto minmax(0, 1fr); height: 100dvh; margin: 0; max-width: none; min-height: 0; min-width: 0; overflow: hidden; width: 100%; }
    #eccv-coauthor-network, #eccv-coauthor-network * { box-sizing: border-box; }
    #eccv-coauthor-network .network-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: .5rem; min-width: 0; }
    #eccv-coauthor-network h2 { color: var(--network-foreground) !important; font-size: 1.1rem; margin: 0; letter-spacing: -.015em; min-width: 0; overflow-wrap: anywhere; }
    #eccv-coauthor-network .network-title-mobile { display: none; }
    #eccv-coauthor-network .network-tools { align-items: center; display: flex; flex-wrap: wrap; gap: .5rem; min-width: 0; }
    #eccv-coauthor-network .network-views { align-items: center; border: 0; display: flex; flex-wrap: wrap; gap: .35rem .65rem; margin: 0; min-width: 0; padding: 0; }
    #eccv-coauthor-network .network-views legend { color: var(--network-muted); float: left; font-size: .76rem; margin-right: .1rem; padding: 0; }
    #eccv-coauthor-network .network-view { align-items: center; color: var(--network-foreground); display: inline-flex; font-size: .76rem; gap: .25rem; min-width: 0; }
    #eccv-coauthor-network .network-search { align-items: center; display: inline-flex; gap: .35rem; font-size: .82rem; min-width: 0; }
    #eccv-coauthor-network .network-author-picker { min-width: 11rem; position: relative; }
    #eccv-coauthor-network .network-search input { background: var(--network-background); border: 1px solid var(--network-border); border-radius: var(--radius, .35rem); box-sizing: border-box; color: var(--network-foreground); font: inherit; padding: .3rem .45rem; width: 100%; }
    #eccv-coauthor-network .network-author-results { background: var(--network-card); border: 1px solid var(--network-border); border-radius: var(--radius, .5rem); box-shadow: 0 10px 30px color-mix(in srgb, var(--network-foreground) 12%, transparent); display: grid; gap: .1rem; left: 0; list-style: none; margin: .25rem 0 0; max-height: 14rem; min-width: max-content; overflow-y: auto; padding: .2rem; position: absolute; right: 0; top: 100%; z-index: 3; }
    #eccv-coauthor-network .network-author-results[hidden] { display: none; }
    #eccv-coauthor-network .network-author-result { align-items: start; background: transparent; border: 0; border-radius: var(--radius, .35rem); color: var(--network-foreground); cursor: pointer; display: grid; font: inherit; gap: .05rem; padding: .35rem .45rem; text-align: left; width: 100%; }
    #eccv-coauthor-network .network-author-result:hover, #eccv-coauthor-network .network-author-result:focus-visible, #eccv-coauthor-network .network-author-result.is-active { background: color-mix(in srgb, var(--network-foreground) 10%, transparent); outline: none; }
    #eccv-coauthor-network .network-author-result-institution, #eccv-coauthor-network .network-author-no-results { color: var(--network-muted); font-size: .76rem; }
    #eccv-coauthor-network .network-status { color: var(--network-muted); font-size: .82rem; line-height: 1.45; margin: 0; }
    #eccv-coauthor-network .network-frame { border: 1px solid var(--network-border); background: var(--network-card); border-radius: var(--radius, .75rem); display: grid; grid-template-rows: auto auto minmax(0, 1fr); min-height: 0; min-width: 0; overflow: visible; position: relative; }
    #eccv-coauthor-network .network-viewport { border-radius: var(--radius, .75rem) var(--radius, .75rem) 0 0; min-height: 0; min-width: 0; overflow: hidden; }
    #eccv-coauthor-network svg { background: var(--network-background); display: block; height: 100%; touch-action: none; width: 100%; }
    #eccv-coauthor-network .edge { stroke: var(--network-muted); stroke-linecap: round; }
    #eccv-coauthor-network .node { stroke: var(--network-background); stroke-width: 1.25px; cursor: grab; }
    #eccv-coauthor-network .node:active { cursor: grabbing; }
    #eccv-coauthor-network .label { fill: var(--network-foreground); font-size: 10px; paint-order: stroke; stroke: var(--network-background); stroke-width: 3px; stroke-linejoin: round; pointer-events: none; }
    #eccv-coauthor-network .selected-node-label { fill: var(--network-foreground); font-size: .82rem; font-weight: 700; paint-order: stroke; pointer-events: none; stroke: var(--network-background); stroke-linejoin: round; stroke-width: 4px; }
    #eccv-coauthor-network .legend { align-content: start; display: grid; gap: .18rem .5rem; grid-auto-rows: 1.55rem; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); max-height: min(26dvh, 13rem); overflow: auto; overscroll-behavior: contain; padding: .35rem .8rem; }
    #eccv-coauthor-network .legend[hidden], #eccv-coauthor-network .legend-toggle[hidden] { display: none; }
    #eccv-coauthor-network .legend.is-collapsed { max-height: 3.28rem; overflow: hidden; }
    #eccv-coauthor-network .legend-item { align-items: center; background: transparent; border: 0; color: var(--network-muted); cursor: pointer; display: inline-flex; font: inherit; font-size: .73rem; gap: .3rem; min-width: 0; overflow: hidden; padding: .18rem .25rem; text-align: left; white-space: nowrap; }
    #eccv-coauthor-network .legend-item:hover, #eccv-coauthor-network .legend-item:focus-visible { color: var(--network-foreground); text-decoration: underline; text-underline-offset: .18em; }
    #eccv-coauthor-network .legend-item.is-selected { background: color-mix(in srgb, var(--network-foreground) 10%, transparent); color: var(--network-foreground); font-weight: 600; }
    #eccv-coauthor-network .legend-item.is-muted { opacity: .48; }
    #eccv-coauthor-network .swatch { border-radius: 50%; display: inline-block; flex: 0 0 auto; height: .62rem; width: .62rem; }
    #eccv-coauthor-network .legend-name { overflow: hidden; text-overflow: ellipsis; }
    #eccv-coauthor-network .legend-toggle { align-self: start; background: transparent; border: 0; color: var(--network-muted); cursor: pointer; font: inherit; font-size: .76rem; margin: 0 .8rem .4rem; padding: .15rem .25rem; text-align: left; text-decoration: underline; text-underline-offset: .18em; }
    #eccv-coauthor-network .legend-toggle:hover, #eccv-coauthor-network .legend-toggle:focus-visible { color: var(--network-foreground); }
    #eccv-coauthor-network .tooltip { background: var(--network-popover); border: 1px solid var(--network-border); border-radius: var(--radius, .5rem); box-shadow: 0 10px 30px color-mix(in srgb, var(--network-foreground) 16%, transparent); box-sizing: border-box; color: var(--network-popover-foreground); display: none; font-size: .78rem; line-height: 1.4; max-width: min(360px, calc(100% - 16px)); padding: .55rem .65rem; pointer-events: none; position: absolute; z-index: 2; }
    #eccv-coauthor-network .tooltip strong { display: block; font-size: .83rem; margin-bottom: .15rem; }
    #eccv-coauthor-network .tooltip-divider { border-top: 1px solid color-mix(in srgb, var(--network-border) 82%, transparent); display: block; margin: .45rem 0 .4rem; }
    #eccv-coauthor-network .tooltip-papers { margin: 0; padding-left: 1.1rem; }
    #eccv-coauthor-network .tooltip-papers li + li { margin-top: .2rem; }
    #eccv-coauthor-network .network-status { display: none; padding: .8rem; }
    @media (max-width: 640px) { #eccv-coauthor-network { max-width: 100vw; width: 100vw; } #eccv-coauthor-network .network-heading, #eccv-coauthor-network .network-frame, #eccv-coauthor-network .network-viewport, #eccv-coauthor-network svg { max-width: 100vw; min-width: 0; width: 100vw; } #eccv-coauthor-network .network-heading { align-items: stretch; display: grid; gap: .45rem; grid-template-columns: minmax(0, 1fr); } #eccv-coauthor-network h2 { font-size: clamp(.92rem, 4.2vw, 1.05rem); overflow-wrap: anywhere !important; white-space: normal !important; width: 100%; } #eccv-coauthor-network .network-title-desktop { display: none; } #eccv-coauthor-network .network-title-mobile { display: inline; } #eccv-coauthor-network .network-tools { align-items: stretch; display: grid; grid-template-columns: minmax(0, 1fr); gap: .45rem; width: 100%; } #eccv-coauthor-network .network-views { align-items: start; display: grid; gap: .35rem; grid-template-columns: minmax(0, 1fr); width: 100%; } #eccv-coauthor-network .network-view { align-items: start; line-height: 1.25; white-space: normal; } #eccv-coauthor-network .network-search { display: grid; grid-template-columns: auto minmax(0, 1fr); width: 100%; } #eccv-coauthor-network .network-author-picker { min-width: 0; } #eccv-coauthor-network .legend { grid-template-columns: minmax(0, 1fr); max-height: 11rem; } }
  </style>
  <div class="network-heading">
    <h2 id="eccv-network-title"><span class="network-title-desktop">ECCV 2026: Korean-first-affiliation paper coauthor network</span><span class="network-title-mobile">ECCV 2026 coauthor network</span></h2>
    <div class="network-tools">
      <fieldset class="network-views" aria-label="Author affiliation view">
        <legend>Author affiliations</legend>
        <label class="network-view"><input type="checkbox" value="university"> Korean universities, graduate schools &amp; science institutes</label>
        <label class="network-view"><input type="checkbox" value="research"> Korean research institutes</label>
        <label class="network-view"><input type="checkbox" value="company"> Korean companies</label>
        <label class="network-view"><input type="checkbox" value="foreign"> Foreign institutions</label>
      </fieldset>
      <div class="network-search"><span>Find author</span>
        <span class="network-author-picker">
          <input type="search" aria-label="Find author" aria-describedby="network-search-status" aria-autocomplete="list" aria-controls="network-author-results" aria-expanded="false" aria-haspopup="listbox" autocomplete="off" placeholder="e.g. Kyungdon Joo" role="combobox">
          <ul class="network-author-results" id="network-author-results" role="listbox" aria-label="Author matches" hidden></ul>
        </span>
      </div>
    </div>
  </div>
  <div class="network-frame">
    <div class="legend is-collapsed" id="network-institution-legend" aria-label="Visible normalized institutions"></div>
    <button class="legend-toggle" type="button" aria-controls="network-institution-legend" aria-expanded="false"></button>
    <div class="network-viewport">
      <svg role="img" aria-label="Coauthor network for the selected ECCV 2026 papers" aria-describedby="network-svg-description" viewBox="0 0 1180 720" preserveAspectRatio="xMidYMid meet">
        <desc id="network-svg-description">Each circle is an author. A line indicates coauthorship on at least one selected paper. Authors sharing a normalized institution are softly drawn toward the same area while coauthor links remain visible. Every visible normalized institution appears in the legend and can be selected to focus its authors and collaborations. Click blank graph space to clear an active highlight.</desc>
      </svg>
    </div>
    <div class="tooltip" role="tooltip"></div>
    <p class="network-status" role="status"></p>
    <p class="network-status" id="network-search-status" aria-live="polite"></p>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/d3@7.9.0/dist/d3.min.js"></script>
  <script>
  (() => {
    const root = document.getElementById('eccv-coauthor-network');
    const allGraph = ${safeJson(allGraph)};
    const esc = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const status = root.querySelector('.network-status');
    const searchInput = root.querySelector('.network-search input');
    const searchStatus = root.querySelector('#network-search-status');
    const views = ['university', 'research', 'company', 'foreign'];
    const requestedViewParam = new URL(window.location.href).searchParams.get('view');
    const requestedViews = requestedViewParam === null ? ['university'] : requestedViewParam.split(',');
    const activeViews = new Set(requestedViews.filter((view) => views.includes(view)));
    const activeViewQuery = views.filter((view) => activeViews.has(view)).join(',');
    const activeUrl = new URL(window.location.href);
    if (activeUrl.searchParams.get('view') !== activeViewQuery) {
      activeUrl.searchParams.set('view', activeViewQuery);
      window.history.replaceState(null, '', activeUrl);
    }
    root.querySelectorAll('.network-view input').forEach((input) => {
      input.checked = activeViews.has(input.value);
      input.addEventListener('change', () => {
        const nextViews = [...root.querySelectorAll('.network-view input')].filter((item) => item.checked).map((item) => item.value);
        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set('view', views.filter((view) => nextViews.includes(view)).join(','));
        window.location.assign(nextUrl.href);
      });
    });
    if (!window.d3) {
      status.textContent = 'The interactive network could not load because its D3 dependency is unavailable.';
      status.style.display = 'block';
      return;
    }
    const visibleNodeIds = new Set(allGraph.nodes.filter((node) => node.views.some((view) => activeViews.has(view))).map((node) => node.id));
    const graph = {
      nodes: allGraph.nodes.filter((node) => visibleNodeIds.has(node.id)),
      links: allGraph.links.filter((link) => visibleNodeIds.has(link.source) && visibleNodeIds.has(link.target)),
    };
    const hasVisibleGraph = graph.nodes.length > 0;
    const visibleInstitutionCounts = new Map();
    graph.nodes.forEach((node) => visibleInstitutionCounts.set(node.institution, (visibleInstitutionCounts.get(node.institution) ?? 0) + 1));
    const visibleInstitutionPapers = new Map();
    graph.nodes.forEach((node) => {
      if (!visibleInstitutionPapers.has(node.institution)) visibleInstitutionPapers.set(node.institution, new Set());
      node.titles.forEach((title) => visibleInstitutionPapers.get(node.institution).add(title));
    });
    const visibleInstitutions = [...visibleInstitutionCounts.entries()]
      .map(([name, authors]) => ({ name, authors, papers: visibleInstitutionPapers.get(name).size }))
      .sort((left, right) => right.papers - left.papers || right.authors - left.authors || left.name.localeCompare(right.name));
    const legendData = visibleInstitutions;
    const css = getComputedStyle(root);
    const palette = Array.from({ length: 12 }, (_, index) => css.getPropertyValue('--network-c' + (index + 1)).trim() || 'CanvasText');
    const colorPlan = palette.map((_, index) => [index, 100]);
    const highlightedInstitutionIndex = new Map(legendData.map((d, index) => [d.name, index]));
    const color = (institution) => {
      const index = highlightedInstitutionIndex.get(institution);
      if (index === undefined) return 'var(--network-muted)';
      const [colorIndex, strength] = colorPlan[index] ?? [index % palette.length, 48];
      const base = palette[colorIndex];
      return 'color-mix(in srgb, ' + base + ' ' + strength + '%, var(--network-background))';
    };
    const legend = d3.select(root).select('.legend');
    const legendToggle = root.querySelector('.legend-toggle');
    const toggleArrow = String.fromCharCode(9662);
    let legendExpanded = false;

    const svg = d3.select(root).select('svg');
    if (!hasVisibleGraph) svg.attr('aria-label', 'Empty coauthor network: no affiliation categories selected.');
    const selectedGlow = svg.append('defs').append('filter').attr('id', 'selected-node-glow').attr('x', '-80%').attr('y', '-80%').attr('width', '260%').attr('height', '260%');
    selectedGlow.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', 3.5).attr('result', 'selected-glow-soft');
    selectedGlow.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', 1.4).attr('result', 'selected-glow-core');
    selectedGlow.append('feMerge').selectAll('feMergeNode').data(['selected-glow-soft', 'selected-glow-core', 'SourceGraphic']).join('feMergeNode').attr('in', (d) => d);
    let width = 1180, height = 720;
    const tooltip = d3.select(root).select('.tooltip');
    const links = graph.links.map((d) => ({ ...d }));
    const nodes = graph.nodes.map((d) => ({ ...d }));
    const nodeById = new Map(nodes.map((d) => [d.id, d]));
    const crossInstitutionDegree = new Map(nodes.map((d) => [d.id, 0]));
    links.forEach((link) => {
      const source = nodeById.get(link.source);
      const target = nodeById.get(link.target);
      link.crossInstitution = Boolean(source && target && source.institution !== target.institution);
      if (link.crossInstitution) {
        crossInstitutionDegree.set(source.id, crossInstitutionDegree.get(source.id) + 1);
        crossInstitutionDegree.set(target.id, crossInstitutionDegree.get(target.id) + 1);
      }
    });
    const institutionGroups = d3.group(nodes, (d) => d.institution);
    const orderedInstitutions = [...institutionGroups.entries()]
      .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    const institutionHubs = orderedInstitutions.map(([institution, members], index) => {
      const distance = .18 + .7 * Math.sqrt((index + .5) / orderedInstitutions.length);
      const homeX = Math.cos(index * goldenAngle) * .38 * distance;
      const homeY = Math.sin(index * goldenAngle) * .36 * distance;
      return {
        id: 'institution-hub:' + index,
        institution,
        memberCount: members.length,
        isInstitutionHub: true,
        homeX,
        homeY,
        x: width / 2 + homeX * width,
        y: height / 2 + homeY * height,
      };
    });
    const hubByInstitution = new Map(institutionHubs.map((hub) => [hub.institution, hub]));
    const hubLinks = nodes.map((author) => ({
      source: author.id,
      target: hubByInstitution.get(author.institution).id,
      isInstitutionLink: true,
      isBridgeAuthor: crossInstitutionDegree.get(author.id) > 0,
    }));
    const layoutNodes = [...nodes, ...institutionHubs];
    const layoutLinks = [...links, ...hubLinks];
    const paperRadius = d3.scaleSqrt().domain([1, d3.max(nodes, (d) => d.papers)]).range([3, 18]);
    const collaborationRadius = d3.scaleSqrt().domain([0, d3.max(nodes, (d) => d.weightedDegree)]).range([0, 7]);
    const radius = (d) => Math.min(28, paperRadius(d.papers) + collaborationRadius(d.weightedDegree));
    const neighbours = new Map(nodes.map((d) => [d.id, new Set([d.id])]));
    links.forEach((d) => { neighbours.get(d.source).add(d.target); neighbours.get(d.target).add(d.source); });
    const scene = svg.append('g').attr('class', 'network-scene');
    const link = scene.append('g').attr('aria-hidden', 'true').selectAll('line').data(links).join('line')
      .attr('class', 'edge').attr('stroke-width', (d) => 0.42 + Math.min(1.7, d.weight * .45)).attr('stroke-opacity', .18);
    const labelNodes = [...nodes].sort((a, b) => b.weightedDegree - a.weightedDegree || b.papers - a.papers || b.degree - a.degree).slice(0, 18);
    const node = scene.append('g').selectAll('circle').data(nodes).join('circle')
      .attr('class', 'node').attr('r', radius)
      .attr('fill', (d) => color(d.institution))
      .attr('aria-label', (d) => d.name + ', ' + d.affiliation + ', ' + d.papers + ' selected paper' + (d.papers === 1 ? '' : 's'));
    const labels = scene.append('g').attr('aria-hidden', 'true').selectAll('text').data(labelNodes).join('text')
      .attr('class', 'label').text((d) => d.name);
    const selectedMarker = scene.append('g').attr('class', 'selected-marker').attr('aria-hidden', 'true').attr('display', 'none');
    selectedMarker.append('text').attr('class', 'selected-node-label');
    let selectedInstitution = null;
    let selectedNodeId = null;
    const updateSelectedMarker = () => {
      const selectedNode = selectedNodeId === null ? null : nodeById.get(selectedNodeId);
      const visible = selectedNode && Number.isFinite(selectedNode.x) && Number.isFinite(selectedNode.y);
      selectedMarker.attr('display', visible ? null : 'none');
      if (!visible) return;
      const selectedRadius = radius(selectedNode);
      selectedMarker.attr('transform', 'translate(' + selectedNode.x + ',' + selectedNode.y + ')');
      selectedMarker.select('.selected-node-label').attr('x', selectedRadius + 11).attr('y', -selectedRadius - 6).text('Selected · ' + selectedNode.name);
    };
    const linkHasInstitution = (edge, institution) => edge.source.institution === institution || edge.target.institution === institution;
    const connectedComponentIds = (startId) => {
      const visited = new Set();
      const pending = [startId];
      while (pending.length) {
        const currentId = pending.pop();
        if (visited.has(currentId)) continue;
        visited.add(currentId);
        for (const neighbourId of neighbours.get(currentId) ?? []) {
          if (!visited.has(neighbourId)) pending.push(neighbourId);
        }
      }
      return visited;
    };
    const applyInstitutionEmphasis = (hoveredId = null) => {
      if (selectedNodeId !== null) {
        const activeNodeIds = connectedComponentIds(selectedNodeId);
        node
          .attr('opacity', (d) => activeNodeIds.has(d.id) ? 1 : .13)
          .attr('stroke', (d) => d.id === selectedNodeId ? color(d.institution) : null)
          .attr('stroke-width', (d) => d.id === selectedNodeId ? 1.25 : activeNodeIds.has(d.id) ? 2.2 : 1.25)
          .attr('filter', (d) => d.id === selectedNodeId ? 'url(#selected-node-glow)' : null)
          .attr('aria-label', (d) => d.name + ', ' + d.affiliation + ', ' + d.papers + ' selected paper' + (d.papers === 1 ? '' : 's') + (d.id === selectedNodeId ? ', selected focus' : ''));
        labels.attr('opacity', (d) => activeNodeIds.has(d.id) ? 1 : .15);
        link.attr('stroke-opacity', (edge) => activeNodeIds.has(edge.source.id) && activeNodeIds.has(edge.target.id) ? .76 : .035);
        updateSelectedMarker();
        return;
      }
      const hasSelection = selectedInstitution !== null;
      node
        .attr('opacity', (d) => !hasSelection || d.institution === selectedInstitution ? 1 : .13)
        .attr('stroke', null)
        .attr('stroke-width', (d) => hasSelection && d.institution === selectedInstitution ? 2.2 : 1.25)
        .attr('filter', null)
        .attr('aria-label', (d) => d.name + ', ' + d.affiliation + ', ' + d.papers + ' selected paper' + (d.papers === 1 ? '' : 's'));
      labels.attr('opacity', (d) => !hasSelection || d.institution === selectedInstitution ? 1 : .15);
      link.attr('stroke-opacity', (edge) => {
        if (hasSelection && !linkHasInstitution(edge, selectedInstitution)) return .035;
        return hoveredId && (edge.source.id === hoveredId || edge.target.id === hoveredId) ? .76 : .18;
      });
      updateSelectedMarker();
    };
    const renderLegend = () => {
      legend.attr('hidden', hasVisibleGraph ? null : true);
      legendToggle.hidden = !hasVisibleGraph;
      const items = legend.selectAll('button.legend-item').data(legendData, (d) => d.name).join((enter) => {
        const button = enter.append('button').attr('type', 'button').attr('class', 'legend-item');
        button.append('span').attr('class', 'swatch');
        button.append('span').attr('class', 'legend-name');
        return button;
      });
      items
        .attr('class', (d) => 'legend-item' + (selectedInstitution === d.name ? ' is-selected' : selectedInstitution ? ' is-muted' : ''))
        .attr('aria-pressed', (d) => String(selectedInstitution === d.name))
        .attr('aria-label', (d) => d.name + ', ' + d.papers + ' selected papers')
        .on('click', (event, d) => {
          selectedInstitution = selectedInstitution === d.name ? null : d.name;
          selectedNodeId = null;
          pinnedId = null;
          tooltip.style('display', 'none');
          renderLegend();
          applyInstitutionEmphasis();
        });
      items.select('.swatch').style('background', (d) => color(d.name));
      items.select('.legend-name').text((d) => d.name + ' (' + d.papers + ')');
      legend.classed('is-collapsed', !legendExpanded);
      legendToggle.setAttribute('aria-expanded', String(legendExpanded));
      legendToggle.textContent = legendExpanded
        ? 'Hide institutions ' + String.fromCharCode(9652)
        : 'Show all ' + legendData.length + ' institutions ' + toggleArrow;
    };
    const repelInstitutionHubs = (alpha) => {
      for (let left = 0; left < institutionHubs.length; left += 1) {
        for (let right = left + 1; right < institutionHubs.length; right += 1) {
          const source = institutionHubs[left];
          const target = institutionHubs[right];
          const dx = target.x - source.x || .01;
          const dy = target.y - source.y || .01;
          const distanceSquared = Math.max(144, dx * dx + dy * dy);
          const strength = alpha * (240 + 18 * Math.sqrt(source.memberCount * target.memberCount)) / distanceSquared;
          source.vx -= dx * strength;
          source.vy -= dy * strength;
          target.vx += dx * strength;
          target.vy += dy * strength;
        }
      }
    };
    const simulation = d3.forceSimulation(layoutNodes)
      .force('link', d3.forceLink(layoutLinks).id((d) => d.id)
        .distance((d) => d.isInstitutionLink ? 0 : d.crossInstitution ? 32 : Math.max(24, 72 - d.weight * 10))
        .strength((d) => d.isInstitutionLink ? (d.isBridgeAuthor ? .075 : .34) : .18))
      .force('charge', d3.forceManyBody().strength((d) => d.isInstitutionHub ? 0 : -14).distanceMax(180))
      .force('collide', d3.forceCollide().radius((d) => d.isInstitutionHub ? 0 : radius(d) + 3).iterations(2))
      .force('institution-repel', repelInstitutionHubs)
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX((d) => d.isInstitutionHub ? width / 2 + d.homeX * width : width / 2).strength((d) => d.isInstitutionHub ? .065 : 0))
      .force('y', d3.forceY((d) => d.isInstitutionHub ? height / 2 + d.homeY * height : height / 2).strength((d) => d.isInstitutionHub ? .065 : 0));
    const renderLayout = () => {
      link.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y).attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y);
      node.attr('cx', (d) => d.x).attr('cy', (d) => d.y);
      labels.attr('x', (d) => d.x + 7).attr('y', (d) => d.y - 7);
      updateSelectedMarker();
    };
    simulation.on('tick', renderLayout);
    const drag = d3.drag()
      .on('start', (event, d) => { event.sourceEvent?.stopPropagation(); if (!event.active) simulation.alphaTarget(.22).restart(); d.fx = d.x; d.fy = d.y; })
      .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y; })
      .on('end', (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = d.x; d.fy = d.y; });
    node.call(drag);
    const zoom = d3.zoom().scaleExtent([.25, 8]).on('zoom', (event) => scene.attr('transform', event.transform));
    svg.call(zoom);
    simulation.alpha(1).restart();
    let pinnedId = null;
    const clearHighlight = () => {
      selectedInstitution = null;
      selectedNodeId = null;
      pinnedId = null;
      tooltip.style('display', 'none');
      renderLegend();
      applyInstitutionEmphasis();
    };
    svg.on('click.clear-highlight', (event) => {
      if (event.target === svg.node()) clearHighlight();
    });
    legendToggle.addEventListener('click', () => {
      legendExpanded = !legendExpanded;
      renderLegend();
      if (!legendExpanded) legend.node().scrollTop = 0;
    });
    renderLegend();
    applyInstitutionEmphasis();
    const show = (event, d) => {
      applyInstitutionEmphasis(d.id);
      const titles = d.titles.slice(0, 3).map((title) => '<li>' + esc(title) + '</li>').join('');
      tooltip.html('<strong>' + esc(d.name) + '</strong><span>' + esc(d.institution) + '</span><br><span>' + d.papers + ' selected paper' + (d.papers === 1 ? '' : 's') + ' &middot; ' + d.degree + ' distinct coauthors &middot; ' + d.weightedDegree + ' collaboration links</span>' + (titles ? '<span class="tooltip-divider" aria-hidden="true"></span><ul class="tooltip-papers">' + titles + '</ul>' : ''));
      tooltip.style('display', 'block'); move(event);
    };
    const move = (event) => {
      const bounds = root.querySelector('.network-frame').getBoundingClientRect();
      const targetBounds = event.currentTarget && event.currentTarget.getBoundingClientRect ? event.currentTarget.getBoundingClientRect() : null;
      const clientX = Number.isFinite(event.clientX) ? event.clientX : targetBounds.left + targetBounds.width / 2;
      const clientY = Number.isFinite(event.clientY) ? event.clientY : targetBounds.top + targetBounds.height / 2;
      const tooltipBounds = tooltip.node().getBoundingClientRect();
      const maxX = Math.max(8, bounds.width - tooltipBounds.width - 8);
      const maxY = Math.max(8, bounds.height - tooltipBounds.height - 8);
      const x = Math.max(8, Math.min(clientX - bounds.left + 12, maxX));
      const y = Math.max(8, Math.min(clientY - bounds.top + 12, maxY));
      tooltip.style('left', x + 'px').style('top', y + 'px');
    };
    const hide = () => { applyInstitutionEmphasis(); tooltip.style('display', 'none'); };
    const toggleNodeSelection = (d) => {
      if (selectedNodeId === d.id) {
        selectedNodeId = null;
        pinnedId = null;
        renderLegend();
        hide();
        return false;
      } else {
        selectedInstitution = null;
        selectedNodeId = d.id;
        pinnedId = d.id;
        renderLegend();
        hide();
        return true;
      }
    };
    const toggle = (event, d) => { event.stopPropagation(); toggleNodeSelection(d); };
    node.on('pointerenter', show)
      .on('pointermove', move)
      .on('pointerleave', hide)
      .on('click', toggle);
    const authorResults = root.querySelector('#network-author-results');
    const maxAuthorResults = 10;
    let authorMatches = [];
    let activeAuthorMatch = -1;
    const closeAuthorResults = () => {
      authorResults.hidden = true;
      authorResults.replaceChildren();
      authorMatches = [];
      searchInput.setAttribute('aria-expanded', 'false');
      searchInput.removeAttribute('aria-activedescendant');
      activeAuthorMatch = -1;
    };
    const selectAuthor = (match) => {
      closeAuthorResults();
      searchInput.value = match.name;
      const isSelected = toggleNodeSelection(match);
      searchStatus.textContent = isSelected ? match.name + ': ' + match.papers + ' selected papers, ' + match.degree + ' distinct coauthors.' : '';
      searchStatus.style.display = isSelected ? 'block' : 'none';
    };
    const renderAuthorResults = () => {
      const query = searchInput.value.trim().toLocaleLowerCase();
      if (!query) { closeAuthorResults(); return; }
      authorMatches = nodes
        .filter((d) => d.name.toLocaleLowerCase().includes(query))
        .sort((left, right) => Number(!left.name.toLocaleLowerCase().startsWith(query)) - Number(!right.name.toLocaleLowerCase().startsWith(query)) || left.name.localeCompare(right.name) || left.institution.localeCompare(right.institution))
        .slice(0, maxAuthorResults);
      authorResults.replaceChildren();
      activeAuthorMatch = authorMatches.length ? 0 : -1;
      if (!authorMatches.length) {
        searchInput.removeAttribute('aria-activedescendant');
        const noResults = document.createElement('li');
        noResults.className = 'network-author-no-results';
        noResults.textContent = 'No author matches for "' + searchInput.value + '".';
        authorResults.append(noResults);
      } else {
        authorMatches.forEach((match, index) => {
          const item = document.createElement('li');
          const button = document.createElement('button');
          button.type = 'button';
          button.id = 'network-author-result-' + index;
          button.className = 'network-author-result' + (index === activeAuthorMatch ? ' is-active' : '');
          button.setAttribute('role', 'option');
          button.setAttribute('aria-selected', index === activeAuthorMatch ? 'true' : 'false');
          button.innerHTML = '<span>' + esc(match.name) + '</span><span class="network-author-result-institution">' + esc(match.institution) + '</span>';
          button.addEventListener('click', () => selectAuthor(match));
          item.append(button);
          authorResults.append(item);
        });
        searchInput.setAttribute('aria-activedescendant', 'network-author-result-' + activeAuthorMatch);
      }
      authorResults.hidden = false;
      searchInput.setAttribute('aria-expanded', 'true');
    };
    const setActiveAuthorMatch = (next) => {
      if (!authorMatches.length) return;
      activeAuthorMatch = (next + authorMatches.length) % authorMatches.length;
      authorResults.querySelectorAll('.network-author-result').forEach((item, index) => {
        const active = index === activeAuthorMatch;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      searchInput.setAttribute('aria-activedescendant', 'network-author-result-' + activeAuthorMatch);
      authorResults.querySelector('.network-author-result.is-active')?.scrollIntoView({ block: 'nearest' });
    };
    searchInput.addEventListener('input', () => {
      if (!searchInput.value.trim()) { clearHighlight(); searchStatus.style.display = 'none'; searchStatus.textContent = ''; }
      renderAuthorResults();
    });
    searchInput.addEventListener('focus', renderAuthorResults);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown' && authorMatches.length) { event.preventDefault(); setActiveAuthorMatch(activeAuthorMatch + 1); }
      else if (event.key === 'ArrowUp' && authorMatches.length) { event.preventDefault(); setActiveAuthorMatch(activeAuthorMatch - 1); }
      else if (event.key === 'Enter' && activeAuthorMatch >= 0) { event.preventDefault(); selectAuthor(authorMatches[activeAuthorMatch]); }
      else if (event.key === 'Escape') closeAuthorResults();
    });
    document.addEventListener('pointerdown', (event) => {
      if (!root.querySelector('.network-author-picker').contains(event.target)) closeAuthorResults();
    });
  })();
  </script>
</section>
</body>
</html>`;

await fs.writeFile(output, html, 'utf8');
await fs.writeFile(directoryOutput, toCsv([
  ['primary_category_id', 'primary_category_ko', 'normalized_institution', 'author_count', 'selected_paper_count', 'matched_filter_views', 'dual_affiliation_author_count', 'raw_affiliation_variants'],
  ...affiliationDirectory.map((entry) => [entry.category_id, entry.category_ko, entry.normalized_institution, entry.author_count, entry.selected_paper_count, entry.matched_filter_views, entry.dual_affiliation_author_count, entry.raw_affiliation_variants]),
]), 'utf8');
const directorySummary = Object.fromEntries(['한국 대학·대학원·과학기술원', '한국 연구기관', '한국 기업', '외국 기관'].map((category) => [
  category,
  {
    institutions: affiliationDirectory.filter((entry) => entry.category_ko === category).length,
    authors: affiliationDirectory.filter((entry) => entry.category_ko === category).reduce((total, entry) => total + entry.author_count, 0),
  },
]));
console.log(JSON.stringify({ output, directoryOutput, bytes: Buffer.byteLength(html), stats, directorySummary, topAffiliations: topLegend }, null, 2));
