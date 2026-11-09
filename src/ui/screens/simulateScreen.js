/**
 * [C · 화면] ③ 붕괴 시뮬레이션
 *
 *  보기     외벽 숨기기, 단면 보기(고른 층보다 위를 숨겨 내부 보기)
 *  대상     부재 하나(클릭 또는 층 · 기둥 버튼) / 위치 · 범위(층을 고르고 바닥 클릭 + 반경)
 *  시나리오 종류 · 세기 · 실행, 선택한 층 붕괴 시연
 *  재생     일시정지 · 속도 · 초기화 (Space / R)
 *  범례 · 이벤트 로그 · 결과
 *
 * 🔧 임시 버전(베이스): 기능 위주의 단순한 화면.
 * TODO(C): 화면 디자인, 결과 화면, "재료만 바꿔 다시 실행" 비교
 */

import { store } from '../../core/state.js';
import { emit, on, EVENTS } from '../../core/events.js';
import { SCENARIOS, BUILDING_TYPES, MATERIALS } from '../../data/ids.js';
import { STATE_COLORS } from '../../data/stateColors.js';
import { h } from '../dom.js';
import { columnsOf, floorCount } from '../floors.js';
import { describeIntensity } from '../../sim/intensityScale.js';

const STATE_LABELS = {
  intact: '정상',
  damaged: '손상',
  failed: '기능 상실',
  falling: '낙하 중',
  settled: '정지',
};

/**
 * @param {HTMLElement} root
 * @param {{ getParts: () => import('../../core/types.js').Part[] }} ctx
 */
export function renderSimulateScreen(root, ctx) {
  const { spec } = store.get();
  const floors = floorCount(ctx.getParts()) || spec.floors;
  let scenarioType = 'impact';
  let intensity = 0.6;
  let partFloor = 1;
  const timers = [];
  const unsubscribers = [];
  // 세기를 실제 크기로 보여 주는 문구 (계산은 B의 sim/intensityScale.js)
  const scaleValue = h('span', { class: 'scale-value' });
  const scaleHeadline = h('strong', { class: 'scale-headline' });
  const scaleDetail = h('p', { class: 'hint scale-detail' });
  const updateScale = () => {
    const { headline, detail } = describeIntensity(scenarioType, intensity);
    scaleValue.textContent = intensity.toFixed(2);
    scaleHeadline.textContent = headline;
    scaleDetail.textContent = detail;
  };
  const findPart = (id) => (id ? ctx.getParts().find((p) => p.id === id) : null);

  // ── 보기 ─────────────────────────────────────────
  const facadeButton = h('button', {
    class: 'btn toggle',
    onclick: () => store.set({ hideFacade: !store.get().hideFacade }),
  });
  const cutSelect = h(
    'select',
    {
      'aria-label': '단면 보기',
      onchange: (e) => store.set({ cutFloor: e.target.value ? Number(e.target.value) : null }),
    },
    h('option', { value: '' }, '전체 보기'),
    Array.from({ length: floors }, (_, i) => h('option', { value: i + 1 }, `${i + 1}층까지 보기`)),
  );

  // ── 대상: 방식 선택 ─────────────────────────────────
  const modeButtons = ['part', 'area'].map((mode) =>
    h(
      'button',
      { class: 'btn seg', onclick: () => setMode(mode) },
      mode === 'part' ? '부재 하나' : '위치 · 범위',
    ),
  );
  function setMode(mode) {
    const patch = { targetMode: mode };
    // 위치 지정은 내부가 보여야 하므로 단면 보기를 켭니다.
    if (mode === 'area' && !store.get().cutFloor) patch.cutFloor = 1;
    store.set(patch);
  }

  // 부재 방식: 층 + 기둥 버튼
  const partFloorSelect = h(
    'select',
    {
      'aria-label': '기둥 층',
      onchange: (e) => {
        partFloor = Number(e.target.value);
        drawColumnButtons();
      },
    },
    Array.from({ length: floors }, (_, i) => h('option', { value: i + 1 }, `${i + 1}층`)),
  );
  const columnGrid = h('div', { class: 'column-grid' });
  function drawColumnButtons() {
    columnGrid.innerHTML = '';
    for (const col of columnsOf(ctx.getParts(), partFloor)) {
      const name = col.label.replace(/^\d+층 /, '').replace(/ 기둥$/, '');
      columnGrid.append(
        h(
          'button',
          {
            class: 'btn column',
            'data-part': col.id,
            title: col.label,
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
    h('label', { class: 'field' }, h('span', {}, '기둥 바로 고르기'), partFloorSelect),
    columnGrid,
    h('p', { class: 'hint' }, '또는 3D 화면에서 부재(기둥 · 보 · 바닥 · 벽)를 클릭하세요.'),
  );

  // 위치 · 범위 방식: 층 + 반경
  const areaFloorSelect = h(
    'select',
    {
      'aria-label': '위치 층',
      onchange: (e) => store.set({ cutFloor: Number(e.target.value), areaTarget: null }),
    },
    Array.from({ length: floors }, (_, i) => h('option', { value: i + 1 }, `${i + 1}층 내부`)),
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
    h('label', { class: 'field' }, h('span', {}, '층 (위층은 숨겨짐)'), areaFloorSelect),
    h('label', { class: 'field' }, h('span', {}, '범위(반경) ', radiusValue), radiusInput),
    h('p', { class: 'hint' }, '3D 화면에서 바닥을 클릭하면 그 지점(바닥 위 1m)이 대상이 됩니다.'),
  );

  const targetInfo = h('p', { class: 'target' });

  // ── 시나리오 ─────────────────────────────────────
  const runButton = h('button', { class: 'btn danger', onclick: run }, '실행');
  const demoButton = h(
    'button',
    {
      class: 'btn',
      onclick: runDemo,
      title: '건물을 초기화하고 고른 층의 앞줄 기둥 두 개를 차례로 부숩니다.',
    },
    '▷ 선택한 층 붕괴 시연',
  );

  function currentTarget() {
    const state = store.get();
    if (state.targetMode === 'area') {
      return state.areaTarget ? { kind: 'area', ...state.areaTarget } : null;
    }
    return state.selectedPartId ? { kind: 'part', partId: state.selectedPartId } : null;
  }

  function run() {
    emit(EVENTS.SCENARIO_RUN, { type: scenarioType, intensity, target: currentTarget() });
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

  // ── 재생 ─────────────────────────────────────────
  const pauseButton = h('button', {
    class: 'btn',
    onclick: () => store.set({ paused: !store.get().paused }),
  });

  // ── 범례 ─────────────────────────────────────────
  const legend = h(
    'ul',
    { class: 'legend' },
    Object.values(STATE_COLORS).map(({ color, label }) =>
      h(
        'li',
        {},
        h('i', { style: `background:${color ?? 'linear-gradient(90deg,#9a9b97,#a45a3f)'}` }),
        label,
      ),
    ),
  );

  // ── 이벤트 로그 ───────────────────────────────────
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
          ? (findPart(target.partId)?.label ?? '부재')
          : target?.kind === 'area'
            ? `반경 ${target.radius}m 범위`
            : '건물 전체';
      log(`${SCENARIOS[type]?.label ?? type} → ${what}`);
    }),
    on(EVENTS.PART_FAILED, ({ partId }) => {
      const part = findPart(partId);
      if (part?.structural) log(`${part.label} 기능 상실`);
    }),
    on(EVENTS.PART_DETACHED, () => {
      detachedCount++;
      if (detachTimer) return;
      detachTimer = setTimeout(() => {
        log(`부재 ${detachedCount}개가 지지를 잃고 떨어짐`);
        detachedCount = 0;
        detachTimer = null;
      }, 400);
    }),
    on(EVENTS.SIM_FINISHED, (r) => {
      log(`모든 움직임 정지 · 무너진 비율 ${Math.round(r.collapsedRatio * 100)}%`);
    }),
    on(EVENTS.SIM_RESET, () => {
      logList.innerHTML = '';
      log('건물 초기화');
    }),
  );

  // ── 결과 ─────────────────────────────────────────
  const resultsBox = h('dl', { class: 'results' });

  // ── 갱신 ─────────────────────────────────────────
  function refresh() {
    const state = store.get();
    const { selectedPartId, paused, results, targetMode, areaTarget, hideFacade, cutFloor } = state;
    const needsTarget = SCENARIOS[scenarioType].needsTarget;
    updateScale();

    facadeButton.textContent = hideFacade ? '외벽 보이기' : '외벽 숨기기 · 골조 보기';
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
        ? `${part.label} · ${MATERIALS[part.material]?.label} · ${STATE_LABELS[part.state]} · 체력 ${Math.round(part.hp * 100)}%`
        : needsTarget
          ? '대상 부재를 고르세요.'
          : '지진은 대상 없이 건물 전체에 작용합니다.';
    } else {
      targetInfo.textContent = areaTarget
        ? `${areaTarget.floor ?? cutFloor ?? 1}층 내부 · 반경 ${areaTarget.radius} m · 위치 (${areaTarget.position.map((v) => v.toFixed(1)).join(', ')})`
        : needsTarget
          ? '3D 화면에서 바닥을 클릭해 위치를 고르세요.'
          : '지진은 대상 없이 건물 전체에 작용합니다.';
    }
    runButton.disabled = needsTarget && !currentTarget();
    pauseButton.textContent = paused ? '▶ 재개' : 'Ⅱ 일시정지';

    resultsBox.innerHTML = '';
    if (results) {
      const first = findPart(results.firstFailedPartId);
      const rows = [
        ['경과 시간', `${results.time.toFixed(1)} s`],
        [
          '무너진 부재',
          `${results.collapsedParts} / ${results.totalParts} (${Math.round(results.collapsedRatio * 100)}%)`,
        ],
        ['무너진 층', `${results.floorsLost}`],
        ['처음 무너진 부재', first?.label ?? '-'],
        ['상태', results.finished ? '정지' : '진행 중'],
      ];
      for (const [k, v] of rows) resultsBox.append(h('dt', {}, k), h('dd', {}, v));
    }
  }

  // ── 조립 ─────────────────────────────────────────
  root.append(
    h(
      'header',
      { class: 'panel-header' },
      h('p', { class: 'step' }, 'STEP 3 / 3'),
      h('h1', {}, '붕괴 시뮬레이션'),
      h('p', { class: 'muted' }, `${BUILDING_TYPES[spec.type].label} · ${spec.floors}층`),
    ),
    h(
      'section',
      { class: 'group' },
      h('h2', {}, '보기'),
      h('div', { class: 'row' }, facadeButton, cutSelect),
    ),
    h(
      'section',
      { class: 'group' },
      h('h2', {}, '대상'),
      h('div', { class: 'segmented' }, modeButtons),
      partPanel,
      areaPanel,
      targetInfo,
    ),
    h(
      'section',
      { class: 'group' },
      h('h2', {}, '시나리오'),
      h(
        'label',
        { class: 'field' },
        h('span', {}, '종류'),
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
      h(
        'label',
        { class: 'field' },
        h('span', {}, '세기 ', scaleValue),
        h('input', {
          type: 'range',
          min: 0.1,
          max: 1,
          step: 0.05,
          value: intensity,
          oninput: (e) => {
            intensity = Number(e.target.value);
            updateScale();
          },
        }),
      ),
      h('div', { class: 'scale' }, scaleHeadline, scaleDetail),
      runButton,
      demoButton,
    ),
    h(
      'section',
      { class: 'group' },
      h('h2', {}, '재생'),
      h(
        'div',
        { class: 'row' },
        pauseButton,
        h(
          'select',
          {
            'aria-label': '재생 속도',
            onchange: (e) => store.set({ speed: Number(e.target.value) }),
          },
          [0.25, 0.5, 1, 2].map((v) =>
            h('option', { value: v, selected: v === store.get().speed }, `${v}×`),
          ),
        ),
        h('button', { class: 'btn', onclick: () => emit(EVENTS.SIM_RESET) }, '↺ 초기화'),
      ),
      h('p', { class: 'hint' }, '단축키: Space 일시정지 · R 초기화'),
    ),
    h('section', { class: 'group' }, h('h2', {}, '상태 색'), legend),
    h('section', { class: 'group' }, h('h2', {}, '이벤트 로그'), logList),
    h('section', { class: 'group' }, h('h2', {}, '결과'), resultsBox),
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        { class: 'btn', onclick: () => store.set({ screen: 'configure' }) },
        '← 설정으로',
      ),
    ),
  );

  drawColumnButtons();
  log('시뮬레이션 준비 완료');

  return {
    refresh(state, prev) {
      if (state.buildVersion !== prev.buildVersion) drawColumnButtons();
      else refresh();
    },
    cleanup() {
      timers.forEach(clearTimeout);
      unsubscribers.forEach((off) => off());
      clearTimeout(detachTimer);
    },
  };
}
