/**
 * [C · 화면] 3D 화면에서 대상 고르기
 *
 * 시뮬레이션 화면에서만 동작합니다.
 *  - 대상 방식이 '부재'일 때: 클릭하면 selectedPartId, 마우스를 올리면 hoveredPartId
 *  - 대상 방식이 '위치 · 범위'일 때: 클릭한 곳의 실내 위치(고른 층 바닥 + 1m)를 areaTarget 으로
 *
 * 실제 광선 검사는 렌더러의 공개 함수 raycast() / raycastPoint() 가 합니다.
 * 드래그(5px 이상 움직임)는 카메라 회전으로 처리하고 선택하지 않습니다.
 */

import { store } from '../core/state.js';
import { floorBaseY } from './floors.js';

/** 위치 대상의 높이: 층 바닥에서 이만큼 위 (실내 사람 키 높이쯤) */
const AREA_HEIGHT_ABOVE_FLOOR = 1.0;

/**
 * @param {import('../render/scene.js').Renderer} renderer
 * @param {{ getParts: () => import('../core/types.js').Part[] }} ctx
 */
export function attachPicking(renderer, ctx) {
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
    if (moved > 5) return;

    const state = store.get();
    if (state.targetMode === 'area') {
      const floor = state.cutFloor ?? 1;
      const y = floorBaseY(ctx.getParts(), floor) + AREA_HEIGHT_ABOVE_FLOOR;
      const position = renderer.raycastPoint(toNdc(event), y);
      if (!position) return;
      store.set({ areaTarget: { position, radius: state.areaTarget?.radius ?? 3, floor } });
    } else {
      store.set({ selectedPartId: renderer.raycast(toNdc(event)) });
    }
  });

  let pending = false;
  el.addEventListener('pointermove', (event) => {
    if (!active() || pending || store.get().targetMode !== 'part') return;
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
