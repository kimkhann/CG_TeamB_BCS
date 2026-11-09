/**
 * [B · 시뮬레이션] 화재 — 중심 주변 부재가 시간이 지날수록 약해짐
 *
 * 중심: 부재 또는 위치 대상, 반경: 위치 대상의 radius, 없으면 3m. 최대 8초.
 * 피해 속도 = 0.25 · 세기 · (1 − 내화성) / 강도.  내화성 = 1 − 10분 / 내화 시간 (materialPhysics) 이므로
 *   8초 동안의 피해 = (20 × 세기 분) / 내화 시간 → 표준화재(ISO 834)에 20 × 세기 분 노출한 것과 같음 (sim/intensityScale.js)
 * TODO(B): 불이 번지는 범위 확대
 */

import { EVENTS } from '../../core/events.js';
import { materialPhysics } from '../../data/materialPhysics.js';

export function runFire(ctx, { target, intensity }) {
  const { center, radius: areaRadius } = ctx.resolveTarget(target);
  if (!center) return;
  const radius = areaRadius ?? 3;
  const duration = 8;
  let elapsed = 0;
  let flicker = 0;

  ctx.addOngoing((dt) => {
    elapsed += dt;
    flicker += dt;
    if (flicker > 0.5) {
      flicker = 0;
      ctx.emit(EVENTS.IMPACT, { position: center, energy: intensity, kind: 'fire', radius });
    }
    for (const { part, distance } of ctx.partsWithin(center, radius)) {
      const resistance = materialPhysics[part.material]?.fireResistance ?? 0.5;
      ctx.damage(part, dt * 0.25 * intensity * (1 - resistance) * (1 - distance / radius));
    }
    return elapsed >= duration;
  });
}
