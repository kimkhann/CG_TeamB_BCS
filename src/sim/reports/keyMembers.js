/**
 * [B · 보고서 ③] 핵심 부재 지도 — "이 기둥 · 벽을 없애도 되는가"
 *
 * 고른 층의 구조 기둥과 벽을 하나씩 없앤 건물을 각각 시뮬레이션하고, 두 가지로 평가합니다.
 *
 * (1) 수직 하중 — 연쇄 붕괴 (대체경로법: 미국 GSA 2016 · UFC 4-023-03 방식을 단순화)
 *     부재를 없앤 뒤 최대 8초(떨어지는 부재의 충돌 · 잔해 무게 포함) 동안 위층 바닥판이 얼마나 무너지는지
 *       인접 칸: 없앤 부재에서 한 칸(기둥 간격) 안의 바닥판 — 그 부재가 직접 받치던 범위
 *       확산 붕괴율 = 인접 칸 밖에서 무너진 바닥판 / 그 층과 위층의 전체 바닥판
 *     핵심  확산 붕괴율 ≥ 15%  (GSA 의 허용 붕괴 범위 15% 를 넘어 피해가 번짐 — 불균형 붕괴)
 *     주의  인접 칸 바닥이 무너짐 (피해가 직접 받치던 범위에 머묾)
 *     국부  바닥은 버티지만 다른 구조 부재가 무너짐
 *     여유  다른 구조 부재가 무너지지 않음
 *
 * (2) 지진 저항 — 이 부재가 그 층의 층 전단 내력에서 차지하는 비율 (지진 시나리오와 같은 식)
 *     핵심 ≥ 10%, 주의 ≥ 5%, 국부 ≥ 2%, 여유 < 2%
 *     (이 모델에서 벽은 바닥의 수직 하중을 받지 않고 지진 때 옆으로 버티는 역할을 하므로,
 *      벽은 주로 (2)로 평가됩니다)
 *
 * 부재의 최종 등급 = 두 평가 중 더 나쁜 쪽
 */

import { BUILDING_TYPES, MATERIALS } from '../../data/ids.js';
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
  critical: { label: '핵심 — 없애면 안 됨', short: '핵심', color: COLORS.red },
  caution: { label: '주의', short: '주의', color: COLORS.orange },
  local: { label: '국부', short: '국부', color: COLORS.yellow },
  safe: { label: '여유', short: '여유', color: COLORS.green },
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

/** 분석 대상: 그 층의 구조 기둥 · 벽 */
export function candidatesOf(parts, floor) {
  return parts.filter((p) => p.floor === floor && p.structural && isVertical(p));
}

/** 벽에 번호를 붙여 지도와 표에서 찾기 쉽게 */
function labelMembers(members) {
  let n = 0;
  return new Map(
    members.map((p) => [
      p.id,
      p.kind === 'wall' ? `W${++n}` : p.label.replace(/^\d+층\s*/, '').replace(' 기둥', ''),
    ]),
  );
}

/** 기둥 간격 (같은 층 기둥 사이의 가장 짧은 수평 거리) */
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

/** 그 층의 방향별 층 전단 내력과 부재별 기여율 */
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
  // 위아래로 나뉜 벽 패널은 같은 자리의 벽 하나로 묶어 함께 없앰 (실제로 벽을 철거하는 단위)
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
    onProgress(i, members.length, `${short.get(m.id)} 없애 보는 중`);
    const { parts, sim } = freshSimulation(spec);
    const slabs = parts.filter((p) => isSlab(p) && p.floor >= floor);
    const near = (s) =>
      Math.abs(s.position[0] - m.position[0]) <= span + m.size[0] / 2 + 0.1 &&
      Math.abs(s.position[2] - m.position[2]) <= span + m.size[2] / 2 + 0.1;
    sim.removeParts(m.ids);
    const immediate = slabs.filter((s) => !alive(s)).length; // 지지 상실만으로 바로 무너진 바닥판
    // 위층 바닥이 모두 무너지면 더 볼 것이 없으므로 일찍 끝냄
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
      label: m.kind === 'wall' ? `${floor}층 벽 ${short.get(m.id)}` : m.label,
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
  onProgress(members.length, members.length, '완료');
  const outline = base.filter((p) => p.floor === floor && isSlab(p)); // 지도 배경
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
      `${floor}층 기둥은 <b>어느 하나만 잃어도</b> 떨어지는 바닥이 주변을 부수며 피해가 건물 전체로 번집니다 — 연쇄 붕괴에 취약한 구조입니다. 기둥 보강 또는 하중을 나눠 받는 구조(벽 · 보 연속성)가 필요합니다.`,
    );
  } else if (count('gravity', 'critical')) {
    out.push(
      `기둥 · 벽 <b>${count('gravity', 'critical')}개</b>는 하나만 없어도 직접 받치던 칸 밖으로 바닥 붕괴가 번집니다 (위층 바닥의 ${pct(GSA_LIMIT)} 이상): ${results
        .filter((r) => r.gravity === 'critical')
        .slice(0, 8)
        .map((r) => esc(r.short))
        .join(', ')}.`,
    );
  } else {
    out.push(`${floor}층에는 하나만 없앴을 때 피해가 주변으로 크게 번지는 부재가 없습니다.`);
  }
  const worst = [...cols].sort((a, b) => b.immediateLoss - a.immediateLoss)[0];
  const least = [...cols].sort((a, b) => a.immediateLoss - b.immediateLoss)[0];
  if (worst && worst !== least) {
    out.push(
      `직접 받치는 범위가 가장 큰 기둥은 <b>${esc(worst.short)}</b> (없애는 즉시 위층 바닥 ${pct(worst.immediateLoss)} 붕괴), 가장 작은 기둥은 ${esc(least.short)} (${pct(least.immediateLoss)}) — 모서리보다 가운데 기둥이 더 넓은 바닥을 받칩니다.`,
    );
  }
  const topShare = [...results].sort((a, b) => b.share - a.share)[0];
  if (topShare && topShare.share > 0) {
    out.push(
      `지진 때 ${floor}층을 옆으로 가장 많이 버티는 부재는 <b>${esc(topShare.label)}</b> (층 전단 내력의 ${pct(topShare.share, 1)})입니다.`,
    );
  }
  if (walls.length) {
    const seismicWalls = walls.filter((w) => w.seismic !== 'safe').length;
    out.push(
      `벽 ${walls.length}개는 이 모델에서 바닥의 수직 하중을 받지 않습니다. 대신 지진 저항 기여율로 평가했고 ${seismicWalls}개가 2% 이상입니다 — 벽을 철거하면 지진에 약해집니다.`,
    );
  }
  out.push(
    crit.length
      ? `종합: <b>없애면 안 되는 부재 ${crit.length}개</b>, 변경 검토 후보(여유) ${count('grade', 'safe')}개. 실제 철거 · 변경은 구조기술사 검토가 필요합니다.`
      : `종합: 핵심 부재 없음, 변경 검토 후보(여유) ${count('grade', 'safe')}개. 실제 철거 · 변경은 구조기술사 검토가 필요합니다.`,
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
      title: `${r.label}: ${GRADES[r.grade].short} (연쇄 ${GRADES[r.gravity].short} · 지진 ${GRADES[r.seismic].short})`,
    })),
  ];

  const rows = sorted.map((r) => [
    `<b>${esc(r.short)}</b>`,
    esc(r.label),
    MATERIALS[r.material]?.label ?? r.material,
    tag(GRADES[r.grade].short, GRADES[r.grade].color),
    `${tag(GRADES[r.gravity].short, GRADES[r.gravity].color)} 즉시 ${pct(r.immediateLoss)} → 확산 ${pct(r.spreadLoss)}`,
    `${tag(GRADES[r.seismic].short, GRADES[r.seismic].color)} ${pct(r.share, 1)}`,
    r.collapsedOthers,
  ]);

  const body = [
    section(
      '결과 한눈에',
      kpis([
        [`${results.length}개`, `분석한 ${floor}층 기둥 · 벽`],
        [`${count('critical')}개`, '핵심 (없애면 안 됨)'],
        [`${count('caution') + count('local')}개`, '주의 · 국부'],
        [`${count('safe')}개`, '여유 (변경 검토 후보)'],
      ]),
    ),
    section(
      `${floor}층 평면 — 부재를 하나씩 없앴을 때`,
      planMap(shapes) +
        legend(ORDER.map((g) => [GRADES[g].label, GRADES[g].color])) +
        '<p class="note">위에서 내려다본 평면입니다. 회색 칸은 그 층 바닥판, 글자는 표의 부재 번호, 색은 두 평가 중 나쁜 쪽입니다.</p>',
    ),
    section(
      '부재별 결과',
      table(
        [
          '번호',
          '부재',
          '재료',
          '종합',
          '수직 하중 (위층 바닥 붕괴)',
          '지진 저항 기여율',
          '함께 무너진 구조 부재',
        ],
        rows,
        [6],
      ) +
        '<p class="note">즉시 = 없애는 순간 지지를 잃고 무너진 위층 바닥 비율 · 확산 = 8초 안에 직접 받치던 칸 밖으로 번져 무너진 비율 · 지진 저항 기여율 = 그 층 층 전단 내력 중 이 부재의 몫</p>',
    ),
    section(
      '분석 방법과 한계',
      `<ul class="note">
<li>${floor}층의 구조 기둥과 벽을 하나씩 없앤 건물을 각각 시뮬레이션했습니다 (없애는 순간 지지를 다시 판단하고, 떨어지는 부재의 충돌 · 잔해 무게까지 최대 8초 계산).</li>
<li>수직 하중 등급: 직접 받치던 칸(기둥 간격 한 칸) 밖에서 위층 바닥이 ${pct(GSA_LIMIT)} 이상 무너지면 핵심 — GSA 대체경로법의 허용 붕괴 범위(15%)를 단순 적용.</li>
<li>지진 저항 등급: 지진 시나리오와 같은 층 전단 내력 식(기둥 휨 항복 · 벽 전단강도 × 연성)으로 계산한 기여율. 10% 이상 핵심, 5% 이상 주의, 2% 이상 국부.</li>
<li>이 모델에서 벽은 바닥의 수직 하중을 받지 않습니다 (골조가 받음). 실제 벽식 구조의 내력벽은 수직 하중도 받으므로 철거 영향이 더 큽니다.</li>
<li>벽은 같은 자리에 위아래로 나뉜 패널을 묶어 한 번에 없앴습니다 (한 면의 가로 절반 폭 단위). 보가 옆 기둥으로 하중을 넘기는 효과는 "받쳐 주는 부재의 절반 초과가 살아 있으면 버팀" 규칙으로 단순화되어 있습니다.</li></ul>`,
    ),
  ].join('');

  return page({
    title: '핵심 부재 지도',
    subtitle: `${type} ${spec.floors}층 · ${floor}층 기둥 · 벽을 하나씩 없앴을 때`,
    meta: [
      ['건물', `${type} ${spec.floors}층`],
      ['분석 층', `${floor}층`],
      ['분석 부재', `${results.length}개`],
    ],
    summary: keyFindings(data),
    body,
  });
}

export function keyMembersCsv({ results }) {
  return toCsv([
    [
      '번호',
      '부재 ID',
      '부재',
      '종류',
      '재료',
      '종합 등급',
      '수직하중 등급',
      '즉시 위층바닥 붕괴율',
      '확산 붕괴율',
      '위층바닥 붕괴율',
      '함께 무너진 구조 부재',
      '지진 등급',
      '지진 저항 기여율',
      '피해 층',
      'x',
      'z',
    ],
    ...results.map((r) => [
      r.short,
      r.id,
      r.label,
      r.kind === 'wall' ? '벽' : '기둥',
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
