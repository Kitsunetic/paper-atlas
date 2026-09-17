import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { SnapshotError, collectSnapshots } from './collect_snapshots.mjs';

const SOURCE = Object.freeze({
  id: 'sample-source',
  url: 'https://example.test/sample.json',
  extension: '.json',
  purpose: 'test fixture'
});

async function withRawDir(callback) {
  const root = await mkdtemp(path.join(tmpdir(), 'paper-atlas-snapshots-'));
  try {
    await callback(path.join(root, 'raw'));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('downloads each source once and records an immutable digest-named snapshot', async () => {
  await withRawDir(async (rawDir) => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response('{"result":"ok"}', {
        status: 200,
        headers: { ETag: '"fixture-etag"', 'Last-Modified': 'Tue, 16 Sep 2026 00:00:00 GMT' }
      });
    };

    const result = await collectSnapshots({ sources: [SOURCE], rawDir, fetchImpl, now: () => new Date('2026-09-16T00:00:00Z') });
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf8'));

    assert.equal(calls, 1);
    assert.equal(result.fetched.length, 1);
    assert.match(manifest.sources['sample-source'].file, /^sample-source\.[a-f0-9]{64}\.json$/u);
    assert.equal(manifest.sources['sample-source'].etag, '"fixture-etag"');
  });
});

test('reuses a local snapshot without issuing another request by default', async () => {
  await withRawDir(async (rawDir) => {
    const firstFetch = async () => new Response('first', { status: 200 });
    await collectSnapshots({ sources: [SOURCE], rawDir, fetchImpl: firstFetch, now: () => new Date('2026-09-16T00:00:00Z') });
    const result = await collectSnapshots({
      sources: [SOURCE],
      rawDir,
      fetchImpl: async () => { throw new Error('network must not be called'); },
      now: () => new Date('2026-09-16T01:00:00Z')
    });

    assert.deepEqual(result.fetched, []);
    assert.deepEqual(result.cached, ['sample-source']);
  });
});

test('records a rejected request and stops before any later source', async () => {
  await withRawDir(async (rawDir) => {
    const laterSource = { ...SOURCE, id: 'later-source', url: 'https://example.test/later.json' };
    let calls = 0;
    await assert.rejects(
      () => collectSnapshots({
        sources: [SOURCE, laterSource],
        rawDir,
        fetchImpl: async () => {
          calls += 1;
          return new Response('rate limited', { status: 429 });
        },
        now: () => new Date('2026-09-16T00:00:00Z')
      }),
      (error) => error instanceof SnapshotError && error.message.includes('429')
    );

    const manifest = JSON.parse(await readFile(path.join(rawDir, 'manifest.json'), 'utf8'));
    assert.equal(calls, 1);
    assert.equal(manifest.sources['sample-source'].last_attempt.http_status, 429);
    assert.equal(manifest.sources['later-source'], undefined);
  });
});

test('uses a conditional GET only when refresh is explicitly requested', async () => {
  await withRawDir(async (rawDir) => {
    await collectSnapshots({
      sources: [SOURCE], rawDir,
      fetchImpl: async () => new Response('first', { status: 200, headers: { ETag: '"etag-1"' } }),
      now: () => new Date('2026-09-16T00:00:00Z')
    });
    let receivedEtag = '';
    const result = await collectSnapshots({
      sources: [SOURCE], rawDir, refresh: true,
      fetchImpl: async (_url, options) => {
        receivedEtag = options.headers.get('if-none-match');
        return new Response(null, { status: 304 });
      },
      now: () => new Date('2026-09-16T01:00:00Z')
    });

    assert.equal(receivedEtag, '"etag-1"');
    assert.deepEqual(result.notModified, ['sample-source']);
  });
});

test('identifies the collector with a descriptive user agent', async () => {
  await withRawDir(async (rawDir) => {
    let userAgent = '';
    await collectSnapshots({
      sources: [SOURCE], rawDir,
      fetchImpl: async (_url, options) => {
        userAgent = options.headers.get('user-agent');
        return new Response('first', { status: 200 });
      },
      now: () => new Date('2026-09-16T00:00:00Z')
    });

    assert.equal(userAgent, 'PaperAtlas/0.1 (+https://github.com/Kitsunetic/paper-atlas)');
  });
});
