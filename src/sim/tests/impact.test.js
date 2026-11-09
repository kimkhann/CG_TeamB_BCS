// Stage B: impact damage and debris load model
// Run: node --test src/sim/tests/impact.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createPart } from '../../core/types.js';
import { materialPhysics as P } from '../../data/materialPhysics.js';
import {
  energyDensity,
  impactDamage,
  locationFactor,
  reserveCapacity,
  overloadDamage,
  MIN_IMPACT_SPEED,
} from '../impact.js';
import { createSimulation } from '../simulation.js';

const slab = (material = 'rc') =>
  createPart({
    id: 's',
    kind: 'slab',
    floor: 1,
    material,
    size: [2, 0.25, 2],
    position: [0, 0, 0],
  });
const v3m = Math.sqrt(2 * 9.81 * 3); // free-fall speed over one story (3 m)

test('energy capacity by material: steel > RC > timber > brick > panel > glass', () => {
  const order = ['steel', 'rc', 'wood', 'brick', 'panel', 'window'].map((m) => energyDensity(P[m]));
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] > order[i]);
});

test('hit location: a mid-plate hit does more damage than an edge hit', () => {
  const s = slab();
  const center = locationFactor(s, [0, 0.12, 0], [0, -1, 0]);
  const edge = locationFactor(s, [0.95, 0.12, 0.95], [0, -1, 0]);
  assert.equal(center, 1);
  assert.ok(edge < 0.5);
  assert.equal(locationFactor(s, [0, 0, 0], [1, 0, 0]), 0.4, 'in-plane glancing hit');
});

test('hit direction: a column is weakest when hit mid-height from the side and strongest when pressed from above', () => {
  const col = createPart({
    id: 'c',
    kind: 'column',
    floor: 1,
    material: 'rc',
    size: [0.4, 2.75, 0.4],
    position: [0, 0, 0],
  });
  const lateralMid = locationFactor(col, [0.2, 0, 0], [-1, 0, 0]);
  const lateralBase = locationFactor(col, [0.2, -1.3, 0], [-1, 0, 0]);
  const axial = locationFactor(col, [0, 1.37, 0], [0, -1, 0]);
  assert.equal(lateralMid, 1.5);
  assert.ok(lateralMid > lateralBase && lateralBase > axial);
});

test('for the same fall, weaker targets break more and heavier debris breaks more', () => {
  const hit = (fallingMaterial, targetMaterial) =>
    impactDamage({
      mass: P[fallingMaterial].density * 1, // one 2m × 0.25m × 2m slab piece
      normalSpeed: v3m,
      target: slab(targetMaterial),
      targetPhys: P[targetMaterial],
      point: [0, 0.12, 0],
      normal: [0, -1, 0],
    });
  assert.ok(hit('rc', 'wood') > hit('rc', 'rc'), 'a timber floor is weaker than an RC floor');
  assert.ok(hit('rc', 'rc') > hit('wood', 'rc'), 'falling RC is heavier than falling timber');
  assert.ok(hit('rc', 'wood') >= 1, 'an RC slab falling one story breaks a timber floor');
  assert.ok(
    hit('rc', 'rc') > 0.5 && hit('rc', 'rc') < 1,
    'RC on RC is heavily damaged but not broken in one hit',
  );
});

test('slow contacts are ignored', () => {
  const amount = impactDamage({
    mass: 10,
    normalSpeed: MIN_IMPACT_SPEED * 0.9,
    target: slab(),
    targetPhys: P.rc,
    point: [0, 0, 0],
    normal: [0, -1, 0],
  });
  assert.equal(amount, 0);
});

test('debris load: holds up to the design reserve and breaks in proportion to the overload', () => {
  const capacity = reserveCapacity(slab('rc'), P.rc);
  // 2m × 2m RC slab: about 50 kN (≈ 5 t) reserve
  assert.ok(capacity > 40 && capacity < 60);
  assert.ok(
    reserveCapacity(slab('wood'), P.wood) < capacity,
    'a light timber floor has less reserve',
  );
  assert.equal(overloadDamage(capacity * 0.9, capacity, 1), 0);
  assert.ok(Math.abs(overloadDamage(capacity * 1.5, capacity, 1) - 1) < 1e-9);
});

function blockAbove(material, size) {
  return createPart({
    id: 'block',
    kind: 'slab',
    floor: 2,
    material,
    size,
    position: [0, 0.125 + size[1] / 2 + 0.02, 0],
    supportedBy: ['missing'],
  });
}
function runPile(block) {
  const floor = createPart({
    id: 'floor',
    kind: 'slab',
    floor: 1,
    material: 'rc',
    size: [2, 0.25, 2],
    position: [0, 0, 0],
    supportedBy: ['ground'],
  });
  // raise the position only, so the slab counts as grounded even though it floats
  floor.position[1] = 2;
  block.position[1] += 2;
  const sim = createSimulation([floor, block], { emit: () => {} });
  sim.runScenario({ type: 'impact', intensity: 0, target: null }); // drop the block
  for (let i = 0; i < 60 * 4; i++) sim.step(1 / 60);
  sim.dispose();
  return floor;
}

test('integration: heavy debris breaks the slab, light debris does not', () => {
  const heavy = runPile(blockAbove('rc', [1.8, 1.8, 1.8])); // ≈ 14 t
  const light = runPile(blockAbove('wood', [1, 0.3, 1])); // ≈ 0.2 t
  assert.notEqual(heavy.state, 'intact');
  assert.ok(heavy.hp < 0.5, `slab hp under heavy debris ${heavy.hp}`);
  assert.equal(light.state, 'intact');
});
