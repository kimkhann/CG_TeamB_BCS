/**
 * [A · 건물 생성] 필로티 빌라
 *
 * 🔧 임시 버전(베이스): 3×2칸 격자 골조. 1층은 벽 없이 기둥만(주차 공간), 2층부터 바깥 벽.
 * TODO(A): 1층 주차 공간 표현, 계단실 코어, 발코니 등
 */

import { buildGridFrame } from '../frame.js';

/** @param {import('../../core/types.js').BuildingSpec} spec */
export function buildPiloti(spec) {
  return buildGridFrame({
    spec,
    cells: [
      [1, 1, 1],
      [1, 1, 1],
    ],
    span: 4.5,
    floorHeight: 3,
    hasWalls: (floor) => floor >= 2,
  });
}
