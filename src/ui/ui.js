/**
 * [C · 화면] 공개 함수: mountUI(root, { renderer }) → { update(dt) }
 *
 * 왼쪽 패널에 현재 화면(형태 선택 → 세부 설정 → 시뮬레이션)을 그립니다.
 * 3D 화면에서의 마우스 조작(카메라, 부재 선택)도 여기서 연결합니다.
 *
 * 규칙: renderer 는 공개 함수(raycast, getBounds, camera, domElement)만 사용합니다.
 *
 * 🔧 임시 버전(베이스): 버튼과 드롭다운만 있는 단순한 화면.
 * TODO(C): 화면 디자인, 형태 카드 미리보기, 결과 화면, 재료 비교, 키보드 단축키
 */

import { store } from '../core/state.js';
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

/**
 * @param {HTMLElement} root
 * @param {{ renderer: import('../render/scene.js').Renderer, getParts: () => import('../core/types.js').Part[] }} ctx
 *   renderer: 3D 화면 (공개 함수만 사용), getParts: 현재 부재 목록 읽기 (읽기 전용으로만 사용)
 */
export function mountUI(root, ctx) {
  const { renderer } = ctx;
  const cameraRig = createCameraRig(renderer);
  attachPicking(renderer);

  /** 현재 화면이 돌려준 정리 함수 / 갱신 함수 */
  let current = { cleanup: () => {}, refresh: () => {} };

  function showScreen(screen) {
    current.cleanup?.();
    root.innerHTML = '';
    current = SCREENS[screen](root, ctx) ?? {};
  }

  store.subscribe((state, prev) => {
    if (state.screen !== prev.screen) showScreen(state.screen);
    else current.refresh?.(state, prev);
    if (state.buildVersion !== prev.buildVersion) cameraRig.frameBuilding();
    cameraRig.setAutoRotate(state.screen !== 'simulate');
  });

  showScreen(store.get().screen);
  cameraRig.setAutoRotate(store.get().screen !== 'simulate');

  return {
    update(dt) {
      cameraRig.update(dt);
    },
  };
}
