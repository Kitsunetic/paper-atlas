import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_ROOT = path.resolve(HERE, '../../../../data/eccv26');
const DEFAULT_SOURCES_PATH = path.resolve(HERE, '../sources.json');
const USER_AGENT = 'PaperAtlas/0.1 (+https://github.com/Kitsunetic/paper-atlas)';

export class SnapshotError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SnapshotError';
  }
}

function emptyManifest() {
  return { schema_version: 1, sources: {} };
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readManifest(manifestPath) {
  if (!(await fileExists(manifestPath))) return emptyManifest();
  try {
    const parsed = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    if (parsed?.schema_version !== 1 || typeof parsed.sources !== 'object' || parsed.sources === null) {
      throw new Error('expected schema_version 1 and a sources object');
    }
    return parsed;
  } catch (error) {
    throw new SnapshotError(`Cannot read ${manifestPath}: ${error.message}`);
  }
}

async function writeJsonAtomically(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {});
    throw new SnapshotError(`Cannot write ${filePath}: ${error.message}`);
  }
}

function validateSource(source) {
  if (!source || typeof source !== 'object') throw new SnapshotError('Every source must be an object');
  const { id, url, extension, purpose } = source;
  if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(id)) {
    throw new SnapshotError(`Invalid source id: ${id}`);
  }
  if (typeof extension !== 'string' || !/^\.[a-z0-9]+$/u.test(extension)) {
    throw new SnapshotError(`Invalid filename extension for ${id}`);
  }
  if (typeof purpose !== 'string' || purpose.trim() === '') throw new SnapshotError(`Missing purpose for ${id}`);
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new SnapshotError(`Invalid URL for ${id}: ${url}`);
  }
  if (parsedUrl.protocol !== 'https:') throw new SnapshotError(`Only HTTPS sources are allowed: ${id}`);
  return { id, url: parsedUrl.toString(), extension, purpose };
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function cachePath(rawDir, entry) {
  return typeof entry?.file === 'string' ? path.join(rawDir, entry.file) : '';
}

function attempt(now, status, error = '') {
  return { attempted_at: now.toISOString(), http_status: status, error };
}

async function recordFailure({ manifest, manifestPath, source, now, status, error }) {
  const previous = manifest.sources[source.id] ?? {};
  manifest.sources[source.id] = { ...previous, last_attempt: attempt(now, status, error) };
  await writeJsonAtomically(manifestPath, manifest);
}

export async function collectSnapshots({ sources, rawDir, refresh = false, fetchImpl = fetch, now = () => new Date() }) {
  if (!Array.isArray(sources) || sources.length === 0) throw new SnapshotError('At least one source is required');
  const checkedSources = sources.map(validateSource);
  if (new Set(checkedSources.map((source) => source.id)).size !== checkedSources.length) {
    throw new SnapshotError('Source ids must be unique');
  }

  await fs.mkdir(rawDir, { recursive: true });
  const manifestPath = path.join(rawDir, 'manifest.json');
  const manifest = await readManifest(manifestPath);
  const fetched = [];
  const cached = [];
  const notModified = [];

  for (const source of checkedSources) {
    const previous = manifest.sources[source.id];
    const previousPath = cachePath(rawDir, previous);
    const cacheAvailable = previousPath !== '' && await fileExists(previousPath);
    if (cacheAvailable && !refresh) {
      cached.push(source.id);
      continue;
    }

    const headers = new Headers();
    headers.set('user-agent', USER_AGENT);
    if (refresh && cacheAvailable && typeof previous.etag === 'string') headers.set('if-none-match', previous.etag);
    if (refresh && cacheAvailable && !headers.has('if-none-match') && typeof previous.last_modified === 'string') {
      headers.set('if-modified-since', previous.last_modified);
    }

    let response;
    try {
      response = await fetchImpl(source.url, { headers, redirect: 'follow' });
    } catch (error) {
      await recordFailure({ manifest, manifestPath, source, now: now(), status: null, error: error.message });
      throw new SnapshotError(`${source.id}: request failed: ${error.message}`);
    }
    if (response.status === 304 && cacheAvailable) {
      manifest.sources[source.id] = {
        ...previous,
        last_checked_at: now().toISOString(),
        last_attempt: attempt(now(), 304)
      };
      await writeJsonAtomically(manifestPath, manifest);
      notModified.push(source.id);
      continue;
    }
    if (!response.ok) {
      await recordFailure({ manifest, manifestPath, source, now: now(), status: response.status, error: response.statusText });
      throw new SnapshotError(`${source.id}: source rejected request with HTTP ${response.status} ${response.statusText}`.trim());
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const sha256 = digest(bytes);
    const file = `${source.id}.${sha256}${source.extension}`;
    const destination = path.join(rawDir, file);
    if (!(await fileExists(destination))) {
      const temporary = `${destination}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await fs.writeFile(temporary, bytes);
      await fs.rename(temporary, destination);
    }
    manifest.sources[source.id] = {
      source_id: source.id,
      url: source.url,
      purpose: source.purpose,
      retrieved_at: now().toISOString(),
      http_status: response.status,
      etag: response.headers.get('etag') ?? '',
      last_modified: response.headers.get('last-modified') ?? '',
      bytes: bytes.length,
      sha256,
      file,
      last_attempt: attempt(now(), response.status)
    };
    await writeJsonAtomically(manifestPath, manifest);
    fetched.push(source.id);
  }

  return { manifestPath, fetched, cached, notModified };
}

async function readSources(filePath) {
  try {
    const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'));
    if (parsed?.schema_version !== 1 || !Array.isArray(parsed.sources)) throw new Error('expected schema_version 1 and sources array');
    return parsed.sources;
  } catch (error) {
    throw new SnapshotError(`Cannot read ${filePath}: ${error.message}`);
  }
}

function parseArgs(argv) {
  const args = { dataRoot: DEFAULT_DATA_ROOT, sourcesPath: DEFAULT_SOURCES_PATH, refresh: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--help' || flag === '-h') return { ...args, help: true };
    if (flag === '--refresh') { args.refresh = true; continue; }
    if (!['--data-root', '--sources'].includes(flag) || !argv[index + 1]) throw new SnapshotError(`Unknown or incomplete option: ${flag}`);
    args[flag === '--data-root' ? 'dataRoot' : 'sourcesPath'] = path.resolve(argv[index + 1]);
    index += 1;
  }
  return args;
}

function usage() {
  return [
    'Usage: node collect_snapshots.mjs [--data-root DIR] [--sources FILE] [--refresh]',
    '',
    'Default runs use cached local snapshots and make no network request.',
    '--refresh sends one sequential conditional GET per configured source.'
  ].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(usage()); return; }
  const result = await collectSnapshots({
    sources: await readSources(args.sourcesPath),
    rawDir: path.join(args.dataRoot, 'raw'),
    refresh: args.refresh
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
