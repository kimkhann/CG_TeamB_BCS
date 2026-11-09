/** [A] 회전된 지붕도 포함하는 월드 경계. 카메라와 그림자가 같은 계산을 사용합니다. */
import * as THREE from 'three';

export function buildingBounds(parts, standingOnly = true) {
  const bounds = new THREE.Box3();
  const local = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3(),
    rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  for (const p of parts) {
    if (p.state === 'failed') continue;
    if (standingOnly && p.state !== 'intact' && p.state !== 'damaged') continue;
    local.min.set(-p.size[0] / 2, -p.size[1] / 2, -p.size[2] / 2);
    local.max.copy(local.min).negate();
    matrix.compose(position.fromArray(p.position), rotation.fromArray(p.quaternion), unit);
    bounds.union(local.applyMatrix4(matrix));
  }
  return bounds;
}

/** 건물 경계의 여덟 모서리를 광원 좌표로 변환해 그림자 카메라 범위를 맞춥니다. */
export function fitSunToBounds(sun, bounds) {
  if (bounds.isEmpty()) return;
  const box = bounds.clone();
  box.min.y = Math.min(0, box.min.y);
  box.min.x -= 5;
  box.max.x += 5;
  box.min.z -= 5;
  box.max.z += 5;
  const center = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  const direction = new THREE.Vector3(-0.65, 1, 0.75).normalize();
  sun.position.copy(center).addScaledVector(direction, radius + 12);
  sun.target.position.copy(center);
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();

  const camera = sun.shadow.camera;
  camera.position.copy(sun.position);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const projected = box.clone().applyMatrix4(camera.matrixWorldInverse);
  Object.assign(camera, {
    left: projected.min.x - 1,
    right: projected.max.x + 1,
    bottom: projected.min.y - 1,
    top: projected.max.y + 1,
    near: Math.max(0.1, -projected.max.z - 2),
    far: -projected.min.z + 2,
  });
  camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.00012;
}
