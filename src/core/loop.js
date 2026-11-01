/**
 * [BASE · 공용] 고정 시간 간격 루프
 *
 * 화면 주사율(60Hz, 144Hz …)과 상관없이 시뮬레이션은 항상 1/60초 단위로 진행합니다.
 * 그래서 같은 입력이면 어떤 컴퓨터에서도 같은 속도로 재생됩니다.
 */

export const FIXED_STEP = 1 / 60;
const MAX_FRAME = 0.1; // 탭 전환 등으로 프레임이 길어져도 한 번에 0.1초 이상 진행하지 않음

/**
 * @param {Object} handlers
 * @param {(dt:number)=>void} handlers.step     고정 간격(FIXED_STEP)마다 호출 — 시뮬레이션
 * @param {(frameDt:number)=>void} handlers.frame 매 화면 프레임마다 호출 — 렌더링, 카메라
 * @param {()=>boolean} handlers.isRunning      false면 step을 건너뜀 (일시정지)
 * @param {()=>number} handlers.getSpeed        재생 속도 배율
 */
export function startLoop({ step, frame, isRunning, getSpeed }) {
  let last = performance.now();
  let accumulator = 0;
  let rafId = 0;

  function tick(now) {
    const frameDt = Math.min(MAX_FRAME, (now - last) / 1000);
    last = now;
    if (isRunning()) {
      accumulator += frameDt * getSpeed();
      let guard = 0;
      while (accumulator >= FIXED_STEP && guard++ < 10) {
        step(FIXED_STEP);
        accumulator -= FIXED_STEP;
      }
      if (guard >= 10) accumulator = 0; // 너무 밀리면 버림 (느린 컴퓨터 보호)
    } else {
      accumulator = 0;
    }
    frame(frameDt);
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId);
}
