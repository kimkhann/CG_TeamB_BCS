/**
 * [BASE · 공용] 상태 저장소
 *
 * "지금의 값"(현재 화면, 설정, 선택한 부재, 재생 상태, 결과)을 한곳에 둡니다.
 *   store.get()                      // 현재 상태 읽기
 *   store.set({ paused: true })      // 일부만 바꾸기
 *   store.subscribe((state, prev) => {}) // 바뀔 때마다 호출 (해제 함수를 돌려줌)
 *
 * "일어난 일"은 events.js, "지금의 값"은 state.js 로 구분해서 쓰세요.
 */

import { defaultSpec } from './types.js';

/**
 * @typedef {Object} AppState
 * @property {'select'|'configure'|'simulate'} screen  현재 화면
 * @property {import('./types.js').BuildingSpec} spec  건물 설정
 * @property {string|null} selectedPartId               클릭으로 선택한 부재
 * @property {string|null} hoveredPartId                마우스를 올린 부재
 * @property {boolean} paused                           일시정지 여부
 * @property {number} speed                             재생 속도 배율 (0.25 ~ 2)
 * @property {number} simTime                           시뮬레이션 경과 시간 (초)
 * @property {import('./types.js').SimResults|null} results 최근 결과
 * @property {number} buildVersion                      건물을 새로 만들 때마다 1씩 증가
 */

/** @type {AppState} */
let state = {
  screen: 'select',
  spec: defaultSpec('piloti'),
  selectedPartId: null,
  hoveredPartId: null,
  paused: false,
  speed: 1,
  simTime: 0,
  results: null,
  buildVersion: 0,
};

const subscribers = new Set();

export const store = {
  /** @returns {AppState} */
  get: () => state,

  /** @param {Partial<AppState>} partial */
  set(partial) {
    const prev = state;
    state = { ...state, ...partial };
    for (const fn of [...subscribers]) {
      try {
        fn(state, prev);
      } catch (error) {
        console.error('[state] 구독 처리 중 오류', error);
      }
    }
  },

  /**
   * @param {(state:AppState, prev:AppState)=>void} fn
   * @returns {() => void}
   */
  subscribe(fn) {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  },
};
