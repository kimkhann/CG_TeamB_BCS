/**
 * [B · 시뮬레이션] 물리 월드 (cannon-es)
 *
 * 🔧 임시 버전(베이스): 중력, 바닥, 수면(sleep) 기능, 부재 ↔ 강체 변환 도우미.
 * TODO(B): 재료별 접촉 재질, 충돌 이벤트로 충격량 계산, 성능 조정
 */

import * as CANNON from 'cannon-es';
import { materialPhysics } from '../data/materialPhysics.js';

/** 처음부터 맞닿아 있는 부재끼리 튕겨 나가지 않도록 충돌 상자를 살짝 줄입니다. */
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
  world.ground = ground; // 지진 때 흔들기 위해 보관

  return world;
}

/**
 * 부재에 맞는 강체를 만듭니다. 처음에는 고정(STATIC) 상태입니다.
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

/** 부재 질량 (t) = 밀도 × 부피 */
export function massOf(part) {
  const density = materialPhysics[part.material]?.density ?? 1;
  return Math.max(0.05, density * part.size[0] * part.size[1] * part.size[2]);
}

/** 고정 강체를 움직이는(DYNAMIC) 강체로 바꿉니다. */
export function makeDynamic(body, mass) {
  body.type = CANNON.Body.DYNAMIC;
  body.allowSleep = true; // 지진 중 KINEMATIC 이었다가 떨어지는 경우 되돌림
  body.mass = mass;
  body.updateMassProperties();
  body.wakeUp();
}

/** 강체의 위치 · 회전을 부재에 복사합니다. */
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
