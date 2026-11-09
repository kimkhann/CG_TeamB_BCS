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

test('유리는 지지를 잃으면 강체 없이 깨지고 glass 이펙트를 냄', () => {
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
  assert.ok(!events.some(([n]) => n === 'part:added'), '유리 조각 강체를 만들지 않음');
  sim.dispose();
});

test('지진: 서 있는 부재가 흔들리고, 끝나면 원래 위치 · 고정 강체로 돌아옴', () => {
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
  assert.ok(moved > 0.1, `지붕이 흔들림 (${moved.toFixed(2)} m)`);
  assert.equal(roof.sim.body.type, CANNON.Body.KINEMATIC);
  run(sim, 7);
  assert.ok(sim.getResults().finished);
  if (roof.state === 'intact' || roof.state === 'damaged') {
    assert.deepEqual(roof.position, start);
    assert.equal(roof.sim.body.type, CANNON.Body.STATIC);
  }
  sim.dispose();
});

test('지진: 벽 없는 필로티 1층은 벽이 있는 위층보다 층 전단비가 큼 (연약층)', () => {
  const parts = makeBuilding({
    type: 'piloti',
    floors: 4,
    materials: { frame: 'rc', slab: 'rc', wall: 'rc' },
  });
  const cap = (floor) =>
    parts
      .filter((p) => p.floor === floor && (p.kind === 'column' || p.kind === 'wall'))
      .reduce((s, p) => s + shearCapacity(p, 'x', 3), 0);
  assert.ok(cap(2) > cap(1) * 2, `1층 ${cap(1).toFixed(0)} kN, 2층 ${cap(2).toFixed(0)} kN`);
  assert.equal(envelope(0), 0);
  assert.equal(envelope(3), 1);
  assert.equal(envelope(8), 0);
});

test('결과: 붕괴 진행 시간 · 층별 피해율 · 원인별 피해', () => {
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

test('횡지지: 보 · 바닥판을 모두 잃은 위층 기둥은 쓰러지고, 땅에 선 1층 기둥은 남음', async () => {
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
  assert.ok(isLaterallyStable(upper, byId, deps), '아래 이음부의 보가 잡아 줌');
  beam.state = 'settled';
  assert.ok(!isLaterallyStable(upper, byId, deps), '잡아 줄 부재가 없음 → 쓰러짐');
  assert.ok(isLaterallyStable(lower, byId, deps), '1층 기둥은 기초에 고정');
});

test('세기 설명: 시나리오별 실제 크기', async () => {
  const { describeIntensity, mmiFromPga } = await import('../intensityScale.js');
  assert.match(describeIntensity('impact', 1).headline, /시속 43km/);
  assert.match(describeIntensity('explosion', 1).headline, /TNT 약 1.5 kg/);
  assert.match(describeIntensity('earthquake', 1).headline, /진도 Ⅷ/);
  assert.match(describeIntensity('fire', 1).headline, /20분/);
  assert.equal(mmiFromPga(0.25).level, 'Ⅶ');
});
