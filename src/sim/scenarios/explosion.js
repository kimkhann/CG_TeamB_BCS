/**
 * [B · Simulation] Explosion — damages parts within the radius by distance and pushes them outward
 *
 * Center: the part's position for a part target, the given position for an area target (empty interior space is fine)
 * Size: TNT equivalent (kg, sim/scenarioScale.js) → damage radius R = 7 · W^(1/3) m, damage factor = (R − 2) / 6
 * Radius: the area target's radius, otherwise R
 *
 * Damage magnitude is still the base-stage rule.
 * TODO(B): same-floor priority, shielding behind walls, blast pressure
 */

import { EVENTS } from '../../core/events.js';
import { blast, effectEnergy, scenarioValue } from '../scenarioScale.js';

export function runExplosion(ctx, scenario) {
  const { center, radius: areaRadius } = ctx.resolveTarget(scenario.target);
  if (!center) return;
  const tnt = scenarioValue(scenario);
  const { radius: blastRadius, power } = blast(tnt);
  const radius = areaRadius ?? blastRadius;

  for (const { part, distance } of ctx.partsWithin(center, radius)) {
    ctx.damage(part, (1 - distance / radius) * (0.8 + 1.2 * power));
  }
  ctx.emit(EVENTS.IMPACT, {
    position: center,
    energy: effectEnergy('explosion', tnt),
    kind: 'explosion',
    radius,
  });

  // push parts and fragments that started falling outward
  ctx.updateSupports();
  for (const part of ctx.parts) {
    if (part.state !== 'falling' || !part.sim.body) continue;
    const dir = [
      part.position[0] - center[0],
      part.position[1] - center[1] + 0.5,
      part.position[2] - center[2],
    ];
    const len = Math.hypot(...dir) || 1;
    if (len > radius) continue;
    const power = (1 - len / radius) * 6 * power * part.sim.body.mass;
    ctx.applyImpulse(
      part,
      dir.map((v) => (v / len) * power),
    );
  }
}
