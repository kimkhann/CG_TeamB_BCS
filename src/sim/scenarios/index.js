/**
 * [B · Simulation] Scenario registry
 *
 * Each scenario is a (ctx, scenario) => void function.
 * scenario.target is { kind:'part', partId } or { kind:'area', position, radius }; the size is scenario.value (sim/scenarioScale.js).
 *
 * Available on ctx
 *   parts, byId, random, emit, time, isAlive
 *   damage(part, amount)              damage (divided by material strength) · damageRaw(part, amount) without it
 *   applyImpulse(part, [x,y,z])       push a falling part
 *   updateSupports()                  drop unsupported parts
 *   addOngoing(fn)                    effect that keeps acting over time · startShaking() for the earthquake
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
