/**
 * [B · Report ②] Design alternative comparison
 *
 * Tests the current building and automatically generated alternatives under the same conditions.
 *   Alternatives: the material sets (RC · steel + panel · timber + brick) that differ from the current one,
 *         and for a piloti, "walls on the ground floor too" (soft-story retrofit)
 *   Tests
 *     (1) Max magnitude withstood: binary search of the magnitude at 10 km epicentral distance (4.0–9.0, step 0.1)
 *         collapse = at least one floor lost or ≥ 20% of structural parts collapsed (checked until 1 s after the quake)
 *     (2) Reference earthquake: M 6.5 at 10 km — per-floor damage and damage by cause
 *     (3) 60-minute fire at the ground-floor center (radius 4 m) — collapsed structural parts
 *   Every test uses the same seed, so regenerating gives the same result.
 */

import { BUILDING_TYPES, MATERIALS } from '../../ui/english.js';
import { makeBuilding } from '../../build/generator.js';
import { normalizeSpec } from '../../core/types.js';
import { buildGridFrame } from '../../build/frame.js';
import { addBalconies, addCore, addParapets, markBuilding } from '../../build/details.js';
import { DURATION } from '../scenarios/earthquake.js';
import { DESIGN_PGA, mmiFromPga, pgaFromMagnitude } from '../scenarioScale.js';
import { massOf } from '../physics.js';
import { freshSimulation, runUntil } from './headless.js';
import {
  CAUSE_COLORS,
  CAUSE_LABELS,
  COLORS,
  SERIES,
  barChart,
  esc,
  num,
  page,
  pct,
  section,
  stackedBars,
  table,
  toCsv,
} from './reportHtml.js';

export const LIMIT_DISTANCE_KM = 10;
export const REFERENCE_QUAKE = { value: 6.5, distanceKm: 10 };
export const FIRE_MINUTES = 60;
const M_MIN = 4;
const M_MAX = 9;

const MATERIAL_SETS = [
  { name: 'RC frame', materials: { frame: 'rc', slab: 'rc', wall: 'rc' } },
  { name: 'Steel + panel', materials: { frame: 'steel', slab: 'rc', wall: 'panel' } },
  { name: 'Timber + brick', materials: { frame: 'wood', slab: 'wood', wall: 'brick' } },
];

/** Piloti alternative with outer walls on the ground floor (same as A's piloti builder except the wall condition) */
function pilotiWithGroundWalls(spec) {
  const parts = buildGridFrame({
    spec,
    cells: [
      [1, 1, 1],
      [1, 1, 1],
    ],
    span: 4.5,
    floorHeight: 3,
    hasWalls: () => true,
  });
  addBalconies(parts, spec, { span: 4.5, floorHeight: 3, nx: 3, nz: 2, bays: [0, 2] });
  addCore(parts, spec, { x: 0, z: -2.7, width: 2.1, depth: 2.2, floorHeight: 3 });
  addParapets(parts, spec, 3);
  return markBuilding(parts, spec);
}

const sameMaterials = (a, b) => ['frame', 'slab', 'wall'].every((k) => a[k] === b[k]);
const materialText = (m) =>
  ['frame', 'wall', 'slab'].map((k) => MATERIALS[m[k]]?.label ?? m[k]).join(' · ');

/** Alternatives to compare */
export function designVariants(rawSpec) {
  const spec = normalizeSpec(rawSpec);
  const variants = [{ name: 'Current design', spec, build: makeBuilding, current: true }];
  for (const set of MATERIAL_SETS) {
    if (sameMaterials(set.materials, spec.materials)) continue;
    variants.push({
      name: set.name,
      spec: { ...spec, materials: { ...spec.materials, ...set.materials } },
      build: makeBuilding,
    });
  }
  if (spec.type === 'piloti') {
    variants.push({ name: 'Current + ground-floor walls', spec, build: pilotiWithGroundWalls });
  }
  return variants.map((v) => ({ ...v, materialText: materialText(v.spec.materials) }));
}

const collapsed = (r) => r.floorsLost >= 1 || r.collapsedRatio >= 0.2;

async function quakeCollapses(variant, magnitude) {
  const { sim } = freshSimulation(variant.spec, variant.build);
  sim.runScenario({
    type: 'earthquake',
    value: magnitude,
    distanceKm: LIMIT_DISTANCE_KM,
    target: null,
  });
  const r = await runUntil(sim, { maxSeconds: DURATION + 1, stop: collapsed });
  sim.dispose();
  return collapsed(r);
}

/** Max magnitude withstood (10 km). Returns the bound with a flag when outside the range */
async function limitMagnitude(variant) {
  if (await quakeCollapses(variant, M_MIN)) return { value: M_MIN, below: true };
  if (!(await quakeCollapses(variant, M_MAX))) return { value: M_MAX, above: true };
  let lo = M_MIN; // holds
  let hi = M_MAX; // collapses
  while (hi - lo > 0.1 + 1e-9) {
    const mid = Math.round(((lo + hi) / 2) * 10) / 10;
    if (await quakeCollapses(variant, mid)) hi = mid;
    else lo = mid;
  }
  return { value: lo };
}

async function referenceQuake(variant) {
  const { sim } = freshSimulation(variant.spec, variant.build);
  sim.runScenario({ type: 'earthquake', ...REFERENCE_QUAKE, target: null });
  const r = await runUntil(sim, { maxSeconds: DURATION + 6, minSeconds: DURATION });
  sim.dispose();
  return r;
}

async function fireTest(variant) {
  const { parts, sim } = freshSimulation(variant.spec, variant.build);
  const ground = parts.filter((p) => p.floor === 1 && p.structural);
  const cx = ground.reduce((s, p) => s + p.position[0], 0) / ground.length;
  const cz = ground.reduce((s, p) => s + p.position[2], 0) / ground.length;
  sim.runScenario({
    type: 'fire',
    value: FIRE_MINUTES,
    target: { kind: 'area', position: [cx, 1, cz], radius: 4, floor: 1 },
  });
  const r = await runUntil(sim, { maxSeconds: 16, minSeconds: 8 });
  sim.dispose();
  return r;
}

/**
 * Runs the comparison
 * @param {object} spec
 * @param {(done:number, total:number, text:string)=>void} [onProgress]
 */
export async function runDesignComparison(spec, onProgress = () => {}) {
  const variants = designVariants(spec);
  const total = variants.length * 3;
  let done = 0;
  const step = (text) => onProgress(done++, total, text);
  const rows = [];
  for (const v of variants) {
    step(`${v.name}: Searching magnitude limit`);
    const limit = await limitMagnitude(v);
    step(`${v.name}: Reference earthquake (M 6.5)`);
    const quake = await referenceQuake(v);
    step(`${v.name}: 60-minute fire`);
    const fire = await fireTest(v);
    const parts = v.build(v.spec);
    const mass = parts.reduce((s, p) => s + massOf(p), 0);
    rows.push({ ...v, limit, quake, fire, mass, build: undefined });
  }
  onProgress(total, total, 'Complete');
  return { spec: normalizeSpec(spec), rows };
}

const limitText = (l) => `${l.below ? '≤ ' : l.above ? '≥ ' : ''}M ${l.value.toFixed(1)}`;

function comparisonFindings({ rows }) {
  const out = [];
  const current = rows.find((r) => r.current);
  const best = [...rows].sort((a, b) => b.limit.value - a.limit.value)[0];
  const pga = pgaFromMagnitude(current.limit.value, LIMIT_DISTANCE_KM);
  out.push(
    `The current design withstands <b>${limitText(current.limit)}</b> at ${LIMIT_DISTANCE_KM} km (PGA ${num(pga, 2)} g; MMI ${mmiFromPga(pga).level}; ${num(pga / DESIGN_PGA)}× the Korean design reference).`,
  );
  if (best !== current && best.limit.value > current.limit.value) {
    out.push(
      `<b>${esc(best.name)}</b> performs best (${limitText(best.limit)}), withstanding a magnitude ${num(best.limit.value - current.limit.value)} above the current design.`,
    );
  } else {
    out.push('No tested alternative outperformed the current design under earthquake loading.');
  }
  const soft = rows.find((r) => r.name.includes('ground-floor walls'));
  if (soft) {
    out.push(
      `Adding ground-floor walls changes the piloti limit from ${limitText(current.limit)} to <b>${limitText(soft.limit)}</b> (soft-story retrofit).`,
    );
  }
  const worstFloor = [...(current.quake.floorDamage ?? [])].sort((a, b) => b.ratio - a.ratio)[0];
  if (worstFloor && worstFloor.ratio > 0.05) {
    out.push(
      `Under the M 6.5 reference earthquake, <b>level ${worstFloor.floor}</b> suffers the most damage (${pct(worstFloor.ratio)}).`,
    );
  }
  const fireBest = [...rows].sort((a, b) => a.fire.collapsedRatio - b.fire.collapsedRatio)[0];
  out.push(
    `Under a 60-minute ground-floor fire, ${pct(current.fire.collapsedRatio)} of the current structural members collapse. ${esc(fireBest.name)} has the lowest collapse ratio (${pct(fireBest.fire.collapsedRatio)}).`,
  );
  return out;
}

export function renderComparisonReport(data) {
  const { spec, rows } = data;
  const type = BUILDING_TYPES[spec.type]?.label ?? spec.type;
  const color = (i) => SERIES[i % SERIES.length];

  const summaryTable = table(
    [
      'Alternative',
      'Materials (frame / wall / slab)',
      'Mass',
      'Magnitude limit',
      'Reference quake collapse ratio',
      'Floors lost',
      '60-minute fire Collapse ratio',
    ],
    rows.map((r) => [
      `<b>${esc(r.name)}</b>`,
      esc(r.materialText),
      `${Math.round(r.mass)} t`,
      `<b>${limitText(r.limit)}</b>`,
      pct(r.quake.collapsedRatio),
      r.quake.floorsLost,
      pct(r.fire.collapsedRatio),
    ]),
    [2, 3, 4, 5, 6],
  );

  const limitChart = barChart(
    rows.map((r, i) => ({
      label: r.name,
      value: r.limit.value,
      color: color(i),
      text: `${limitText(r.limit)} · ${num(pgaFromMagnitude(r.limit.value, LIMIT_DISTANCE_KM), 2)} g`,
    })),
    { max: M_MAX },
  );

  const floors = [
    ...new Set(rows.flatMap((r) => (r.quake.floorDamage ?? []).map((f) => f.floor))),
  ].sort((a, b) => a - b);
  const floorTable = table(
    ['Level', ...rows.map((r) => r.name)],
    floors.map((f) => [
      `L${f}`,
      ...rows.map((r) => {
        const v = r.quake.floorDamage?.find((x) => x.floor === f)?.ratio ?? 0;
        const bg = v >= 0.5 ? '#f6d5d2' : v >= 0.15 ? '#fbe6c8' : 'transparent';
        return `<span style="background:${bg};padding:1px 6px;border-radius:4px">${pct(v)}</span>`;
      }),
    ]),
    rows.map((_, i) => i + 1),
  );

  const causeChart = stackedBars(
    rows.map((r) => ({
      label: r.name,
      parts: ['scenario', 'collision', 'debris'].map((k) => ({
        key: k,
        value: r.quake.damageByCause?.[k] ?? 0,
      })),
    })),
    {
      scenario: CAUSE_COLORS.scenario,
      collision: CAUSE_COLORS.collision,
      debris: CAUSE_COLORS.debris,
    },
    CAUSE_LABELS,
  );

  const fireChart = barChart(
    rows.map((r, i) => ({
      label: r.name,
      value: r.fire.collapsedRatio * 100,
      color: color(i),
      text: `${pct(r.fire.collapsedRatio)} · Floors lost ${r.fire.floorsLost}`,
    })),
    { max: 100 },
  );

  const method = `<ul class="note">
<li>Magnitude limit: binary search from M ${M_MIN.toFixed(1)} to ${M_MAX.toFixed(1)} at ${LIMIT_DISTANCE_KM} km in 0.1 steps. Collapse means at least one floor lost or at least 20% of structural members collapsed.</li>
<li>Earthquake: magnitude and distance give PGA (Joyner &amp; Boore 1981); story shear is distributed by story mass × height (simplified KDS 41 17 00 equivalent static method).</li>
<li>Fire: ISO 834 standard fire for ${FIRE_MINUTES} min within a 4 m radius at the ground-floor center. Members fail when exposure exceeds their fire rating.</li>
<li>All alternatives use the same random seed for reproducibility. Torsion, soil conditions and nonstructural members are excluded.</li></ul>`;

  const body = [
    section('Comparison summary', summaryTable),
    section(
      `Earthquake: Magnitude limit (epicentral distance ${LIMIT_DISTANCE_KM} km)`,
      limitChart +
        `<p class="note">The Korean design reference (0.22 g) corresponds at 10 km to approximately M ${num(
          findDesignMagnitude(),
        )}.</p>`,
    ),
    section(
      `Reference quake (M ${REFERENCE_QUAKE.value} · epicentral distance ${REFERENCE_QUAKE.distanceKm} km): Damage by floor`,
      floorTable,
    ),
    section('Reference earthquake / damage causes', causeChart),
    section(`Ground-floor fire ${FIRE_MINUTES} min: Structural collapse ratio`, fireChart),
    section('Test method & limitations', method),
  ].join('');

  return page({
    title: 'Design comparison',
    subtitle: `${type} / ${spec.floors} floors · ${rows.length} alternatives compared under matching conditions`,
    meta: [
      ['Building', `${type} / ${spec.floors} floors`],
      ['Current materials', rows[0].materialText],
      ['Alternatives', `${rows.length}`],
    ],
    summary: comparisonFindings(data),
    body,
  });
}

/** Magnitude giving the 0.22 g design PGA at 10 km */
function findDesignMagnitude() {
  let m = 4;
  while (m < 9 && pgaFromMagnitude(m, LIMIT_DISTANCE_KM) < DESIGN_PGA) m += 0.1;
  return m;
}

export function comparisonCsv({ rows }) {
  const floors = [
    ...new Set(rows.flatMap((r) => (r.quake.floorDamage ?? []).map((f) => f.floor))),
  ].sort((a, b) => a - b);
  const header = [
    'Alternative',
    'Materials',
    'Mass(t)',
    'Magnitude limit',
    'Reference quake collapse ratio',
    'Reference quake floors lost',
    'Damage / scenario',
    'Damage / collision',
    'Damage / debris',
    ...floors.map((f) => `Reference quake L${f} damage ratio`),
    '60 min fire collapse ratio',
    '60 min fire floors lost',
  ];
  return toCsv([
    header,
    ...rows.map((r) => [
      r.name,
      r.materialText,
      Math.round(r.mass),
      limitText(r.limit),
      r.quake.collapsedRatio.toFixed(3),
      r.quake.floorsLost,
      (r.quake.damageByCause?.scenario ?? 0).toFixed(3),
      (r.quake.damageByCause?.collision ?? 0).toFixed(3),
      (r.quake.damageByCause?.debris ?? 0).toFixed(3),
      ...floors.map((f) =>
        (r.quake.floorDamage?.find((x) => x.floor === f)?.ratio ?? 0).toFixed(3),
      ),
      r.fire.collapsedRatio.toFixed(3),
      r.fire.floorsLost,
    ]),
  ]);
}

export { COLORS };
