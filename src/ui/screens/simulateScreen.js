/**
 * [C · 화면] ③ 붕괴 시뮬레이션 — 시나리오 선택, 실행, 재생 제어, 결과
 *
 * 🔧 임시 버전(베이스): 기본 조작과 결과 숫자만 표시.
 * TODO(C): 결과 화면 디자인, "재료만 바꿔 다시 실행" 비교, 단축키(Space, R)
 */

import { store } from '../../core/state.js';
import { emit, EVENTS } from '../../core/events.js';
import { SCENARIOS, BUILDING_TYPES, MATERIALS } from '../../data/ids.js';
import { h } from '../dom.js';

const KIND_LABELS = {
  column: '기둥',
  beam: '보',
  slab: '바닥판',
  roof: '지붕',
  wall: '벽',
  window: '창',
  fragment: '조각',
};

/**
 * @param {HTMLElement} root
 * @param {{ getParts: () => import('../../core/types.js').Part[] }} ctx
 */
export function renderSimulateScreen(root, ctx) {
  let scenarioType = 'impact';
  let intensity = 0.6;

  const targetInfo = h('p', { class: 'target' });
  const runButton = h('button', { class: 'btn danger', onclick: run }, '실행');
  const pauseButton = h('button', {
    class: 'btn',
    onclick: () => store.set({ paused: !store.get().paused }),
  });
  const resultsBox = h('dl', { class: 'results' });

  function run() {
    const { selectedPartId } = store.get();
    emit(EVENTS.SCENARIO_RUN, { type: scenarioType, intensity, targetPartId: selectedPartId });
  }

  function refresh() {
    const { selectedPartId, paused, results } = store.get();
    const part = selectedPartId ? ctx.getParts().find((p) => p.id === selectedPartId) : null;
    const needsTarget = SCENARIOS[scenarioType].needsTarget;

    targetInfo.textContent = part
      ? `${part.floor}층 ${KIND_LABELS[part.kind] ?? part.kind} · ${MATERIALS[part.material]?.label} · 체력 ${Math.round(part.hp * 100)}%`
      : needsTarget
        ? '3D 화면에서 부재를 클릭해 대상을 고르세요.'
        : '이 시나리오는 대상이 필요 없습니다.';
    runButton.disabled = needsTarget && !part;
    pauseButton.textContent = paused ? '▶ 재개' : 'Ⅱ 일시정지';

    resultsBox.innerHTML = '';
    if (results) {
      const rows = [
        ['경과 시간', `${results.time.toFixed(1)} s`],
        [
          '무너진 부재',
          `${results.collapsedParts} / ${results.totalParts} (${Math.round(results.collapsedRatio * 100)}%)`,
        ],
        ['무너진 층', `${results.floorsLost}`],
        ['처음 무너진 부재', results.firstFailedPartId ?? '-'],
        ['상태', results.finished ? '정지' : '진행 중'],
      ];
      for (const [k, v] of rows) resultsBox.append(h('dt', {}, k), h('dd', {}, v));
    }
  }

  const { spec } = store.get();
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
        h('span', {}, '세기'),
        h('input', {
          type: 'range',
          min: 0.1,
          max: 1,
          step: 0.05,
          value: intensity,
          oninput: (e) => (intensity = Number(e.target.value)),
        }),
      ),
      targetInfo,
      runButton,
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
    ),
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

  refresh();
  return { refresh };
}
