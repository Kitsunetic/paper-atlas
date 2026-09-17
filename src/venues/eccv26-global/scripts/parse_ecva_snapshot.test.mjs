import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { EcvaParseError, buildEcvaSnapshotReport } from './parse_ecva_snapshot.mjs';

async function withDataRoot(callback) {
  const dataRoot = await mkdtemp(path.join(tmpdir(), 'paper-atlas-ecva-'));
  try {
    await mkdir(path.join(dataRoot, 'raw'), { recursive: true });
    await callback(dataRoot);
  } finally {
    await rm(dataRoot, { recursive: true, force: true });
  }
}

async function writeFixture(dataRoot, payload) {
  const rawDir = path.join(dataRoot, 'raw');
  const file = 'ecva-virtual-program.fixture.json';
  await writeFile(path.join(rawDir, file), JSON.stringify(payload));
  await writeFile(path.join(rawDir, 'manifest.json'), JSON.stringify({
    schema_version: 1,
    sources: { 'ecva-virtual-program': { file } }
  }));
}

test('reports unique poster papers and raw first-author affiliation coverage', async () => {
  await withDataRoot(async (dataRoot) => {
    await writeFixture(dataRoot, {
      results: [
        { id: 1, uid: 'paper-a', eventtype: 'Poster', authors: [{ fullname: 'Ada', institution: 'Example University' }] },
        { id: 2, uid: 'paper-b', eventtype: 'Poster', authors: [{ fullname: 'Bo', institution: '' }] },
        { id: 3, uid: 'paper-a', eventtype: 'Oral', authors: [{ fullname: 'Ada', institution: 'Example University' }] }
      ]
    });

    const result = await buildEcvaSnapshotReport({ dataRoot });
    const report = JSON.parse(await readFile(result.reportPath, 'utf8'));

    assert.equal(report.event_counts.Poster, 2);
    assert.equal(report.poster_unique_paper_uids, 2);
    assert.equal(report.poster_first_author_affiliation_missing, 1);
    assert.deepEqual(report.poster_first_author_affiliation_top_raw, [{ affiliation: 'Example University', paper_count: 1 }]);
  });
});

test('refuses a virtual-program snapshot without a results array', async () => {
  await withDataRoot(async (dataRoot) => {
    await writeFixture(dataRoot, { invalid: true });
    await assert.rejects(() => buildEcvaSnapshotReport({ dataRoot }), EcvaParseError);
  });
});
