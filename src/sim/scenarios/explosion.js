/**
 * [B · 시뮬레이션] 폭발 — 중심에서 반경 안의 부재에 거리에 따라 피해 + 바깥으로 밀어냄
 *
 * 중심: 부재 대상이면 그 부재 위치, 위치 대상이면 그 위치 (건물 내부의 빈 공간도 가능)
 * 크기: TNT 환산량 (kg, sim/scenarioScale.js) → 피해 반경 R = 7 · W^(1/3) m, 피해 배율 = (R − 2) / 6
 * 반경: 위치 대상의 radius, 없으면 R
 *
 * 🔧 임시 버전(베이스)
 * TODO(B): 같은 층 우선, 벽 뒤 차폐, 폭풍 압력 표현
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

  // 떨어지기 시작한 부재와 조각을 바깥으로 밀어냄
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
