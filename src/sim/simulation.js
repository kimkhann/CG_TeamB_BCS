/**
 * [B · Simulation] Public API: createSimulation(parts, { emit }) → Simulation
 *
 * Flow: a scenario damages parts → at 0 hp a part fails (splits into fragments)
 *       → the support check finds unsupported parts and turns them into falling bodies → the physics engine handles falls and collisions
 *
 * Part states
 *   intact   undamaged (static body)
 *   damaged  hurt but still standing (static body)
 *   failed   lost function — disappears from view and is replaced by fragments
 *   falling  lost support and is falling (dynamic body)
 *   settled  came to rest after falling
 *
 * Weight-driven damage (stage B; model in sim/impact.js · sim/B_NOTES.md)
 *   - Impact damage: when a falling part first hits a standing part (decor included), its impact energy
 *     is compared with the target's energy capacity to remove hp. The factor depends on hit location and direction
 *   - Debris load: records which part settled debris rests on; when the weight piled on a horizontal member
 *     exceeds its reserve capacity from the design code, the member gradually breaks
 *
 * Scenarios: scenarios/ · results: results.js · reports: reports/
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

/** Interval (s) between debris-load checks */
const LOAD_CHECK_INTERVAL = 0.25;
/** Dust effect: only for impacts at or above this energy (kJ), with a per-second cap */
const EFFECT_MIN_ENERGY = 5;
const EFFECT_MAX_PER_SECOND = 8;
/** Glass shatter effect: max per second (avoids particle overload when dozens of panes break at once) */
const GLASS_EFFECT_MAX_PER_SECOND = 16;
/** Materials treated as breakable glass */
const GLASS_MATERIALS = new Set(['window', 'curtain']);
const isGlass = (part) => GLASS_MATERIALS.has(part.material);
/** Impact energy (kJ) that maps to effect strength 1 */
const EFFECT_FULL_ENERGY = 40;

/** A body below this speed (m/s) for SETTLE_TIME seconds is considered at rest */
const SETTLE_SPEED = 0.5;
const SETTLE_TIME = 0.8;
/** A settled body above this speed (m/s) counts as falling again (exceeded within 0.1 s once its support vanishes) */
const WAKE_SPEED = 1.0;
/** Damping for settled debris — reduces jitter and sliding in stacked boxes */
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
 * @param {import('../core/types.js').Part[]} parts  parts from the generator (fragments are appended here)
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
  /** For results: scenario start time, time of the last collapse, hp lost per cause */
  let scenarioStart = null;
  let lastCollapseAt = null;
  const damageByCause = { scenario: 0, collision: 0, debris: 0 };
  /**
   * Event history (for reports and log analysis, sim/reports/logAnalysis.js)
   *   events : { t, type:'scenario'|'damaged'|'failed'|'detached'|'shattered', partId?, cause?, trigger?, scenario? }
   *            damaged is recorded only on first damage; a detached event's trigger lists the parts that failed just before it
   *   samples: every 0.5 s { t, collapsed, falling, damaged } (structural part counts)
   */
  const history = { events: [], samples: [] };
  /** Parts that failed since the last support check (to trace what caused a cascade) */
  let pendingTriggers = [];
  let sampleTimer = 0;
  let lastCause = 'scenario';
  const record = (type, part, extra) =>
    history.events.push({ t: time, type, partId: part?.id, ...extra });

  /** Whether an earthquake is shaking the building (standing parts are KINEMATIC) */
  let shakingActive = false;
  let scenarioActive = false;
  let finishedEmitted = false;
  /** Effects that keep acting over time (e.g. fire). (dt) => true when finished */
  const ongoing = [];

  // Every part (decor included) gets a static body,
  // so falling parts can hit and damage standing columns, slabs, walls, windows and railings.
  for (const part of parts) {
    part.sim = { body: createBodyForPart(part), stillTime: 0, restingOn: null };
    world.addBody(part.sim.body);
  }

  /** part → parts it supports (for column lateral bracing; based on the original parts — fragments support nothing) */
  const dependents = buildDependents(parts);

  /** Collisions in this step (bodies cannot be removed mid-step, so they are queued and handled afterwards) */
  const impactQueue = [];
  let loadTimer = 0;
  let effectBudget = EFFECT_MAX_PER_SECOND;
  let glassBudget = GLASS_EFFECT_MAX_PER_SECOND;
  let effectTimer = 0;

  /** Records the first contact of a moving body. (cannon-es fires collide only on first contact) */
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
      targetId: other.userData?.partId ?? null, // null for the ground
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
   * Removes hp directly (material strength already applied by the caller).
   * @param {'scenario'|'collision'|'debris'} cause  for per-cause damage totals
   */
  function loseHp(part, amount, cause = 'scenario') {
    if (!part || !isAlive(part) || amount <= 0) return;
    damageByCause[cause] += Math.min(part.hp, amount);
    if (part.state === 'intact') record('damaged', part, { cause });
    part.hp = Math.max(0, part.hp - amount);
    lastCause = cause;
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

  /** Turns queued collisions into damage. Returns true if anything was damaged */
  function processImpacts() {
    let damaged = false;
    for (const hit of impactQueue) {
      const target = hit.targetId ? byId.get(hit.targetId) : null;
      const targetPhys = materialPhysics[target?.material ?? 'rc'];
      playCollisionEffect(hit.point, absorbedEnergy(hit.mass, hit.speed, targetPhys));
      if (!target || !isAlive(target)) continue; // no damage to the ground or already-fallen parts
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

  /** Records which parts settled debris rests on, from its latest contacts. */
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
          // if other is below self, the y component of the self → other direction is negative
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

  /** Passes piled debris weight downward and checks horizontal members for overload. Returns true if anything was damaged */
  function checkDebrisLoads(interval) {
    const load = new Map(); // part id → debris mass resting on it (t)
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
        // debris on debris: pass the weight on to whatever the lower debris rests on
        const share = mass / p.sim.restingOn.length;
        for (const next of p.sim.restingOn) route(next, share, depth + 1);
      }
    };
    for (const p of parts) {
      // nearly-still 'falling' debris also passes on its weight (no need to wait until it fully settles)
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

  // ── State changes ─────────────────────────────────

  /** Drops a part that lost its support. */
  function detach(part) {
    if (isGlass(part)) {
      shatter(part, 0.4, 'support'); // 유리는 통째로 떨어지지 않고 지지를 잃는 순간 깨짐
      return;
    }
    part.state = 'falling';
    if (part.structural) lastCollapseAt = time; // collapse time counts structural parts only
    makeDynamic(part.sim.body, massOf(part));
    if (shakingActive) {
      part.sim.body.collisionFilterGroup = 1; // collide with shaking parts (group 2) again
      part.sim.body.collisionFilterMask = -1;
    }
    watchImpacts(part.sim.body);
    const spin = 0.6;
    part.sim.body.angularVelocity.set(
      (random() - 0.5) * spin,
      (random() - 0.5) * spin,
      (random() - 0.5) * spin,
    );
    // A column toppling from lost bracing (the column below is intact): tilt it so it does not balance on top
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
    record('detached', part, { trigger: pendingTriggers.slice(0, 4) });
    emit(EVENTS.PART_DETACHED, { partId: part.id });
  }

  /**
   * Glass shatter: no rigid body, only an on-screen shatter effect.
   * Real glass panes break into small pieces rather than falling as large sheets on impact or support loss,
   * and glass parts (windows, curtain wall, balcony glass) are 15–20% of a building, so this greatly reduces body count.
   */
  function shatter(part, energy, cause = lastCause) {
    part.state = 'failed';
    if (part.structural) lastCollapseAt = time; // collapse time counts structural parts only
    part.hp = 0;
    world.removeBody(part.sim.body);
    record('shattered', part, { cause });
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

  /** Splits a part whose hp reached 0 into fragments. */
  function fail(part) {
    if (isGlass(part)) {
      shatter(part, 0.7);
      return;
    }
    part.state = 'failed';
    part.hp = 0;
    if (part.structural) lastCollapseAt = time; // collapse time counts structural parts only
    if (part.sim.body) world.removeBody(part.sim.body);
    if (!firstFailedPartId && part.structural) firstFailedPartId = part.id;
    record('failed', part, { cause: lastCause });
    if (part.structural) pendingTriggers.push(part.id);
    emit(EVENTS.PART_FAILED, { partId: part.id });

    const count = Math.max(1, materialPhysics[part.material]?.fragments ?? 2);
    const axis = part.size.indexOf(Math.max(...part.size)); // cut along the longest axis
    for (let k = 0; k < count; k++) {
      const size = [...part.size];
      size[axis] = (part.size[axis] / count) * 0.96;
      const offset = [0, 0, 0];
      offset[axis] = -part.size[axis] / 2 + (part.size[axis] / count) * (k + 0.5);
      // if the part is tilted (gable roof etc.), rotate fragment offsets the same way
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

  // ── Tools for scenarios ───────────────────────────
  const ctx = {
    parts,
    byId,
    random,
    emit,
    get time() {
      return time;
    },
    isAlive,

    /** Damages a part. amount: 0–1 (divided by material strength) */
    damage(part, amount) {
      if (!part || !isAlive(part)) return;
      const strength = materialPhysics[part.material]?.strength ?? 1;
      loseHp(part, amount / strength);
    },

    /** Removes hp without dividing by strength (when the model already accounts for material capacity, e.g. earthquake). */
    damageRaw(part, amount) {
      loseHp(part, amount, 'scenario');
    },

    /**
     * Starts ground shaking: standing parts become KINEMATIC bodies that move with the ground.
     * @returns {{ move:(dt:number, offsetAt:(y:number)=>[number,number])=>void, stop:()=>void }}
     *   move: sets this step's positions and velocities from a function giving the horizontal offset [dx, dz] at height y
     *   stop: returns surviving parts to their original position as static bodies
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
        // skip collision checks between touching KINEMATIC parts (group 2 ignores group 2) — they still collide with falling debris
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

    /** Applies an instant impulse to a falling body. */
    applyImpulse(part, impulse) {
      const body = part?.sim?.body;
      if (!body || body.type !== CANNON.Body.DYNAMIC) return;
      body.applyImpulse(new CANNON.Vec3(...impulse));
    },

    /** Must be called after damage: drops parts that are no longer supported. */
    updateSupports() {
      propagateSupport(parts, byId, detach, dependents);
      pendingTriggers = [];
    },

    /** Registers an effect that acts over time. Finished when fn(dt) returns true. */
    addOngoing(fn) {
      ongoing.push(fn);
    },

    /**
     * Resolves a scenario target into a center point, radius and part.
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

    /** Alive parts within the radius of the center, with distances */
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

  // ── Public API ────────────────────────────────────
  return {
    runScenario(scenario) {
      const run = SCENARIO_RUNNERS[scenario.type];
      if (!run) {
        console.warn(`[sim] unknown scenario: ${scenario.type}`);
        return;
      }
      scenarioActive = true;
      finishedEmitted = false;
      if (scenarioStart === null) scenarioStart = time;
      record('scenario', null, {
        scenario: {
          type: scenario.type,
          value: scenario.value,
          distanceKm: scenario.distanceKm,
          intensity: scenario.intensity,
          target: scenario.target ?? null,
        },
      });
      lastCause = 'scenario';
      run(ctx, scenario);
      ctx.updateSupports();
    },

    step(dt) {
      time += dt;

      // Effects over time (fire, earthquake). The final damage of an effect ending this step also feeds the support check
      const hadOngoing = ongoing.length > 0;
      for (let i = ongoing.length - 1; i >= 0; i--) {
        if (ongoing[i](dt)) ongoing.splice(i, 1);
      }
      if (hadOngoing) ctx.updateSupports();

      // With only sleeping debris and static parts, broadphase/narrowphase can be skipped.
      if (
        shakingActive ||
        world.bodies.some(
          (body) => body.type === CANNON.Body.DYNAMIC && body.sleepState !== CANNON.Body.SLEEPING,
        )
      ) {
        world.step(dt);
      }
      contactIndex = null;

      // Weight-driven damage ①: impacts during this step
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
          // Woken by a light touch from neighboring debris: keep it 'settled' until it really moves fast,
          // and put it back to sleep once quiet. (prevents a flood of wake ↔ sleep events)
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
        // Put a body to sleep once it stays slow for a while
        // (so debris leaning and jittering against each other does not stay 'falling' forever).
        // A brief speed-up decays stillTime instead of resetting it (handles jitter in piled debris)
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

      // Weight-driven damage ②: piled debris load (at a fixed interval)
      loadTimer += dt;
      if (loadTimer >= LOAD_CHECK_INTERVAL) {
        if (checkDebrisLoads(loadTimer)) damaged = true;
        loadTimer = 0;
      }
      if (damaged) ctx.updateSupports();

      sampleTimer += dt;
      if (scenarioActive && sampleTimer >= 0.5) {
        sampleTimer = 0;
        let collapsed = 0;
        let falling = 0;
        let hurt = 0;
        for (const p of parts) {
          if (!p.structural || p.kind === 'fragment') continue;
          if (p.state === 'damaged') hurt++;
          else if (p.state !== 'intact') collapsed++;
          if (p.state === 'falling') falling++;
        }
        history.samples.push({ t: time, collapsed, falling, damaged: hurt });
      }

      if (scenarioActive && !finishedEmitted && !ongoing.length) {
        const moving = parts.some((p) => p.state === 'falling');
        if (!moving) {
          finishedEmitted = true;
          emit(EVENTS.SIM_FINISHED, this.getResults());
        }
      }
    },

    /**
     * Treats parts as removed (key member analysis: "what happens without this part").
     * Removes the bodies without fragments and re-runs the support check.
     * @param {string[]} ids
     */
    removeParts(ids) {
      scenarioActive = true;
      finishedEmitted = false;
      if (scenarioStart === null) scenarioStart = time;
      for (const id of ids) {
        const part = byId.get(id);
        if (!part || !isAlive(part)) continue;
        part.state = 'failed';
        part.hp = 0;
        if (part.sim?.body) world.removeBody(part.sim.body);
        record('failed', part, { cause: 'removed' });
        pendingTriggers.push(part.id);
        emit(EVENTS.PART_FAILED, { partId: part.id });
      }
      ctx.updateSupports();
    },

    /** Event history (for reports, read-only) */
    getHistory() {
      return history;
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
