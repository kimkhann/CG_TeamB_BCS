/**
 * [B · Simulation] Earthquake — the ground really shakes, and each story takes seismic force (story mass × height)
 *
 * ── 1. Shaking (visual + physics) ──────────────────────────────────
 *   While the quake lasts, standing parts become KINEMATIC bodies that move with the ground.
 *   offset  u(h, t) = d_g(t) · (1 + AMP · h / H)     (first mode: sway grows with height)
 *   d_g(t) = ground offset (two sine waves × envelope). Debris on the ground is shaken by friction with the moving ground.
 *   Afterwards standing parts return to their original position as STATIC bodies.
 *
 * ── 2. Damage (equivalent static method, simplified from KDS 41 17 00) ──
 *   ground acceleration  a_g(t) = PGA · envelope · waveform
 *                  PGA: from magnitude and epicentral distance via attenuation (Joyner & Boore 1981, sim/scenarioScale.js)
 *   building accel.  S_a(t) = 2.5 · a_g(t)          (short-period plateau of the design spectrum, 2.5)
 *   base shear      V = M · S_a                     (M: total mass of standing parts)
 *   story force     F_i = V · m_i·h_i / Σ m_j·h_j   (proportional to story mass × height, short period k = 1)
 *   story shear     V_i = Σ_{j ≥ i} F_j            (resisted by story i's columns and walls)
 *   story capacity  C_i = Σ τ · A · (member height / story height) · √(2μ − 1) · hp
 *                  τ: columns use flexural yield 2·Mp/h ÷ area (shearColumn), walls use shear strength (shearWall)
 *                  A: plan area
 *                  √(2μ − 1): ductility-based force reduction (Newmark–Hall, short period)
 *                  walls resist only along their length (no out-of-plane share); capacity drops as hp drops
 *   hp loss         Δhp/s = SEISMIC_RATE · (V_i / C_i − 1)   (when the story shear ratio exceeds 1)
 *   glass           above GLASS_RATIO, story drift starts breaking that story's glass
 *
 *   A story without walls, like a piloti ground floor, has a small C_i and fails first (soft story).
 */

import { EVENTS } from '../../core/events.js';
import { materialPhysics } from '../../data/materialPhysics.js';
import { massOf } from '../physics.js';
import { G } from '../impact.js';
import { earthquakePga } from '../scenarioScale.js';

export const DURATION = 8;
/** Spectral amplification on the short-period plateau */
export const SPECTRAL_AMP = 2.5;
/** hp lost per second per unit of story shear ratio above 1 */
export const SEISMIC_RATE = 1.5;
/** Story shear ratio at which glass starts breaking */
export const GLASS_RATIO = 0.5;
/** Ground offset (m) at PGA 0.5 g — larger than reality (a few cm) so it is visible */
const GROUND_DISPLACEMENT = 0.12;
/** How much more the roof sways than the ground */
const AMP = 1.5;
/** Ground motion: two sine waves with different periods (Hz) */
const WAVES = [
  { freq: 1.6, weight: 0.65 },
  { freq: 0.9, weight: 0.35 },
];
const GROUP_REFRESH = 0.25;

/** 0 → 1 (1 s) → 1 (4 s) → 0 (3 s) */
export function envelope(t) {
  if (t < 1) return t;
  if (t < 5) return 1;
  return Math.max(0, (DURATION - t) / 3);
}

/** One part's contribution to story shear capacity (kN) — direction 'x' | 'z' */
export function shearCapacity(part, axis, storyHeight) {
  const phys = materialPhysics[part.material];
  const tau = (part.kind === 'column' ? phys?.shearColumn : phys?.shearWall) ?? 0;
  if (!tau) return 0;
  const [sx, sy, sz] = part.size;
  if (part.kind === 'wall') {
    const alongX = sx >= sz;
    if ((axis === 'x') !== alongX) return 0; // 면외 방향은 버티지 못함
  }
  const area = sx * sz;
  const heightShare = Math.min(1, sy / storyHeight);
  const ductility = Math.sqrt(2 * (phys.ductility ?? 1) - 1);
  return tau * 1000 * area * heightShare * ductility * Math.max(0, part.hp);
}

const isVertical = (part) => part.kind === 'column' || part.kind === 'wall';

export function runEarthquake(ctx, scenario) {
  const pgaG = earthquakePga(scenario);
  const pga = pgaG * G;
  // visible sway: 0.12 m at 0.5 g, capped at 0.3 m
  const shake = Math.min(2.5, pgaG / 0.5);
  const amplitude = GROUND_DISPLACEMENT * shake;
  const energy = Math.min(1, shake);
  const phase = WAVES.map(() => [ctx.random() * Math.PI * 2, ctx.random() * Math.PI * 2]);
  const wave = (t, k) =>
    WAVES.reduce((s, w, i) => s + w.weight * Math.sin(2 * Math.PI * w.freq * t + phase[i][k]), 0);

  // story data: heights (h_i) and story heights fixed from the starting positions
  const floors = new Map();
  for (const part of ctx.parts) {
    if (!ctx.isAlive(part) || part.kind === 'fragment') continue;
    const top = part.position[1] + part.size[1] / 2;
    const bottom = part.position[1] - part.size[1] / 2;
    const f = floors.get(part.floor) ?? { top: 0, bottom: Infinity };
    f.top = Math.max(f.top, top);
    if (isVertical(part)) f.bottom = Math.min(f.bottom, bottom);
    floors.set(part.floor, f);
  }
  const height = Math.max(...[...floors.values()].map((f) => f.top), 1);
  for (const f of floors.values()) f.storyHeight = Math.max(1, f.top - Math.min(f.bottom, f.top));

  const shaking = ctx.startShaking();
  let elapsed = 0;
  let refresh = GROUP_REFRESH;
  let groups = [];
  let dust = 0;
  ctx.emit(EVENTS.IMPACT, { position: [0, 0.2, 0], energy, kind: 'explosion' });

  /** Recompute per-story mass, members and capacity (they change as parts break) */
  function regroup() {
    const byFloor = new Map();
    for (const part of ctx.parts) {
      if (!ctx.isAlive(part)) continue;
      const g = byFloor.get(part.floor) ?? { floor: part.floor, mass: 0, members: [], glass: [] };
      g.mass += massOf(part);
      if (isVertical(part)) g.members.push(part);
      if (part.material === 'window' || part.material === 'curtain') g.glass.push(part);
      byFloor.set(part.floor, g);
    }
    groups = [...byFloor.values()].sort((a, b) => b.floor - a.floor); // top story first
    for (const g of groups) {
      const info = floors.get(g.floor) ?? { top: height, storyHeight: 3 };
      g.h = info.top;
      g.capX = g.members.reduce((s, p) => s + shearCapacity(p, 'x', info.storyHeight), 0);
      g.capZ = g.members.reduce((s, p) => s + shearCapacity(p, 'z', info.storyHeight), 0);
    }
  }

  ctx.addOngoing((dt) => {
    elapsed += dt;
    const env = envelope(elapsed);

    // ① shaking: ground offset amplified with height
    const dx = amplitude * env * wave(elapsed, 0);
    const dz = amplitude * env * 0.4 * wave(elapsed, 1);
    shaking.move(dt, (y) => {
      const k = 1 + (AMP * Math.max(0, y)) / height;
      return [dx * k, dz * k];
    });

    // ② per-story damage from equivalent static seismic forces
    refresh += dt;
    if (refresh >= GROUP_REFRESH) {
      refresh = 0;
      regroup();
    }
    const ax = SPECTRAL_AMP * pga * env * wave(elapsed, 0);
    const az = SPECTRAL_AMP * pga * env * 0.4 * wave(elapsed, 1);
    const sumMH = groups.reduce((s, g) => s + g.mass * g.h, 0) || 1;
    const totalMass = groups.reduce((s, g) => s + g.mass, 0);
    let shearX = 0;
    let shearZ = 0;
    for (const g of groups) {
      const share = (g.mass * g.h) / sumMH;
      shearX += totalMass * Math.abs(ax) * share; // accumulated from the top → story shear
      shearZ += totalMass * Math.abs(az) * share;
      const rx = g.capX > 0 ? shearX / g.capX : shearX > 0 ? 10 : 0;
      const rz = g.capZ > 0 ? shearZ / g.capZ : shearZ > 0 ? 10 : 0;
      g.ratio = Math.max(rx, rz);
      for (const part of g.members) {
        let r = rx;
        if (part.kind === 'column') r = Math.max(rx, rz);
        else if (part.size[2] > part.size[0]) r = rz;
        if (r > 1) ctx.damageRaw(part, SEISMIC_RATE * (r - 1) * dt);
      }
      if (g.ratio > GLASS_RATIO) {
        for (const glass of g.glass) {
          if (ctx.random() < (g.ratio - GLASS_RATIO) * dt) ctx.damageRaw(glass, 1);
        }
      }
    }

    // dust near the ground while shaking hard
    dust += dt;
    if (dust > 0.6 && env > 0.5) {
      dust = 0;
      ctx.emit(EVENTS.IMPACT, {
        position: [(ctx.random() - 0.5) * 8, 0.2, (ctx.random() - 0.5) * 8],
        energy: 0.4 * energy,
        kind: 'collision',
      });
    }

    if (elapsed >= DURATION) {
      shaking.stop();
      return true;
    }
    return false;
  });
}
