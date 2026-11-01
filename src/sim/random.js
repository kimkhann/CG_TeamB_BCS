/**
 * [B · 시뮬레이션] 시드 고정 난수
 *
 * Math.random() 대신 이 함수를 쓰면, 같은 시드에서는 항상 같은 붕괴가 재현됩니다.
 * (다시 보기 · 재료 비교에 필요)
 */

export function createRandom(seed = 20261102) {
  let s = seed >>> 0;
  return function random() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
