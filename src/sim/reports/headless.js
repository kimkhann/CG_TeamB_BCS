/**
 * [B · Report] Headless simulation — repeated runs for reports
 *
 * Physics only, no rendering, so it runs faster than on-screen playback.
 * Yields (await) roughly every 0.2 s so the browser stays responsive.
 * In the UI the on-screen simulation is paused while a report is computed (simulateScreen.js).
 */

import { makeBuilding } from '../../build/generator.js';
import { createSimulation } from '../simulation.js';

const DT = 1 / 60;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const now = () => performance.now();
const YIELD_MS = 200;

/** Fixed seed so the same conditions give the same result */
export const REPORT_SEED = 7;

/**
 * New building + new simulation
 * @param {object} spec
 * @param {(spec:object)=>import('../../core/types.js').Part[]} [build]  alternative builder (design variants)
 */
export function freshSimulation(spec, build = makeBuilding) {
  const parts = build(spec);
  const sim = createSimulation(parts, { emit: () => {}, seed: REPORT_SEED });
  return { parts, sim };
}

/**
 * Steps until the condition holds or the time limit is reached
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
    // yield after about 0.2 s of computation so the browser can repaint and show progress
    if (now() - lastYield > YIELD_MS) {
      await tick();
      lastYield = now();
    }
  }
  return sim.getResults();
}
