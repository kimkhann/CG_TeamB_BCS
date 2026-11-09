/**
 * [B · 보고서] 화면 없이 시뮬레이션 돌리기 — 보고서용 반복 실행
 *
 * 렌더링 없이 물리 계산만 하므로 화면 재생보다 빠릅니다.
 * 브라우저가 멈추지 않도록 약 0.2초마다 잠깐 양보(await)합니다.
 * 화면에서 실행할 때는 화면의 시뮬레이션을 잠시 멈추고 계산합니다 (simulateScreen.js).
 */

import { makeBuilding } from '../../build/generator.js';
import { createSimulation } from '../simulation.js';

const DT = 1 / 60;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const now = () => performance.now();
const YIELD_MS = 200;

/** 같은 조건이면 같은 결과가 나오도록 고정 시드 */
export const REPORT_SEED = 7;

/**
 * 새 건물 + 새 시뮬레이션
 * @param {object} spec
 * @param {(spec:object)=>import('../../core/types.js').Part[]} [build]  다른 생성 방법(설계 대안)
 */
export function freshSimulation(spec, build = makeBuilding) {
  const parts = build(spec);
  const sim = createSimulation(parts, { emit: () => {}, seed: REPORT_SEED });
  return { parts, sim };
}

/**
 * 조건을 만족하거나 최대 시간이 될 때까지 진행
 * @param {object} sim
 * @param {{ maxSeconds:number, minSeconds?:number, stop?:(results:object)=>boolean }} o
 */
export async function runUntil(sim, { maxSeconds, minSeconds = 0, stop }) {
  const total = Math.round(maxSeconds * 60);
  let lastYield = now();
  for (let step = 1; step <= total; step++) {
    sim.step(DT);
    if (step % 20 === 0) {
      const t = step * DT;
      const r = sim.getResults();
      if (t >= minSeconds && (r.finished || stop?.(r))) break;
    }
    // 브라우저가 멈추지 않도록 약 0.2초 계산할 때마다 한 번 양보 (화면 갱신 · 진행률 표시)
    if (now() - lastYield > YIELD_MS) {
      await tick();
      lastYield = now();
    }
  }
  return sim.getResults();
}
