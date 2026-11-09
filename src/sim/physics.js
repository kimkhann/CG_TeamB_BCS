/**
 * [B · Simulation] Physics world (cannon-es)
 *
 * Gravity, ground plane, sleeping, and part ↔ body helpers.
 * The ground is kept on world.ground so the earthquake scenario can move it.
 */

import * as CANNON from 'cannon-es';
import { materialPhysics } from '../data/materialPhysics.js';

/** Shrinks collision boxes slightly so parts that start in contact do not push each other apart. */
const SHAPE_SHRINK = 0.97;

export function createWorld() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.broadphase = new CANNON.SAPBroadphase(world);
  world.allowSleep = true;
  world.solver.iterations = 8;
  world.defaultContactMaterial.friction = 0.6;
  world.defaultContactMaterial.restitution = 0.05;

  const ground = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
  ground.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(ground);
  world.ground = ground; // kept so the earthquake can shake it

  return world;
}

/**
 * Creates a body for a part. It starts STATIC.
 * @param {import('../core/types.js').Part} part
 */
export function createBodyForPart(part) {
  const half = new CANNON.Vec3(
    (part.size[0] / 2) * SHAPE_SHRINK,
    (part.size[1] / 2) * SHAPE_SHRINK,
    (part.size[2] / 2) * SHAPE_SHRINK,
  );
  const body = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Box(half),
    position: new CANNON.Vec3(...part.position),
    quaternion: new CANNON.Quaternion(...part.quaternion),
    sleepSpeedLimit: 0.2,
    sleepTimeLimit: 0.5,
    linearDamping: 0.08,
    angularDamping: 0.25,
  });
  body.userData = { partId: part.id };
  return body;
}

/** Part mass (t) = density × volume */
export function massOf(part) {
  const density = materialPhysics[part.material]?.density ?? 1;
  return Math.max(0.05, density * part.size[0] * part.size[1] * part.size[2]);
}

/** Turns a static body into a DYNAMIC one. */
export function makeDynamic(body, mass) {
  body.type = CANNON.Body.DYNAMIC;
  body.allowSleep = true; // restore if it was KINEMATIC during an earthquake
  body.mass = mass;
  body.updateMassProperties();
  body.wakeUp();
}

/** Copies a body's position and rotation to its part. */
export function copyBodyToPart(body, part) {
  part.position[0] = body.position.x;
  part.position[1] = body.position.y;
  part.position[2] = body.position.z;
  part.quaternion[0] = body.quaternion.x;
  part.quaternion[1] = body.quaternion.y;
  part.quaternion[2] = body.quaternion.z;
  part.quaternion[3] = body.quaternion.w;
}

export { CANNON };
