/**
 * [B · 시뮬레이션] 재료별 물성 값
 *
 * 키는 data/ids.js 의 재료 ID와 같아야 합니다.
 *
 * ── 시나리오용 상대값 (베이스부터 사용) ──────────────────────────
 * density        밀도 (t/m³, 부재 상자 부피 기준) — 부재 질량 = 밀도 × 부피
 * strength       강도 배율 — 시나리오(충격·폭발·화재) 피해량을 이 값으로 나눔
 * fireResistance 내화성 (0 ~ 1) — 클수록 화재에 강함
 * fragments      기능을 잃었을 때 쪼개지는 조각 수
 * friction       마찰 계수
 *
 * ── 충돌 · 잔해 하중 모델용 실측 기반 값 (sim/impact.js) ──────────
 * sigma        강도 σ (MPa)        — 콘크리트·조적: 압축강도, 강재: 항복강도, 목재·유리: 휨강도
 * modulus      탄성계수 E (GPa)
 * ductility    연성 계수 μ          — 탄성 한계 이후 파괴까지 흡수하는 에너지 배율 (가정값)
 * solid        실체 비율            — 부재 상자 부피 중 실제 재료가 차지하는 비율 (H형강 · 목조 장선 · 유리 두께)
 * shearColumn  기둥 1개가 버티는 층 전단력 ÷ 기둥 상자 수평 단면적 (MPa) — 휨 항복 기준 2·Mp / h
 * shearWall    벽의 등가 전단강도 (MPa, 벽 상자 수평 단면 기준) — 지진 층 전단 내력 (sim/scenarios/earthquake.js)
 * restitution  반발 계수 e          — 충돌 에너지 중 튕겨 나가는 비율은 e², 나머지는 부재가 흡수
 *
 * ── B-4 보정 (실제 기준) ──────────────────────────────────────
 * density        = 실제 재료 밀도 × solid (부재 상자 부피 기준이므로 빈 공간 비율을 곱함)
 * fireResistance = 1 − 10분 / 내화 시간  → 화재 피해 속도가 내화 시간에 반비례 (10분 이하면 0)
 * fragments      = 파괴 양상: 철골은 휘어질 뿐 쪼개지지 않음(1), 조적은 벽돌 단위로 흩어짐(4)
 * strength · sigma 등 강도 값은 그대로 유지
 *
 * 값의 근거는 src/sim/B_NOTES.md 의 "재료 값의 근거" 표를 보세요.
 */

export const materialPhysics = {
  // 콘크리트 fck 24 MPa, Ec = 8500·∛(fck+4) ≈ 25.8 GPa (KDS 14 20 10), 철근 보강으로 μ = 4
  // 밀도 24 kN/m³ (KDS 41 10 15) · 내화 3시간(주요 구조부, 피복 확보) · 철근에 묶인 덩어리로 부서짐(3)
  rc: {
    density: 2.4,
    strength: 1.0,
    fireResistance: 0.94,
    fragments: 3,
    friction: 0.6,
    sigma: 24,
    modulus: 25.8,
    ductility: 4,
    solid: 1,
    shearColumn: 0.7,
    shearWall: 1.8,
    restitution: 0.15,
  },
  // SS275 fy 275 MPa, E 205 GPa (KDS 14 31 10), 연성 μ = 8, H-400×400 단면적/외곽 상자 ≈ 0.14
  // 밀도 7.85 × 0.14 ≈ 1.1 · 무피복 강재 임계온도(약 550℃) 도달 약 20분 · 휘어질 뿐 쪼개지지 않음(1)
  steel: {
    density: 1.1,
    strength: 1.4,
    fireResistance: 0.5,
    fragments: 1,
    friction: 0.4,
    sigma: 275,
    modulus: 205,
    ductility: 8,
    solid: 0.14,
    shearColumn: 4.6,
    shearWall: 4.6,
    restitution: 0.3,
  },
  // 구조용 목재 C24: 휨강도 24 MPa, E 11 GPa (EN 338), 취성에 가까워 μ = 1.5, 장선 바닥 실체 비율 0.6
  // 밀도 C24 평균 0.42 × 0.6 ≈ 0.25 · 경골 목조 약 30분 (탄화 속도 0.65~0.8 mm/분, EN 1995-1-2) · 접합부에서 쪼개짐(2)
  wood: {
    density: 0.25,
    strength: 0.5,
    fireResistance: 0.67,
    fragments: 2,
    friction: 0.7,
    sigma: 24,
    modulus: 11,
    ductility: 1.5,
    solid: 0.6,
    shearColumn: 0.05,
    shearWall: 0.06,
    restitution: 0.4,
  },
  // 점토벽돌 조적: f'm 10 MPa, Em = 700·f'm = 7 GPa (TMS 402), 취성 μ = 1
  // 밀도 약 19 kN/m³ · 190mm 조적벽 약 2시간 · 벽돌 단위로 흩어짐(4)
  brick: {
    density: 1.9,
    strength: 0.6,
    fireResistance: 0.92,
    fragments: 4,
    friction: 0.7,
    sigma: 10,
    modulus: 7,
    ductility: 1,
    solid: 1,
    shearColumn: 0.1,
    shearWall: 0.2,
    restitution: 0.15,
  },
  // 샌드위치 패널(얇은 강판 + 단열재 심재)의 등가값 — 공학 기준값이 아닌 추정값
  // 밀도 심재 포함 약 20 kg/m² ÷ 벽 두께 0.2 m = 0.1 · 비내화 샌드위치 패널 10분 이하
  panel: {
    density: 0.1,
    strength: 0.3,
    fireResistance: 0.0,
    fragments: 2,
    friction: 0.5,
    sigma: 1,
    modulus: 0.3,
    ductility: 2,
    solid: 1,
    shearColumn: 0.05,
    shearWall: 0.05,
    restitution: 0.1,
  },
  // 판유리: 특성 휨강도 45 MPa, E 70 GPa (EN 572), 취성 μ = 1, 창 상자 중 유리 두께 비율 0.1
  // 밀도 2.5 × 0.1 = 0.25 · 일반 판유리는 화재 시 수 분 ~ 12분 내 깨짐 · 유리는 조각 대신 깨짐 이펙트(B-3)
  window: {
    density: 0.25,
    strength: 0.2,
    fireResistance: 0.17,
    fragments: 1,
    friction: 0.3,
    sigma: 45,
    modulus: 70,
    ductility: 1,
    solid: 0.1,
    shearColumn: 0,
    shearWall: 0,
    restitution: 0.5,
  },
  // 커튼월 복층 · 접합 유리: 같은 유리, 두께 비율 0.15
  // 밀도 2.5 × 0.15 ≈ 0.38 · 내화 성능은 판유리와 같음
  curtain: {
    density: 0.38,
    strength: 0.2,
    fireResistance: 0.17,
    fragments: 1,
    friction: 0.3,
    sigma: 45,
    modulus: 70,
    ductility: 1,
    solid: 0.15,
    shearColumn: 0,
    shearWall: 0,
    restitution: 0.5,
  },
};
