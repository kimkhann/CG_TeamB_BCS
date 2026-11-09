/**
 * [B · Simulation] Impact — a 2 t wrecking ball hits
 *
 *  Speed: the scenario value (km/h, 5–60 — sim/scenarioScale.js). Damage uses the same energy model as falling parts (sim/impact.js):
 *    Δhp = ½ m v² · (1 − e²) · 0.5 · f(location, direction) / U(material energy capacity)
 *  - part target: hits the middle of the part — vertical parts (columns, walls) from the side, horizontal ones (slabs, beams) from above
 *  - area target: hits every part in the area; impact energy scales by (1 − distance/radius)
 *  The material energy capacity U makes the difference instead of the strength multiplier (brick and timber break easily, steel hardly)
 */

import { EVENTS } from '../../core/events.js';
import { materialPhysics } from '../../data/materialPhysics.js';
import { impactDamage, isHorizontalMember } from '../impact.js';
import { BALL_MASS, effectEnergy, impactSpeed, scenarioValue } from '../scenarioScale.js';

/** Hit direction: horizontal members from above, vertical ones normal to their thin face */
function hitNormal(part) {
  if (isHorizontalMember(part)) return [0, -1, 0];
  return part.size[0] < part.size[2] ? [1, 0, 0] : [0, 0, 1];
}

function hit(ctx, part, speed) {
  const amount = impactDamage({
    mass: BALL_MASS,
    normalSpeed: speed,
    target: part,
    targetPhys: materialPhysics[part.material],
    point: [...part.position],
    normal: hitNormal(part),
  });
  ctx.damageRaw(part, amount);
}

export function runImpact(ctx, scenario) {
  const { target } = scenario;
  const kmh = scenarioValue(scenario);
  const { center, radius, part } = ctx.resolveTarget(target);
  if (!center) return;
  const speed = impactSpeed(kmh);

  if (part) {
    hit(ctx, part, speed);
  } else {
    for (const { part: p, distance } of ctx.partsWithin(center, radius)) {
      hit(ctx, p, speed * Math.sqrt(1 - distance / radius)); // energy ∝ v² scaled by (1 − distance/radius)
    }
  }
  ctx.emit(EVENTS.IMPACT, {
    position: center,
    energy: effectEnergy('impact', kmh),
    kind: 'impact',
  });
}
