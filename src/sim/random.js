/**
 * [B · Simulation] Seeded random numbers
 *
 * Use this instead of Math.random() so the same seed always reproduces the same collapse
 * (needed for replays and material comparisons).
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
