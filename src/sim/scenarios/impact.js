/**
 * [B · 시뮬레이션] 충격 — 철거용 쇳덩이(2 t)가 부딪히는 충격
 *
 *  속도 v = 2 + 10 × 세기 (m/s, 시속 7 ~ 43 km). 피해는 떨어진 부재의 충돌과 같은 에너지 모델(sim/impact.js):
 *    Δhp = ½ m v² · (1 − e²) · 0.5 · f(위치, 방향) / U(재료 흡수 능력)
 *  - 부재 대상: 부재 가운데를 침. 기둥 · 벽 등 세운 부재는 옆에서, 바닥판 · 보 등 수평 부재는 위에서
 *  - 위치·범위 대상: 범위 안의 부재 각각을 침. 중심에서 멀수록 충돌 에너지가 (1 − 거리/반경) 배로 줄어듦
 *  재료 강도(strength) 배율 대신 재료별 흡수 능력 U 가 차이를 만듭니다. (벽돌 · 목재는 쉽게, 철골은 어렵게 부서짐)
 */

import { EVENTS } from '../../core/events.js';
import { materialPhysics } from '../../data/materialPhysics.js';
import { impactDamage, isHorizontalMember } from '../impact.js';
import { BALL_MASS, impactSpeed } from '../intensityScale.js';

/** 부재를 치는 방향: 수평 부재는 위에서, 세운 부재는 얇은 쪽 면에 수직으로 */
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

export function runImpact(ctx, { target, intensity }) {
  const { center, radius, part } = ctx.resolveTarget(target);
  if (!center) return;
  const speed = impactSpeed(intensity);

  if (part) {
    hit(ctx, part, speed);
  } else {
    for (const { part: p, distance } of ctx.partsWithin(center, radius)) {
      hit(ctx, p, speed * Math.sqrt(1 - distance / radius)); // 에너지 ∝ v² 가 (1 − 거리/반경) 배
    }
  }
  ctx.emit(EVENTS.IMPACT, { position: center, energy: intensity, kind: 'impact' });
}
