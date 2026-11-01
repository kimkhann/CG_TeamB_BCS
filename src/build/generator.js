/**
 * [A · 건물 생성] 공개 함수: makeBuilding(spec) → Part[]
 *
 * 설정(BuildingSpec)을 받아 부재 목록을 만듭니다.
 * 형태별 세부 모양은 build/types/*.js 에서 만듭니다.
 *
 * 🔧 임시 버전(베이스): 모든 형태가 build/frame.js 의 격자 골조를 조금씩 다르게 쓰는 수준입니다.
 *    A 단계에서 형태별로 실제 모양(박공지붕, 필로티, L자 등)을 다듬어 주세요.
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
