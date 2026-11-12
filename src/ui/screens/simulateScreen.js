import { createResultsPanel } from '../resultsPanel.js';
import { presentReport } from '../reportPresentation.js';

import { store } from '../../core/state.js';
import { emit, on, EVENTS } from '../../core/events.js';
import { SCENARIOS, BUILDING_TYPES, MATERIALS } from '../english.js';
import { STATE_COLORS } from '../../data/stateColors.js';
import { partLabel } from '../english.js';
import { h } from '../dom.js';
import { columnsOf, floorCount } from '../floors.js';
import {
  SCALES,
  describeScenario,
  formatValue,
  sliderFromValue,
  valueFromSlider,
} from '../../sim/scenarioScale.js';
import {
  REPORTS,
  buildReport,
  canOpenWindow,
  downloadText,
  openHtml,
} from '../../sim/reports/index.js';

const STATE_LABELS = {
  intact: 'Intact',
  damaged: 'Damaged',
  failed: 'Failed',
  falling: 'Falling',
  settled: 'Settled',
};

/**
 * @param {HTMLElement} root
 * @param {{ getParts: () => import('../../core/types.js').Part[] }} ctx
 */
export function renderSimulateScreen(root, ctx) {
  const { spec } = store.get();
  const floors = floorCount(ctx.getParts()) || spec.floors;
  let scenarioType = 'impact';
  // per-scenario value with its own unit and range (impact km/h, explosion TNT kg, earthquake magnitude, fire minutes)
  const values = Object.fromEntries(Object.entries(SCALES).map(([k, s]) => [k, s.defaultValue]));
  let distanceKm = SCALES.earthquake.distance.defaultValue;
  let partFloor = 1;
  let disposed = false;
  const timers = [];
  const unsubscribers = [];
  // size slider and real-world description (ranges and conversions in B's sim/scenarioScale.js)
  const scaleLabel = h('span', {});
  const scaleValue = h('span', { class: 'scale-value' });
  const scaleSlider = h('input', {
    type: 'range',
    min: 0,
    max: 1000,
    step: 1,
    oninput: (e) => {
      values[scenarioType] = valueFromSlider(SCALES[scenarioType], Number(e.target.value));
      updateScale();
    },
  });
  const distanceValue = h('span', { class: 'scale-value' });
  const distanceSlider = h('input', {
    type: 'range',
    min: SCALES.earthquake.distance.min,
    max: SCALES.earthquake.distance.max,
    step: SCALES.earthquake.distance.step,
    value: distanceKm,
    oninput: (e) => {
      distanceKm = Number(e.target.value);
      updateScale();
    },
  });
  const distanceField = h(
    'label',
    { class: 'field' },
    h('span', {}, SCALES.earthquake.distance.label, distanceValue),
    distanceSlider,
  );
  const scaleHeadline = h('strong', { class: 'scale-headline' });
  const scaleDetail = h('p', { class: 'hint scale-detail' });
  let shownType = null;
  const updateScale = () => {
    const scale = SCALES[scenarioType];
    const value = values[scenarioType];
    if (shownType !== scenarioType) {
      shownType = scenarioType;
      scaleLabel.textContent = scale.label;
      scaleSlider.value = String(sliderFromValue(scale, value));
    }
    scaleValue.textContent = formatValue(scenarioType, value);
    distanceField.hidden = !scale.distance;
    distanceValue.textContent = `${distanceKm} km`;
    const { headline, detail } = describeScenario(scenarioType, value, distanceKm);
    scaleHeadline.textContent = headline;
    scaleDetail.textContent = detail;
  };
  const findPart = (id) => (id ? ctx.getParts().find((p) => p.id === id) : null);

  const facadeButton = h('button', {
    class: 'btn toggle',
    onclick: () => store.set({ hideFacade: !store.get().hideFacade }),
  });
  const cutSelect = h(
    'select',
    {
      'aria-label': 'Section view',
      onchange: (e) => store.set({ cutFloor: e.target.value ? Number(e.target.value) : null }),
    },
    h('option', { value: '' }, 'Full building'),
    Array.from({ length: floors }, (_, i) =>
      h('option', { value: i + 1 }, `Through level ${i + 1}`),
    ),
  );

  const modeButtons = ['part', 'area'].map((mode) =>
    h(
      'button',
      { class: 'btn seg', onclick: () => setMode(mode) },
      mode === 'part' ? 'Single member' : 'Area target',
    ),
  );
  function setMode(mode) {
    const patch = { targetMode: mode };

    if (mode === 'area' && !store.get().cutFloor) patch.cutFloor = 1;
    store.set(patch);
  }

  const partFloorSelect = h(
    'select',
    {
      'aria-label': 'Column level',
      onchange: (e) => {
        partFloor = Number(e.target.value);
        drawColumnButtons();
      },
    },
    Array.from({ length: floors }, (_, i) => h('option', { value: i + 1 }, `Level ${i + 1}`)),
  );
  const columnGrid = h('div', { class: 'column-grid' });
  function drawColumnButtons() {
    columnGrid.innerHTML = '';
    for (const col of columnsOf(ctx.getParts(), partFloor)) {
      const name = col.grid ? `${String.fromCharCode(65 + col.grid.i)}${col.grid.j + 1}` : col.id;
      columnGrid.append(
        h(
          'button',
          {
            class: 'btn column',
            'data-part': col.id,
            title: partLabel(col.label),
            onclick: () => store.set({ selectedPartId: col.id }),
          },
          name,
        ),
      );
    }
    refresh();
  }
  const partPanel = h(
    'div',
    { class: 'mode-panel' },
    h('label', { class: 'field' }, h('span', {}, 'Select a column'), partFloorSelect),
    columnGrid,
    h('p', { class: 'hint' }, 'Or click a column, beam, slab or wall in the 3D view.'),
  );

  const areaFloorSelect = h(
    'select',
    {
      'aria-label': 'Target level',
      onchange: (e) => store.set({ cutFloor: Number(e.target.value), areaTarget: null }),
    },
    Array.from({ length: floors }, (_, i) =>
      h('option', { value: i + 1 }, `Level ${i + 1} interior`),
    ),
  );
  const radiusValue = h('output', {});
  const radiusInput = h('input', {
    type: 'range',
    min: 0.5,
    max: 8,
    step: 0.5,
    value: store.get().areaTarget?.radius ?? 3,
    oninput: (e) => {
      const radius = Number(e.target.value);
      radiusValue.textContent = `${radius} m`;
      const { areaTarget } = store.get();
      if (areaTarget) store.set({ areaTarget: { ...areaTarget, radius } });
    },
  });
  radiusValue.textContent = `${radiusInput.value} m`;
  const areaPanel = h(
    'div',
    { class: 'mode-panel' },
    h('label', { class: 'field' }, h('span', {}, 'Level (upper floors hidden)'), areaFloorSelect),
    h('label', { class: 'field' }, h('span', {}, 'Target radius ', radiusValue), radiusInput),
    h('p', { class: 'hint' }, 'Click the floor in the 3D view to place a target 1 m above it.'),
  );

  const targetInfo = h('p', { class: 'target' });

  const runButton = h('button', { class: 'btn danger', onclick: run }, 'Run scenario →');
  const demoButton = h(
    'button',
    {
      class: 'btn',
      onclick: runDemo,
      title: 'Reset the building, then fail two front-row columns on the selected level.',
    },
    '▷ Demonstrate floor collapse',
  );

  function currentTarget() {
    const state = store.get();
    if (state.targetMode === 'area') {
      return state.areaTarget ? { kind: 'area', ...state.areaTarget } : null;
    }
    return state.selectedPartId ? { kind: 'part', partId: state.selectedPartId } : null;
  }

  function run() {
    emit(EVENTS.SCENARIO_RUN, {
      type: scenarioType,
      value: values[scenarioType],
      distanceKm: scenarioType === 'earthquake' ? distanceKm : undefined,
      target: currentTarget(),
    });
  }

  function runDemo() {
    const targets = columnsOf(ctx.getParts(), partFloor).slice(0, 2);
    if (targets.length < 2) return;
    timers.forEach(clearTimeout);
    emit(EVENTS.SIM_RESET);
    store.set({ targetMode: 'part' });
    const speed = store.get().speed;
    targets.forEach((col, k) => {
      timers.push(
        setTimeout(
          () => {
            store.set({ selectedPartId: col.id });
            for (let n = 0; n < 2; n++) {
              emit(EVENTS.SCENARIO_RUN, {
                type: 'impact',
                intensity: 1,
                target: { kind: 'part', partId: col.id },
              });
            }
          },
          (400 + k * 1200) / speed,
        ),
      );
    });
  }

  const pauseButton = h('button', {
    class: 'btn',
    onclick: () => store.set({ paused: !store.get().paused }),
  });

  const legend = h(
    'ul',
    { class: 'legend' },
    Object.entries(STATE_COLORS).map(([key, { color }]) =>
      h(
        'li',
        {},
        h('i', { style: `background:${color ?? 'linear-gradient(90deg,#9a9b97,#a45a3f)'}` }),
        {
          intact: 'Intact',
          selected: 'Selected',
          damaged: 'Damaged',
          falling: 'Falling',
          settled: 'Debris',
        }[key],
      ),
    ),
  );

  // ── Event record ───────────────────────────────────
  const logList = h('ol', { class: 'log' });
  function log(text) {
    const time = (store.get().simTime ?? 0).toFixed(1);
    logList.prepend(h('li', {}, h('span', {}, `${time}s`), text));
    while (logList.children.length > 8) logList.lastChild.remove();
  }
  let detachedCount = 0;
  let detachTimer = null;
  unsubscribers.push(
    on(EVENTS.SCENARIO_RUN, ({ type, target }) => {
      const what =
        target?.kind === 'part'
          ? partLabel(findPart(target.partId)?.label) || 'Member'
          : target?.kind === 'area'
            ? `Area · ${target.radius} m radius`
            : 'Whole building';
      log(`${SCENARIOS[type]?.label ?? type} → ${what}`);
    }),
    on(EVENTS.PART_FAILED, ({ partId }) => {
      const part = findPart(partId);
      if (part?.structural) log(`${partLabel(part.label)} failed`);
    }),
    on(EVENTS.PART_DETACHED, () => {
      detachedCount++;
      if (detachTimer) return;
      detachTimer = setTimeout(() => {
        log(`${detachedCount} members lost support`);
        detachedCount = 0;
        detachTimer = null;
      }, 400);
    }),
    on(EVENTS.SIM_FINISHED, (r) => {
      log(`Motion settled · ${Math.round(r.collapsedRatio * 100)}% collapsed`);
    }),
    on(EVENTS.SIM_RESET, () => {
      timers.forEach(clearTimeout);
      clearTimeout(detachTimer);
      detachTimer = null;
      detachedCount = 0;
      logList.innerHTML = '';
      log('Building reset');
    }),
  );

  const observations = createResultsPanel(ctx);
  document.getElementById('app').append(observations.element);

  function refresh() {
    const state = store.get();
    const { selectedPartId, paused, results, targetMode, areaTarget, hideFacade, cutFloor } = state;
    const needsTarget = SCENARIOS[scenarioType].needsTarget;
    updateScale();

    facadeButton.textContent = hideFacade ? 'Show facade' : 'Hide facade / frame view';
    facadeButton.classList.toggle('on', hideFacade);
    cutSelect.value = cutFloor ? String(cutFloor) : '';
    if (cutFloor) areaFloorSelect.value = String(cutFloor);

    modeButtons.forEach((b, i) => b.classList.toggle('on', ['part', 'area'][i] === targetMode));
    partPanel.hidden = targetMode !== 'part';
    areaPanel.hidden = targetMode !== 'area';
    demoButton.hidden = targetMode !== 'part';

    for (const button of columnGrid.children) {
      const part = findPart(button.dataset.part);
      button.classList.toggle('on', button.dataset.part === selectedPartId);
      button.classList.toggle(
        'dead',
        !!part && part.state !== 'intact' && part.state !== 'damaged',
      );
    }

    if (targetMode === 'part') {
      const part = findPart(selectedPartId);
      targetInfo.textContent = part
        ? `${partLabel(part.label)} · ${MATERIALS[part.material]?.label} · ${STATE_LABELS[part.state]} · Health ${Math.round(part.hp * 100)}%`
        : needsTarget
          ? 'Select a member to apply this scenario.'
          : 'Earthquakes act on the whole building; no target needed.';
    } else {
      targetInfo.textContent = areaTarget
        ? `Level ${areaTarget.floor ?? cutFloor ?? 1} · radius ${areaTarget.radius} m · XYZ (${areaTarget.position.map((v) => v.toFixed(1)).join(', ')})`
        : needsTarget
          ? 'Click the floor in the 3D view to place the target.'
          : 'Earthquakes act on the whole building; no target needed.';
    }
    runButton.disabled = needsTarget && !currentTarget();
    pauseButton.textContent = paused ? '▶ Resume' : 'Ⅱ Pause';

    observations.refresh(state);
  }

  root.append(
    h(
      'header',
      { class: 'panel-header' },
      h('p', { class: 'step' }, 'STEP 3 / 3'),
      h('h1', {}, 'Collapse experiment'),
      h('p', { class: 'muted' }, `${BUILDING_TYPES[spec.type].label} · ${spec.floors} floors`),
    ),
    h(
      'section',
      { class: 'group' },
      h('h2', {}, '01 / View'),
      h('div', { class: 'row' }, facadeButton, cutSelect),
    ),
    h(
      'section',
      { class: 'group' },
      h('h2', {}, '02 / Target'),
      h('div', { class: 'segmented' }, modeButtons),
      partPanel,
      areaPanel,
      targetInfo,
    ),
    h(
      'section',
      { class: 'group' },
      h('h2', {}, '03 / Scenario'),
      h(
        'label',
        { class: 'field' },
        h('span', {}, 'Type'),
        h(
          'select',
          {
            onchange: (e) => {
              scenarioType = e.target.value;
              refresh();
            },
          },
          Object.values(SCENARIOS).map((s) => h('option', { value: s.id }, s.label)),
        ),
      ),
      h('label', { class: 'field' }, h('span', {}, scaleLabel, scaleValue), scaleSlider),
      distanceField,
      h('div', { class: 'scale' }, scaleHeadline, scaleDetail),
      runButton,
      demoButton,
    ),
    h(
      'section',
      { class: 'group' },
      h('h2', {}, '04 / Playback'),
      h(
        'div',
        { class: 'row' },
        pauseButton,
        h(
          'select',
          {
            'aria-label': 'Playback speed',
            onchange: (e) => store.set({ speed: Number(e.target.value) }),
          },
          [0.25, 0.5, 1, 2].map((v) =>
            h('option', { value: v, selected: v === store.get().speed }, `${v}×`),
          ),
        ),
        h('button', { class: 'btn', onclick: () => emit(EVENTS.SIM_RESET) }, '↺ Reset'),
      ),
      h('p', { class: 'hint' }, 'SPACE pause / resume · R reset'),
    ),
    h('section', { class: 'group' }, h('h2', {}, 'Member states'), legend),
    h('section', { class: 'group' }, h('h2', {}, 'Event record'), logList),
    reportSection(),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        { class: 'btn', onclick: () => store.set({ screen: 'configure' }) },
        '← Edit specification',
      ),
    ),
  );

  drawColumnButtons();
  log('Experiment ready');

  // ── Reports (computed and generated by B's sim/reports) ───────────
  function reportSection() {
    let reportType = '';
    let reportFloor = '';
    let report = null;
    let busy = false;
    const placeholder = (text) => h('option', { value: '', selected: true, disabled: true }, text);
    const typeSelect = h(
      'select',
      {
        'aria-label': 'Report type',
        onchange: (e) => {
          reportType = e.target.value;
          const needsFloor = Boolean(REPORTS[reportType]?.needsFloor);
          // Only the key member map analyses one level; the other reports cover the whole building.
          reportFloor = needsFloor ? '' : 'building';
          floorSelect.replaceChildren(
            placeholder('Select analysis level'),
            ...(needsFloor
              ? Array.from({ length: floors }, (_, i) =>
                  h('option', { value: i + 1 }, `Level ${i + 1} columns & walls`),
                )
              : []),
          );
          floorSelect.value = '';
          invalidate();
        },
      },
      placeholder('Select report type'),
      Object.values(REPORTS).map((r) => h('option', { value: r.id }, r.label)),
    );
    const floorSelect = h(
      'select',
      {
        'aria-label': 'Analysis level',
        onchange: (e) => {
          reportFloor = e.target.value;
          invalidate();
        },
      },
      placeholder('Select analysis level'),
    );
    const floorField = h('label', { class: 'field' }, h('span', {}, 'Analysis level'), floorSelect);
    const description = h('p', { class: 'hint' });
    const status = h('p', { class: 'hint report-status', role: 'status', 'aria-live': 'polite' });
    const progress = h('progress', {
      class: 'report-progress',
      max: 1,
      value: 0,
      'aria-label': 'Report analysis progress',
    });
    const makeButton = h('button', { class: 'btn primary', onclick: make }, 'Generate report');
    // One analysis, every format: the files are exported from the same generated report.
    const htmlButton = h(
      'button',
      { class: 'btn', onclick: () => save(`${report.baseName}.html`, report.html, 'text/html') },
      'Download HTML',
    );
    const csvButton = h(
      'button',
      { class: 'btn', onclick: () => save(`${report.baseName}.csv`, report.csv, 'text/csv') },
      'Download CSV',
    );
    const pdfButton = h('button', { class: 'btn', onclick: () => printPdf() }, 'Open / Print PDF');
    const downloads = h('div', { class: 'row report-downloads' }, htmlButton, csvButton, pdfButton);

    function invalidate() {
      report = null;
      status.textContent = '';
      update();
    }
    function update() {
      const info = REPORTS[reportType];
      description.textContent = info?.description ?? '';
      description.hidden = !reportType;
      floorField.hidden = !info?.needsFloor;
      makeButton.hidden = !reportType || !reportFloor;
      makeButton.disabled = busy;
      typeSelect.disabled = busy;
      floorSelect.disabled = busy;
      makeButton.textContent = busy ? 'Analyzing…' : 'Generate report';
      downloads.hidden = !report || busy;
      progress.hidden = !busy;
    }
    async function save(name, text, mime) {
      if (!report) return;
      const result = await downloadText(name, text, mime);
      if (result === 'failed')
        status.textContent = 'Downloads are unavailable in this environment.';
      else if (result === 'declined') status.textContent = 'Download cancelled.';
    }
    async function printPdf() {
      if (!report) return;
      // Opened directly from the click, so pop-up blockers allow it. Inside an artifact a new
      // window is blocked; the HTML file is saved instead and can be printed from there.
      if (canOpenWindow()) openHtml(report.html);
      else await save(`${report.baseName}.html`, report.html, 'text/html');
    }
    async function make() {
      if (busy || !reportType || !reportFloor) return;
      busy = true;
      report = null;
      const wasPaused = store.get().paused;
      store.set({ paused: true });
      progress.value = 0;
      status.textContent = 'Preparing analysis…';
      update();
      try {
        report = await buildReport(reportType, {
          spec: store.get().spec,
          sim: ctx.getSim?.(),
          parts: ctx.getParts(),
          floor: reportFloor === 'building' ? 1 : Number(reportFloor),
          onProgress: (done, total, text) => {
            progress.value = total > 0 ? done / total : 0;
            status.textContent = `${Math.round((done / total) * 100)}% · ${text}`;
          },
        });
        report.html = presentReport(report.html, reportType);
        status.textContent = `Ready: ${report.title} — choose a file format below.`;
      } catch (error) {
        console.error(error);
        status.textContent = `Failed: ${error.message}`;
      } finally {
        busy = false;
        if (!disposed) store.set({ paused: wasPaused });
        update();
      }
    }
    update();
    return h(
      'section',
      { class: 'group report-block' },
      h('h2', {}, 'Analysis reports'),
      h('label', { class: 'field' }, h('span', {}, 'Type'), typeSelect),
      floorField,
      description,
      makeButton,
      progress,
      status,
      downloads,
    );
  }

  return {
    refresh(state, prev) {
      if (state.buildVersion !== prev.buildVersion) drawColumnButtons();
      else refresh();
    },
    cleanup() {
      disposed = true;
      observations.element.remove();
      timers.forEach(clearTimeout);
      unsubscribers.forEach((off) => off());
      clearTimeout(detachTimer);
    },
  };
}
