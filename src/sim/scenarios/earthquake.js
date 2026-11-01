/**
 * [B · 시뮬레이션] 지진
 *
 * 🔧 임시 버전(베이스): 3초 동안 1층 기둥과 벽에 무작위로 피해를 조금씩 줍니다.
 *    (지면이 실제로 흔들리지는 않습니다.)
 * TODO(B): 지면 흔들림(수평 진동), 층 질량 × 높이에 비례한 수평력, 필로티 연약층 표현
 */

import { EVENTS } from '../../core/events.js';

export function runEarthquake(ctx, { intensity }) {
  const duration = 3;
  let elapsed = 0;
  let pulse = 0;
  ctx.emit(EVENTS.IMPACT, { position: [0, 0.2, 0], energy: intensity, kind: 'explosion' });

  ctx.addOngoing((dt) => {
    elapsed += dt;
    pulse += dt;
    if (pulse >= 0.25) {
      pulse = 0;
      for (const part of ctx.parts) {
        if (part.floor !== 1 || !ctx.isAlive(part)) continue;
        if (part.kind !== 'column' && part.kind !== 'wall') continue;
        ctx.damage(part, ctx.random() * 0.35 * intensity);
      }
    }
    return elapsed >= duration;
  });
}
