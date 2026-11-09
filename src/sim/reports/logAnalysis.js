/**
 * [B · Report ①] Analysis of the current simulation log
 *
 * From the event history (sim.getHistory()) and the results it computes:
 *   - timeline: scenario → first damage → first structural failure → last collapse → rest
 *   - collapse causes: parts broken directly (scenario, impacts, debris load) vs parts that fell in a cascade after losing support
 *   - cascade ratio = structural parts lost in the cascade / structural parts broken directly
 *   - the parts that triggered the largest cascades (parts that lost support right after each one broke)
 *   - per-floor damage, the order floors collapsed, the collapse curve over time and the peak collapse rate
 */

import { BUILDING_TYPES, MATERIALS, SCENARIOS } from '../../data/ids.js';
import { describeScenario, scenarioValue } from '../scenarioScale.js';
import {
  CAUSE_COLORS,
  CAUSE_LABELS,
  COLORS,
  barChart,
  esc,
  kpis,
  lineChart,
  num,
  page,
  pct,
  section,
  stackedBars,
  table,
  toCsv,
} from './reportHtml.js';

const KIND_LABELS = {
  column: '기둥',
  beam: '보',
  slab: '바닥판',
  roof: '지붕',
  wall: '벽',
  window: '유리',
  fragment: '조각',
};

const isStructural = (p) => p && p.structural && p.kind !== 'fragment';

/** One-line scenario description */
function scenarioText(s) {
  const label = SCENARIOS[s.type]?.label ?? s.type;
  const value = scenarioValue(s);
  const { headline } = describeScenario(s.type, value, s.distanceKm ?? 10);
  return `${label} — ${headline}`;
}

/**
 * @param {{ history:{events:object[], samples:object[]}, results:object, parts:object[], spec:object }} input
 */
export function analyzeLog({ history, results, parts, spec }) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const events = history.events;
  const scenarios = events.filter((e) => e.type === 'scenario');
  const t0 = scenarios[0]?.t ?? 0;
  const rel = (t) => (t === undefined || t === null ? null : t - t0);
  const firstOf = (pred) => events.find(pred);

  const firstDamage = firstOf((e) => e.type === 'damaged' || e.type === 'failed');
  const firstStructuralFail = firstOf(
    (e) => (e.type === 'failed' || e.type === 'detached') && isStructural(byId.get(e.partId)),
  );
  const collapseEvents = events.filter(
    (e) => (e.type === 'failed' || e.type === 'detached') && isStructural(byId.get(e.partId)),
  );
  const lastCollapse = collapseEvents[collapseEvents.length - 1];

  // direct failures (by cause) vs cascade (support loss)
  const directByCause = { scenario: 0, collision: 0, debris: 0, removed: 0 };
  let cascade = 0;
  const triggerCount = new Map();
  for (const e of collapseEvents) {
    if (e.type === 'failed') directByCause[e.cause] = (directByCause[e.cause] ?? 0) + 1;
    else {
      cascade++;
      for (const id of e.trigger ?? []) triggerCount.set(id, (triggerCount.get(id) ?? 0) + 1);
    }
  }
  const direct = Object.values(directByCause).reduce((s, v) => s + v, 0);
  const topTriggers = [...triggerCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({ part: byId.get(id), count }));

  // counts per kind and floor (structural parts present from the start)
  const structural = parts.filter(isStructural);
  const kinds = {};
  for (const p of structural) {
    const k = (kinds[p.kind] ??= { total: 0, damaged: 0, collapsed: 0 });
    k.total++;
    if (p.state === 'damaged') k.damaged++;
    else if (p.state !== 'intact') k.collapsed++;
  }
  const glass = parts.filter((p) => p.kind === 'window');
  const glassBroken = glass.filter((p) => p.state === 'failed').length;

  // order of floor collapse: when all of a floor's slabs and roof pieces had collapsed
  const slabTime = new Map();
  for (const e of collapseEvents) {
    const p = byId.get(e.partId);
    if (p.kind === 'slab' || p.kind === 'roof') slabTime.set(p.id, e.t);
  }
  const floorLost = [];
  const floorsSeen = [...new Set(structural.map((p) => p.floor))].sort((a, b) => a - b);
  for (const floor of floorsSeen) {
    const slabs = structural.filter(
      (p) => p.floor === floor && (p.kind === 'slab' || p.kind === 'roof'),
    );
    if (slabs.length && slabs.every((s) => slabTime.has(s.id))) {
      floorLost.push({ floor, t: rel(Math.max(...slabs.map((s) => slabTime.get(s.id)))) });
    }
  }
  floorLost.sort((a, b) => a.t - b.t);

  // collapse curve and peak collapse rate (samples every 0.5 s)
  const samples = history.samples.map((s) => ({ ...s, t: rel(s.t) }));
  let peakRate = 0;
  let peakAt = null;
  for (let i = 1; i < samples.length; i++) {
    const rate =
      (samples[i].collapsed - samples[i - 1].collapsed) / (samples[i].t - samples[i - 1].t);
    if (rate > peakRate) {
      peakRate = rate;
      peakAt = samples[i].t;
    }
  }

  const worstFloor = [...(results.floorDamage ?? [])].sort((a, b) => b.ratio - a.ratio)[0];

  return {
    spec,
    results,
    scenarios: scenarios.map((e) => ({ t: rel(e.t), text: scenarioText(e.scenario) })),
    timeline: {
      firstDamage: firstDamage && { t: rel(firstDamage.t), part: byId.get(firstDamage.partId) },
      firstStructuralFail: firstStructuralFail && {
        t: rel(firstStructuralFail.t),
        part: byId.get(firstStructuralFail.partId),
        cause: firstStructuralFail.type === 'detached' ? 'support' : firstStructuralFail.cause,
      },
      lastCollapse: lastCollapse && { t: rel(lastCollapse.t), part: byId.get(lastCollapse.partId) },
      end: rel(results.time),
    },
    direct,
    directByCause,
    cascade,
    cascadeRatio: direct > 0 ? cascade / direct : 0,
    topTriggers,
    kinds,
    glass: { total: glass.length, broken: glassBroken },
    floorLost,
    samples,
    peakRate,
    peakAt,
    worstFloor,
    events,
    byId,
  };
}

/** Human-readable conclusions from the analysis (Korean, shown in the report) */
function findings(a) {
  const out = [];
  const r = a.results;
  if (!a.scenarios.length) return ['아직 실행한 시나리오가 없습니다.'];
  if (!r.finished) {
    out.push(
      '<b>시뮬레이션이 아직 진행 중일 때 만든 보고서입니다.</b> 모든 움직임이 멈춘 뒤 다시 만들면 최종 결과가 반영됩니다.',
    );
  }
  if (r.collapsedParts === 0) {
    out.push(
      `구조 부재는 하나도 무너지지 않았습니다${a.timeline.firstDamage ? ' (일부 손상만 발생)' : ''}.`,
    );
  } else {
    out.push(
      `구조 부재 <b>${r.totalParts}개 중 ${r.collapsedParts}개(${pct(r.collapsedRatio)})</b>가 무너졌고, 무너진 층은 <b>${r.floorsLost}개</b>입니다.`,
    );
  }
  if (a.direct > 0 && a.cascade > 0) {
    out.push(
      `직접 부서진 구조 부재 ${a.direct}개가 <b>연쇄로 ${a.cascade}개</b>를 더 무너뜨렸습니다 (연쇄 배율 <b>${num(a.cascadeRatio)}배</b>) — ${
        a.cascadeRatio >= 3
          ? '하중 경로가 끊기며 피해가 크게 번지는 연쇄 붕괴(progressive collapse) 양상입니다.'
          : '피해가 주로 직접 맞은 부분에 머물렀습니다.'
      }`,
    );
  }
  const top = a.topTriggers[0];
  if (top?.part && top.count >= 3) {
    out.push(
      `연쇄를 가장 크게 일으킨 부재는 <b>${esc(top.part.label)}</b>입니다 — 부서진 직후 ${top.count}개 부재가 지지를 잃었습니다. 보강 우선 대상입니다.`,
    );
  }
  const c = r.damageByCause ?? {};
  const secondary = (c.collision ?? 0) + (c.debris ?? 0);
  if (secondary > 0.05) {
    out.push(
      `깎인 체력의 <b>${pct(secondary)}</b>는 시나리오가 아니라 <b>떨어진 부재의 충돌과 쌓인 잔해 무게</b>에서 나왔습니다 (2차 피해).`,
    );
  }
  if (a.floorLost.length) {
    out.push(
      `층이 무너진 순서: ${a.floorLost.map((f) => `${f.floor}층(${num(f.t)}초)`).join(' → ')}${
        a.floorLost[0].floor === 1 ? ' — 1층이 먼저 무너지는 연약층 붕괴입니다.' : ''
      }`,
    );
  }
  if (a.peakRate > 0) {
    out.push(
      `붕괴는 ${num(a.timeline.firstStructuralFail?.t)}초에 시작해 ${num(a.timeline.lastCollapse?.t)}초까지 이어졌고, ${num(a.peakAt)}초 무렵 <b>초당 ${num(a.peakRate, 0)}개</b>로 가장 빨랐습니다.`,
    );
  }
  if (a.glass.total) {
    out.push(
      `유리 ${a.glass.total}장 중 ${a.glass.broken}장(${pct(a.glass.broken / a.glass.total)})이 깨졌습니다.`,
    );
  }
  return out;
}

export function renderLogReport(a) {
  const { spec, results: r } = a;
  const type = BUILDING_TYPES[spec.type]?.label ?? spec.type;
  const mats = Object.entries(spec.materials ?? {})
    .map(([, m]) => MATERIALS[m]?.label ?? m)
    .join(' · ');
  const label = (p) => esc(p?.label ?? '-');
  const causeText = (k) => CAUSE_LABELS[k] ?? k;

  const timeline = table(
    ['시각(초)', '사건', '부재 · 내용'],
    [
      ...a.scenarios.map((s) => [num(s.t), '시나리오 실행', esc(s.text)]),
      a.timeline.firstDamage && [
        num(a.timeline.firstDamage.t),
        '첫 손상',
        label(a.timeline.firstDamage.part),
      ],
      a.timeline.firstStructuralFail && [
        num(a.timeline.firstStructuralFail.t),
        '첫 구조 부재 붕괴',
        `${label(a.timeline.firstStructuralFail.part)} (${causeText(a.timeline.firstStructuralFail.cause)})`,
      ],
      ...a.floorLost.map((f) => [num(f.t), '층 붕괴', `${f.floor}층 바닥판 모두 무너짐`]),
      a.timeline.lastCollapse && [
        num(a.timeline.lastCollapse.t),
        '마지막 붕괴',
        label(a.timeline.lastCollapse.part),
      ],
      [num(a.timeline.end), r.finished ? '모든 움직임 정지' : '기록 시점 (진행 중)', ''],
    ]
      .filter(Boolean)
      .sort((x, y) => Number(x[0]) - Number(y[0])),
    [0],
  );

  const curve = a.samples.length
    ? lineChart(
        [
          {
            name: '무너진 구조 부재',
            color: COLORS.red,
            points: a.samples.map((s) => [s.t, s.collapsed]),
          },
          {
            name: '손상된 구조 부재',
            color: COLORS.orange,
            points: a.samples.map((s) => [s.t, s.damaged]),
          },
          {
            name: '떨어지는 중',
            color: COLORS.blue,
            points: a.samples.map((s) => [s.t, s.falling]),
          },
        ],
        { xLabel: '시나리오 시작 후 시간 (초)', yLabel: '부재 수' },
      )
    : '<p class="note">표본이 없습니다.</p>';

  const c = r.damageByCause ?? { scenario: 0, collision: 0, debris: 0 };
  const causeChart = stackedBars(
    [
      {
        label: '깎인 체력 (원인별)',
        parts: ['scenario', 'collision', 'debris'].map((k) => ({ key: k, value: c[k] ?? 0 })),
      },
      {
        label: '무너진 구조 부재 수',
        parts: [
          { key: 'scenario', value: a.directByCause.scenario + (a.directByCause.removed ?? 0) },
          { key: 'collision', value: a.directByCause.collision },
          { key: 'debris', value: a.directByCause.debris },
          { key: 'support', value: a.cascade },
        ],
      },
    ],
    CAUSE_COLORS,
    CAUSE_LABELS,
  );

  const floorChart = barChart(
    (r.floorDamage ?? []).map((f) => ({
      label: `${f.floor}층`,
      value: f.ratio * 100,
      color: f.ratio >= 0.5 ? COLORS.red : f.ratio >= 0.15 ? COLORS.orange : COLORS.green,
      text: pct(f.ratio),
    })),
    { max: 100 },
  );

  const kindRows = Object.entries(a.kinds).map(([k, v]) => [
    KIND_LABELS[k] ?? k,
    v.total,
    v.damaged,
    v.collapsed,
    pct(v.collapsed / v.total),
  ]);

  const triggerRows = a.topTriggers
    .filter((t) => t.part)
    .map((t, i) => [i + 1, label(t.part), MATERIALS[t.part.material]?.label ?? '', t.count]);

  const body = [
    section(
      '결과 한눈에',
      kpis([
        [pct(r.collapsedRatio), '무너진 구조 부재 비율'],
        [`${r.floorsLost}개 층`, '완전히 무너진 층'],
        [r.collapseTime === null ? '-' : `${num(r.collapseTime)}초`, '붕괴 진행 시간'],
        [a.direct ? `${num(a.cascadeRatio)}배` : '-', '연쇄 배율'],
      ]),
    ),
    section('진행 시간표', timeline),
    section('시간에 따른 붕괴', curve),
    section(
      '붕괴 원인',
      `${causeChart}<p class="note">위: 부재들이 잃은 체력을 원인별로 합한 비율 · 아래: 무너진 구조 부재를 마지막 원인별로 센 수 (지지 상실 = 받쳐 주던 부재가 무너져 함께 떨어진 연쇄 붕괴)</p>`,
    ),
    triggerRows.length
      ? section(
          '연쇄를 일으킨 부재',
          table(['순위', '부재', '재료', '직후 지지를 잃은 부재 수'], triggerRows, [0, 3]) +
            '<p class="note">이 부재가 부서진 바로 그 순간 지지를 잃고 떨어진 부재 수입니다. 많을수록 하중 경로의 핵심입니다.</p>',
        )
      : '',
    section(
      '층별 피해율',
      floorChart + '<p class="note">그 층 구조 부재의 평균 체력 손실 (무너진 부재는 100%)</p>',
    ),
    section(
      '부재 종류별',
      table(['종류', '전체', '손상', '붕괴', '붕괴율'], kindRows, [1, 2, 3, 4]),
    ),
  ].join('');

  return page({
    title: '시뮬레이션 로그 분석',
    subtitle: `${type} ${spec.floors}층 · ${a.scenarios.map((s) => s.text).join(' / ') || '시나리오 없음'}`,
    meta: [
      ['건물', `${type} ${spec.floors}층`],
      ['재료', mats],
      ['기록 시간', `${num(r.time)}초`],
      ['이벤트 수', `${a.events.length}개`],
    ],
    summary: findings(a),
    body,
  });
}

/** Raw data: the full event history */
export function logCsv(a) {
  const rows = [
    ['시각(초)', '사건', '부재 ID', '부재', '종류', '층', '재료', '원인', '연쇄를 일으킨 부재'],
  ];
  const t0 = a.scenarios.length ? a.events.find((e) => e.type === 'scenario').t : 0;
  const typeLabel = {
    scenario: '시나리오',
    damaged: '첫 손상',
    failed: '파괴',
    detached: '지지 상실 낙하',
    shattered: '유리 깨짐',
  };
  for (const e of a.events) {
    const p = a.byId.get(e.partId);
    rows.push([
      (e.t - t0).toFixed(3),
      typeLabel[e.type] ?? e.type,
      e.partId ?? '',
      e.type === 'scenario' ? scenarioText(e.scenario) : (p?.label ?? ''),
      KIND_LABELS[p?.kind] ?? '',
      p?.floor ?? '',
      MATERIALS[p?.material]?.label ?? '',
      e.type === 'detached' ? CAUSE_LABELS.support : (CAUSE_LABELS[e.cause] ?? ''),
      (e.trigger ?? []).map((id) => a.byId.get(id)?.label ?? id).join(' / '),
    ]);
  }
  return toCsv(rows);
}
