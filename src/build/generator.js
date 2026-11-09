/**
 * [A · 건물 생성] 공개 함수: makeBuilding(spec) → Part[]
 *
 * 설정(BuildingSpec)을 받아 부재 목록을 만듭니다.
 * 형태별 세부 모양은 build/types/*.js 에서 만듭니다.
 *
 * 공통 골조의 하중 경로를 유지하며 형태별 지붕·외벽·발코니·코어를 추가합니다.
 */

import { normalizeSpec } from '../core/types.js';
import { buildHouse } from './types/house.js';
import { buildPiloti } from './types/piloti.js';
import { buildApartment } from './types/apartment.js';
import { buildLShape } from './types/lshape.js';

const BUILDERS = {
  house: buildHouse,
  piloti: buildPiloti,
  apartment: buildApartment,
  lshape: buildLShape,
};

/**
 * @param {import('../core/types.js').BuildingSpec} spec
 * @returns {import('../core/types.js').Part[]}
 */
export function makeBuilding(spec) {
  const normalized = normalizeSpec(spec);
  return BUILDERS[normalized.type](normalized);
}
