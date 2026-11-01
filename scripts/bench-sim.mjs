// 시뮬레이션만 브라우저 없이 돌려 성능과 정지 여부를 확인하는 스크립트
// 사용법: node scripts/bench-sim.mjs [type] [floors]
import { makeBuilding } from '../src/build/generator.js';
import { createSimulation } from '../src/sim/simulation.js';

const type = process.argv[2] ?? 'piloti';
const floors = Number(process.argv[3] ?? 5);
const parts = makeBuilding({ type, floors });
const sim = createSimulation(parts, { emit: () => {} });

const targets = parts.filter((p) => p.kind === 'column' && p.floor === 1 && p.id.endsWith('-0'));
for (const t of targets) sim.runScenario({ type: 'impact', intensity: 1, targetPartId: t.id });
for (const t of targets) sim.runScenario({ type: 'impact', intensity: 1, targetPartId: t.id });

const dt = 1 / 60;
let worst = 0;
const start = performance.now();
for (let i = 1; i <= 60 * 12; i++) {
  const t0 = performance.now();
  sim.step(dt);
  worst = Math.max(worst, performance.now() - t0);
  if (i % 120 === 0) {
    const falling = parts.filter((p) => p.state === 'falling').length;
    const r = sim.getResults();
    console.log(`t=${(i * dt).toFixed(0)}s falling=${falling} collapsed=${r.collapsedParts}/${r.totalParts} finished=${r.finished}`);
  }
}
const total = performance.now() - start;
console.log(`${type} ${floors}F parts=${parts.length} avg ${(total / 720).toFixed(2)} ms/step, worst ${worst.toFixed(1)} ms`);
