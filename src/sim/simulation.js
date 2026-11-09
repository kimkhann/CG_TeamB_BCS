/**
 * [B · 시뮬레이션] 공개 함수: createSimulation(parts, { emit }) → Simulation
 *
 * 흐름: 시나리오가 부재에 피해 → 체력 0이면 기능 상실(조각으로 분리)
 *       → 구조 판단으로 받쳐지지 않는 부재를 찾아 물리 낙하로 전환 → 물리 엔진이 낙하 · 충돌 처리
 *
 * 부재 상태
 *   intact   멀쩡함 (고정 강체)
 *   damaged  피해를 입었지만 버팀 (고정 강체)
 *   failed   기능 상실 — 화면에서 사라지고 조각(fragment)으로 대체됨
 *   falling  지지를 잃고 떨어지는 중 (움직이는 강체)
 *   settled  떨어진 뒤 멈춤
 *
 * 무게에 따른 파괴 (B 단계, 모델 설명은 sim/impact.js · sim/B_NOTES.md)
 *   - 충돌 피해: 떨어지는 부재가 서 있는 부재(장식 포함)와 처음 부딪힐 때 충돌 에너지를
 *     맞은 부재의 흡수 능력과 비교해 체력을 깎음. 충돌 위치 · 방향에 따라 계수가 달라짐
 *   - 잔해 하중: 멈춘 잔해가 어느 부재 위에 얹혀 있는지 기록하고, 수평 부재에 쌓인 무게가
 *     설계 기준으로 계산한 여유 하중을 넘으면 서서히 부서짐
 *
 * TODO(B): 지진·화재 고도화(scenarios/), 결과 지표(results.js)
 */

import { EVENTS } from '../core/events.js';
import { createPart } from '../core/types.js';
import { materialPhysics } from '../data/materialPhysics.js';
import {
  CANNON,
  createWorld,
  createBodyForPart,
  makeDynamic,
  massOf,
  copyBodyToPart,
} from './physics.js';
import { buildDependents, isAlive, propagateSupport } from './structure.js';
import { createRandom } from './random.js';
import {
  G,
  MIN_IMPACT_SPEED,
  absorbedEnergy,
  impactDamage,
  distanceToBox,
  toWorld,
  isHorizontalMember,
  reserveCapacity,
  overloadDamage,
} from './impact.js';
import { computeResults } from './results.js';
import { SCENARIO_RUNNERS } from './scenarios/index.js';

/** 잔해 하중을 다시 계산하는 간격 (초) */
const LOAD_CHECK_INTERVAL = 0.25;
/** 먼지 이펙트: 이 에너지(kJ) 이상 충돌에서만, 초당 최대 개수 */
const EFFECT_MIN_ENERGY = 5;
const EFFECT_MAX_PER_SECOND = 8;
/** 유리 깨짐 이펙트: 초당 최대 개수 (한꺼번에 수십 장이 깨질 때 파티클 과부하 방지) */
const GLASS_EFFECT_MAX_PER_SECOND = 16;
/** 깨지는 유리로 처리하는 재료 */
const GLASS_MATERIALS = new Set(['window', 'curtain']);
const isGlass = (part) => GLASS_MATERIALS.has(part.material);
/** 이펙트 세기 1에 해당하는 충돌 에너지 (kJ) */
const EFFECT_FULL_ENERGY = 40;

/** 이 속도(m/s) 아래로 SETTLE_TIME 초 동안 머물면 멈춘 것으로 판단 */
const SETTLE_SPEED = 0.5;
const SETTLE_TIME = 0.8;
/** 멈춘 잔해가 이 속도(m/s)를 넘으면 다시 '떨어지는 중'으로 봄 (받침이 사라지면 0.1초 안에 넘음) */
const WAKE_SPEED = 1.0;
/** 멈춘 잔해에 주는 감쇠 — 쌓인 상자들이 미세하게 떨며 미끄러지는 것을 줄임 */
const SETTLED_DAMPING = { linear: 0.6, angular: 0.8 };
const MOVING_DAMPING = { linear: 0.08, angular: 0.25 };

/**
 * @typedef {Object} Simulation
 * @property {(scenario:import('../core/types.js').Scenario)=>void} runScenario
 * @property {(dt:number)=>void} step
 * @property {()=>import('../core/types.js').SimResults} getResults
 * @property {()=>void} dispose
 */

/**
 * @param {import('../core/types.js').Part[]} parts  생성기가 만든 부재 배열 (조각이 생기면 여기에 추가됨)
 * @param {{ emit:(name:string, payload?:any)=>void, seed?:number }} options
 * @returns {Simulation}
 */
export function createSimulation(parts, { emit, seed }) {
  const world = createWorld();
  const random = createRandom(seed);
  /** @type {Map<string, import('../core/types.js').Part>} */
  const byId = new Map(parts.map((p) => [p.id, p]));

  let time = 0;
  let firstFailedPartId = null;
  /** B-6 결과용: 시나리오 시작 시각, 마지막으로 부재가 무너진 시각, 원인별 체력 감소 합 */
  let scenarioStart = null;
  let lastCollapseAt = null;
  const damageByCause = { scenario: 0, collision: 0, debris: 0 };
  /** 지진으로 흔들리는 중인지 (서 있는 부재가 KINEMATIC) */
  let shakingActive = false;
  let scenarioActive = false;
  let finishedEmitted = false;
  /** 시간이 흐르며 계속 작용하는 효과 (예: 화재). (dt) => 끝났으면 true */
  const ongoing = [];

  // 모든 부재(장식 포함)에 고정 강체를 붙여 둡니다.
  // 떨어지는 부재가 서 있는 기둥 · 바닥 · 벽 · 창 · 난간과 부딪혀 피해를 줄 수 있게.
  for (const part of parts) {
    part.sim = { body: createBodyForPart(part), stillTime: 0, restingOn: null };
    world.addBody(part.sim.body);
  }

  /** 부재 → 그 부재가 받쳐 주는 부재 (기둥 횡지지 판단용, 처음 부재 기준 — 조각은 아무것도 받치지 않음) */
  const dependents = buildDependents(parts);

  /** 이번 단계에 일어난 충돌 (물리 계산 도중에는 강체를 지울 수 없어 모았다가 단계 후 처리) */
  const impactQueue = [];
  let loadTimer = 0;
  let effectBudget = EFFECT_MAX_PER_SECOND;
  let glassBudget = GLASS_EFFECT_MAX_PER_SECOND;
  let effectTimer = 0;

  /** 움직이는 강체의 첫 충돌을 기록합니다. (cannon-es 의 collide 는 처음 닿을 때만 발생) */
  function onCollide(event) {
    const self = event.target;
    const other = event.body;
    const contact = event.contact;
    const speed = Math.abs(contact.getImpactVelocityAlongNormal());
    if (speed < MIN_IMPACT_SPEED) return;
    const onOther = contact.bi === other;
    const base = onOther ? contact.bi.position : contact.bj.position;
    const r = onOther ? contact.ri : contact.rj;
    impactQueue.push({
      mass: self.mass,
      speed,
      targetId: other.userData?.partId ?? null, // 땅이면 null
      point: [base.x + r.x, base.y + r.y, base.z + r.z],
      normal: [contact.ni.x, contact.ni.y, contact.ni.z],
    });
  }

  function watchImpacts(body) {
    if (body.userData.watching) return;
    body.userData.watching = true;
    body.addEventListener('collide', onCollide);
  }

  /**
   * 체력을 직접 깎습니다 (재료 강도는 호출하는 쪽에서 이미 반영).
   * @param {'scenario'|'collision'|'debris'} cause  원인별 피해 집계용
   */
  function loseHp(part, amount, cause = 'scenario') {
    if (!part || !isAlive(part) || amount <= 0) return;
    damageByCause[cause] += Math.min(part.hp, amount);
    part.hp = Math.max(0, part.hp - amount);
    if (part.hp <= 0) fail(part);
    else part.state = 'damaged';
    emit(EVENTS.PART_DAMAGED, { partId: part.id, hp: part.hp });
  }

  function playCollisionEffect(point, energy) {
    if (energy < EFFECT_MIN_ENERGY || effectBudget <= 0) return;
    effectBudget--;
    emit(EVENTS.IMPACT, {
      position: point,
      energy: Math.min(1, energy / EFFECT_FULL_ENERGY),
      kind: 'collision',
    });
  }

  /** 모아 둔 충돌을 피해로 바꿉니다. 피해가 있었으면 true */
  function processImpacts() {
    let damaged = false;
    for (const hit of impactQueue) {
      const target = hit.targetId ? byId.get(hit.targetId) : null;
      const targetPhys = materialPhysics[target?.material ?? 'rc'];
      playCollisionEffect(hit.point, absorbedEnergy(hit.mass, hit.speed, targetPhys));
      if (!target || !isAlive(target)) continue; // 땅이나 이미 떨어진 부재는 피해 없음
      const amount = impactDamage({
        mass: hit.mass,
        normalSpeed: hit.speed,
        target,
        targetPhys,
        point: hit.point,
        normal: hit.normal,
      });
      if (amount > 0) {
        loseHp(target, amount, 'collision');
        damaged = true;
      }
    }
    impactQueue.length = 0;
    return damaged;
  }

  /** 멈춘 잔해가 어떤 부재 위에 얹혀 있는지 마지막 접촉으로 기록합니다. */
  let contactIndex = null;
  function contactsOf(body) {
    if (!contactIndex) {
      contactIndex = new Map();
      for (const c of world.contacts) {
        for (const [self, other, sign] of [
          [c.bi, c.bj, 1],
          [c.bj, c.bi, -1],
        ]) {
          if (!contactIndex.has(self)) contactIndex.set(self, []);
          // other 가 self 의 아래에 있으면 self → other 방향의 y 성분이 음수
          contactIndex.get(self).push({ other, down: c.ni.y * sign < -0.5 });
        }
      }
    }
    return contactIndex.get(body) ?? [];
  }
  function recordRest(part) {
    const below = new Set();
    for (const { other, down } of contactsOf(part.sim.body)) {
      const id = other.userData?.partId;
      if (down && id && id !== part.id) below.add(id);
    }
    part.sim.restingOn = below.size ? [...below] : null;
  }

  /** 쌓인 잔해 무게를 아래로 전달해 수평 부재의 하중 초과를 판정합니다. 피해가 있었으면 true */
  function checkDebrisLoads(interval) {
    const load = new Map(); // 부재 id → 얹힌 잔해 질량 (t)
    const route = (id, mass, depth) => {
      const p = byId.get(id);
      if (!p) return;
      if (isAlive(p)) {
        load.set(id, (load.get(id) ?? 0) + mass);
      } else if (
        (p.state === 'settled' || p.state === 'falling') &&
        p.sim.restingOn &&
        depth < 12
      ) {
        // 잔해 위의 잔해: 아래 잔해가 얹힌 곳으로 무게를 넘김
        const share = mass / p.sim.restingOn.length;
        for (const next of p.sim.restingOn) route(next, share, depth + 1);
      }
    };
    for (const p of parts) {
      // 거의 멈춘 채 얹혀 있는 '떨어지는 중' 잔해도 무게를 전달함 (완전히 멈출 때까지 기다리지 않음)
      if (p.state === 'falling' && p.sim.body.velocity.length() < SETTLE_SPEED) recordRest(p);
      if ((p.state !== 'settled' && p.state !== 'falling') || !p.sim.restingOn) continue;
      const share = p.sim.body.mass / p.sim.restingOn.length;
      for (const id of p.sim.restingOn) route(id, share, 0);
    }
    let damaged = false;
    for (const [id, mass] of load) {
      const part = byId.get(id);
      if (!isHorizontalMember(part)) continue;
      const amount = overloadDamage(
        mass * G,
        reserveCapacity(part, materialPhysics[part.material]),
        interval,
      );
      if (amount > 0) {
        loseHp(part, amount, 'debris');
        damaged = true;
      }
    }
    return damaged;
  }

  // ── 상태 변화 ──────────────────────────────────────

  /** 지지를 잃은 부재를 떨어뜨립니다. */
  function detach(part) {
    if (isGlass(part)) {
      shatter(part, 0.4); // 유리는 통째로 떨어지지 않고 지지를 잃는 순간 깨짐
      return;
    }
    part.state = 'falling';
    if (part.structural) lastCollapseAt = time; // 붕괴 진행 시간은 구조 부재 기준
    makeDynamic(part.sim.body, massOf(part));
    if (shakingActive) {
      part.sim.body.collisionFilterGroup = 1; // 흔들리는 부재(그룹 2)와 다시 충돌하도록
      part.sim.body.collisionFilterMask = -1;
    }
    watchImpacts(part.sim.body);
    const spin = 0.6;
    part.sim.body.angularVelocity.set(
      (random() - 0.5) * spin,
      (random() - 0.5) * spin,
      (random() - 0.5) * spin,
    );
    // 횡지지를 잃어 쓰러지는 기둥(아래 기둥은 멀쩡함): 위에 올려진 채 균형을 잡지 않도록 옆으로 기울임
    if (
      part.kind === 'column' &&
      part.supportedBy.some((id) => byId.has(id) && isAlive(byId.get(id)))
    ) {
      const tip = 1.2;
      part.sim.body.angularVelocity.set(
        random() < 0.5 ? -tip : tip,
        0,
        random() < 0.5 ? -tip : tip,
      );
    }
    emit(EVENTS.PART_DETACHED, { partId: part.id });
  }

  /**
   * 유리 깨짐: 강체를 만들지 않고 화면 효과로만 산산조각 냅니다.
   * 실제 판유리는 충격이나 지지 상실 시 큰 판으로 떨어지기보다 작은 조각으로 깨지며,
   * 유리 부재(창 · 커튼월 · 발코니 유리)는 건물의 15~20%를 차지해 강체 수를 크게 줄여 줍니다.
   */
  function shatter(part, energy) {
    part.state = 'failed';
    if (part.structural) lastCollapseAt = time; // 붕괴 진행 시간은 구조 부재 기준
    part.hp = 0;
    world.removeBody(part.sim.body);
    emit(EVENTS.PART_FAILED, { partId: part.id });
    if (glassBudget > 0) {
      glassBudget--;
      emit(EVENTS.IMPACT, {
        position: [...part.position],
        energy: Math.min(1, energy),
        kind: 'glass',
      });
    }
  }

  /** 체력이 0이 된 부재를 조각으로 나눕니다. */
  function fail(part) {
    if (isGlass(part)) {
      shatter(part, 0.7);
      return;
    }
    part.state = 'failed';
    part.hp = 0;
    if (part.structural) lastCollapseAt = time; // 붕괴 진행 시간은 구조 부재 기준
    if (part.sim.body) world.removeBody(part.sim.body);
    if (!firstFailedPartId && part.structural) firstFailedPartId = part.id;
    emit(EVENTS.PART_FAILED, { partId: part.id });

    const count = Math.max(1, materialPhysics[part.material]?.fragments ?? 2);
    const axis = part.size.indexOf(Math.max(...part.size)); // 가장 긴 방향으로 자름
    for (let k = 0; k < count; k++) {
      const size = [...part.size];
      size[axis] = (part.size[axis] / count) * 0.96;
      const offset = [0, 0, 0];
      offset[axis] = -part.size[axis] / 2 + (part.size[axis] / count) * (k + 0.5);
      // 부재가 기울어져 있으면(박공지붕 등) 조각 위치도 같은 방향으로 회전
      const local = toWorld(offset, part.quaternion);
      const fragment = createPart({
        id: `${part.id}-frag-${k}`,
        kind: 'fragment',
        floor: part.floor,
        material: part.material,
        size,
        position: [
          part.position[0] + local[0],
          part.position[1] + local[1],
          part.position[2] + local[2],
        ],
        quaternion: [...part.quaternion],
        structural: false,
        state: 'falling',
      });
      fragment.sim = { body: createBodyForPart(fragment), stillTime: 0, restingOn: null };
      world.addBody(fragment.sim.body);
      makeDynamic(fragment.sim.body, massOf(fragment));
      watchImpacts(fragment.sim.body);
      fragment.sim.body.velocity.set((random() - 0.5) * 2, 0.5, (random() - 0.5) * 2);
      parts.push(fragment);
      byId.set(fragment.id, fragment);
      emit(EVENTS.PART_ADDED, { part: fragment });
    }
  }

  // ── 시나리오가 쓰는 도구 모음 ────────────────────────
  const ctx = {
    parts,
    byId,
    random,
    emit,
    get time() {
      return time;
    },
    isAlive,

    /** 부재에 피해를 줍니다. amount: 0~1 (재료 강도로 나눠서 적용) */
    damage(part, amount) {
      if (!part || !isAlive(part)) return;
      const strength = materialPhysics[part.material]?.strength ?? 1;
      loseHp(part, amount / strength);
    },

    /** 재료 강도로 나누지 않고 체력을 깎습니다 (지진처럼 모델 안에서 이미 재료 내력을 반영한 경우). */
    damageRaw(part, amount) {
      loseHp(part, amount, 'scenario');
    },

    /**
     * 지면 흔들기 시작: 서 있는 부재를 KINEMATIC 강체로 바꿔 지면과 함께 움직이게 합니다.
     * @returns {{ move:(dt:number, offsetAt:(y:number)=>[number,number])=>void, stop:()=>void }}
     *   move: 높이 y 의 수평 변위 [dx, dz] 를 주는 함수로 이번 단계의 위치 · 속도를 정함
     *   stop: 살아 있는 부재를 원래 위치 · 고정 강체로 되돌림
     */
    startShaking() {
      const ground = world.ground;
      const origins = new Map();
      for (const part of parts) {
        if (!isAlive(part) || !part.sim?.body) continue;
        const body = part.sim.body;
        origins.set(part, [...part.position]);
        body.type = CANNON.Body.KINEMATIC;
        body.allowSleep = false;
        // 서로 맞닿은 KINEMATIC 부재끼리는 충돌 검사를 건너뜀 (그룹 2끼리 무시) — 떨어지는 잔해와는 충돌
        body.collisionFilterGroup = 2;
        body.collisionFilterMask = ~2;
        body.updateMassProperties();
      }
      ground.type = CANNON.Body.KINEMATIC;
      ground.collisionFilterGroup = 2;
      ground.collisionFilterMask = ~2;
      shakingActive = true;
      let groundPrev = [0, 0];
      return {
        move(dt, offsetAt) {
          for (const [part, origin] of origins) {
            if (!isAlive(part)) {
              origins.delete(part);
              continue;
            }
            const [ox, oz] = offsetAt(origin[1]);
            const body = part.sim.body;
            const x = origin[0] + ox;
            const z = origin[2] + oz;
            body.velocity.set((x - body.position.x) / dt, 0, (z - body.position.z) / dt);
            body.position.set(x, origin[1], z);
            part.position[0] = x;
            part.position[2] = z;
          }
          const g = offsetAt(0);
          ground.velocity.set((g[0] - groundPrev[0]) / dt, 0, (g[1] - groundPrev[1]) / dt);
          groundPrev = g;
        },
        stop() {
          for (const [part, origin] of origins) {
            if (!isAlive(part)) continue;
            const body = part.sim.body;
            part.position[0] = origin[0];
            part.position[2] = origin[2];
            body.position.set(...origin);
            body.velocity.set(0, 0, 0);
            body.type = CANNON.Body.STATIC;
            body.allowSleep = true;
            body.collisionFilterGroup = 1;
            body.collisionFilterMask = -1;
            body.updateMassProperties();
          }
          ground.type = CANNON.Body.STATIC;
          ground.velocity.set(0, 0, 0);
          ground.collisionFilterGroup = 1;
          ground.collisionFilterMask = -1;
          shakingActive = false;
        },
      };
    },

    /** 떨어지는 강체에 순간적인 힘을 줍니다. */
    applyImpulse(part, impulse) {
      const body = part?.sim?.body;
      if (!body || body.type !== CANNON.Body.DYNAMIC) return;
      body.applyImpulse(new CANNON.Vec3(...impulse));
    },

    /** 피해를 준 뒤 반드시 호출: 받쳐지지 않는 부재를 떨어뜨립니다. */
    updateSupports() {
      propagateSupport(parts, byId, detach, dependents);
    },

    /** 시간이 흐르며 작용하는 효과를 등록합니다. fn(dt)가 true를 반환하면 끝남. */
    addOngoing(fn) {
      ongoing.push(fn);
    },

    /**
     * 시나리오 대상을 중심점 · 반경 · 부재로 풀어 줍니다.
     * @returns {{ center:[number,number,number]|null, radius:number|null, part:object|null }}
     */
    resolveTarget(target) {
      if (target?.kind === 'part') {
        const part = byId.get(target.partId) ?? null;
        return { center: part ? [...part.position] : null, radius: null, part };
      }
      if (target?.kind === 'area') {
        return { center: [...target.position], radius: target.radius, part: null };
      }
      return { center: null, radius: null, part: null };
    },

    /** 중심에서 반경 안에 있는 살아 있는 부재와 거리 목록 */
    partsWithin(center, radius) {
      const result = [];
      for (const part of parts) {
        if (!isAlive(part)) continue;
        const d = distanceToBox(center, part);
        if (d <= radius) result.push({ part, distance: d });
      }
      return result;
    },
  };

  // ── 공개 함수 ──────────────────────────────────────
  return {
    runScenario(scenario) {
      const run = SCENARIO_RUNNERS[scenario.type];
      if (!run) {
        console.warn(`[sim] 알 수 없는 시나리오: ${scenario.type}`);
        return;
      }
      scenarioActive = true;
      finishedEmitted = false;
      if (scenarioStart === null) scenarioStart = time;
      run(ctx, scenario);
      ctx.updateSupports();
    },

    step(dt) {
      time += dt;

      // 시간에 따라 작용하는 효과(화재 · 지진). 이번 단계에 끝난 효과의 마지막 피해도 지지 판단에 반영
      const hadOngoing = ongoing.length > 0;
      for (let i = ongoing.length - 1; i >= 0; i--) {
        if (ongoing[i](dt)) ongoing.splice(i, 1);
      }
      if (hadOngoing) ctx.updateSupports();

      // 잠든 잔해와 고정 부재만 있으면 충돌 후보 탐색/해결 단계가 필요하지 않습니다.
      if (
        shakingActive ||
        world.bodies.some(
          (body) => body.type === CANNON.Body.DYNAMIC && body.sleepState !== CANNON.Body.SLEEPING,
        )
      ) {
        world.step(dt);
      }
      contactIndex = null;

      // 무게에 따른 파괴 ①: 이번 단계의 충돌 피해
      let damaged = processImpacts();
      effectTimer += dt;
      if (effectTimer >= 1) {
        effectTimer = 0;
        effectBudget = EFFECT_MAX_PER_SECOND;
        glassBudget = GLASS_EFFECT_MAX_PER_SECOND;
      }

      for (const part of parts) {
        if (part.state !== 'falling' && part.state !== 'settled') continue;
        const body = part.sim.body;
        const slow =
          body.velocity.length() < SETTLE_SPEED && body.angularVelocity.length() < SETTLE_SPEED * 2;

        if (part.state === 'settled') {
          if (body.sleepState === CANNON.Body.SLEEPING) continue;
          // 옆 잔해에 살짝 닿아 깨어난 경우: 실제로 빠르게 움직이기 전까지는 '정지' 상태를 유지하고
          // 조용해지면 다시 재웁니다. (깨어남 ↔ 잠듦이 반복되며 이벤트가 쏟아지는 것 방지)
          copyBodyToPart(body, part);
          if (body.velocity.length() < WAKE_SPEED) {
            part.sim.stillTime = slow
              ? part.sim.stillTime + dt
              : Math.max(0, part.sim.stillTime - dt);
            if (part.sim.stillTime > SETTLE_TIME) body.sleep();
            continue;
          }
          part.state = 'falling';
          part.sim.stillTime = 0;
          part.sim.restingOn = null;
          body.linearDamping = MOVING_DAMPING.linear;
          body.angularDamping = MOVING_DAMPING.angular;
          emit(EVENTS.PART_DETACHED, { partId: part.id });
          continue;
        }

        copyBodyToPart(body, part);
        // 충분히 느린 상태가 일정 시간 이어지면 멈춘 것으로 보고 강체를 재웁니다.
        // (서로 기대어 미세하게 떨리는 잔해가 영원히 '떨어지는 중'으로 남지 않게)
        // 잠깐 빨라졌다고 바로 0으로 돌리지 않고 천천히 줄임 (쌓인 잔해의 미세한 떨림 대응)
        part.sim.stillTime = slow
          ? part.sim.stillTime + dt
          : Math.max(0, part.sim.stillTime - 2 * dt);
        if (body.sleepState === CANNON.Body.SLEEPING || part.sim.stillTime > SETTLE_TIME) {
          body.sleep();
          body.linearDamping = SETTLED_DAMPING.linear;
          body.angularDamping = SETTLED_DAMPING.angular;
          part.state = 'settled';
          part.sim.stillTime = 0;
          recordRest(part);
          emit(EVENTS.PART_SETTLED, { partId: part.id });
        }
      }

      // 무게에 따른 파괴 ②: 쌓인 잔해 하중 (일정 간격으로)
      loadTimer += dt;
      if (loadTimer >= LOAD_CHECK_INTERVAL) {
        if (checkDebrisLoads(loadTimer)) damaged = true;
        loadTimer = 0;
      }
      if (damaged) ctx.updateSupports();

      if (scenarioActive && !finishedEmitted && !ongoing.length) {
        const moving = parts.some((p) => p.state === 'falling');
        if (!moving) {
          finishedEmitted = true;
          emit(EVENTS.SIM_FINISHED, this.getResults());
        }
      }
    },

    getResults() {
      const finished =
        scenarioActive && !ongoing.length && !parts.some((p) => p.state === 'falling');
      return computeResults(parts, {
        time,
        firstFailedPartId,
        finished,
        collapseTime:
          lastCollapseAt !== null && scenarioStart !== null ? lastCollapseAt - scenarioStart : null,
        damageByCause,
      });
    },

    dispose() {
      for (const body of [...world.bodies]) world.removeBody(body);
      ongoing.length = 0;
    },
  };
}
