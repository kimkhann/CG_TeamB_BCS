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

import { BUILDING_TYPES, MATERIALS, SCENARIOS } from '../../ui/english.js';
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
  column: 'column',
  beam: 'beam',
  slab: 'slab',
  roof: 'roof',
  wall: 'wall',
  window: 'glass',
  fragment: 'fragment',
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

/** Human-readable conclusions from the analysis (English, shown in the report) */
function findings(a) {
  const out = [];
  const r = a.results;
  if (!a.scenarios.length) return ['No scenario has been run yet.'];
  if (!r.finished) {
    out.push(
      '<b>This report was generated while the simulation was running.</b> Generate it again after all motion settles for final results.',
    );
  }
  if (r.collapsedParts === 0) {
    out.push(
      `No structural members collapsed${a.timeline.firstDamage ? ' (some damage occurred)' : ''}.`,
    );
  } else {
    out.push(
      `<b>${r.collapsedParts} of ${r.totalParts} structural members (${pct(r.collapsedRatio)})</b> collapsed; <b>${r.floorsLost} floors</b> were lost.`,
    );
  }
  if (a.direct > 0 && a.cascade > 0) {
    out.push(
      `${a.direct} direct structural failures triggered <b>${a.cascade} secondary collapses</b> (cascade ratio <b>${num(a.cascadeRatio)}×</b>) — ${
        a.cascadeRatio >= 3
          ? 'progressive collapse spread damage through interrupted load paths.'
          : 'damage remained mainly near the directly affected members.'
      }`,
    );
  }
  const top = a.topTriggers[0];
  if (top?.part && top.count >= 3) {
    out.push(
      `<b>${esc(top.part.label)}</b> triggered the largest cascade: ${top.count} members lost support immediately after its failure. Consider it a reinforcement priority.`,
    );
  }
  const c = r.damageByCause ?? {};
  const secondary = (c.collision ?? 0) + (c.debris ?? 0);
  if (secondary > 0.05) {
    out.push(
      `<b>${pct(secondary)}</b> of health loss came from <b>falling-member collisions and accumulated debris weight</b> (secondary damage).`,
    );
  }
  if (a.floorLost.length) {
    out.push(
      `Floor collapse order: ${a.floorLost.map((f) => `L${f.floor} (${num(f.t)} s)`).join(' → ')}${
        a.floorLost[0].floor === 1 ? ' — ground-floor-first soft-story collapse.' : ''
      }`,
    );
  }
  if (a.peakRate > 0) {
    out.push(
      `Collapse began at ${num(a.timeline.firstStructuralFail?.t)} s and continued to ${num(a.timeline.lastCollapse?.t)} s, peaking near ${num(a.peakAt)} s at <b>${num(a.peakRate, 0)} members/s</b>.`,
    );
  }
  if (a.glass.total) {
    out.push(
      `${a.glass.broken} of ${a.glass.total} glass panels (${pct(a.glass.broken / a.glass.total)}) shattered.`,
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
    ['Time (s)', 'Event', 'Member / details'],
    [
      ...a.scenarios.map((s) => [num(s.t), 'Scenario run', esc(s.text)]),
      a.timeline.firstDamage && [
        num(a.timeline.firstDamage.t),
        'First damage',
        label(a.timeline.firstDamage.part),
      ],
      a.timeline.firstStructuralFail && [
        num(a.timeline.firstStructuralFail.t),
        'First structural collapse',
        `${label(a.timeline.firstStructuralFail.part)} (${causeText(a.timeline.firstStructuralFail.cause)})`,
      ],
      ...a.floorLost.map((f) => [num(f.t), 'Floor collapse', `L${f.floor} all slabs collapsed`]),
      a.timeline.lastCollapse && [
        num(a.timeline.lastCollapse.t),
        'Last collapse',
        label(a.timeline.lastCollapse.part),
      ],
      [num(a.timeline.end), r.finished ? 'All motion settled' : 'Recorded while running', ''],
    ]
      .filter(Boolean)
      .sort((x, y) => Number(x[0]) - Number(y[0])),
    [0],
  );

  const curve = a.samples.length
    ? lineChart(
        [
          {
            name: 'Collapsed structural members',
            color: COLORS.red,
            points: a.samples.map((s) => [s.t, s.collapsed]),
          },
          {
            name: 'Damaged structural members',
            color: COLORS.orange,
            points: a.samples.map((s) => [s.t, s.damaged]),
          },
          {
            name: 'Falling',
            color: COLORS.blue,
            points: a.samples.map((s) => [s.t, s.falling]),
          },
        ],
        { xLabel: 'Time since scenario start (s)', yLabel: 'Member count' },
      )
    : '<p class="note">No samples recorded.</p>';

  const c = r.damageByCause ?? { scenario: 0, collision: 0, debris: 0 };
  const causeChart = stackedBars(
    [
      {
        label: 'Health loss by cause',
        parts: ['scenario', 'collision', 'debris'].map((k) => ({ key: k, value: c[k] ?? 0 })),
      },
      {
        label: 'Collapsed structural members',
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
      label: `L${f.floor}`,
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
      'Results at a glance',
      kpis([
        [pct(r.collapsedRatio), 'Structural collapse ratio'],
        [`${r.floorsLost} floors`, 'Fully collapsed floors'],
        [r.collapseTime === null ? '-' : `${num(r.collapseTime)} s`, 'Collapse duration'],
        [a.direct ? `${num(a.cascadeRatio)}×` : '-', 'Cascade ratio'],
      ]),
    ),
    section('Event timeline', timeline),
    section('Collapse over time', curve),
    section(
      'Damage causes',
      `${causeChart}<p class="note">Top: health loss by cause. Bottom: collapsed structural members by final cause. Support loss means progressive collapse following a supporting member failure.</p>`,
    ),
    triggerRows.length
      ? section(
          'Cascade triggers',
          table(
            ['Rank', 'Member', 'Materials', 'Members losing support immediately'],
            triggerRows,
            [0, 3],
          ) +
            '<p class="note">Members that lost support immediately after this member failed. Higher counts indicate a more important load path.</p>',
        )
      : '',
    section(
      'Damage by floor',
      floorChart +
        '<p class="note">Average health loss of structural members on each floor (collapsed members count as 100%).</p>',
    ),
    section(
      'Member breakdown',
      table(['Kind', 'Total', 'Damaged', 'Collapsed', 'Collapse ratio'], kindRows, [1, 2, 3, 4]),
    ),
  ].join('');

  return page({
    title: 'Simulation log analysis',
    subtitle: `${type} / ${spec.floors} floors · ${a.scenarios.map((s) => s.text).join(' / ') || 'No scenario'}`,
    meta: [
      ['Building', `${type} / ${spec.floors} floors`],
      ['Materials', mats],
      ['Recorded time', `${num(r.time)} s`],
      ['Events', `${a.events.length}`],
    ],
    summary: findings(a),
    body,
  });
}

/** Raw data: the full event history */
export function logCsv(a) {
  const rows = [
    [
      'Time (s)',
      'Event',
      'Member ID',
      'Member',
      'Kind',
      'Level',
      'Materials',
      'Cause',
      'Cascade triggers',
    ],
  ];
  const t0 = a.scenarios.length ? a.events.find((e) => e.type === 'scenario').t : 0;
  const typeLabel = {
    scenario: 'Scenario',
    damaged: 'First damage',
    failed: 'Failed',
    detached: 'Falling / support loss',
    shattered: 'Glass shattered',
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
