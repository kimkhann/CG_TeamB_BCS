// 시뮬레이션만 브라우저 없이 돌려 성능과 정지 여부를 확인하는 스크립트
// 사용법: npm run bench -- [type] [floors]
//   예)   npm run bench -- piloti 5
import { makeBuilding } from '../src/build/generator.js';
import { createSimulation } from '../src/sim/simulation.js';

const type = process.argv[2] ?? 'piloti';
const floors = Number(process.argv[3] ?? 5);
const parts = makeBuilding({ type, floors });
const sim = createSimulation(parts, { emit: () => {} });

// 1층 앞줄 기둥 두 개를 완전히 부숨 (프로포절 데모의 '붕괴 시연'과 같은 상황)
const targets = parts.filter((p) => p.kind === 'column' && p.floor === 1 && p.grid?.j === 0).slice(0, 2);
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
      `t=${(i * dt).toFixed(0)}s  떨어지는 중 ${falling}  무너짐 ${r.collapsedParts}/${r.totalParts}  층 ${r.floorsLost}  정지 ${r.finished}`,
    );
  }
}
const total = performance.now() - start;
console.log(
  `${type} ${floors}층 · 부재 ${parts.length}개 · 평균 ${(total / (60 * seconds)).toFixed(2)} ms/단계 · 최악 ${worst.toFixed(1)} ms`,
);
console.log('※ 한 단계가 16ms를 넘으면 실시간보다 느려집니다.');
