/**
 * [B · 시뮬레이션] 지진 — 지면이 실제로 흔들리고, 층마다 지진력(층 질량 × 높이)으로 피해
 *
 * ── 1. 흔들림 (화면 · 물리) ─────────────────────────────────────
 *   지진이 이어지는 동안 서 있는 부재를 KINEMATIC 강체로 바꿔 지면과 함께 움직입니다.
 *   변위   u(h, t) = d_g(t) · (1 + AMP · h / H)     (1차 모드: 높이에 비례해 크게 흔들림)
 *   d_g(t) = 지면 변위 (두 주기의 사인파 합 × 포락선). 땅에 떨어진 잔해도 움직이는 지면 마찰로 흔들림.
 *   끝나면 서 있는 부재를 원래 위치 · 고정(STATIC) 강체로 되돌립니다.
 *
 * ── 2. 피해 (등가정적해석, KDS 41 17 00 의 방식을 단순화) ──────────
 *   지반 가속도     a_g(t) = PGA · 포락선 · 파형,  PGA = 0.5 g × 세기
 *   건물 가속도     S_a(t) = 2.5 · a_g(t)          (설계응답스펙트럼 단주기 구간 증폭 2.5)
 *   밑면 전단력     V = M · S_a                     (M: 서 있는 부재 전체 질량)
 *   층 지진력       F_i = V · m_i·h_i / Σ m_j·h_j   (층 질량 × 높이에 비례, 단주기 건물 k = 1)
 *   층 전단력       V_i = Σ_{j ≥ i} F_j            (i층 기둥 · 벽이 함께 버팀)
 *   층 전단 내력    C_i = Σ τ · A · (부재 높이 / 층 높이) · √(2μ − 1) · hp
 *                  τ: 기둥은 휨 항복 기준 2·Mp/h ÷ 단면적 (shearColumn), 벽은 전단강도 (shearWall)
 *                  A: 수평 단면적
 *                  √(2μ − 1): 연성에 의한 지진력 감소 (Newmark–Hall, 단주기)
 *                  벽은 길이 방향으로만 버팀 (면외 방향 기여 0), hp 가 줄면 내력도 줄어듦
 *   체력 감소       Δhp/초 = SEISMIC_RATE · (V_i / C_i − 1)   (층 전단비가 1을 넘을 때)
 *   유리            층 전단비가 GLASS_RATIO 를 넘으면 층간 변형으로 그 층 유리가 깨지기 시작
 *
 *   필로티 1층처럼 벽이 없는 층은 C_i 가 작아 먼저 무너집니다 (연약층).
 */

import { EVENTS } from '../../core/events.js';
import { materialPhysics } from '../../data/materialPhysics.js';
import { massOf } from '../physics.js';
import { G } from '../impact.js';

export const DURATION = 8;
/** 세기 1 일 때 최대 지반 가속도 (g) */
export const PGA_PER_INTENSITY = 0.5;
/** 단주기 구간 스펙트럼 증폭 */
export const SPECTRAL_AMP = 2.5;
/** 층 전단비 초과분 1당 초당 체력 감소 */
export const SEISMIC_RATE = 1.5;
/** 유리가 깨지기 시작하는 층 전단비 */
export const GLASS_RATIO = 0.5;
/** 세기 1 일 때 지면 변위 (m) — 화면에서 보이도록 실제(수 cm)보다 키운 값 */
const GROUND_DISPLACEMENT = 0.12;
/** 지붕이 지면보다 더 흔들리는 비율 */
const AMP = 1.5;
/** 지진 파형: 주기가 다른 두 사인파 (Hz) */
const WAVES = [
  { freq: 1.6, weight: 0.65 },
  { freq: 0.9, weight: 0.35 },
];
const GROUP_REFRESH = 0.25;

/** 0 → 1 (1초) → 1 (4초) → 0 (3초) */
export function envelope(t) {
  if (t < 1) return t;
  if (t < 5) return 1;
  return Math.max(0, (DURATION - t) / 3);
}

/** 부재 하나의 층 전단 내력 기여 (kN) — 방향 'x' | 'z' */
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

export function runEarthquake(ctx, { intensity }) {
  const pga = PGA_PER_INTENSITY * G * intensity;
  const amplitude = GROUND_DISPLACEMENT * intensity;
  const phase = WAVES.map(() => [ctx.random() * Math.PI * 2, ctx.random() * Math.PI * 2]);
  const wave = (t, k) =>
    WAVES.reduce((s, w, i) => s + w.weight * Math.sin(2 * Math.PI * w.freq * t + phase[i][k]), 0);

  // 층 정보: 높이(h_i)와 층 높이는 시작 시점 위치로 고정
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
  ctx.emit(EVENTS.IMPACT, { position: [0, 0.2, 0], energy: intensity, kind: 'explosion' });

  /** 층별 질량 · 부재 · 내력 다시 계산 (부재가 부서지면 질량과 내력이 바뀜) */
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
    groups = [...byFloor.values()].sort((a, b) => b.floor - a.floor); // 위층부터
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

    // ① 흔들림: 지면 변위와 높이별 증폭
    const dx = amplitude * env * wave(elapsed, 0);
    const dz = amplitude * env * 0.4 * wave(elapsed, 1);
    shaking.move(dt, (y) => {
      const k = 1 + (AMP * Math.max(0, y)) / height;
      return [dx * k, dz * k];
    });

    // ② 등가정적 지진력으로 층별 피해
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
      shearX += totalMass * Math.abs(ax) * share; // 위층부터 누적 → 층 전단력
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

    // 강하게 흔들리는 동안 바닥에서 먼지
    dust += dt;
    if (dust > 0.6 && env > 0.5) {
      dust = 0;
      ctx.emit(EVENTS.IMPACT, {
        position: [(ctx.random() - 0.5) * 8, 0.2, (ctx.random() - 0.5) * 8],
        energy: 0.4 * intensity,
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
