/**
 * [B · 시뮬레이션] 충격
 *  - 부재 대상: 그 부재 하나에 피해
 *  - 위치·범위 대상: 범위 안의 부재 모두에 거리에 따라 약해지는 피해 ("이 구역을 무너뜨린다")
 *
 * 🔧 임시 버전(베이스)
 */

import { EVENTS } from '../../core/events.js';

export function runImpact(ctx, { target, intensity }) {
  const { center, radius, part } = ctx.resolveTarget(target);
  if (!center) return;

  if (part) {
    ctx.damage(part, 0.3 + 0.7 * intensity);
  } else {
    for (const { part: p, distance } of ctx.partsWithin(center, radius)) {
      ctx.damage(p, (1 - distance / radius) * (0.5 + 1.0 * intensity));
    }
  }
  ctx.emit(EVENTS.IMPACT, { position: center, energy: intensity, kind: 'impact' });
}
