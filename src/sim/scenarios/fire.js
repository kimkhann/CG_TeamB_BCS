/**
 * [B · Simulation] Fire — parts around the center weaken over time
 *
 * Size: standard fire (ISO 834) duration t minutes (sim/scenarioScale.js), played back in 8 s.
 *   part fire rating t_R = 10 min / (1 − fireResistance)  (data/materialPhysics.js)
 *   damage = t / t_R × (1 − distance/radius)  → at the center a part fails after burning for its rating
 *   (no strength multiplier — the fire rating already captures the material difference)
 * Center: part or area target; radius: the area target's radius, otherwise 3 m.
 * TODO(B): fire spread
 */

import { EVENTS } from '../../core/events.js';
import { materialPhysics } from '../../data/materialPhysics.js';
import { FIRE_PLAY_SECONDS, effectEnergy, scenarioValue } from '../scenarioScale.js';

export function runFire(ctx, scenario) {
  const { center, radius: areaRadius } = ctx.resolveTarget(scenario.target);
  const minutes = scenarioValue(scenario);
  const energy = effectEnergy('fire', minutes);
  if (!center) return;
  const radius = areaRadius ?? 3;
  const duration = FIRE_PLAY_SECONDS;
  let elapsed = 0;
  let flicker = 0;

  ctx.addOngoing((dt) => {
    elapsed += dt;
    flicker += dt;
    if (flicker > 0.5) {
      flicker = 0;
      ctx.emit(EVENTS.IMPACT, { position: center, energy, kind: 'fire', radius });
    }
    for (const { part, distance } of ctx.partsWithin(center, radius)) {
      const resistance = materialPhysics[part.material]?.fireResistance ?? 0.5;
      const fireRating = 10 / Math.max(0.01, 1 - resistance); // fire rating (min)
      ctx.damageRaw(part, (dt / duration) * (minutes / fireRating) * (1 - distance / radius));
    }
    return elapsed >= duration;
  });
}
