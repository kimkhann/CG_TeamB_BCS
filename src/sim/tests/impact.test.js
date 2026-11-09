// B 단계: 충돌 피해 · 잔해 하중 모델 검증
// 실행: node --test src/sim/tests/impact.test.js
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
const v3m = Math.sqrt(2 * 9.81 * 3); // 한 층(3m) 자유낙하 속도

test('재료별 흡수 능력: 강재 > 철근콘크리트 > 목재 > 벽돌 > 패널 > 유리', () => {
  const order = ['steel', 'rc', 'wood', 'brick', 'panel', 'window'].map((m) => energyDensity(P[m]));
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1] > order[i]);
});

test('충돌 위치: 판 가운데 충돌이 가장자리보다 피해가 큼', () => {
  const s = slab();
  const center = locationFactor(s, [0, 0.12, 0], [0, -1, 0]);
  const edge = locationFactor(s, [0.95, 0.12, 0.95], [0, -1, 0]);
  assert.equal(center, 1);
  assert.ok(edge < 0.5);
  assert.equal(locationFactor(s, [0, 0, 0], [1, 0, 0]), 0.4, '면을 따라 스치는 충돌');
});

test('충돌 방향: 기둥은 옆에서 가운데를 맞을 때 가장 약하고, 위에서 누를 때 강함', () => {
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

test('같은 낙하라도 약한 재료가 더 크게 부서지고, 무거운 낙하물이 더 크게 부숨', () => {
  const hit = (fallingMaterial, targetMaterial) =>
    impactDamage({
      mass: P[fallingMaterial].density * 1, // 2m × 0.25m × 2m 바닥판 한 조각
      normalSpeed: v3m,
      target: slab(targetMaterial),
      targetPhys: P[targetMaterial],
      point: [0, 0.12, 0],
      normal: [0, -1, 0],
    });
  assert.ok(hit('rc', 'wood') > hit('rc', 'rc'), '목조 바닥이 RC 바닥보다 약함');
  assert.ok(hit('rc', 'rc') > hit('wood', 'rc'), 'RC 낙하물이 목재 낙하물보다 무거움');
  assert.ok(hit('rc', 'wood') >= 1, 'RC 바닥판이 한 층 떨어지면 목조 바닥은 부서짐');
  assert.ok(
    hit('rc', 'rc') > 0.5 && hit('rc', 'rc') < 1,
    'RC끼리는 크게 손상되지만 한 번에 부서지지는 않음',
  );
});

test('느린 접촉은 무시', () => {
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

test('잔해 하중: 설계 여유 하중 이하는 버티고, 넘으면 초과 비율만큼 부서짐', () => {
  const capacity = reserveCapacity(slab('rc'), P.rc);
  // 2m × 2m RC 바닥판: 약 50 kN (≈ 5톤) 여유
  assert.ok(capacity > 40 && capacity < 60);
  assert.ok(reserveCapacity(slab('wood'), P.wood) < capacity, '가벼운 목조 바닥은 여유가 작음');
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
  // 바닥판이 공중에 떠 있어도 땅에 붙은 것으로 취급되도록 위치만 올림
  floor.position[1] = 2;
  block.position[1] += 2;
  const sim = createSimulation([floor, block], { emit: () => {} });
  sim.runScenario({ type: 'impact', intensity: 0, target: null }); // 블록을 떨어뜨림
  for (let i = 0; i < 60 * 4; i++) sim.step(1 / 60);
  sim.dispose();
  return floor;
}

test('통합: 무거운 잔해가 얹히면 바닥판이 부서지고, 가벼운 잔해는 버팀', () => {
  const heavy = runPile(blockAbove('rc', [1.8, 1.8, 1.8])); // ≈ 14톤
  const light = runPile(blockAbove('wood', [1, 0.3, 1])); // ≈ 0.2톤
  assert.notEqual(heavy.state, 'intact');
  assert.ok(heavy.hp < 0.5, `무거운 잔해 아래 바닥판 체력 ${heavy.hp}`);
  assert.equal(light.state, 'intact');
});
