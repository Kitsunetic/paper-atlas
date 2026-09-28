import assert from 'node:assert/strict';
import test from 'node:test';

import { createInstitutionCoarseGraph, seedAuthorsAroundInstitutions } from './coarse-layout.mjs';

test('coarse institution edges normalize raw support by both institution sizes', () => {
  const nodes = [
    { id: 'a1', institution: 'A' }, { id: 'a2', institution: 'A' },
    { id: 'b1', institution: 'B' }, { id: 'b2', institution: 'B' },
    { id: 'c1', institution: 'C' },
  ];
  const links = [
    { source: 'a1', target: 'b1', weight: 4 },
    { source: 'a2', target: 'b2', weight: 2 },
    { source: 'a1', target: 'c1', weight: 2 },
  ];
  const { coarseLinks } = createInstitutionCoarseGraph(nodes, links, 1180, 720);
  const ab = coarseLinks.find((edge) => edge.rawSupport === 6);
  const ac = coarseLinks.find((edge) => edge.rawSupport === 2);
  assert.equal(ab.normalizedSupport, 3);
  assert.ok(Math.abs(ac.normalizedSupport - Math.SQRT2) < 1e-12);
});

test('author seeds begin around the positioned institution hubs', () => {
  const nodes = [
    { id: 'a1', institution: 'A' }, { id: 'a2', institution: 'A' }, { id: 'b1', institution: 'B' },
  ];
  const graph = createInstitutionCoarseGraph(nodes, [], 1180, 720);
  graph.hubs[0].x = 100; graph.hubs[0].y = 120;
  graph.hubs[1].x = 900; graph.hubs[1].y = 600;
  seedAuthorsAroundInstitutions(graph.groups, graph.hubByInstitution);
  assert.ok(Math.hypot(nodes[0].x - 100, nodes[0].y - 120) <= graph.hubs[0].clusterRadius);
  assert.ok(Math.hypot(nodes[1].x - 100, nodes[1].y - 120) <= graph.hubs[0].clusterRadius);
  assert.ok(Math.hypot(nodes[2].x - 900, nodes[2].y - 600) <= graph.hubs[1].clusterRadius);
});

test('the initial hub field expands with the author-cloud area', () => {
  const compact = createInstitutionCoarseGraph(
    Array.from({ length: 20 }, (_, index) => ({ id: `compact-${index}`, institution: `I-${index}` })), [], 1180, 720,
  );
  const dense = createInstitutionCoarseGraph(
    Array.from({ length: 1000 }, (_, index) => ({ id: `dense-${index}`, institution: `I-${Math.floor(index / 5)}` })), [], 1180, 720,
  );
  assert.equal(compact.hubs[0].initialFieldScale, 1);
  assert.ok(dense.hubs[0].initialFieldScale > compact.hubs[0].initialFieldScale);
  const centerX = 1180 / 2;
  const compactExtent = Math.max(...compact.hubs.map((hub) => Math.abs(hub.x - centerX)));
  const denseExtent = Math.max(...dense.hubs.map((hub) => Math.abs(hub.x - centerX)));
  assert.ok(denseExtent > compactExtent, 'a larger graph begins in a wider field instead of a fixed central disk');
});
