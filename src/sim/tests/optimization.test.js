import test from 'node:test';
import assert from 'node:assert/strict';
import * as CANNON from 'cannon-es';
import { createPart } from '../../core/types.js';
import { createSimulation } from '../simulation.js';

function plate() {
  return createPart({
    id: 'plate',
    kind: 'slab',
    floor: 1,
    material: 'wood',
    size: [0.5, 0.2, 0.5],
    position: [0, 2, 0],
    supportedBy: ['missing'],
  });
}
const triggerSupport = (sim) => sim.runScenario({ type: 'impact', intensity: 0, target: null });

test('움직이는 강체가 없을 때 충돌 단계를 호출하지 않고, 낙하 시 다시 실행', () => {
  const step = CANNON.World.prototype.step;
  let calls = 0;
  CANNON.World.prototype.step = function (...args) {
    calls++;
    return step.apply(this, args);
  };
  const p = plate();
  const sim = createSimulation([p], { emit: () => {} });
  try {
    for (let i = 0; i < 120; i++) sim.step(1 / 60);
    assert.equal(calls, 0);
    assert.equal(sim.getResults().time.toFixed(1), '2.0', '관찰 시간은 계속 진행');
    triggerSupport(sim);
    sim.step(1 / 60);
    assert.equal(calls, 1);
    assert.ok(p.position[1] < 2);
  } finally {
    sim.dispose();
    CANNON.World.prototype.step = step;
  }
});

test('잠든 잔해는 좌표 복사를 멈추고 깨어나면 낙하/종료 판정을 복원', () => {
  const p = plate();
  const sim = createSimulation([p], { emit: () => {} });
  try {
    triggerSupport(sim);
    sim.step(1 / 60);
    p.sim.body.sleep();
    sim.step(1 / 60);
    assert.equal(p.state, 'settled');
    assert.equal(sim.getResults().finished, true);
    let writes = 0;
    p.position = new Proxy(p.position, {
      set(target, key, value) {
        writes++;
        target[key] = value;
        return true;
      },
    });
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    assert.equal(writes, 0);
    // B 단계: 살짝 깨어난 정도(WAKE_SPEED 1 m/s 미만)는 '정지'를 유지 — 쌓인 잔해의 깨어남/잠듦 반복 방지
    p.sim.body.wakeUp();
    p.sim.body.velocity.set(0.3, 0, 0);
    sim.step(1 / 60);
    assert.ok(writes > 0, '깨어 있는 동안은 좌표를 반영');
    assert.equal(p.state, 'settled');
    assert.equal(sim.getResults().finished, true);
    // 실제로 빠르게 움직이면 다시 '떨어지는 중'
    p.sim.body.wakeUp();
    p.sim.body.velocity.set(3, 0, 0);
    sim.step(1 / 60);
    assert.equal(p.state, 'falling');
    assert.equal(sim.getResults().finished, false);
  } finally {
    sim.dispose();
  }
});

test('고정 부재만 있어도 화재의 시간·피해·표시 이벤트는 계속 진행', () => {
  const p = createPart({
    id: 'pillar',
    kind: 'column',
    floor: 1,
    material: 'rc',
    size: [0.5, 2, 0.5],
    position: [0, 1, 0],
  });
  const events = [];
  const sim = createSimulation([p], { emit: (name) => events.push(name) });
  try {
    sim.runScenario({ type: 'fire', intensity: 0.1, target: { kind: 'part', partId: p.id } });
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    assert.ok(p.hp < 1 && p.hp > 0);
    assert.equal(p.state, 'damaged');
    assert.deepEqual(p.position, [0, 1, 0]);
    assert.equal(sim.getResults().finished, false);
    assert.ok(events.includes('impact'));
    for (let i = 0; i < 480; i++) sim.step(1 / 60);
    assert.equal(sim.getResults().finished, true);
  } finally {
    sim.dispose();
  }
});

test('대기 중 물리 생략이 이후 동일 시드의 낙하 궤적을 바꾸지 않음', () => {
  const a = plate(),
    b = plate();
  const immediate = createSimulation([a], { emit: () => {}, seed: 1 });
  const delayed = createSimulation([b], { emit: () => {}, seed: 1 });
  try {
    for (let i = 0; i < 120; i++) delayed.step(1 / 60);
    triggerSupport(immediate);
    triggerSupport(delayed);
    for (let i = 0; i < 90; i++) {
      immediate.step(1 / 60);
      delayed.step(1 / 60);
    }
    assert.deepEqual(a.position, b.position);
    assert.deepEqual(a.quaternion, b.quaternion);
    assert.equal(a.state, b.state);
  } finally {
    immediate.dispose();
    delayed.dispose();
  }
});
