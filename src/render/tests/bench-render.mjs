// CPU 동기화 비용/버퍼 갱신 횟수 측정. GPU FPS나 물리 성능을 나타내지는 않습니다.
import * as THREE from 'three';
import { makeBuilding } from '../../build/generator.js';
import { createPartMeshes } from '../partMeshes.js';

const parts = makeBuilding({ type: 'apartment', floors: 8 });
const meshes = createPartMeshes(new THREE.Scene());
meshes.setParts(parts);
const samples = 5,
  frames = 300;
const attributes = () =>
  meshes
    .pickables()
    .flatMap((mesh) => [
      mesh.instanceMatrix,
      mesh.instanceColor,
      mesh.geometry.getAttribute('aSurfaceOrigin'),
      mesh.geometry.getAttribute('aSurfaceDamage'),
    ]);

function measure(name, update) {
  for (let i = 0; i < 30; i++) {
    update(i);
    meshes.sync(parts);
  }
  const versions = attributes().map((attr) => attr.version);
  const times = [];
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now();
    for (let i = 0; i < frames; i++) {
      update(i);
      meshes.sync(parts);
    }
    times.push((performance.now() - start) / frames);
  }
  times.sort((a, b) => a - b);
  const uploads = attributes().reduce((sum, attr, i) => sum + attr.version - versions[i], 0);
  console.log(
    JSON.stringify({
      name,
      parts: parts.length,
      medianMs: +times[2].toFixed(4),
      attributeUpdatesPerFrame: +(uploads / (samples * frames)).toFixed(2),
    }),
  );
}
measure('standing', () => {});
parts.forEach((p) => {
  p.state = 'settled';
});
measure('settled', () => {});
parts[0].state = 'falling';
measure('oneMoving', () => {
  parts[0].position[0] += 0.001;
});
measure('selection', (i) => {
  meshes.setSelected(parts[i % parts.length].id);
});
