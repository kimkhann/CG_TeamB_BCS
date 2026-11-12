import { store } from '../../core/state.js';
import { defaultSpec } from '../../core/types.js';
import { BUILDING_TYPES } from '../english.js';
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
          h(
            'div',
            { class: `building-diagram ${info.id}`, 'aria-hidden': 'true' },
            ...Array.from({ length: info.id === 'house' ? 2 : 4 }, () => h('i')),
          ),
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
      h('h1', {}, 'Choose a building'),
    ),
    list,
    h(
      'div',
      { class: 'actions' },
      h(
        'button',
        { class: 'btn primary', onclick: () => store.set({ screen: 'configure' }) },
        'Configure building →',
      ),
    ),
  );

  return {
    refresh(state, prev) {
      if (state.spec !== prev.spec) draw();
    },
  };
}
