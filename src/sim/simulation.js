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
 * 🔧 임시 버전(베이스): 위 흐름이 끝까지 동작하는 최소 구현입니다.
 * TODO(B): 하중 경로·재분배(structure.js), 낙하 충돌 피해(무게에 따른 아래층 파괴),
 *          지진·화재 고도화(scenarios/), 결과 지표(results.js)
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
import { isAlive, propagateSupport } from './structure.js';
import { createRandom } from './random.js';
import { computeResults } from './results.js';
import { SCENARIO_RUNNERS } from './scenarios/index.js';

/**
 * 점에서 부재 상자 표면까지의 거리 (회전은 무시한 근사값). 큰 부재도 가장자리 기준으로 범위 판정.
 * @param {[number,number,number]} point
 */
function distanceToBox(point, part) {
  let sum = 0;
  for (let a = 0; a < 3; a++) {
    const d = Math.abs(point[a] - part.position[a]) - part.size[a] / 2;
    if (d > 0) sum += d * d;
  }
  return Math.sqrt(sum);
}

/** 이 속도(m/s) 아래로 SETTLE_TIME 초 동안 머물면 멈춘 것으로 판단 */
const SETTLE_SPEED = 0.35;
const SETTLE_TIME = 0.8;

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
  let scenarioActive = false;
  let finishedEmitted = false;
  /** 시간이 흐르며 계속 작용하는 효과 (예: 화재). (dt) => 끝났으면 true */
  const ongoing = [];

  // 구조 부재에는 고정 강체를 붙여 둡니다. 떨어지는 부재가 서 있는 부재와 부딪힐 수 있게.
  // 창문 같은 장식 부재는 떨어질 때 강체를 만듭니다 (서 있는 동안은 충돌할 일이 없어 성능 절약).
  for (const part of parts) {
    part.sim = { body: part.structural ? createBodyForPart(part) : null, stillTime: 0 };
    if (part.sim.body) world.addBody(part.sim.body);
  }

  // ── 상태 변화 ──────────────────────────────────────

  /** 지지를 잃은 부재를 떨어뜨립니다. */
  function detach(part) {
    part.state = 'falling';
    if (!part.sim.body) {
      part.sim.body = createBodyForPart(part);
      world.addBody(part.sim.body);
    }
    makeDynamic(part.sim.body, massOf(part));
    const spin = 0.6;
    part.sim.body.angularVelocity.set(
      (random() - 0.5) * spin,
      (random() - 0.5) * spin,
      (random() - 0.5) * spin,
    );
    emit(EVENTS.PART_DETACHED, { partId: part.id });
  }

  /** 체력이 0이 된 부재를 조각으로 나눕니다. */
  function fail(part) {
    part.state = 'failed';
    part.hp = 0;
    if (part.sim.body) world.removeBody(part.sim.body);
    if (!firstFailedPartId && part.structural) firstFailedPartId = part.id;
    emit(EVENTS.PART_FAILED, { partId: part.id });

    const count = Math.max(1, materialPhysics[part.material]?.fragments ?? 2);
    const axis = part.size.indexOf(Math.max(...part.size)); // 가장 긴 방향으로 자름
    for (let k = 0; k < count; k++) {
      const size = [...part.size];
      size[axis] = (part.size[axis] / count) * 0.96;
      const local = [0, 0, 0];
      local[axis] = -part.size[axis] / 2 + (part.size[axis] / count) * (k + 0.5);
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
      fragment.sim = { body: createBodyForPart(fragment), stillTime: 0 };
      world.addBody(fragment.sim.body);
      makeDynamic(fragment.sim.body, massOf(fragment));
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
      part.hp = Math.max(0, part.hp - amount / strength);
      if (part.hp <= 0) fail(part);
      else part.state = 'damaged';
      emit(EVENTS.PART_DAMAGED, { partId: part.id, hp: part.hp });
    },

    /** 떨어지는 강체에 순간적인 힘을 줍니다. */
    applyImpulse(part, impulse) {
      const body = part?.sim?.body;
      if (!body || body.type !== CANNON.Body.DYNAMIC) return;
      body.applyImpulse(new CANNON.Vec3(...impulse));
    },

    /** 피해를 준 뒤 반드시 호출: 받쳐지지 않는 부재를 떨어뜨립니다. */
    updateSupports() {
      propagateSupport(parts, byId, detach);
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
      run(ctx, scenario);
      ctx.updateSupports();
    },

    step(dt) {
      time += dt;

      for (let i = ongoing.length - 1; i >= 0; i--) {
        if (ongoing[i](dt)) ongoing.splice(i, 1);
      }
      if (ongoing.length) ctx.updateSupports();

      world.step(dt);

      for (const part of parts) {
        if (part.state !== 'falling' && part.state !== 'settled') continue;
        const body = part.sim.body;
        copyBodyToPart(body, part);
        if (part.state !== 'falling') continue;

        // 충분히 느린 상태가 일정 시간 이어지면 멈춘 것으로 보고 강체를 재웁니다.
        // (서로 기대어 미세하게 떨리는 잔해가 영원히 '떨어지는 중'으로 남지 않게)
        const slow =
          body.velocity.length() < SETTLE_SPEED && body.angularVelocity.length() < SETTLE_SPEED * 2;
        part.sim.stillTime = slow ? part.sim.stillTime + dt : 0;
        if (body.sleepState === CANNON.Body.SLEEPING || part.sim.stillTime > SETTLE_TIME) {
          body.sleep();
          part.state = 'settled';
          emit(EVENTS.PART_SETTLED, { partId: part.id });
        }
      }

      // TODO(B): 떨어지는 부재가 서 있는 부재와 세게 부딪히면 피해를 주기 (무게 기반 붕괴)
      //          body.addEventListener('collide', (e) => { e.contact.getImpactVelocityAlongNormal() ... })

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
      return computeResults(parts, { time, firstFailedPartId, finished });
    },

    dispose() {
      for (const body of [...world.bodies]) world.removeBody(body);
      ongoing.length = 0;
    },
  };
}
