/**
 * [BASE · 공용] 데이터 약속 (형식 정의)
 *
 * 모듈끼리 주고받는 데이터의 모양을 정의합니다.
 * - 필드는 "추가"만 자유롭게 할 수 있습니다.
 * - 이름 변경 · 삭제는 반드시 통합 담당과 상의하세요.
 * 자세한 설명은 docs/CONTRACTS.md 를 보세요.
 */

import { BUILDING_TYPES, MATERIAL_SLOTS } from '../data/ids.js';

/**
 * 사용자가 설정 화면에서 만든 건물 설정 (C가 만들고 A가 받음)
 * @typedef {Object} BuildingSpec
 * @property {'house'|'piloti'|'apartment'|'lshape'} type  건물 형태 ID
 * @property {number} floors                               층수
 * @property {{frame:string, wall:string, slab:string, facade:string}} materials 부위별 재료 ID
 */

/**
 * 부재 하나 (A의 생성기가 만들고, B가 상태를 바꾸고, A의 렌더러가 그림)
 *
 * 필드 소유권
 *  - 생성기(A)가 채움: id, kind, floor, material, size, position, quaternion, supportedBy, structural
 *  - 시뮬레이션(B)이 바꿈: position, quaternion, state, hp
 *  - 모듈 전용 메모 공간: part.sim (B 전용), part.view (A 전용) — 서로의 공간은 건드리지 않습니다.
 *
 * @typedef {Object} Part
 * @property {string} id                 고유 ID (예: 'col-1-0-0')
 * @property {string} label              화면 표시용 이름 (예: '1층 A1 기둥')
 * @property {'column'|'beam'|'slab'|'wall'|'roof'|'window'|'fragment'} kind 부재 종류
 * @property {number} floor              층 번호 (1부터, 지붕은 floors + 1)
 * @property {string} material           재료 ID (data/ids.js 의 MATERIALS)
 * @property {[number,number,number]} size        상자 크기 [가로 x, 높이 y, 깊이 z] (m)
 * @property {[number,number,number]} position    중심 위치 (m, 월드 좌표)
 * @property {[number,number,number,number]} quaternion  회전 [x, y, z, w]
 * @property {string[]} supportedBy      이 부재를 받치고 있는 부재들의 id
 * @property {boolean} structural        하중을 받는 부재인지 (창문 등 장식은 false)
 * @property {'intact'|'damaged'|'failed'|'falling'|'settled'} state 현재 상태
 * @property {number} hp                 남은 체력 (1 = 멀쩡, 0 = 기능 상실)
 * @property {Object} [sim]              B 전용 메모 공간
 * @property {Object} [view]             A 전용 메모 공간
 */

/**
 * 시나리오의 대상 — 부재 하나, 또는 위치 + 반경
 * @typedef {{ kind:'part', partId:string } | { kind:'area', position:[number,number,number], radius:number }} ScenarioTarget
 */

/**
 * 붕괴 시나리오 실행 요청 (C가 보내고 B가 실행)
 * @typedef {Object} Scenario
 * @property {'impact'|'explosion'|'earthquake'|'fire'} type
 * @property {number} intensity          세기 (0 ~ 1)
 * @property {ScenarioTarget|null} target 대상 (지진은 null 가능)
 */

/**
 * 시뮬레이션 결과 (B가 만들고 C가 보여줌)
 * @typedef {Object} SimResults
 * @property {number} time               경과 시간 (초)
 * @property {number} totalParts         전체 부재 수 (조각 제외)
 * @property {number} collapsedParts     무너진(떨어진) 부재 수
 * @property {number} collapsedRatio     무너진 비율 (0 ~ 1)
 * @property {string|null} firstFailedPartId 가장 먼저 기능을 잃은 부재
 * @property {number} floorsLost         완전히 무너진 층 수
 * @property {boolean} finished          모든 움직임이 멈췄는지
 * @property {number|null} collapseTime  시나리오 시작부터 마지막 구조 부재가 무너질 때까지 (초), 무너진 게 없으면 null
 * @property {{floor:number, ratio:number}[]} floorDamage 층별 피해율 (0 ~ 1, 구조 부재의 평균 체력 손실 · 무너진 부재는 1)
 * @property {{scenario:number, collision:number, debris:number}} damageByCause
 *           원인별 피해 비율 (합 1, 피해 없으면 모두 0) — 시나리오 직접 피해 · 떨어진 부재 충돌 · 쌓인 잔해 무게
 */

/**
 * 부재 객체를 만드는 도우미. 생성기(A)는 반드시 이 함수로 부재를 만드세요.
 * @param {Partial<Part> & Pick<Part,'id'|'kind'|'floor'|'material'|'size'|'position'>} fields
 * @returns {Part}
 */
export function createPart(fields) {
  return {
    label: fields.id,
    quaternion: [0, 0, 0, 1],
    supportedBy: [],
    structural: fields.kind !== 'window',
    state: 'intact',
    hp: 1,
    ...fields,
    size: [...fields.size],
    position: [...fields.position],
  };
}

/**
 * 설정을 기본값으로 채우고 범위를 맞춥니다.
 * @param {Partial<BuildingSpec>} spec
 * @returns {BuildingSpec}
 */
export function normalizeSpec(spec = {}) {
  const type = BUILDING_TYPES[spec.type] ? spec.type : 'piloti';
  const info = BUILDING_TYPES[type];
  const floors = Math.round(
    Math.min(
      info.floors.max,
      Math.max(info.floors.min, Number(spec.floors) || info.floors.default),
    ),
  );
  const materials = { ...info.defaultMaterials };
  for (const slot of Object.keys(MATERIAL_SLOTS)) {
    const value = spec.materials?.[slot];
    if (value && MATERIAL_SLOTS[slot].options.includes(value)) materials[slot] = value;
  }
  return { type, floors, materials };
}

/** 형태의 기본 설정 */
export function defaultSpec(type = 'piloti') {
  return normalizeSpec({ type });
}
