/**
 * [C · 화면] ② 세부 설정 — 층수, 부위별 재료
 *
 * 🔧 임시 버전(베이스): 슬라이더 + 드롭다운. 바꾸면 3D 미리보기가 바로 바뀜.
 * TODO(C): 재료 설명·아이콘, 예상 무게 등 정보 표시
 */

import { store } from '../../core/state.js';
import { normalizeSpec } from '../../core/types.js';
import { BUILDING_TYPES, MATERIAL_SLOTS, MATERIALS } from '../../data/ids.js';
import { h } from '../dom.js';

export function renderConfigureScreen(root) {
  const { spec } = store.get();
  const info = BUILDING_TYPES[spec.type];
  const updateSpec = (patch) =>
    store.set({ spec: normalizeSpec({ ...store.get().spec, ...patch }) });

  const floorsValue = h('output', {}, String(spec.floors));
  const floorsInput = h('input', {
    type: 'range',
    min: info.floors.min,
    max: info.floors.max,
    step: 1,
    value: spec.floors,
    oninput: (e) => {
      floorsValue.textContent = e.target.value;
      updateSpec({ floors: Number(e.target.value) });
    },
  });

  const slotFields = Object.entries(MATERIAL_SLOTS).map(([slot, { label, options }]) =>
    h(
      'label',
      { class: 'field' },
      h('span', {}, label),
      h(
        'select',
        {
          onchange: (e) =>
            updateSpec({ materials: { ...store.get().spec.materials, [slot]: e.target.value } }),
        },
        options.map((id) =>
          h('option', { value: id, selected: spec.materials[slot] === id }, MATERIALS[id].label),
        ),
      ),
    ),
  );

  root.append(
    h(
      'header',
      { class: 'panel-header' },
      h('p', { class: 'step' }, 'STEP 2 / 3'),
      h('h1', {}, `${info.label} 세부 설정`),
    ),
    h(
      'section',
      { class: 'group' },
      h('label', { class: 'field' }, h('span', {}, '층수 ', floorsValue), floorsInput),
    ),
    h('section', { class: 'group' }, h('h2', {}, '부위별 재료'), slotFields),
    h(
      'div',
      { class: 'actions' },
      h('button', { class: 'btn', onclick: () => store.set({ screen: 'select' }) }, '← 이전'),
      h(
        'button',
        { class: 'btn primary', onclick: () => store.set({ screen: 'simulate' }) },
        '시뮬레이션 시작 →',
      ),
    ),
  );
}
