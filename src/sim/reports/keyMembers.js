/**
 * [B · Report ③] Key member map — "can this column or wall be removed?"
 *
 * Simulates the building once per removed column or wall on the chosen floor and rates each in two ways.
 *
 * (1) Vertical load — progressive collapse (alternate path method, simplified from GSA 2016 · UFC 4-023-03)
 *     how much of the slabs above collapse within 8 s after removal (including impacts and debris load)
 *       adjacent bays: slabs within one bay (column spacing) of the removed member — what it directly supported
 *       spread ratio = slabs lost outside the adjacent bays / all slabs on that floor and above
 *     critical  spread ratio ≥ 15%  (beyond the GSA 15% allowable collapse area — disproportionate collapse)
 *     caution   adjacent-bay slabs collapse (damage stays within what it supported)
 *     local     slabs hold but other structural parts collapse
 *     safe      no other structural part collapses
 *
 * (2) Seismic resistance — the member's share of that story's shear capacity (same formula as the earthquake scenario)
 *     critical ≥ 10%, caution ≥ 5%, local ≥ 2%, safe < 2%
 *     (in this model walls carry no slab load and only resist lateral force in a quake,
 *      so walls are mostly rated by (2))
 *
 * Final grade = the worse of the two
 */

import { BUILDING_TYPES, MATERIALS } from '../../ui/english.js';
import { normalizeSpec } from '../../core/types.js';
import { shearCapacity } from '../scenarios/earthquake.js';
import { freshSimulation, runUntil } from './headless.js';
import {
  COLORS,
  esc,
  kpis,
  legend,
  num,
  page,
  pct,
  planMap,
  section,
  table,
  tag,
  toCsv,
} from './reportHtml.js';

export const GSA_LIMIT = 0.15;
export const SEISMIC_LIMITS = { critical: 0.1, caution: 0.05, local: 0.02 };
const ORDER = ['critical', 'caution', 'local', 'safe'];
const isSlab = (p) => p.kind === 'slab' || p.kind === 'roof';
const alive = (p) => p.state === 'intact' || p.state === 'damaged';
const isVertical = (p) => p.kind === 'column' || p.kind === 'wall';

export const GRADES = {
  critical: { label: 'Critical — retain', short: 'Critical', color: COLORS.red },
  caution: { label: 'Caution', short: 'Caution', color: COLORS.orange },
  local: { label: 'Local', short: 'Local', color: COLORS.yellow },
  safe: { label: 'Low impact', short: 'Low impact', color: COLORS.green },
};

export function gravityGrade({ spreadLoss, slabLoss, collapsedOthers }) {
  if (spreadLoss >= GSA_LIMIT) return 'critical';
  if (slabLoss > 0) return 'caution';
  if (collapsedOthers > 0) return 'local';
  return 'safe';
}

export function seismicGrade(share) {
  if (share >= SEISMIC_LIMITS.critical) return 'critical';
  if (share >= SEISMIC_LIMITS.caution) return 'caution';
  if (share >= SEISMIC_LIMITS.local) return 'local';
  return 'safe';
}

const worse = (a, b) => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);

/** Members analyzed: structural columns and walls on the floor */
export function candidatesOf(parts, floor) {
  return parts.filter((p) => p.floor === floor && p.structural && isVertical(p));
}

/** Numbers walls so they are easy to find on the map and in the table */
function labelMembers(members) {
  let n = 0;
  return new Map(
    members.map((p) => [
      p.id,
      p.kind === 'wall' ? `W${++n}` : p.label.replace(/^\d+층\s*/, '').replace(' 기둥', ''),
    ]),
  );
}

/** Column spacing (shortest horizontal distance between columns on the floor) */
function columnSpan(parts, floor) {
  const cols = parts.filter((p) => p.floor === floor && p.kind === 'column');
  let span = Infinity;
  for (const a of cols) {
    for (const b of cols) {
      if (a === b) continue;
      const d = Math.hypot(a.position[0] - b.position[0], a.position[2] - b.position[2]);
      if (d > 0.5) span = Math.min(span, d);
    }
  }
  return Number.isFinite(span) ? span : 4.5;
}

/** Story shear capacity per direction and each member's share */
function seismicShares(parts, floor) {
  const members = parts.filter((p) => p.floor === floor && isVertical(p));
  const storyHeight = Math.max(
    1,
    ...members.filter((p) => p.kind === 'column').map((p) => p.size[1] + 0.25),
  );
  const total = { x: 0, z: 0 };
  for (const p of members) {
    total.x += shearCapacity(p, 'x', storyHeight);
    total.z += shearCapacity(p, 'z', storyHeight);
  }
  return (p) =>
    Math.max(
      total.x ? shearCapacity(p, 'x', storyHeight) / total.x : 0,
      total.z ? shearCapacity(p, 'z', storyHeight) / total.z : 0,
    );
}

/**
 * @param {object} spec
 * @param {number} floor
 * @param {(done:number, total:number, text:string)=>void} [onProgress]
 */
export async function runKeyMembers(rawSpec, floor, onProgress = () => {}) {
  const spec = normalizeSpec(rawSpec);
  const { parts: base } = freshSimulation(spec);
  // wall panels stacked at the same spot are grouped and removed together (the unit a real wall removal takes out)
  const groups = new Map();
  for (const p of candidatesOf(base, floor)) {
    const key =
      p.kind === 'wall' ? `w:${p.position[0].toFixed(1)}:${p.position[2].toFixed(1)}` : p.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }
  const members = [...groups.values()].map((list) => ({
    ...list.reduce((a, b) => (b.size[1] > a.size[1] ? b : a)),
    ids: list.map((p) => p.id),
  }));
  const short = labelMembers(members);
  const span = columnSpan(base, floor);
  const shareOf = seismicShares(base, floor);
  const results = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    onProgress(i, members.length, `${short.get(m.id)} removal test`);
    const { parts, sim } = freshSimulation(spec);
    const slabs = parts.filter((p) => isSlab(p) && p.floor >= floor);
    const near = (s) =>
      Math.abs(s.position[0] - m.position[0]) <= span + m.size[0] / 2 + 0.1 &&
      Math.abs(s.position[2] - m.position[2]) <= span + m.size[2] / 2 + 0.1;
    sim.removeParts(m.ids);
    const immediate = slabs.filter((s) => !alive(s)).length; // slabs lost to support loss alone, immediately
    // stop early once every slab above is gone — nothing more to learn
    await runUntil(sim, {
      maxSeconds: 8,
      minSeconds: 0.5,
      stop: () => slabs.every((s) => !alive(s)),
    });
    const structural = parts.filter(
      (p) => p.structural && p.kind !== 'fragment' && !m.ids.includes(p.id),
    );
    const collapsedOthers = structural.filter((p) => !alive(p)).length;
    const lost = slabs.filter((s) => !alive(s));
    const slabLoss = slabs.length ? lost.length / slabs.length : 0;
    const spreadLoss = slabs.length ? lost.filter((s) => !near(s)).length / slabs.length : 0;
    const floorsHit = [...new Set(structural.filter((p) => !alive(p)).map((p) => p.floor))].sort(
      (a, b) => a - b,
    );
    const share = m.ids.reduce((sum, id) => sum + shareOf(base.find((p) => p.id === id)), 0);
    const gravity = gravityGrade({ spreadLoss, slabLoss, collapsedOthers });
    const seismic = seismicGrade(share);
    results.push({
      id: m.ids.join(' '),
      short: short.get(m.id),
      label: m.kind === 'wall' ? `L${floor} wall ${short.get(m.id)}` : m.label,
      kind: m.kind,
      material: m.material,
      position: [...m.position],
      size: [...m.size],
      immediateLoss: slabs.length ? immediate / slabs.length : 0,
      slabLoss,
      spreadLoss,
      collapsedOthers,
      collapsedRatio: collapsedOthers / structural.length,
      floorsHit,
      share,
      gravity,
      seismic,
      grade: worse(gravity, seismic),
    });
    sim.dispose();
  }
  onProgress(members.length, members.length, 'Complete');
  const outline = base.filter((p) => p.floor === floor && isSlab(p)); // map background
  return { spec, floor, results, outline };
}

function keyFindings({ floor, results }) {
  const out = [];
  const count = (key, g) => results.filter((r) => r[key] === g).length;
  const cols = results.filter((r) => r.kind === 'column');
  const walls = results.filter((r) => r.kind === 'wall');
  const crit = results.filter((r) => r.grade === 'critical');

  if (cols.length && count('gravity', 'critical') === cols.length) {
    out.push(
      `Removing <b>any column on level ${floor}</b> triggers falling slabs that spread damage across the building. This structure is vulnerable to progressive collapse; column reinforcement or alternate load paths should be considered.`,
    );
  } else if (count('gravity', 'critical')) {
    out.push(
      `Removing any of <b>${count('gravity', 'critical')} columns or walls</b> spreads slab collapse beyond its supported bay (at least ${pct(GSA_LIMIT)} of upper-floor slabs): ${results
        .filter((r) => r.gravity === 'critical')
        .slice(0, 8)
        .map((r) => esc(r.short))
        .join(', ')}.`,
    );
  } else {
    out.push(`No single member removal on level ${floor} causes widespread secondary damage.`);
  }
  const worst = [...cols].sort((a, b) => b.immediateLoss - a.immediateLoss)[0];
  const least = [...cols].sort((a, b) => a.immediateLoss - b.immediateLoss)[0];
  if (worst && worst !== least) {
    out.push(
      `<b>${esc(worst.short)}</b> supports the largest slab area (${pct(worst.immediateLoss)} immediate loss); ${esc(least.short)} supports the smallest (${pct(least.immediateLoss)}). Interior columns generally support more floor area than corner columns.`,
    );
  }
  const topShare = [...results].sort((a, b) => b.share - a.share)[0];
  if (topShare && topShare.share > 0) {
    out.push(
      `<b>${esc(topShare.label)}</b> provides the largest lateral resistance on level ${floor}: ${pct(topShare.share, 1)} of story shear capacity.`,
    );
  }
  if (walls.length) {
    const seismicWalls = walls.filter((w) => w.seismic !== 'safe').length;
    out.push(
      `The ${walls.length} walls carry no vertical slab load in this model. They are rated by seismic contribution; ${seismicWalls} contribute at least 2%. Wall removal reduces lateral resistance.`,
    );
  }
  out.push(
    crit.length
      ? `Overall: <b>${crit.length} critical members</b>; ${count('grade', 'safe')} low-impact candidates for review. Real alterations require a structural engineer.`
      : `Overall: no critical members; ${count('grade', 'safe')} low-impact candidates for review. Real alterations require a structural engineer.`,
  );
  return out;
}

export function renderKeyMembersReport(data) {
  const { spec, floor, results, outline } = data;
  const type = BUILDING_TYPES[spec.type]?.label ?? spec.type;
  const count = (g) => results.filter((r) => r.grade === g).length;
  const sorted = [...results].sort(
    (a, b) =>
      ORDER.indexOf(a.grade) - ORDER.indexOf(b.grade) ||
      b.collapsedOthers - a.collapsedOthers ||
      b.share - a.share,
  );

  const shapes = [
    ...outline.map((p) => ({
      x: p.position[0],
      z: p.position[2],
      w: p.size[0],
      d: p.size[2],
      outline: true,
    })),
    ...results.map((r) => ({
      x: r.position[0],
      z: r.position[2],
      w: Math.max(r.size[0], 0.35),
      d: Math.max(r.size[2], 0.35),
      color: GRADES[r.grade].color,
      label: r.short,
      title: `${r.label}: ${GRADES[r.grade].short} (cascade ${GRADES[r.gravity].short} · Earthquake ${GRADES[r.seismic].short})`,
    })),
  ];

  const rows = sorted.map((r) => [
    `<b>${esc(r.short)}</b>`,
    esc(r.label),
    MATERIALS[r.material]?.label ?? r.material,
    tag(GRADES[r.grade].short, GRADES[r.grade].color),
    `${tag(GRADES[r.gravity].short, GRADES[r.gravity].color)} immediate ${pct(r.immediateLoss)} → spread ${pct(r.spreadLoss)}`,
    `${tag(GRADES[r.seismic].short, GRADES[r.seismic].color)} ${pct(r.share, 1)}`,
    r.collapsedOthers,
  ]);

  const body = [
    section(
      'Results at a glance',
      kpis([
        [`${results.length}`, `Analyzed L${floor} columns & walls`],
        [`${count('critical')}`, 'Critical / retain'],
        [`${count('caution') + count('local')}`, 'Caution / local'],
        [`${count('safe')}`, 'Low impact / review candidate'],
      ]),
    ),
    section(
      `L${floor} plan / individual member removal tests`,
      planMap(shapes) +
        legend(ORDER.map((g) => [GRADES[g].label, GRADES[g].color])) +
        '<p class="note">Top-down plan. Gray areas are floor slabs; labels match the member table. Colors show the more severe of the two ratings.</p>',
    ),
    section(
      'Member results',
      table(
        [
          'No.',
          'Member',
          'Materials',
          'Overall',
          'Gravity / upper slab loss',
          'Seismic resistance share',
          'Other collapsed members',
        ],
        rows,
        [6],
      ) +
        '<p class="note">Immediate = upper slabs losing support upon removal. Spread = collapse beyond the supported bay within 8 s. Seismic share = this member’s fraction of story shear capacity.</p>',
    ),
    section(
      'Method & limitations',
      `<ul class="note">
<li>Each structural column and wall on level ${floor} was removed in an independent run. Support was rechecked immediately; collisions and debris load were simulated for up to 8 s.</li>
<li>Gravity rating: critical if at least ${pct(GSA_LIMIT)} of upper slabs collapse outside the directly supported bay; a simplified application of the GSA alternate-path 15% collapse limit.</li>
<li>Seismic rating: story shear capacity share using the earthquake model (column flexural yield and wall shear strength × ductility). Critical ≥10%, caution ≥5%, local ≥2%.</li>
<li>Walls carry no vertical slab load in this frame model. Real load-bearing walls may also carry gravity loads, so removal can have greater consequences.</li>
<li>Vertically split wall panels at the same location were removed as a group (half a facade bay). Beam load redistribution is simplified to the rule that more than half of supporting members must survive.</li></ul>`,
    ),
  ].join('');

  return page({
    title: 'Key member map',
    subtitle: `${type} / ${spec.floors} floors · L${floor} columns & walls / individual removal tests`,
    meta: [
      ['Building', `${type} / ${spec.floors} floors`],
      ['Analysis level', `L${floor}`],
      ['Analyzed members', `${results.length}`],
    ],
    summary: keyFindings(data),
    body,
  });
}

export function keyMembersCsv({ results }) {
  return toCsv([
    [
      'No.',
      'Member ID',
      'Member',
      'Kind',
      'Materials',
      'Overall grade',
      'Gravity grade',
      'Immediate upper-slab collapse ratio',
      'Spread collapse ratio',
      'Upper-slab collapse ratio',
      'Other collapsed members',
      'Seismic grade',
      'Seismic resistance share',
      'Affected floors',
      'x',
      'z',
    ],
    ...results.map((r) => [
      r.short,
      r.id,
      r.label,
      r.kind === 'wall' ? 'wall' : 'column',
      MATERIALS[r.material]?.label ?? r.material,
      GRADES[r.grade].short,
      GRADES[r.gravity].short,
      r.immediateLoss.toFixed(3),
      r.spreadLoss.toFixed(3),
      r.slabLoss.toFixed(3),
      r.collapsedOthers,
      GRADES[r.seismic].short,
      r.share.toFixed(4),
      r.floorsHit.join(' '),
      num(r.position[0], 2),
      num(r.position[2], 2),
    ]),
  ]);
}
