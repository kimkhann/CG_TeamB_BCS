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

import { BUILDING_TYPES, MATERIALS } from '../../data/ids.js';
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
  { name: 'RC 골조', materials: { frame: 'rc', slab: 'rc', wall: 'rc' } },
  { name: '철골 + 패널', materials: { frame: 'steel', slab: 'rc', wall: 'panel' } },
  { name: '목조 + 벽돌', materials: { frame: 'wood', slab: 'wood', wall: 'brick' } },
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
  const variants = [{ name: '현재 설계', spec, build: makeBuilding, current: true }];
  for (const set of MATERIAL_SETS) {
    if (sameMaterials(set.materials, spec.materials)) continue;
    variants.push({
      name: set.name,
      spec: { ...spec, materials: { ...spec.materials, ...set.materials } },
      build: makeBuilding,
    });
  }
  if (spec.type === 'piloti') {
    variants.push({ name: '현재 + 1층 벽 보강', spec, build: pilotiWithGroundWalls });
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
    step(`${v.name}: 버티는 최대 규모 찾는 중`);
    const limit = await limitMagnitude(v);
    step(`${v.name}: 기준 지진 (규모 6.5)`);
    const quake = await referenceQuake(v);
    step(`${v.name}: 60분 화재`);
    const fire = await fireTest(v);
    const parts = v.build(v.spec);
    const mass = parts.reduce((s, p) => s + massOf(p), 0);
    rows.push({ ...v, limit, quake, fire, mass, build: undefined });
  }
  onProgress(total, total, '완료');
  return { spec: normalizeSpec(spec), rows };
}

const limitText = (l) => `${l.below ? '≤ ' : l.above ? '≥ ' : ''}M ${l.value.toFixed(1)}`;

function comparisonFindings({ rows }) {
  const out = [];
  const current = rows.find((r) => r.current);
  const best = [...rows].sort((a, b) => b.limit.value - a.limit.value)[0];
  const pga = pgaFromMagnitude(current.limit.value, LIMIT_DISTANCE_KM);
  out.push(
    `현재 설계는 진앙 ${LIMIT_DISTANCE_KM} km 지진에서 <b>${limitText(current.limit)}</b>까지 버팁니다 (지반 가속도 ${num(pga, 2)} g, 진도 ${mmiFromPga(pga).level}, 국내 설계지진의 ${num(pga / DESIGN_PGA)}배).`,
  );
  if (best !== current && best.limit.value > current.limit.value) {
    out.push(
      `가장 잘 버티는 안은 <b>${esc(best.name)}</b> (${limitText(best.limit)}) — 현재보다 규모 ${num(best.limit.value - current.limit.value)} 큰 지진까지 견딥니다.`,
    );
  } else {
    out.push('비교한 대안 중 현재 설계보다 지진에 더 잘 버티는 안은 없었습니다.');
  }
  const soft = rows.find((r) => r.name.includes('1층 벽'));
  if (soft) {
    out.push(
      `필로티 1층에 벽을 두면 버티는 최대 규모가 ${limitText(current.limit)} → <b>${limitText(soft.limit)}</b>로 바뀝니다 (연약층 보강 효과).`,
    );
  }
  const worstFloor = [...(current.quake.floorDamage ?? [])].sort((a, b) => b.ratio - a.ratio)[0];
  if (worstFloor && worstFloor.ratio > 0.05) {
    out.push(
      `규모 6.5 기준 지진에서 현재 설계는 <b>${worstFloor.floor}층</b> 피해가 가장 큽니다 (${pct(worstFloor.ratio)}).`,
    );
  }
  const fireBest = [...rows].sort((a, b) => a.fire.collapsedRatio - b.fire.collapsedRatio)[0];
  out.push(
    `1층 60분 화재에서 현재 설계는 구조 부재 ${pct(current.fire.collapsedRatio)}가 무너지고, 가장 적게 무너지는 안은 ${esc(fireBest.name)} (${pct(fireBest.fire.collapsedRatio)})입니다.`,
  );
  return out;
}

export function renderComparisonReport(data) {
  const { spec, rows } = data;
  const type = BUILDING_TYPES[spec.type]?.label ?? spec.type;
  const color = (i) => SERIES[i % SERIES.length];

  const summaryTable = table(
    [
      '안',
      '재료 (기둥 · 벽 · 바닥)',
      '무게',
      '버티는 최대 규모',
      '기준 지진 붕괴율',
      '무너진 층',
      '60분 화재 붕괴율',
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
    ['층', ...rows.map((r) => r.name)],
    floors.map((f) => [
      `${f}층`,
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
      text: `${pct(r.fire.collapsedRatio)} · 무너진 층 ${r.fire.floorsLost}`,
    })),
    { max: 100 },
  );

  const method = `<ul class="note">
<li>버티는 최대 규모: 진앙 ${LIMIT_DISTANCE_KM} km 지진의 규모를 ${M_MIN.toFixed(1)} ~ ${M_MAX.toFixed(1)}에서 0.1 단위로 이분 탐색. 층 하나 이상 무너지거나 구조 부재 20% 이상이 무너지면 '붕괴'.</li>
<li>지진 피해: 규모 · 거리 → 지반 가속도 (Joyner &amp; Boore 1981), 층 질량 × 높이로 층 전단력을 나누는 등가정적 방식(KDS 41 17 00 단순화).</li>
<li>화재: 표준화재곡선(ISO 834) ${FIRE_MINUTES}분, 1층 중앙 반경 4 m. 부재는 내화 시간보다 오래 타면 무너짐.</li>
<li>모든 안은 같은 시드로 시험해 다시 만들어도 같은 결과가 나옵니다. 비틀림 · 지반 조건 · 비구조재는 고려하지 않습니다.</li></ul>`;

  const body = [
    section('비교 요약', summaryTable),
    section(
      `지진: 버티는 최대 규모 (진앙 ${LIMIT_DISTANCE_KM} km)`,
      limitChart +
        `<p class="note">국내 내진설계 기준 지진(0.22 g)은 진앙 10 km에서 약 규모 ${num(
          findDesignMagnitude(),
        )}에 해당합니다.</p>`,
    ),
    section(
      `기준 지진 (규모 ${REFERENCE_QUAKE.value} · 진앙 ${REFERENCE_QUAKE.distanceKm} km): 층별 피해율`,
      floorTable,
    ),
    section('기준 지진: 피해 원인', causeChart),
    section(`1층 화재 ${FIRE_MINUTES}분: 무너진 구조 부재 비율`, fireChart),
    section('시험 방법과 한계', method),
  ].join('');

  return page({
    title: '설계안 비교 리포트',
    subtitle: `${type} ${spec.floors}층 · ${rows.length}개 안을 같은 조건으로 비교`,
    meta: [
      ['건물', `${type} ${spec.floors}층`],
      ['현재 재료', rows[0].materialText],
      ['비교 안', `${rows.length}개`],
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
    '안',
    '재료',
    '무게(t)',
    '버티는 최대 규모',
    '기준지진 붕괴율',
    '기준지진 무너진 층',
    '피해-시나리오',
    '피해-충돌',
    '피해-잔해',
    ...floors.map((f) => `기준지진 ${f}층 피해율`),
    '화재60분 붕괴율',
    '화재60분 무너진 층',
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
