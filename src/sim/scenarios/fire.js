/**
 * [B · 시뮬레이션] 화재 — 대상 주변 부재가 시간이 지날수록 약해짐
 *
 * 🔧 임시 버전(베이스): 반경 3m 안의 부재 체력을 내화성에 따라 천천히 깎습니다. 최대 8초.
 * TODO(B): 불이 번지는 범위 확대, 재료별 차이 강화
 */

import { EVENTS } from '../../core/events.js';
import { materialPhysics } from '../../data/materialPhysics.js';

export function runFire(ctx, { targetPartId, intensity }) {
  const target = ctx.byId.get(targetPartId);
  if (!target) return;
  const origin = [...target.position];
  const radius = 3;
  const duration = 8;
  let elapsed = 0;
  let flicker = 0;

  ctx.addOngoing((dt) => {
    elapsed += dt;
    flicker += dt;
    if (flicker > 0.5) {
      flicker = 0;
      ctx.emit(EVENTS.IMPACT, { position: origin, energy: intensity, kind: 'fire' });
    }
    for (const part of ctx.parts) {
      if (!ctx.isAlive(part)) continue;
      const d = Math.hypot(
        part.position[0] - origin[0],
        part.position[1] - origin[1],
        part.position[2] - origin[2],
      );
      if (d > radius) continue;
      const resistance = materialPhysics[part.material]?.fireResistance ?? 0.5;
      ctx.damage(part, dt * 0.25 * intensity * (1 - resistance) * (1 - d / radius));
    }
    return elapsed >= duration;
  });
}
