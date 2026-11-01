/**
 * [BASE · 공용] 개발용 URL 옵션
 *
 * 다른 사람의 작업이 덜 끝나도 자기 부분을 바로 확인할 수 있도록,
 * 주소 뒤에 옵션을 붙여 원하는 상태로 시작합니다.
 *
 *   ?type=piloti&floors=4                 → 해당 설정으로 시작
 *   ?frame=steel&wall=panel&slab=rc       → 재료 지정
 *   ?screen=simulate                      → 설정 화면 건너뛰고 바로 시뮬레이션
 *   ?debug=1                              → FPS, 부재 수 표시
 *
 * 예) http://localhost:5173/?type=apartment&floors=8&screen=simulate&debug=1
 */

import { normalizeSpec } from './types.js';

export function readDevParams(search = window.location.search) {
  const q = new URLSearchParams(search);
  const hasSpec = ['type', 'floors', 'frame', 'wall', 'slab', 'facade'].some((k) => q.has(k));
  const spec = hasSpec
    ? normalizeSpec({
        type: q.get('type') ?? undefined,
        floors: q.get('floors') ?? undefined,
        materials: {
          frame: q.get('frame') ?? undefined,
          wall: q.get('wall') ?? undefined,
          slab: q.get('slab') ?? undefined,
          facade: q.get('facade') ?? undefined,
        },
      })
    : null;
  const screen = ['select', 'configure', 'simulate'].includes(q.get('screen'))
    ? q.get('screen')
    : null;
  return { spec, screen, debug: q.get('debug') === '1' };
}
