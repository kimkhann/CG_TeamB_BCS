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

test('skips the collision step with no moving bodies and resumes when something falls', () => {
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
    assert.equal(sim.getResults().time.toFixed(1), '2.0', 'observed time keeps advancing');
    triggerSupport(sim);
    sim.step(1 / 60);
    assert.equal(calls, 1);
    assert.ok(p.position[1] < 2);
  } finally {
    sim.dispose();
    CANNON.World.prototype.step = step;
  }
});

test('sleeping debris stops copying positions and restores fall/finish checks on waking', () => {
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
    // Stage B: a light wake-up (below WAKE_SPEED 1 m/s) stays 'settled' — prevents wake/sleep churn in piled debris
    p.sim.body.wakeUp();
    p.sim.body.velocity.set(0.3, 0, 0);
    sim.step(1 / 60);
    assert.ok(writes > 0, 'positions are copied while awake');
    assert.equal(p.state, 'settled');
    assert.equal(sim.getResults().finished, true);
    // moving fast for real makes it 'falling' again
    p.sim.body.wakeUp();
    p.sim.body.velocity.set(3, 0, 0);
    sim.step(1 / 60);
    assert.equal(p.state, 'falling');
    assert.equal(sim.getResults().finished, false);
  } finally {
    sim.dispose();
  }
});

test('fire time, damage and effect events continue with only static parts', () => {
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

test('skipping idle physics does not change later fall trajectories for the same seed', () => {
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
