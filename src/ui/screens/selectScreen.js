/**
 * [C · 화면] ① 건물 형태 선택
 *
 * 🔧 임시 버전(베이스): 형태 버튼 4개 + 다음 버튼. 고르면 3D 화면에 바로 미리보기.
 * TODO(C): 형태 카드 디자인, 썸네일
 */

import { store } from '../../core/state.js';
import { defaultSpec } from '../../core/types.js';
import { BUILDING_TYPES } from '../../data/ids.js';
import { h } from '../dom.js';

export function renderSelectScreen(root) {
  const list = h('div', { class: 'type-list' });

  function draw() {
    list.innerHTML = '';
    const current = store.get().spec.type;
    for (const info of Object.values(BUILDING_TYPES)) {
      list.append(
        h(
          'button',
          {
            class: `type-card${info.id === current ? ' active' : ''}`,
            'aria-pressed': String(info.id === current),
            onclick: () => store.set({ spec: defaultSpec(info.id) }),
          },
          h('strong', {}, info.label),
          h('span', {}, info.description),
        ),
      );
    }
  }
  draw();

  root.append(
    h(
      'header',
      { class: 'panel-header' },
      h('p', { class: 'step' }, 'STEP 1 / 3'),
      h('h1', {}, '건물 형태 선택'),
    ),
    list,
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        { class: 'btn primary', onclick: () => store.set({ screen: 'configure' }) },
        '다음: 세부 설정 →',
      ),
    ),
  );

  return {
    refresh(state, prev) {
      if (state.spec !== prev.spec) draw();
    },
  };
}
