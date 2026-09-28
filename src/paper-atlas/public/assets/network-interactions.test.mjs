import assert from 'node:assert/strict';
import test from 'node:test';

import { keyboardPanDirection, traverseGraph } from './network-interactions.js';

test('traverseGraph discovers a breadth-first tree and honours a view-specific depth', () => {
  const adjacency = new Map([
    ['A', [{ id: 'B', edge: { id: 'AB' } }]],
    ['B', [{ id: 'A', edge: { id: 'AB' } }, { id: 'C', edge: { id: 'BC' } }]],
    ['C', [{ id: 'B', edge: { id: 'BC' } }]],
  ]);

  assert.deepEqual([...traverseGraph(adjacency, 'A').distances.entries()], [['A', 0], ['B', 1], ['C', 2]]);
  assert.deepEqual([...traverseGraph(adjacency, 'A', 1).distances.entries()], [['A', 0], ['B', 1]]);
});

test('keyboard panning uses camera direction and leaves modified keys alone', () => {
  assert.deepEqual(keyboardPanDirection({ key: 'ArrowRight' }), { x: -1, y: 0 });
  assert.deepEqual(keyboardPanDirection({ key: 'ArrowUp' }), { x: 0, y: 1 });
  assert.equal(keyboardPanDirection({ key: 'ArrowRight', ctrlKey: true }), null);
  assert.equal(keyboardPanDirection({ key: 'a' }), null);
});
