import assert from 'node:assert/strict';
import test from 'node:test';

import { createCountryClusterForce, isWorldOverviewEdge, linkAffinity, worldLinkDistance, worldLinkStrength } from './world-layout.mjs';

test('one-paper co-occurrence cannot pull the world graph into its core', () => {
  const oneOff = { paperCount: 1, mutuality: 1 };
  const recurrentMutual = { paperCount: 3, mutuality: .5 };

  assert.equal(linkAffinity(oneOff), 0);
  assert.equal(worldLinkStrength(oneOff), 0);
  assert.ok(worldLinkDistance(oneOff) > worldLinkDistance(recurrentMutual));
  assert.ok(worldLinkStrength(oneOff) < worldLinkStrength(recurrentMutual));
});

test('the world overview keeps only recurrent edges until an endpoint is focused', () => {
  assert.equal(isWorldOverviewEdge({ paperCount: 1 }), false);
  assert.equal(isWorldOverviewEdge({ paperCount: 2 }), true);
});

test('country clusters cohere internally while nearby countries repel', () => {
  const internal = [{ countryCode: 'KR', x: 0, y: 0, vx: 0, vy: 0 }, { countryCode: 'KR', x: 100, y: 0, vx: 0, vy: 0 }];
  const cohesion = createCountryClusterForce({ cohesionStrength: .1, separationStrength: 0 });
  cohesion.initialize(internal);
  cohesion(1);
  assert.ok(internal[0].vx > 0);
  assert.ok(internal[1].vx < 0);

  const countries = [{ countryCode: 'KR', x: 0, y: 0, vx: 0, vy: 0 }, { countryCode: 'US', x: 10, y: 0, vx: 0, vy: 0 }];
  const separation = createCountryClusterForce({ cohesionStrength: 0, separationStrength: .5, minimumCountryDistance: 100 });
  separation.initialize(countries);
  separation(1);
  assert.ok(countries[0].vx < 0);
  assert.ok(countries[1].vx > 0);
});
