/**
 * [A · 건물 생성] 필로티 빌라
 *
 * 열린 1층 주차 공간, 뒤쪽 계단실, 주거층 발코니와 옥상 난간.
 */

import { buildGridFrame } from '../frame.js';
import { addBalconies, addCore, addParapets, markBuilding } from '../details.js';

/** @param {import('../../core/types.js').BuildingSpec} spec */
export function buildPiloti(spec) {
  const parts = buildGridFrame({
    spec,
    cells: [
      [1, 1, 1],
      [1, 1, 1],
    ],
    span: 4.5,
    floorHeight: 3,
    hasWalls: (floor) => floor >= 2,
  });
  addBalconies(parts, spec, { span: 4.5, floorHeight: 3, nx: 3, nz: 2, bays: [0, 2] });
  addCore(parts, spec, { x: 0, z: -2.7, width: 2.1, depth: 2.2, floorHeight: 3 });
  addParapets(parts, spec, 3);
  return markBuilding(parts, spec);
}
