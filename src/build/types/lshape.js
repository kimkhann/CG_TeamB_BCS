/**
 * [A · 건물 생성] L자형 건물
 *
 * 실제 L자 평면과 넓은 유리 개구부, 코너를 따라 도는 옥상 난간.
 */

import { buildGridFrame } from '../frame.js';
import { addCore, addParapets, markBuilding } from '../details.js';

/** @param {import('../../core/types.js').BuildingSpec} spec */
export function buildLShape(spec) {
  const parts = buildGridFrame({
    spec,
    cells: [
      [1, 1, 1],
      [1, 0, 0],
      [1, 0, 0],
    ],
    span: 4.5,
    floorHeight: 3.2,
    hasWalls: () => true,
    curtainWall: true,
  });
  addCore(parts, spec, { x: -4.5, z: -4.5, width: 2, depth: 2, floorHeight: 3.2, rooftop: true });
  addParapets(parts, spec, 3.2);
  return markBuilding(parts, spec);
}
