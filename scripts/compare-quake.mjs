// 지진 비교: 건물 · 재료 · 세기별로 층 전단비와 피해 확인
// 사용법: node scripts/compare-quake.mjs [type] [floors] [intensity]
import { makeBuilding } from '../src/build/generator.js';
import { createSimulation } from '../src/sim/simulation.js';

const type = process.argv[2] ?? 'piloti';
const floors = Number(process.argv[3] ?? 5);
const intensity = Number(process.argv[4] ?? 1);
const MATERIALS = [
  { label: '기본 재료', materials: undefined },
  { label: '철근콘크리트', materials: { frame: 'rc', slab: 'rc', wall: 'rc' } },
  { label: '철골 + 패널', materials: { frame: 'steel', slab: 'rc', wall: 'panel' } },
  { label: '목조 + 벽돌', materials: { frame: 'wood', slab: 'wood', wall: 'brick' } },
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
    `${label.padEnd(8)} | 붕괴 ${Math.round(r.collapsedRatio * 100)}% 층 ${r.floorsLost}` +
      ` | 층별% ${floorsText} | 원인 지진${Math.round(c.scenario * 100)}/충돌${Math.round(c.collision * 100)}/잔해${Math.round(c.debris * 100)}` +
      ` | 붕괴진행 ${r.collapseTime?.toFixed(1) ?? '-'}s | ${(steps / 60).toFixed(1)}s ${ms.toFixed(1)}ms/단계`,
  );
  sim.dispose();
}
