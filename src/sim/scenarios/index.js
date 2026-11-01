/**
 * [B · 시뮬레이션] 시나리오 목록
 *
 * 각 시나리오는 (ctx, scenario) => void 함수입니다.
 * ctx 에서 쓸 수 있는 것: parts, byId, random, emit, time, isAlive,
 *                         damage(part, amount), applyImpulse(part, [x,y,z]),
 *                         updateSupports(), addOngoing(fn)
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
