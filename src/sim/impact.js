/**
 * [B · 시뮬레이션] 충돌 피해 · 잔해 하중 모델 (순수 함수 — 물리 엔진과 무관하게 테스트 가능)
 *
 * 단위: 질량 t(톤), 속도 m/s, 에너지 kJ (= t·m²/s²), 힘 kN, 응력 MPa, 탄성계수 GPa, 길이 m
 *
 * ── 1. 충돌 피해 ───────────────────────────────────────────────
 *   충돌 에너지       E  = ½ · m · vₙ²                       (vₙ: 접촉면 수직 방향 충돌 속도)
 *   흡수 에너지       Eₐ = E · (1 − e²)                       (e: 맞은 부재 재료의 반발 계수)
 *   맞은 부재 몫      Eₜ = Eₐ · SHARE                         (두 물체가 나눠 흡수, SHARE = 0.5)
 *   흡수 능력         U  = u · V,  u = σ² / (2E) · μ · solid  (변형 에너지 밀도 × 연성 × 실체 비율)
 *   체력 감소         Δhp = Eₜ · f(위치, 방향) / U
 *
 * ── 2. 충돌 위치 · 방향 계수 f ──────────────────────────────────
 *   보 · 판의 휨 모멘트는 집중하중 위치 ξ(0~1, 지점 → 반대 지점)에 따라 M(ξ) ∝ ξ(1−ξ),
 *   가운데(ξ = 0.5)에서 최대입니다. 이를 b(ξ) = 4ξ(1−ξ) (0~1)로 정규화해 씁니다.
 *   지점 근처는 휨 대신 전단이 지배하므로 바닥값을 둡니다.
 *     보                         f = 0.4 + 0.6 · b(ξ_길이)
 *     판(바닥 · 지붕 · 벽 · 창)  면에 수직 충돌: f = 0.4 + 0.6 · b(ξ₁) · b(ξ₂)
 *                                면을 따라 스치는 충돌: f = 0.4
 *     기둥                       위에서 누르는 축방향 충돌: f = 0.35 (기둥은 축하중용으로 설계됨)
 *                                옆에서 치는 충돌: f = 0.5 + 1.0 · b(ξ_높이) (휨에 약함, 최대 1.5)
 *
 * ── 3. 쌓인 잔해 하중 ──────────────────────────────────────────
 *   모든 수평 부재는 설계하중(KDS 41 10 15 주거 활하중 L = 2.0 kN/m²)을 견디도록 설계되었다고 가정
 *     고정하중   D = 밀도 · g · 두께
 *     붕괴 내력  q_u = γ · (1.2D + 1.6L)                   (γ = 1.8: 강도감소계수 · 재료 초과강도 · 여유)
 *     여유 하중  q_r = q_u − D                             (자기 무게를 빼고 더 얹을 수 있는 하중)
 *     내력       C = q_r · 평면 면적
 *   잔해 무게 W 가 C 를 넘으면 초과 비율만큼 서서히 부서짐:  Δhp/초 = OVERLOAD_RATE · (W/C − 1)
 *
 * 근거와 한계는 src/sim/B_NOTES.md 를 보세요.
 */

export const G = 9.81;
/** 충돌 에너지 중 맞은 부재가 흡수하는 몫 (나머지는 떨어진 부재가 흡수) */
export const SHARE = 0.5;
/** 이보다 느린 충돌(m/s)은 무시 — 서로 기대어 미세하게 떨리는 접촉 제외 */
export const MIN_IMPACT_SPEED = 1.0;
/** 설계 활하중 (kN/m², KDS 41 10 15 주거용) */
export const LIVE_LOAD = 2.0;
/** 하중계수 조합 1.2D + 1.6L 에 곱하는 붕괴 여유 배율 */
export const COLLAPSE_MARGIN = 1.8;
/** 하중 초과 시 초당 체력 감소 배율 (50% 초과 → 1초에 체력 1 감소) */
export const OVERLOAD_RATE = 2.0;

const bend = (xi) => 4 * xi * (1 - xi);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** 재료의 단위 부피당 흡수 능력 u (kJ/m³) = σ²/(2E) · μ · solid  (σ MPa, E GPa → kJ/m³) */
export function energyDensity(phys) {
  if (!phys?.sigma || !phys?.modulus) return 10;
  return (
    ((phys.sigma * phys.sigma) / (2 * phys.modulus)) * (phys.ductility ?? 1) * (phys.solid ?? 1)
  );
}

/** 부재 하나의 흡수 능력 U (kJ) */
export function energyCapacity(part, phys) {
  const volume = part.size[0] * part.size[1] * part.size[2];
  return Math.max(0.05, energyDensity(phys) * volume);
}

/** 충돌로 맞은 부재가 흡수하는 에너지 Eₜ (kJ) */
export function absorbedEnergy(mass, normalSpeed, targetPhys) {
  const e = targetPhys?.restitution ?? 0.2;
  return 0.5 * mass * normalSpeed * normalSpeed * (1 - e * e) * SHARE;
}

/** 쿼터니언 q의 역회전을 벡터 v에 적용 (월드 → 부재 로컬) */
function toLocal(v, q) {
  const [x, y, z, w] = q;
  // q⁻¹ · v · q  (단위 쿼터니언이므로 역 = 켤레)
  const ix = w * v[0] - y * v[2] + z * v[1];
  const iy = w * v[1] - z * v[0] + x * v[2];
  const iz = w * v[2] - x * v[1] + y * v[0];
  const iw = x * v[0] + y * v[1] + z * v[2];
  return [
    ix * w + iw * x - iy * z + iz * y,
    iy * w + iw * y - iz * x + ix * z,
    iz * w + iw * z - ix * y + iy * x,
  ];
}

/**
 * 충돌 위치 · 방향 계수 f
 * @param {import('../core/types.js').Part} part  맞은 부재
 * @param {[number,number,number]} point   충돌 지점 (월드 좌표)
 * @param {[number,number,number]} normal  충돌 방향 단위벡터 (월드 좌표)
 */
export function locationFactor(part, point, normal) {
  const rel = [
    point[0] - part.position[0],
    point[1] - part.position[1],
    point[2] - part.position[2],
  ];
  const local = toLocal(rel, part.quaternion);
  const n = toLocal(normal, part.quaternion);
  const xi = local.map((v, a) => clamp01((v + part.size[a] / 2) / part.size[a]));

  if (part.kind === 'column') {
    const axial = Math.abs(n[1]) > 0.7;
    return axial ? 0.35 : 0.5 + 1.0 * bend(xi[1]);
  }

  // 가장 얇은 축 = 두께 방향, 나머지 두 축 = 판의 평면 (보는 가장 긴 축 = 길이 방향)
  const order = [0, 1, 2].sort((a, b) => part.size[a] - part.size[b]);
  const [thin, mid, long] = order;
  if (part.kind === 'beam') return 0.4 + 0.6 * bend(xi[long]);

  const outOfPlane = Math.abs(n[thin]) > 0.7;
  if (!outOfPlane) return 0.4;
  return 0.4 + 0.6 * bend(xi[mid]) * bend(xi[long]);
}

/** 충돌 한 번의 체력 감소량 */
export function impactDamage({ mass, normalSpeed, target, targetPhys, point, normal }) {
  if (normalSpeed < MIN_IMPACT_SPEED) return 0;
  const energy = absorbedEnergy(mass, normalSpeed, targetPhys);
  return (energy * locationFactor(target, point, normal)) / energyCapacity(target, targetPhys);
}

/** 수평 부재(바닥판 · 지붕판 · 보 · 수평 장식판)인지 — 잔해 하중 판정 대상 */
export function isHorizontalMember(part) {
  if (part.kind === 'slab' || part.kind === 'roof' || part.kind === 'beam') return true;
  if (part.kind === 'column' || part.kind === 'fragment') return false;
  const thin = [0, 1, 2].reduce((a, b) => (part.size[b] < part.size[a] ? b : a), 0);
  return thin === 1;
}

/** 수평 부재가 자기 무게 외에 더 버틸 수 있는 하중 C (kN) */
export function reserveCapacity(part, phys) {
  const density = phys?.density ?? 1;
  const thickness = Math.min(...part.size);
  const deadLoad = density * G * thickness; // kN/m²
  const ultimate = COLLAPSE_MARGIN * (1.2 * deadLoad + 1.6 * LIVE_LOAD);
  const area = part.kind === 'column' ? 0 : planArea(part);
  return Math.max(0.5, (ultimate - deadLoad) * area);
}

/** 평면(위에서 본) 면적 m² — 회전은 무시한 근사 */
function planArea(part) {
  return part.size[0] * part.size[2];
}

/** 잔해 하중 W(kN)가 내력 C를 넘을 때 dt 동안의 체력 감소 */
export function overloadDamage(loadKN, capacityKN, dt) {
  if (loadKN <= capacityKN) return 0;
  return OVERLOAD_RATE * (loadKN / capacityKN - 1) * dt;
}
