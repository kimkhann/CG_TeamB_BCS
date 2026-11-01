/**
 * [C · 화면] 3D 화면에서 부재 고르기
 *
 * 클릭(드래그가 아닌 짧은 클릭)하면 selectedPartId, 마우스를 올리면 hoveredPartId 를 바꿉니다.
 * 실제 광선 검사는 렌더러의 공개 함수 raycast() 가 합니다.
 *
 * 🔧 임시 버전(베이스): 시뮬레이션 화면에서만 동작.
 */

import { store } from '../core/state.js';

/** @param {import('../render/scene.js').Renderer} renderer */
export function attachPicking(renderer) {
  const el = renderer.domElement;
  let down = null;

  const toNdc = (event) => {
    const rect = el.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((event.clientY - rect.top) / rect.height) * 2 + 1,
    };
  };
  const active = () => store.get().screen === 'simulate';

  el.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
  });

  el.addEventListener('pointerup', (event) => {
    if (!down || !active()) return;
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
    down = null;
    if (moved > 5) return; // 드래그는 카메라 회전으로 처리
    const id = renderer.raycast(toNdc(event));
    store.set({ selectedPartId: id });
  });

  let pending = false;
  el.addEventListener('pointermove', (event) => {
    if (!active() || pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const id = renderer.raycast(toNdc(event));
      if (id !== store.get().hoveredPartId) store.set({ hoveredPartId: id });
    });
  });

  el.addEventListener('pointerleave', () => {
    if (store.get().hoveredPartId) store.set({ hoveredPartId: null });
  });
}
