/**
 * [B · 시뮬레이션] 시나리오 목록
 *
 * 각 시나리오는 (ctx, scenario) => void 함수입니다.
 * scenario.target 은 { kind:'part', partId } 또는 { kind:'area', position, radius } 입니다.
 *
 * ctx 에서 쓸 수 있는 것
 *   parts, byId, random, emit, time, isAlive
 *   damage(part, amount)              피해 (재료 강도로 나눠 적용)
 *   applyImpulse(part, [x,y,z])       떨어지는 부재 밀기
 *   updateSupports()                  받쳐지지 않는 부재 떨어뜨리기
 *   addOngoing(fn)                    시간에 따라 계속 작용하는 효과
 *   resolveTarget(target)             → { center, radius, part }
 *   partsWithin(center, radius)       → [{ part, distance }]
 */

import { runImpact } from './impact.js';
import { runExplosion } from './explosion.js';
import { runEarthquake } from './earthquake.js';
import { runFire } from './fire.js';

export const SCENARIO_RUNNERS = {
  impact: runImpact,
  explosion: runExplosion,
  earthquake: runEarthquake,
  fire: runFire,
};
