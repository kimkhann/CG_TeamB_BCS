// Weight-driven damage check: destroy upper-floor columns so the upper floors fall, and compare lower-floor damage per material
// Usage: node scripts/compare-crush.mjs [type] [floors] [failFloor]  (simulates up to 30 s)
//   e.g.  node scripts/compare-crush.mjs piloti 5 4
import { makeBuilding } from '../src/build/generator.js';
import { createSimulation } from '../src/sim/simulation.js';

const type = process.argv[2] ?? 'piloti';
const floors = Number(process.argv[3] ?? 5);
const failFloor = Number(process.argv[4] ?? floors - 1);

const MATERIALS = [
  { label: 'RC', materials: { frame: 'rc', slab: 'rc', wall: 'rc' } },
  { label: 'steel + RC slab', materials: { frame: 'steel', slab: 'rc', wall: 'panel' } },
  { label: 'timber', materials: { frame: 'wood', slab: 'wood', wall: 'brick' } },
];

for (const { label, materials } of MATERIALS) {
  const parts = makeBuilding({ type, floors, materials });
  let impacts = 0;
  const sim = createSimulation(parts, {
    emit: (name) => {
      if (name === 'impact') impacts++;
    },
  });
  // destroy every column on the chosen floor → that floor and those above fall
  for (const col of parts.filter((p) => p.kind === 'column' && p.floor === failFloor)) {
    for (let n = 0; n < 3; n++) {
      sim.runScenario({ type: 'impact', intensity: 1, target: { kind: 'part', partId: col.id } });
    }
  }
  const t0 = performance.now();
  let steps = 0;
  for (; steps < 60 * 30; steps++) {
    sim.step(1 / 60);
    if (steps > 120 && sim.getResults().finished) break;
  }
  const ms = (performance.now() - t0) / steps;
  const below = parts.filter((p) => p.structural && p.kind !== 'fragment' && p.floor < failFloor);
  const brokenBelow = below.filter((p) => p.state !== 'intact').length;
  const r = sim.getResults();
  console.log(
    `${label.padEnd(10)} | collapsed ${String(r.collapsedParts).padStart(4)}/${r.totalParts} (${Math.round(r.collapsedRatio * 100)}%)` +
      ` | lower floors damaged/collapsed ${brokenBelow}/${below.length} | floors lost ${r.floorsLost}` +
      ` | ${(steps / 60).toFixed(1)}s, avg ${ms.toFixed(1)} ms/step`,
  );
  sim.dispose();
}
