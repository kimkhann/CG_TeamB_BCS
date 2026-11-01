/**
 * [C · 화면] 공개 함수: mountUI(root, { renderer, getParts }) → { update(dt) }
 *
 * 왼쪽 패널에 현재 화면(형태 선택 → 세부 설정 → 시뮬레이션)을 그리고,
 * 3D 화면의 마우스 조작(카메라, 부재 · 위치 선택), 보기 설정(외벽 숨기기 · 단면 보기),
 * 대상 표시, 단축키를 연결합니다.
 *
 * 규칙: renderer 는 공개 함수만 사용합니다. getParts() 는 읽기 전용입니다.
 *
 * 🔧 임시 버전(베이스): 기능 위주의 단순한 화면.
 * TODO(C): 화면 디자인, 형태 카드 미리보기, 결과 화면, 재료 비교
 */

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

/**
 * 보기 설정에 맞는 부재 필터. 떨어지는 부재와 잔해는 항상 보입니다.
 * @param {import('../core/state.js').AppState} state
 */
function makePartFilter({ hideFacade, cutFloor, screen }) {
  const cut = screen === 'simulate' ? cutFloor : null;
  if (!hideFacade && !cut) return null;
  return (p) => {
    if (!isStanding(p)) return true;
    if (hideFacade && (p.kind === 'wall' || p.kind === 'window')) return false;
    if (cut) {
      if (p.floor > cut) return false;
      // 단면 층의 천장(바닥판)도 숨겨 내부가 보이게 함
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

  /** 현재 화면이 돌려준 정리 함수 / 갱신 함수 */
  let current = { cleanup: () => {}, refresh: () => {} };

  function showScreen(screen) {
    current.cleanup?.();
    root.innerHTML = '';
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

  // 단축키: Space 일시정지 · 재개, R 초기화 (입력 칸에 커서가 있을 때는 무시)
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

  return {
    update(dt) {
      cameraRig.update(dt);
    },
  };
}
