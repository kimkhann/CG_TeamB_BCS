/**
 * [B · 시뮬레이션] 충격 — 선택한 부재 하나에 피해
 *
 * 🔧 임시 버전(베이스): 세기에 비례한 피해를 대상에 한 번 줍니다.
 */

import { EVENTS } from '../../core/events.js';

export function runImpact(ctx, { targetPartId, intensity }) {
  const target = ctx.byId.get(targetPartId);
  if (!target) return;
  ctx.damage(target, 0.3 + 0.7 * intensity);
  ctx.emit(EVENTS.IMPACT, { position: [...target.position], energy: intensity, kind: 'impact' });
}
