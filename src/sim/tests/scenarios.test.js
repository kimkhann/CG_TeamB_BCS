import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createPart } from '../../core/types.js';
import { makeBuilding } from '../../build/generator.js';
import { createSimulation } from '../simulation.js';
import { envelope, shearCapacity } from '../scenarios/earthquake.js';

const run = (sim, seconds) => {
  for (let i = 0; i < seconds * 60; i++) sim.step(1 / 60);
};

test('explosion applies finite outward impulses after members start falling', () => {
  const parts = makeBuilding({
    type: 'house',
    floors: 2,
    materials: { frame: 'wood', wall: 'brick', slab: 'wood', facade: 'window' },
  });
  const sim = createSimulation(parts, { emit: () => {} });
  try {
    const column = parts.find((p) => p.kind === 'column' && p.floor === 1);
    assert.doesNotThrow(() =>
      sim.runScenario({
        type: 'explosion',
        value: 10,
        target: { kind: 'part', partId: column.id },
      }),
    );
    const moving = parts.filter((p) => p.state === 'falling' && p.sim.body);
    assert.ok(moving.length > 0, 'the blast must exercise falling-member impulse code');
    assert.ok(moving.some((p) => p.sim.body.velocity.length() > 0));
    assert.ok(moving.every((p) => p.sim.body.velocity.toArray().every(Number.isFinite)));
    run(sim, 1);
    assert.ok(parts.every((p) => p.position.every(Number.isFinite)));
  } finally {
    sim.dispose();
  }
});

test('glass shatters without rigid bodies on support loss and emits a glass effect', () => {
  const glass = createPart({
    id: 'win-a',
    kind: 'window',
    floor: 1,
    material: 'window',
    size: [1, 1, 0.1],
    position: [0, 2, 0],
    supportedBy: ['missing'],
  });
  const events = [];
  const sim = createSimulation([glass], { emit: (name, payload) => events.push([name, payload]) });
  sim.runScenario({ type: 'impact', intensity: 0, target: null });
  assert.equal(glass.state, 'failed');
  assert.ok(events.some(([n]) => n === 'part:failed'));
  assert.ok(events.some(([n, p]) => n === 'impact' && p.kind === 'glass'));
  assert.ok(!events.some(([n]) => n === 'part:added'), 'no rigid bodies for glass pieces');
  sim.dispose();
});

test('earthquake: standing parts sway and return to their position as static bodies afterwards', () => {
  const parts = makeBuilding({
    type: 'apartment',
    floors: 3,
    materials: { frame: 'steel', slab: 'rc', wall: 'panel' },
  });
  const roof = parts.reduce((a, b) => (b.position[1] > a.position[1] ? b : a));
  const start = [...roof.position];
  const sim = createSimulation(parts, { emit: () => {} });
  sim.runScenario({ type: 'earthquake', intensity: 1, target: null });
  let moved = 0;
  for (let i = 0; i < 60 * 3; i++) {
    sim.step(1 / 60);
    moved = Math.max(moved, Math.abs(roof.position[0] - start[0]));
  }
  assert.ok(moved > 0.1, `the roof sways (${moved.toFixed(2)} m)`);
  assert.equal(roof.sim.body.type, CANNON.Body.KINEMATIC);
  run(sim, 7);
  assert.ok(sim.getResults().finished);
  if (roof.state === 'intact' || roof.state === 'damaged') {
    assert.deepEqual(roof.position, start);
    assert.equal(roof.sim.body.type, CANNON.Body.STATIC);
  }
  sim.dispose();
});

test('earthquake: a wall-less piloti ground floor has a higher story shear ratio than the walled floors above (soft story)', () => {
  const parts = makeBuilding({
    type: 'piloti',
    floors: 4,
    materials: { frame: 'rc', slab: 'rc', wall: 'rc' },
  });
  const cap = (floor) =>
    parts
      .filter((p) => p.floor === floor && (p.kind === 'column' || p.kind === 'wall'))
      .reduce((s, p) => s + shearCapacity(p, 'x', 3), 0);
  assert.ok(
    cap(2) > cap(1) * 2,
    `floor 1 ${cap(1).toFixed(0)} kN, floor 2 ${cap(2).toFixed(0)} kN`,
  );
  assert.equal(envelope(0), 0);
  assert.equal(envelope(3), 1);
  assert.equal(envelope(8), 0);
});

test('results: collapse time, per-floor damage, damage by cause', () => {
  const parts = makeBuilding({ type: 'house', floors: 2 });
  const sim = createSimulation(parts, { emit: () => {} });
  const column = parts.find((p) => p.kind === 'column' && p.floor === 2);
  for (let n = 0; n < 3; n++) {
    sim.runScenario({ type: 'impact', intensity: 1, target: { kind: 'part', partId: column.id } });
  }
  run(sim, 6);
  const r = sim.getResults();
  assert.equal(r.floorDamage.length, 2);
  assert.ok(r.floorDamage.every((f) => f.ratio >= 0 && f.ratio <= 1));
  assert.ok(r.floorDamage.find((f) => f.floor === 2).ratio > 0);
  const { scenario, collision, debris } = r.damageByCause;
  assert.ok(Math.abs(scenario + collision + debris - 1) < 1e-9);
  assert.ok(scenario > 0);
  assert.ok(r.collapseTime === null || r.collapseTime >= 0);
  sim.dispose();
});

test('lateral bracing: an upper column with no beams or slabs left topples, a ground-floor column stays', async () => {
  const { buildDependents, isLaterallyStable } = await import('../structure.js');
  const lower = createPart({
    id: 'c1',
    kind: 'column',
    floor: 1,
    material: 'rc',
    size: [0.4, 2.75, 0.4],
    position: [0, 1.375, 0],
    supportedBy: ['ground'],
  });
  const upper = createPart({
    id: 'c2',
    kind: 'column',
    floor: 2,
    material: 'rc',
    size: [0.4, 2.75, 0.4],
    position: [0, 4.375, 0],
    supportedBy: ['c1'],
  });
  const beam = createPart({
    id: 'b1',
    kind: 'beam',
    floor: 1,
    material: 'rc',
    size: [4, 0.35, 0.3],
    position: [2, 2.8, 0],
    supportedBy: ['c1'],
  });
  const parts = [lower, upper, beam];
  const byId = new Map(parts.map((p) => [p.id, p]));
  const deps = buildDependents(parts);
  assert.ok(isLaterallyStable(upper, byId, deps), 'the beam at the lower joint braces it');
  beam.state = 'settled';
  assert.ok(!isLaterallyStable(upper, byId, deps), 'nothing braces it → topples');
  assert.ok(
    isLaterallyStable(lower, byId, deps),
    'a ground-floor column is fixed to its foundation',
  );
});

test('scenario size: real-world unit conversion', async () => {
  const m = await import('../scenarioScale.js');
  assert.match(m.describeScenario('impact', 43).headline, /43 km\/h/);
  assert.ok(Math.abs(m.blast(1).radius - 7) < 1e-9, '1 kg TNT → 7 m radius');
  // M 6.0 at 10 km → about 0.22 g (Korean design earthquake level)
  assert.ok(Math.abs(m.pgaFromMagnitude(6, 10) - 0.22) < 0.01);
  assert.ok(m.pgaFromMagnitude(7, 10) > m.pgaFromMagnitude(7, 50), 'weaker with distance');
  assert.match(m.describeScenario('earthquake', 6, 10).headline, /MMI Ⅶ/);
  assert.match(m.describeScenario('fire', 30).headline, /30 min/);
  assert.equal(m.mmiFromPga(0.25).level, 'Ⅶ');
  // log-scale slider round trip
  const s = m.SCALES.explosion;
  assert.ok(Math.abs(m.valueFromSlider(s, m.sliderFromValue(s, 10)) - 10) < 0.5);
  // old format (intensity) still accepted
  assert.equal(m.scenarioValue({ type: 'fire', intensity: 0.5 }), 10);
});
