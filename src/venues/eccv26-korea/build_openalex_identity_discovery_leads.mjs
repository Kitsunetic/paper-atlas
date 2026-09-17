import fs from 'node:fs/promises';

const root = process.cwd();
const queueFile = `${root}/eccv_2026_first_author_identity_review_queue.csv`;
const outputFile = `${root}/eccv_2026_first_author_openalex_identity_leads.csv`;
const concurrency = 1;
const minimumRequestIntervalMs = 250;
let nextRequestAt = 0;

function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (character !== '\r') field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function toCsv(rows) {
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((row) => headers.map((header) => csvCell(row[header])).join(','))].join('\n') + '\n';
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function canonicalAffiliation(value) {
  const normalized = normalize(value);
  const aliases = [
    ['kaist', /\bkaist\b|korea advanced institute of science/],
    ['postech', /\bpostech\b|pohang university of science/],
    ['dgist', /\bdgist\b|daegu gyeongbuk institute/],
    ['unist', /\bunist\b|ulsan national institute/],
    ['gist', /\bgist\b|gwangju institute of science/],
    ['snu', /seoul national university|\bsnu\b/],
    ['yonsei', /yonsei/],
    ['korea university', /korea university/],
    ['sungkyunkwan', /sung ?kyun ?kwan|skku/],
    ['ewha', /ewha/],
    ['hanyang', /hanyang/],
    ['naver', /naver/],
    ['samsung', /samsung/],
    ['etri', /\betri\b|electronics and telecommunications research/],
    ['keti', /\bketi\b|korea electronics technology institute/],
    ['kist', /\bkist\b|korea institute of science and technology/],
  ];
  return aliases.find(([, pattern]) => pattern.test(normalized))?.[0] ?? normalized;
}

function nameMatches(left, right) {
  return normalize(left) === normalize(right);
}

function institutionNames(author) {
  return (author.last_known_institutions ?? [])
    .map((institution) => institution.display_name ?? institution.institution?.display_name ?? '')
    .filter(Boolean);
}

function scoreLead(queueRecord, author) {
  const signals = [];
  let score = 0;
  if (nameMatches(queueRecord.eccv_first_author_name, author.display_name)) {
    score += 60;
    signals.push('exact_normalized_name');
  }
  const expected = canonicalAffiliation(queueRecord.eccv_first_author_affiliation_raw);
  const institutions = institutionNames(author);
  if (institutions.some((institution) => canonicalAffiliation(institution) === expected)) {
    score += 35;
    signals.push('canonical_affiliation_match');
  }
  if (author.orcid) {
    score += 5;
    signals.push('orcid_available');
  }
  return { score, signals: signals.join('; ') };
}

const rows = parseCsv(await fs.readFile(queueFile, 'utf8'));
const [headers, ...dataRows] = rows;
const queue = dataRows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
if (queue.length !== 271) throw new Error(`Expected 271 candidate identities; found ${queue.length}`);

async function fetchCandidates(queueRecord) {
  const query = new URL('https://api.openalex.org/authors');
  query.searchParams.set('search', queueRecord.eccv_first_author_name);
  query.searchParams.set('per-page', '5');
  let payload;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const waitMs = Math.max(0, nextRequestAt - Date.now());
    if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
    nextRequestAt = Date.now() + minimumRequestIntervalMs;
    const response = await fetch(query, { headers: { Accept: 'application/json' } });
    if (response.ok) {
      payload = await response.json();
      break;
    }
    if (response.status !== 429 || attempt === 3) throw new Error(`OpenAlex ${response.status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  return (payload.results ?? []).map((author, index) => {
    const { score, signals } = scoreLead(queueRecord, author);
    return {
      candidate_identity_key: queueRecord.candidate_identity_key,
      eccv_first_author_name: queueRecord.eccv_first_author_name,
      eccv_first_author_affiliation_raw: queueRecord.eccv_first_author_affiliation_raw,
      openalex_rank: String(index + 1),
      openalex_author_id: author.id ?? '',
      openalex_display_name: author.display_name ?? '',
      openalex_orcid: author.orcid ?? '',
      openalex_last_known_institutions: institutionNames(author).join('; '),
      openalex_works_count: String(author.works_count ?? ''),
      openalex_cited_by_count: String(author.cited_by_count ?? ''),
      candidate_match_score: String(score),
      matching_signals: signals,
      openalex_api_query_url: query.toString(),
      lead_status: 'unverified_discovery_only',
      notes: 'Do not use this row to resolve identity or count prior papers without primary-source verification.',
    };
  });
}

const output = [];
let cursor = 0;
async function worker() {
  while (cursor < queue.length) {
    const queueRecord = queue[cursor++];
    try {
      output.push(...await fetchCandidates(queueRecord));
    } catch (error) {
      output.push({
        candidate_identity_key: queueRecord.candidate_identity_key,
        eccv_first_author_name: queueRecord.eccv_first_author_name,
        eccv_first_author_affiliation_raw: queueRecord.eccv_first_author_affiliation_raw,
        openalex_rank: '', openalex_author_id: '', openalex_display_name: '', openalex_orcid: '',
        openalex_last_known_institutions: '', openalex_works_count: '', openalex_cited_by_count: '',
        candidate_match_score: '', matching_signals: '', openalex_api_query_url: '',
        lead_status: 'fetch_failed', notes: String(error.message ?? error),
      });
    }
  }
}

await Promise.all(Array.from({ length: concurrency }, () => worker()));
output.sort((left, right) => left.eccv_first_author_name.localeCompare(right.eccv_first_author_name, 'en') || Number(left.openalex_rank || 999) - Number(right.openalex_rank || 999));
await fs.writeFile(outputFile, toCsv(output), 'utf8');

const matched = output.filter((row) => Number(row.candidate_match_score) >= 95);
console.log(JSON.stringify({
  identity_candidates: queue.length,
  discovery_rows: output.length,
  exact_name_and_affiliation_leads: matched.length,
  candidates_with_exact_name_and_affiliation_lead: new Set(matched.map((row) => row.candidate_identity_key)).size,
  fetch_failures: output.filter((row) => row.lead_status === 'fetch_failed').length,
  output: outputFile,
}, null, 2));
