/**
 * [B · 시뮬레이션] 시나리오 세기(0 ~ 1)를 실제 세계의 크기로 바꿔 설명
 *
 * 화면(C)이 세기 막대 옆에 보여 주는 문구입니다. 각 시나리오가 실제로 쓰는 식과 같은 값을 씁니다.
 *
 *   충격   철거용 쇳덩이 2 t 가 v = 2 + 10 × 세기 (m/s) 로 부딪힘      → sim/scenarios/impact.js
 *          에너지 E = ½ m v², 같은 에너지를 내는 승용차(1.5 t) 속도도 함께 표시
 *   폭발   피해 반경 R = 2 + 6 × 세기 (m), 그 거리에서 폭풍압 ≈ 20 kPa(벽 · 창이 크게 부서지는 수준)
 *          환산거리 Z = R / W^(1/3) ≈ 7 m/kg^(1/3) (Kingery–Bulmash 곡선) → TNT 환산량 W = (R / 7)³ kg
 *   지진   최대 지반 가속도 PGA = 0.5 g × 세기                         → sim/scenarios/earthquake.js
 *          진도: 수정 메르칼리 진도(MMI)와 PGA의 관계 (Wald et al., 1999 — 기상청 진도 등급과 같은 Ⅰ~Ⅻ 체계)
 *          국내 내진설계 기준 설계지진(지진구역 Ⅰ, 2,400년 재현주기) 0.22 g 와 비교
 *   화재   표준화재곡선(ISO 834)에 20 × 세기 분 노출한 것과 같은 피해를 8초로 압축  → sim/scenarios/fire.js
 *          온도 T = 20 + 345 · log₁₀(8t + 1) ℃ (t: 분)
 */

import { PGA_PER_INTENSITY } from './scenarios/earthquake.js';

/** 충격: 철거용 쇳덩이 질량 (t) */
export const BALL_MASS = 2;
const CAR_MASS = 1.5;
/** 국내 설계지진 유효지반가속도 (g): 지진구역 Ⅰ 0.11 g × 2,400년 재현주기 계수 2.0 (KDS 41 17 00) */
const DESIGN_PGA = 0.22;
/** 화재: 세기 1 일 때 표준화재 노출 시간 (분) */
export const FIRE_MINUTES_PER_INTENSITY = 20;

/** 충격 속도 (m/s) */
export const impactSpeed = (intensity) => 2 + 10 * intensity;
/** 폭발 피해 반경 (m) — 부재 대상일 때 */
export const blastRadius = (intensity) => 2 + 6 * intensity;

const MMI = [
  [0.0017, 'Ⅰ', '느끼지 못함'],
  [0.014, 'Ⅱ~Ⅲ', '실내 일부가 느낌'],
  [0.039, 'Ⅳ', '그릇 · 창문이 흔들림'],
  [0.092, 'Ⅴ', '그릇이 깨지고 물건이 넘어짐'],
  [0.18, 'Ⅵ', '무거운 가구가 움직이고 벽에 금이 감'],
  [0.34, 'Ⅶ', '약한 건물은 크게 부서짐'],
  [0.65, 'Ⅷ', '보통 건물도 일부 무너짐'],
  [1.24, 'Ⅸ', '잘 지은 건물도 크게 부서짐'],
  [Infinity, 'Ⅹ 이상', '대부분의 건물이 무너짐'],
];

/** PGA(g) → 진도 등급 · 설명 */
export function mmiFromPga(pga) {
  const row = MMI.find(([upper]) => pga < upper) ?? MMI[MMI.length - 1];
  return { level: row[1], text: row[2] };
}

const kmh = (ms) => Math.round(ms * 3.6);
const round = (v, digits = 1) => {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
};

/**
 * 세기를 실제 크기로 설명
 * @param {'impact'|'explosion'|'earthquake'|'fire'} type
 * @param {number} intensity 0 ~ 1
 * @returns {{ headline:string, detail:string }}
 */
export function describeIntensity(type, intensity) {
  if (type === 'impact') {
    const v = impactSpeed(intensity);
    const energy = 0.5 * BALL_MASS * v * v;
    const car = Math.sqrt((2 * energy) / CAR_MASS);
    return {
      headline: `철거용 쇳덩이 ${BALL_MASS}t · 시속 ${kmh(v)}km`,
      detail: `충돌 에너지 ${Math.round(energy)} kJ — 승용차(1.5t)가 시속 ${kmh(car)}km로 들이받는 것과 같은 에너지`,
    };
  }
  if (type === 'explosion') {
    const radius = blastRadius(intensity);
    const tnt = (radius / 7) ** 3;
    return {
      headline: `TNT 약 ${tnt < 1 ? round(tnt, 2) : round(tnt, 1)} kg 상당`,
      detail: `${round(radius)} m 거리까지 벽 · 창이 크게 부서지는 폭풍압(약 20 kPa). 위치 · 범위 대상은 지정한 반경 안에만 피해`,
    };
  }
  if (type === 'earthquake') {
    const pga = PGA_PER_INTENSITY * intensity;
    const { level, text } = mmiFromPga(pga);
    return {
      headline: `진도 ${level} · 최대 지반 가속도 ${round(pga, 2)} g`,
      detail: `${text}. 국내 내진설계 기준 지진(0.22 g)의 ${round(pga / DESIGN_PGA)}배`,
    };
  }
  if (type === 'fire') {
    const minutes = FIRE_MINUTES_PER_INTENSITY * intensity;
    const temp = 20 + 345 * Math.log10(8 * minutes + 1);
    return {
      headline: `표준 화재 ${round(minutes)}분 · 약 ${Math.round(temp / 10) * 10}℃`,
      detail: `실내 화재(ISO 834 표준화재곡선)에 ${round(minutes)}분 동안 노출된 것과 같은 피해를 8초로 압축`,
    };
  }
  return { headline: '', detail: '' };
}
