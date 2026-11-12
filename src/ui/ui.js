import { h } from './dom.js';
import { showWelcome } from './screens/welcomeScreen.js';

import { store } from '../core/state.js';
import { emit, EVENTS } from '../core/events.js';
import { renderSelectScreen } from './screens/selectScreen.js';
import { renderConfigureScreen } from './screens/configureScreen.js';
import { renderSimulateScreen } from './screens/simulateScreen.js';
import { createCameraRig } from './cameraRig.js';
import { attachPicking } from './picking.js';

const SCREENS = {
  select: renderSelectScreen,
  configure: renderConfigureScreen,
  simulate: renderSimulateScreen,
};

const isStanding = (p) => p.state === 'intact' || p.state === 'damaged';

function makePartFilter({ hideFacade, cutFloor, screen }) {
  const cut = screen === 'simulate' ? cutFloor : null;
  if (!hideFacade && !cut) return null;
  return (p) => {
    if (!isStanding(p)) return true;
    if (hideFacade && (p.kind === 'wall' || p.kind === 'window')) return false;
    if (cut) {
      if (p.floor > cut) return false;

      if (p.floor === cut && (p.kind === 'slab' || p.kind === 'roof')) return false;
    }
    return true;
  };
}

/**
 * @param {HTMLElement} root
 * @param {{ renderer: import('../render/scene.js').Renderer, getParts: () => import('../core/types.js').Part[] }} ctx
 */
export function mountUI(root, ctx) {
  const { renderer } = ctx;
  const cameraRig = createCameraRig(renderer);
  attachPicking(renderer, ctx);
  new ResizeObserver(() => cameraRig.frameBuilding()).observe(renderer.domElement.parentElement);

  let current = { cleanup: () => {}, refresh: () => {} };

  function showScreen(screen) {
    current.cleanup?.();
    root.innerHTML = '';
    root.dataset.screen = screen;
    document.body.dataset.screen = screen;
    root.append(
      h(
        'div',
        { class: 'brand-bar' },
        h(
          'button',
          {
            class: 'brand',
            onclick: () => {
              store.set({ screen: 'select' });
              showWelcome(() => showScreen('select'));
            },
            'aria-label': 'Open title screen',
          },
          'CL',
          h('span', {}, 'COLLAPSE LAB'),
        ),
      ),
    );
    current = SCREENS[screen](root, ctx) ?? {};
  }

  function applyView(state) {
    renderer.setPartFilter(makePartFilter(state));
    const showMarker = state.screen === 'simulate' && state.targetMode === 'area';
    renderer.setTargetMarker(showMarker ? state.areaTarget : null);
  }

  store.subscribe((state, prev) => {
    if (state.screen !== prev.screen) showScreen(state.screen);
    else current.refresh?.(state, prev);
    if (state.buildVersion !== prev.buildVersion) cameraRig.frameBuilding();
    cameraRig.setAutoRotate(state.screen !== 'simulate');
    if (
      state.hideFacade !== prev.hideFacade ||
      state.cutFloor !== prev.cutFloor ||
      state.screen !== prev.screen ||
      state.targetMode !== prev.targetMode ||
      state.areaTarget !== prev.areaTarget
    ) {
      applyView(state);
    }
  });

  window.addEventListener('keydown', (event) => {
    if (store.get().screen !== 'simulate') return;
    if (/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement?.tagName ?? '')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      store.set({ paused: !store.get().paused });
    }
    if (event.code === 'KeyR') emit(EVENTS.SIM_RESET);
  });

  showScreen(store.get().screen);
  cameraRig.setAutoRotate(store.get().screen !== 'simulate');
  applyView(store.get());
  document.documentElement.lang = 'en';
  document.title = 'Collapse Lab / Building Collapse Simulator';
  root.setAttribute('aria-label', 'Experiment controls');
  renderer.domElement.parentElement.setAttribute('aria-label', 'Interactive 3D building preview');
  if (!new URLSearchParams(location.search).has('screen'))
    showWelcome(() => showScreen(store.get().screen));

  return {
    update(dt) {
      cameraRig.update(dt);
    },
  };
}
