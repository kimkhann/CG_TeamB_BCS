/**
 * [B · 시뮬레이션] 화재 — 중심 주변 부재가 시간이 지날수록 약해짐
 *
 * 중심: 부재 또는 위치 대상, 반경: 위치 대상의 radius, 없으면 3m. 최대 8초.
 * 🔧 임시 버전(베이스): 내화성에 따라 체력을 천천히 깎습니다.
 * TODO(B): 불이 번지는 범위 확대, 재료별 차이 강화
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
