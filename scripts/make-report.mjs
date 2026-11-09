// Builds a report without the UI (same output as the "Make report" button in the browser)
// Usage: node scripts/make-report.mjs <log|compare|keymembers> [type] [floors] [floor] [output folder]
//   e.g.  node scripts/make-report.mjs compare piloti 5
//         node scripts/make-report.mjs keymembers piloti 5 1
//         node scripts/make-report.mjs log piloti 5        (from a recorded M 6.5, 10 km earthquake run)
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildReport } from '../src/sim/reports/index.js';
import { freshSimulation, runUntil } from '../src/sim/reports/headless.js';
import { normalizeSpec } from '../src/core/types.js';

const [kind = 'compare', type = 'piloti', floors = '5', floor = '1', out = 'reports'] =
  process.argv.slice(2);
const spec = normalizeSpec({ type, floors: Number(floors) });
const options = {
  spec,
  floor: Number(floor),
  onProgress: (done, total, text) =>
    process.stdout.write(`\r[${done}/${total}] ${text}`.padEnd(60)),
};
if (kind === 'log') {
  const { parts, sim } = freshSimulation(spec);
  sim.runScenario({ type: 'earthquake', value: 6.5, distanceKm: 10, target: null });
  await runUntil(sim, { maxSeconds: 30, minSeconds: 9 });
  Object.assign(options, { sim, parts });
}
const t0 = performance.now();
const report = await buildReport(kind, options);
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `${report.baseName}.html`), report.html);
writeFileSync(join(out, `${report.baseName}.csv`), report.csv);
console.log(
  `\n${report.title} → ${out}/${report.baseName}.html (${((performance.now() - t0) / 1000).toFixed(1)} s)`,
);
