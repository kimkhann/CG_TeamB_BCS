/**
 * [BASE · 공용] 이벤트 버스
 *
 * 모듈끼리 서로의 파일을 직접 부르지 않고, "일어난 일"을 이벤트로 알립니다.
 *   emit(EVENTS.PART_FAILED, { partId })      // 보내기
 *   on(EVENTS.PART_FAILED, ({ partId }) => {}) // 받기 (해제 함수를 돌려줌)
 *
 * 새 이벤트가 필요하면 통합 담당에게 요청하세요.
 */

export const EVENTS = {
  // ── C(UI) → 시뮬레이션 ─────────────────────────────
  /** 시나리오 실행 요청. payload: Scenario */
  SCENARIO_RUN: 'scenario:run',
  /** 건물을 처음 상태로 되돌리기. payload: {} */
  SIM_RESET: 'sim:reset',

  // ── B(시뮬레이션) → A(렌더링), C(UI) ─────────────────
  /** 부재가 피해를 입음. payload: { partId, hp } */
  PART_DAMAGED: 'part:damaged',
  /** 부재가 기능을 잃음. payload: { partId } */
  PART_FAILED: 'part:failed',
  /** 부재가 지지를 잃고 떨어지기 시작함. payload: { partId } */
  PART_DETACHED: 'part:detached',
  /** 떨어진 부재가 멈춤. payload: { partId } */
  PART_SETTLED: 'part:settled',
  /** 새 부재(조각)가 생김. payload: { part } — 렌더러가 메시를 만들어야 함 */
  PART_ADDED: 'part:added',
  /** 충돌 · 폭발 등 충격 지점. payload: { position:[x,y,z], energy:number, kind:'impact'|'explosion'|'collision'|'fire'|'glass', radius?:number }
   *  glass: 유리가 깨지는 순간 (B 단계 추가) — 렌더러가 모르면 먼지 효과로 대체해도 됨 */
  IMPACT: 'impact',
  /** 모든 움직임이 멈춤. payload: SimResults */
  SIM_FINISHED: 'sim:finished',
};

/** @type {Map<string, Set<Function>>} */
const listeners = new Map();

/**
 * @param {string} name
 * @param {(payload:any)=>void} fn
 * @returns {() => void} 해제 함수
 */
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => off(name, fn);
}

export function off(name, fn) {
  listeners.get(name)?.delete(fn);
}

/**
 * @param {string} name
 * @param {any} [payload]
 */
export function emit(name, payload = {}) {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (error) {
      console.error(`[events] '${name}' 처리 중 오류`, error);
    }
  }
}
