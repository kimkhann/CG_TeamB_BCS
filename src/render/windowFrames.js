/** [A] 창틀은 유리 부재를 따라가는 렌더 전용 인스턴스입니다. 강체 수를 늘리지 않습니다. */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function frameGeometry(axis) {
  const pieces = [];
  for (const [size, position] of [
    [
      [1, 0.038, 1.3],
      [0, -0.48, 0],
    ],
    [
      [1, 0.038, 1.3],
      [0, 0.48, 0],
    ],
    [
      [0.025, 1, 1.3],
      [-0.487, 0, 0],
    ],
    [
      [0.025, 1, 1.3],
      [0.487, 0, 0],
    ],
    [
      [0.019, 1, 1.2],
      [0, 0, 0],
    ],
  ]) {
    const piece = new THREE.BoxGeometry(...size);
    piece.translate(...position);
    if (axis === 'x') piece.rotateY(Math.PI / 2);
    pieces.push(piece);
  }
  const geometry = mergeGeometries(pieces);
  pieces.forEach((p) => p.dispose());
  return geometry;
}

export function createWindowFrames(parent) {
  const batches = new Map();
  const matrix = new THREE.Matrix4();
  const pos = new THREE.Vector3(),
    quat = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  const color = new THREE.Color();

  function clear() {
    for (const mesh of batches.values()) {
      parent.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
      mesh.dispose();
    }
    batches.clear();
  }

  return {
    clear,
    sync(parts, visibleIds, selectedId, hoveredId) {
      const groups = { x: [], z: [] };
      for (const p of parts) {
        if (p.kind === 'window' && p.view?.framed && visibleIds.has(p.id)) {
          groups[p.size[0] < p.size[2] ? 'x' : 'z'].push(p);
        }
      }
      for (const axis of ['x', 'z']) {
        const list = groups[axis];
        let mesh = batches.get(axis);
        if (!mesh && !list.length) continue;
        if (!mesh || mesh.instanceMatrix.count < list.length) {
          if (mesh) {
            parent.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            mesh.dispose();
          }
          mesh = new THREE.InstancedMesh(
            frameGeometry(axis),
            new THREE.MeshStandardMaterial({
              color: '#ffffff',
              roughness: 0.48,
              metalness: 0.65,
            }),
            Math.max(32, list.length * 2),
          );
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.frustumCulled = false;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          parent.add(mesh);
          batches.set(axis, mesh);
        }
        mesh.count = list.length;
        list.forEach((p, i) => {
          pos.fromArray(p.position);
          quat.fromArray(p.quaternion);
          scale.fromArray(p.size);
          matrix.compose(pos, quat, scale);
          mesh.setMatrixAt(i, matrix);
          color.set('#34444a');
          if (p.state === 'settled') color.set('#596064');
          if (p.id === selectedId) color.set('#ffb347');
          else if (p.id === hoveredId) color.set('#6f9dff');
          mesh.setColorAt(i, color);
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
    },
  };
}
