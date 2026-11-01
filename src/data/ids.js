/**
 * [BASE · 공용] 형태 · 재료 · 시나리오 ID 목록
 *
 * 모든 모듈이 이 ID를 기준으로 동작합니다.
 * 새 형태나 재료를 추가하려면 통합 담당에게 요청하세요.
 * (A는 materialLooks.js, B는 materialPhysics.js 에 같은 ID로 값을 채웁니다.)
 */

/** 건물 형태 */
export const BUILDING_TYPES = {
  house: {
    id: 'house',
    label: '단독주택',
    description: '벽이 하중을 받는 벽식 구조, 박공지붕',
    floors: { min: 1, max: 3, default: 2 },
    defaultMaterials: { frame: 'wood', wall: 'brick', slab: 'wood', facade: 'window' },
  },
  piloti: {
    id: 'piloti',
    label: '필로티 빌라',
    description: '1층은 기둥만 있는 주차 공간, 위층은 주거',
    floors: { min: 2, max: 5, default: 4 },
    defaultMaterials: { frame: 'rc', wall: 'brick', slab: 'rc', facade: 'window' },
  },
  apartment: {
    id: 'apartment',
    label: '아파트',
    description: '기둥과 보로 이루어진 라멘 구조, 고층',
    floors: { min: 3, max: 10, default: 6 },
    defaultMaterials: { frame: 'rc', wall: 'rc', slab: 'rc', facade: 'window' },
  },
  lshape: {
    id: 'lshape',
    label: 'L자형 건물',
    description: '두 동이 꺾여 붙은 형태, 비대칭 붕괴',
    floors: { min: 2, max: 6, default: 3 },
    defaultMaterials: { frame: 'steel', wall: 'panel', slab: 'rc', facade: 'curtain' },
  },
};

/** 재료 ID와 표시 이름 */
export const MATERIALS = {
  rc: { id: 'rc', label: '철근콘크리트' },
  steel: { id: 'steel', label: '철골' },
  wood: { id: 'wood', label: '목재' },
  brick: { id: 'brick', label: '벽돌(조적)' },
  panel: { id: 'panel', label: '경량 패널' },
  window: { id: 'window', label: '일반 창호' },
  curtain: { id: 'curtain', label: '유리 커튼월' },
};

/** 부위(슬롯)별로 고를 수 있는 재료 */
export const MATERIAL_SLOTS = {
  frame: { label: '기둥 · 보', options: ['rc', 'steel', 'wood'] },
  wall: { label: '벽', options: ['rc', 'brick', 'panel'] },
  slab: { label: '바닥판', options: ['rc', 'wood'] },
  facade: { label: '외장(창)', options: ['window', 'curtain'] },
};

/** 붕괴 시나리오 */
export const SCENARIOS = {
  impact: { id: 'impact', label: '충격', needsTarget: true },
  explosion: { id: 'explosion', label: '폭발', needsTarget: true },
  earthquake: { id: 'earthquake', label: '지진', needsTarget: false },
  fire: { id: 'fire', label: '화재', needsTarget: true },
};

/** 부재 종류 */
export const PART_KINDS = ['column', 'beam', 'slab', 'wall', 'roof', 'window', 'fragment'];

/** 부재 종류 → 재료 슬롯 */
export const KIND_TO_SLOT = {
  column: 'frame',
  beam: 'frame',
  slab: 'slab',
  roof: 'slab',
  wall: 'wall',
  window: 'facade',
  fragment: null, // 조각은 원래 부재의 재료를 그대로 씁니다
};
