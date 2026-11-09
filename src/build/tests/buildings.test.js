import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBuilding } from '../generator.js';
import { BUILDING_TYPES, MATERIALS, PART_KINDS } from '../../data/ids.js';
import { createSimulation } from '../../sim/simulation.js';

for (const [type, info] of Object.entries(BUILDING_TYPES)) {
  test(`${type}: 모든 허용 층수의 부재/지지 계약과 재현성`, () => {
    for (let floors = info.floors.min; floors <= info.floors.max; floors++) {
      const parts = makeBuilding({ type, floors });
      assert.deepEqual(parts, makeBuilding({ type, floors }));
      const byId = new Map(parts.map((p) => [p.id, p]));
      assert.equal(byId.size, parts.length, 'ID는 중복되지 않음');
      assert.ok(parts.length < 1200, '최대 초기 부재 예산');
      for (const p of parts) {
        assert.ok(PART_KINDS.includes(p.kind) && MATERIALS[p.material]);
        assert.ok(p.floor >= 1 && p.floor <= floors, p.id);
        assert.ok(
          p.size.every((v) => Number.isFinite(v) && v > 0),
          p.id,
        );
        assert.ok(p.position.every(Number.isFinite), p.id);
        assert.ok(Math.abs(Math.hypot(...p.quaternion) - 1) < 1e-8, p.id);
        assert.ok(p.supportedBy.length > 0, `${p.id}의 연결 누락`);
        for (const id of p.supportedBy)
          assert.ok(id === 'ground' || byId.has(id), `${p.id} -> ${id}`);
      }
      // 이웃 판 사이에 순환 연결이 있어도 각 부재는 땅으로 이어지는 경로를 가집니다.
      const rooted = new Set(['ground']);
      let changed = true;
      while (changed) {
        changed = false;
        for (const p of parts) {
          if (!rooted.has(p.id) && p.supportedBy.some((id) => rooted.has(id))) {
            rooted.add(p.id);
            changed = true;
          }
        }
      }
      assert.equal(rooted.size, parts.length + 1);
    }
  });
}

test('유형별 외형: 경사 지붕, 필로티 개방, 반복 발코니, L자 빈 공간', () => {
  const house = makeBuilding({ type: 'house', floors: 2 });
  assert.equal(house.filter((p) => p.id.startsWith('pitched-')).length, 16);
  assert.ok(house.some((p) => Math.abs(p.quaternion[2]) > 0.1));
  assert.ok(house.some((p) => p.label === '1층 현관문'));
  const piloti = makeBuilding({ type: 'piloti', floors: 4 });
  assert.ok(!piloti.some((p) => p.floor === 1 && p.id.startsWith('wall-')));
  assert.ok(piloti.some((p) => p.id === 'core-1-back'));
  assert.ok(piloti.some((p) => p.id === 'balcony-2-0'));
  const apartment = makeBuilding({ type: 'apartment', floors: 8 });
  assert.ok(apartment.some((p) => p.id === 'penthouse-cap'));
  assert.equal(apartment.filter((p) => /^balcony-\d+-\d+$/.test(p.id)).length, 14);
  const lshape = makeBuilding({ type: 'lshape', floors: 3 });
  assert.ok(!lshape.some((p) => p.kind === 'column' && p.grid.i > 1 && p.grid.j > 1));
});

test('A가 추가한 지붕·발코니가 기존 공개 시뮬레이션과 함께 분리됨', () => {
  for (const type of ['house', 'piloti', 'apartment', 'lshape']) {
    const parts = makeBuilding({ type, floors: 3 });
    const sim = createSimulation(parts, { emit: () => {}, seed: 1 });
    assert.equal(sim.getResults().collapsedParts, 0);
    for (const p of [...parts].filter((p) => p.kind === 'column' && p.floor === 1)) {
      for (let i = 0; i < 3; i++)
        sim.runScenario({
          type: 'impact',
          intensity: 1,
          target: { kind: 'part', partId: p.id },
        });
    }
    assert.ok(
      parts.filter((p) => p.structural).every((p) => p.state === 'failed' || p.state === 'falling'),
    );
    if (type === 'house')
      assert.ok(
        parts.filter((p) => p.id.startsWith('pitched-')).every((p) => p.state === 'falling'),
      );
    sim.dispose();
  }
});
