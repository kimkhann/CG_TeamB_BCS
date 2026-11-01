/**
 * [B · 시뮬레이션] 폭발 — 대상 주변 반경 안의 부재에 거리에 따라 피해 + 바깥으로 밀어냄
 *
 * 🔧 임시 버전(베이스): 반경 = 2 + 6 × 세기, 거리에 비례해 약해지는 피해.
 * TODO(B): 같은 층 우선, 벽 뒤 차폐, 폭풍 압력 표현
 */

import { EVENTS } from '../../core/events.js';

export function runExplosion(ctx, { targetPartId, intensity }) {
  const target = ctx.byId.get(targetPartId);
  if (!target) return;
  const origin = [...target.position];
  const radius = 2 + 6 * intensity;
  const distanceTo = (p) =>
    Math.hypot(p.position[0] - origin[0], p.position[1] - origin[1], p.position[2] - origin[2]);

  for (const part of [...ctx.parts]) {
    if (!ctx.isAlive(part)) continue;
    const d = distanceTo(part);
    if (d > radius) continue;
    ctx.damage(part, (1 - d / radius) * (0.8 + 1.2 * intensity));
  }
  ctx.emit(EVENTS.IMPACT, { position: origin, energy: intensity, kind: 'explosion' });

  // 떨어지기 시작한 부재와 조각을 바깥으로 밀어냄
  ctx.updateSupports();
  for (const part of ctx.parts) {
    if (part.state !== 'falling') continue;
    const d = distanceTo(part);
    if (d > radius) continue;
    const dir = [
      part.position[0] - origin[0],
      part.position[1] - origin[1] + 0.5,
      part.position[2] - origin[2],
    ];
    const len = Math.hypot(...dir) || 1;
    const mass = part.sim.body.mass;
    const power = (1 - d / radius) * 6 * intensity * mass;
    ctx.applyImpulse(
      part,
      dir.map((v) => (v / len) * power),
    );
  }
}
