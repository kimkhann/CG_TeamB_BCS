/**
 * [B · Simulation] Impact damage and debris load model (pure functions — testable without the physics engine)
 *
 * Units: mass t (tonnes), speed m/s, energy kJ (= t·m²/s²), force kN, stress MPa, modulus GPa, length m
 *
 * ── 1. Impact damage ──────────────────────────────────────────────
 *   Impact energy      E  = ½ · m · vₙ²                       (vₙ: impact speed normal to the contact)
 *   Absorbed energy    Eₐ = E · (1 − e²)                       (e: restitution of the target material)
 *   Target's share     Eₜ = Eₐ · SHARE                         (both bodies absorb it, SHARE = 0.5)
 *   Energy capacity    U  = u · V,  u = σ² / (2E) · μ · solid  (strain energy density × ductility × solid ratio)
 *   hp loss            Δhp = Eₜ · f(location, direction) / U
 *
 * ── 2. Location / direction factor f ────────────────────────────────
 *   The bending moment of a beam or plate under a point load at ξ (0–1, support → opposite support) is M(ξ) ∝ ξ(1−ξ),
 *   largest at mid-span (ξ = 0.5). It is normalized as b(ξ) = 4ξ(1−ξ) (0–1).
 *   Near supports shear governs instead of bending, so there is a floor value.
 *     beam                         f = 0.4 + 0.6 · b(ξ_length)
 *     plate (slab, roof, wall, window)  out-of-plane hit: f = 0.4 + 0.6 · b(ξ₁) · b(ξ₂)
 *                                in-plane glancing hit: f = 0.4
 *     column                       axial hit from above: f = 0.35 (columns are designed for axial load)
 *                                lateral hit: f = 0.5 + 1.0 · b(ξ_height) (weak in bending, up to 1.5)
 *
 * ── 3. Piled debris load ───────────────────────────────────────────
 *   Every horizontal member is assumed designed for the code load (KDS 41 10 15 residential live load L = 2.0 kN/m²)
 *     dead load        D = density · g · thickness
 *     collapse load    q_u = γ · (1.2D + 1.6L)                   (γ = 1.8: strength reduction · material overstrength · margin)
 *     reserve load     q_r = q_u − D                             (load it can carry beyond its own weight)
 *     capacity         C = q_r · plan area
 *   When debris weight W exceeds C, the member breaks gradually:  Δhp/s = OVERLOAD_RATE · (W/C − 1)
 *
 * Sources and limits: src/sim/B_NOTES.md.
 */

export const G = 9.81;
/** Share of the impact energy absorbed by the target (the falling part absorbs the rest) */
export const SHARE = 0.5;
/** Impacts slower than this (m/s) are ignored — excludes jittering contacts between resting parts */
export const MIN_IMPACT_SPEED = 1.0;
/** Design live load (kN/m², KDS 41 10 15 residential) */
export const LIVE_LOAD = 2.0;
/** Collapse margin applied to the 1.2D + 1.6L load combination */
export const COLLAPSE_MARGIN = 1.8;
/** hp lost per second per unit of overload (50% over → 1 hp per second) */
export const OVERLOAD_RATE = 2.0;

const bend = (xi) => 4 * xi * (1 - xi);
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Energy capacity per unit volume u (kJ/m³) = σ²/(2E) · μ · solid  (σ MPa, E GPa → kJ/m³) */
export function energyDensity(phys) {
  if (!phys?.sigma || !phys?.modulus) return 10;
  return (
    ((phys.sigma * phys.sigma) / (2 * phys.modulus)) * (phys.ductility ?? 1) * (phys.solid ?? 1)
  );
}

/** Energy capacity U of one part (kJ) */
export function energyCapacity(part, phys) {
  const volume = part.size[0] * part.size[1] * part.size[2];
  return Math.max(0.05, energyDensity(phys) * volume);
}

/** Energy Eₜ absorbed by the hit part (kJ) */
export function absorbedEnergy(mass, normalSpeed, targetPhys) {
  const e = targetPhys?.restitution ?? 0.2;
  return 0.5 * mass * normalSpeed * normalSpeed * (1 - e * e) * SHARE;
}

/** Rotates v by the unit quaternion (x, y, z, w): v' = v + 2w(u×v) + 2u×(u×v), u = (x, y, z) */
function rotate(v, x, y, z, w) {
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

/** Applies quaternion q to vector v (part local → world) */
export function toWorld(v, q) {
  return rotate(v, q[0], q[1], q[2], q[3]);
}

/** Applies the inverse of quaternion q to vector v (world → part local) */
export function toLocal(v, q) {
  return rotate(v, -q[0], -q[1], -q[2], q[3]);
}

/**
 * Location / direction factor f
 * @param {import('../core/types.js').Part} part  the part that was hit
 * @param {[number,number,number]} point   contact point (world)
 * @param {[number,number,number]} normal  unit impact direction (world)
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

  // thinnest axis = thickness, the other two = the plate's plane (for a beam the longest axis = its length)
  const order = [0, 1, 2].sort((a, b) => part.size[a] - part.size[b]);
  const [thin, mid, long] = order;
  if (part.kind === 'beam') return 0.4 + 0.6 * bend(xi[long]);

  const outOfPlane = Math.abs(n[thin]) > 0.7;
  if (!outOfPlane) return 0.4;
  return 0.4 + 0.6 * bend(xi[mid]) * bend(xi[long]);
}

/** hp lost from one impact */
export function impactDamage({ mass, normalSpeed, target, targetPhys, point, normal }) {
  if (normalSpeed < MIN_IMPACT_SPEED) return 0;
  const energy = absorbedEnergy(mass, normalSpeed, targetPhys);
  return (energy * locationFactor(target, point, normal)) / energyCapacity(target, targetPhys);
}

/**
 * Distance from a point to the part's box surface (rotation-aware). 0 if the point is inside.
 * @param {[number,number,number]} point
 */
export function distanceToBox(point, part) {
  const local = toLocal(
    [point[0] - part.position[0], point[1] - part.position[1], point[2] - part.position[2]],
    part.quaternion,
  );
  let sum = 0;
  for (let a = 0; a < 3; a++) {
    const d = Math.abs(local[a]) - part.size[a] / 2;
    if (d > 0) sum += d * d;
  }
  return Math.sqrt(sum);
}

/** Whether a part is a horizontal member (slab, roof, beam, horizontal decor) — subject to debris load */
export function isHorizontalMember(part) {
  if (part.kind === 'slab' || part.kind === 'roof' || part.kind === 'beam') return true;
  if (part.kind === 'column' || part.kind === 'fragment') return false;
  const thin = [0, 1, 2].reduce((a, b) => (part.size[b] < part.size[a] ? b : a), 0);
  return thin === 1;
}

/** Load C (kN) a horizontal member can carry beyond its own weight */
export function reserveCapacity(part, phys) {
  const density = phys?.density ?? 1;
  const thickness = Math.min(...part.size);
  const deadLoad = density * G * thickness; // kN/m²
  const ultimate = COLLAPSE_MARGIN * (1.2 * deadLoad + 1.6 * LIVE_LOAD);
  const area = part.kind === 'column' ? 0 : planArea(part);
  return Math.max(0.5, (ultimate - deadLoad) * area);
}

/** Plan area in m² (seen from above) — approximation ignoring rotation */
function planArea(part) {
  return part.size[0] * part.size[2];
}

/** hp lost over dt when debris load W (kN) exceeds capacity C */
export function overloadDamage(loadKN, capacityKN, dt) {
  if (loadKN <= capacityKN) return 0;
  return OVERLOAD_RATE * (loadKN / capacityKN - 1) * dt;
}
