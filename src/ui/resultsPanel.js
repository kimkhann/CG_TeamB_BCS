import { h } from './dom.js';
import { BUILDING_TYPES, partLabel } from './english.js';

let baseline = null;
const percent = (v) => `${Math.round((v ?? 0) * 100)}%`;
const seconds = (v) => (v == null ? '—' : `${v.toFixed(1)} s`);

export function createResultsPanel(ctx) {
  const summary = h('div', { class: 'result-summary' });
  const metrics = h('dl', { class: 'results' });
  const floorBars = h('div', { class: 'damage-bars' });
  const causeBars = h('div', { class: 'damage-bars' });
  const comparison = h('div', { class: 'comparison' });
  let latest = null;
  let spec = null;
  const pin = h(
    'button',
    {
      class: 'btn',
      onclick: () => {
        if (!latest) return;
        baseline = {
          ratio: latest.collapsedRatio,
          collapseTime: latest.collapseTime,
          label: `${BUILDING_TYPES[spec.type].label} / ${spec.floors}F`,
          materials: Object.values(spec.materials).join(' / '),
        };
        drawComparison();
      },
    },
    'Pin as baseline',
  );
  const clear = h(
    'button',
    {
      class: 'btn text-btn',
      onclick: () => {
        baseline = null;
        drawComparison();
      },
    },
    'Clear',
  );
  const panel = h(
    'aside',
    { class: 'analysis-panel', 'aria-label': 'Simulation results' },
    h('header', { class: 'panel-header' }, h('h2', {}, 'Response record')),
    summary,
    metrics,
    h('section', { class: 'group' }, h('h2', {}, 'Damage by floor'), floorBars),
    h('section', { class: 'group' }, h('h2', {}, 'Damage by cause'), causeBars),
    h(
      'section',
      { class: 'group' },
      h('h2', {}, 'Design comparison'),
      comparison,
      h('div', { class: 'row' }, pin, clear),
    ),
  );
  function bar(label, ratio, color = '') {
    const value = Math.min(1, Math.max(0, Number(ratio) || 0));
    return h(
      'div',
      { class: 'damage-row' },
      h('div', {}, h('span', {}, label), h('b', {}, percent(value))),
      h(
        'div',
        { class: 'bar-track' },
        h('i', { style: `width:${value * 100}%;${color ? `background:${color}` : ''}` }),
      ),
    );
  }
  function drawComparison() {
    comparison.replaceChildren();
    clear.hidden = !baseline;
    if (!baseline) return;
    const delta = ((latest?.collapsedRatio ?? 0) - baseline.ratio) * 100;
    comparison.append(
      h('p', { class: 'baseline-label' }, `BASELINE / ${baseline.label}`),
      h('p', { class: 'hint' }, baseline.materials),
      h('p', {}, `${percent(baseline.ratio)} → ${percent(latest?.collapsedRatio)} collapsed`),
      h(
        'strong',
        { class: delta > 0 ? 'delta worse' : 'delta' },
        `${delta > 0 ? '+' : ''}${delta.toFixed(1)} percentage points`,
      ),
    );
  }
  return {
    element: panel,
    refresh(state) {
      latest = state.results;
      spec = state.spec;
      const r = latest;
      pin.disabled = !r;
      summary.replaceChildren(
        h('strong', {}, percent(r?.collapsedRatio)),
        h('span', {}, 'STRUCTURAL MEMBERS COLLAPSED'),
        h(
          'p',
          { class: 'status-line' },
          !r
            ? 'Awaiting experiment'
            : r.finished
              ? '● Motion settled'
              : state.paused
                ? 'Ⅱ Paused'
                : '● Recording',
        ),
      );
      metrics.replaceChildren();
      const first = ctx.getParts().find((p) => p.id === r?.firstFailedPartId);
      for (const [k, v] of [
        ['Elapsed time', seconds(r?.time)],
        ['Collapse duration', seconds(r?.collapseTime)],
        ['Members lost', r ? `${r.collapsedParts} / ${r.totalParts}` : '—'],
        ['Floors lost', r?.floorsLost ?? '—'],
        ['First failure', partLabel(first?.label) || '—'],
      ])
        metrics.append(h('dt', {}, k), h('dd', {}, v));
      floorBars.replaceChildren(
        ...(r?.floorDamage ?? [])
          .slice()
          .reverse()
          .map((f) => bar(`L${f.floor}`, f.ratio)),
      );
      const causes = r?.damageByCause ?? {};
      causeBars.replaceChildren(
        ...[
          ['scenario', 'Direct scenario', '#b65b32'],
          ['collision', 'Falling collisions', '#c29745'],
          ['debris', 'Debris load', '#637c86'],
        ].map(([key, label, color]) => bar(label, causes[key], color)),
      );
      drawComparison();
    },
  };
}
