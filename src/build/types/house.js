/**
 * [A · 건물 생성] 단독주택
 *
 * 2×2칸 골조, 현관, 세분화된 박공지붕. 구조 하중 경로는 기존 골조를 유지합니다.
 */

import { buildGridFrame } from '../frame.js';
import { addEntrance, addGableRoof, markBuilding } from '../details.js';

/** @param {import('../../core/types.js').BuildingSpec} spec */
export function buildHouse(spec) {
  const parts = buildGridFrame({
    spec,
    cells: [
      [1, 1],
      [1, 1],
    ],
    span: 4,
    floorHeight: 3,
    hasWalls: () => true,
  });
  addEntrance(parts);
  addGableRoof(parts, spec, 8, 8, 3);
  return markBuilding(parts, spec);
}
