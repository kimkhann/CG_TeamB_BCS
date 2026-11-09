// Runs only the simulation, without a browser, to check performance and that it comes to rest
// Usage: npm run bench -- [type] [floors]
//   e.g.  npm run bench -- piloti 5
import { makeBuilding } from '../src/build/generator.js';
import { createSimulation } from '../src/sim/simulation.js';

const type = process.argv[2] ?? 'piloti';
const floors = Number(process.argv[3] ?? 5);
const parts = makeBuilding({ type, floors });
const sim = createSimulation(parts, { emit: () => {} });

// Fully destroy the two front ground-floor columns (same as the proposal demo's collapse showcase)
const targets = parts
  .filter((p) => p.kind === 'column' && p.floor === 1 && p.grid?.j === 0)
  .slice(0, 2);
for (const t of targets) {
  sim.runScenario({ type: 'impact', intensity: 1, target: { kind: 'part', partId: t.id } });
  sim.runScenario({ type: 'impact', intensity: 1, target: { kind: 'part', partId: t.id } });
}

const dt = 1 / 60;
let worst = 0;
const start = performance.now();
const seconds = 10;
for (let i = 1; i <= 60 * seconds; i++) {
  const t0 = performance.now();
  sim.step(dt);
  worst = Math.max(worst, performance.now() - t0);
  if (i % 120 === 0) {
    const falling = parts.filter((p) => p.state === 'falling').length;
    const r = sim.getResults();
    console.log(
      `t=${(i * dt).toFixed(0)}s  falling ${falling}  collapsed ${r.collapsedParts}/${r.totalParts}  floors ${r.floorsLost}  finished ${r.finished}`,
    );
  }
}
const total = performance.now() - start;
console.log(
  `${type} ${floors}F · ${parts.length} parts · avg ${(total / (60 * seconds)).toFixed(2)} ms/step · worst ${worst.toFixed(1)} ms`,
);
console.log('Note: steps over 16 ms run slower than real time.');
