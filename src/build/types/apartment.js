/**
 * [A · 건물 생성] 아파트
 *
 * 🔧 임시 버전(베이스): 3×2칸 라멘(기둥 + 보) 골조, 모든 층 바깥 벽.
 * TODO(A): 층마다 반복되는 창호 패턴, 옥상 구조물, 코어(엘리베이터·계단)
 */

import { buildGridFrame } from '../frame.js';

/** @param {import('../../core/types.js').BuildingSpec} spec */
export function buildApartment(spec) {
  return buildGridFrame({
    spec,
    cells: [
      [1, 1, 1],
      [1, 1, 1],
    ],
    span: 5,
    floorHeight: 3,
    hasWalls: () => true,
  });
}
