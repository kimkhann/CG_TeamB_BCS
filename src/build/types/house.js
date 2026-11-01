/**
 * [A · 건물 생성] 단독주택
 *
 * 🔧 임시 버전(베이스): 2×2칸 격자 골조 + 모든 층 바깥 벽. 지붕은 평평한 바닥판.
 * TODO(A): 박공지붕(경사 지붕 두 장), 벽식 구조 느낌(기둥 대신 두꺼운 벽), 출입문
 */

import { buildGridFrame } from '../frame.js';

/** @param {import('../../core/types.js').BuildingSpec} spec */
export function buildHouse(spec) {
  return buildGridFrame({
    spec,
    cells: [
      [1, 1],
      [1, 1],
    ],
    span: 4,
    floorHeight: 3,
    hasWalls: () => true,
  });
}
