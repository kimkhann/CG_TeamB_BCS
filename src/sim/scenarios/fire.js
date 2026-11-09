/**
 * [B · 시뮬레이션] 화재 — 중심 주변 부재가 시간이 지날수록 약해짐
 *
 * 크기: 표준화재(ISO 834) 지속 시간 t 분 (sim/scenarioScale.js), 화면에서는 8초로 압축.
 *   부재의 내화 시간 t_R = 10분 / (1 − 내화성)  (data/materialPhysics.js)
 *   피해 = t / t_R × (1 − 거리/반경)  → 중심에서는 내화 시간만큼 타면 무너짐
 *   (재료 강도 배율은 쓰지 않음 — 내화 시간이 이미 재료 차이를 담고 있음)
 * 중심: 부재 또는 위치 대상, 반경: 위치 대상의 radius, 없으면 3m.
 * TODO(B): 불이 번지는 범위 확대
 */

import { EVENTS } from '../../core/events.js';
import { materialPhysics } from '../../data/materialPhysics.js';
import { FIRE_PLAY_SECONDS, effectEnergy, scenarioValue } from '../scenarioScale.js';

export function runFire(ctx, scenario) {
  const { center, radius: areaRadius } = ctx.resolveTarget(scenario.target);
  const minutes = scenarioValue(scenario);
  const energy = effectEnergy('fire', minutes);
  if (!center) return;
  const radius = areaRadius ?? 3;
  const duration = FIRE_PLAY_SECONDS;
  let elapsed = 0;
  let flicker = 0;

  ctx.addOngoing((dt) => {
    elapsed += dt;
    flicker += dt;
    if (flicker > 0.5) {
      flicker = 0;
      ctx.emit(EVENTS.IMPACT, { position: center, energy, kind: 'fire', radius });
    }
    for (const { part, distance } of ctx.partsWithin(center, radius)) {
      const resistance = materialPhysics[part.material]?.fireResistance ?? 0.5;
      const fireRating = 10 / Math.max(0.01, 1 - resistance); // 내화 시간 (분)
      ctx.damageRaw(part, (dt / duration) * (minutes / fireRating) * (1 - distance / radius));
    }
    return elapsed >= duration;
  });
}
