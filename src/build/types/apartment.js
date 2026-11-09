/**
 * [A · 건물 생성] 아파트
 *
 * 3×2칸 라멘 골조, 반복 창호·발코니·옥탑·옥상 난간.
 */

import { buildGridFrame } from '../frame.js';
import { addEntrance, addBalconies, addCore, addParapets, markBuilding } from '../details.js';

/** @param {import('../../core/types.js').BuildingSpec} spec */
export function buildApartment(spec) {
  const parts = buildGridFrame({
    spec,
    cells: [
      [1, 1, 1],
      [1, 1, 1],
    ],
    span: 5,
    floorHeight: 3,
    hasWalls: () => true,
  });
  addEntrance(parts);
  addBalconies(parts, spec, { span: 5, floorHeight: 3, nx: 3, nz: 2, bays: [0, 2] });
  addCore(parts, spec, { x: 0, z: 2, width: 2.6, depth: 2.4, floorHeight: 3, rooftop: true });
  addParapets(parts, spec, 3);
  return markBuilding(parts, spec);
}
