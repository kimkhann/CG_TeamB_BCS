// Earthquake comparison: per-story damage by building, material and intensity
// Usage: node scripts/compare-quake.mjs [type] [floors] [intensity 0–1, 1 = 0.5 g PGA]
import { makeBuilding } from '../src/build/generator.js';
import { createSimulation } from '../src/sim/simulation.js';

const type = process.argv[2] ?? 'piloti';
const floors = Number(process.argv[3] ?? 5);
const intensity = Number(process.argv[4] ?? 1);
const MATERIALS = [
  { label: 'default', materials: undefined },
  { label: 'RC', materials: { frame: 'rc', slab: 'rc', wall: 'rc' } },
  { label: 'steel + panel', materials: { frame: 'steel', slab: 'rc', wall: 'panel' } },
  { label: 'timber + brick', materials: { frame: 'wood', slab: 'wood', wall: 'brick' } },
];

for (const { label, materials } of MATERIALS) {
  const parts = makeBuilding({ type, floors, ...(materials ? { materials } : {}) });
  const sim = createSimulation(parts, { emit: () => {} });
  sim.runScenario({ type: 'earthquake', intensity, target: null });
  const t0 = performance.now();
  let steps = 0;
  for (; steps < 60 * 30; steps++) {
    sim.step(1 / 60);
    if (steps > 60 * 9 && sim.getResults().finished) break;
  }
  const ms = (performance.now() - t0) / steps;
  const r = sim.getResults();
  const floorsText = r.floorDamage.map((f) => `${f.floor}:${Math.round(f.ratio * 100)}`).join(' ');
  const c = r.damageByCause;
  console.log(
    `${label.padEnd(8)} | collapsed ${Math.round(r.collapsedRatio * 100)}% floors ${r.floorsLost}` +
      ` | per floor % ${floorsText} | cause quake ${Math.round(c.scenario * 100)}/impact ${Math.round(c.collision * 100)}/debris ${Math.round(c.debris * 100)}` +
      ` | collapse time ${r.collapseTime?.toFixed(1) ?? '-'}s | ${(steps / 60).toFixed(1)}s ${ms.toFixed(1)} ms/step`,
  );
  sim.dispose();
}
