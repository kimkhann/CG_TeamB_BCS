/**
 * [A · 건물 생성] L자형 건물
 *
 * 🔧 임시 버전(베이스): L자 모양 칸 배치의 격자 골조, 모든 층 바깥 벽.
 * TODO(A): 꺾이는 부분 디테일, 커튼월 외관
 */

import { buildGridFrame } from '../frame.js';

/** @param {import('../../core/types.js').BuildingSpec} spec */
export function buildLShape(spec) {
  return buildGridFrame({
    spec,
    cells: [
      [1, 1, 1],
      [1, 0, 0],
      [1, 0, 0],
    ],
    span: 4.5,
    floorHeight: 3.2,
    hasWalls: () => true,
  });
}
