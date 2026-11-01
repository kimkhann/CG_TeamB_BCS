/**
 * [B · 시뮬레이션] 재료별 물성 값
 *
 * 키는 data/ids.js 의 재료 ID와 같아야 합니다.
 * 🔧 임시 버전(베이스): 시연용 상대값입니다. 실제 공학 수치가 아닙니다.
 * TODO(B): 실제 재료 특성을 참고해 상대 비율 조정
 *
 * density        밀도 (t/m³) — 부재 질량 = 밀도 × 부피. 무게에 따른 충격에 쓰임
 * strength       강도 배율 — 피해량을 이 값으로 나눔 (클수록 튼튼)
 * fireResistance 내화성 (0 ~ 1) — 클수록 화재에 강함
 * fragments      기능을 잃었을 때 쪼개지는 조각 수
 * friction       마찰 계수
 */

export const materialPhysics = {
  rc: { density: 2.4, strength: 1.0, fireResistance: 0.85, fragments: 3, friction: 0.6 },
  steel: { density: 1.6, strength: 1.4, fireResistance: 0.4, fragments: 2, friction: 0.4 },
  wood: { density: 0.6, strength: 0.5, fireResistance: 0.1, fragments: 2, friction: 0.7 },
  brick: { density: 1.9, strength: 0.6, fireResistance: 0.8, fragments: 4, friction: 0.7 },
  panel: { density: 0.3, strength: 0.3, fireResistance: 0.3, fragments: 2, friction: 0.5 },
  window: { density: 0.8, strength: 0.2, fireResistance: 0.3, fragments: 1, friction: 0.3 },
  curtain: { density: 0.8, strength: 0.2, fireResistance: 0.3, fragments: 1, friction: 0.3 },
};
