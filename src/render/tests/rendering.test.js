import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPart } from '../../core/types.js';
import { createPartMeshes } from '../partMeshes.js';
import { makeSurfacePixels } from '../surfaceTextures.js';
import { buildingBounds, fitSunToBounds } from '../buildingBounds.js';
import { createEffects } from '../effects.js';
import { createSite } from '../site.js';
import { makeNeighborhoodLayout } from '../neighborhoodLayout.js';
import { makeBuilding } from '../../build/generator.js';

test('절차 텍스처는 결정적이며 재료별 색/높이/거칠기 채널을 생성', () => {
  const signatures = new Set();
  for (const pattern of ['brick', 'concrete', 'wood', 'steel', 'panel', 'glass']) {
    const pixels = makeSurfacePixels(pattern, 64);
    assert.deepEqual(pixels, makeSurfacePixels(pattern, 64));
    assert.equal(pixels.color.length, 64 * 64 * 4);
    signatures.add(pixels.color.join(','));
    if (pattern === 'brick') {
      assert.ok(
        pixels.color.some((v, i) => i % 4 === 3 && v === 255),
        '줄눈',
      );
      assert.ok(
        pixels.color.some((v, i) => i % 4 === 3 && v === 0),
        '벽돌',
      );
    }
  }
  assert.equal(signatures.size, 6);
});

function part(id, x = 0) {
  return createPart({
    id,
    kind: 'column',
    floor: 1,
    material: 'brick',
    size: [1, 2, 1],
    position: [x, 1, 0],
  });
}

test('배치 확장 중 기존 변환·초기 표면 좌표가 보존되고 추가 파편 선택도 가능', () => {
  const scene = new THREE.Scene();
  const meshes = createPartMeshes(scene);
  const original = part('first', 3);
  const parts = [original];
  meshes.setParts(parts);
  original.position[0] = 8;
  original.hp = 0.4;
  for (let i = 0; i < 100; i++) parts.push(part(`fragment-${i}`, i));
  meshes.sync(parts);
  const batch = meshes.pickables()[0];
  const matrix = new THREE.Matrix4();
  batch.getMatrixAt(0, matrix);
  assert.equal(matrix.elements[12], 8);
  assert.equal(batch.geometry.getAttribute('aSurfaceOrigin').getX(0), 3, '이동 전 표면 좌표 유지');
  assert.ok(Math.abs(batch.geometry.getAttribute('aSurfaceDamage').getX(0) - 0.6) < 1e-6);
  assert.equal(batch.count, 101);
  assert.equal(meshes.idAt(batch, 100), 'fragment-99');
  meshes.setFilter((p) => p.id !== 'first');
  meshes.sync(parts);
  assert.equal(meshes.idAt(batch, 0), null);
  assert.equal(meshes.isVisible('fragment-99'), true);
  meshes.scorchAt({ position: [99, 1, 0], radius: 2, energy: 1 });
  meshes.sync(parts);
  assert.ok(batch.geometry.getAttribute('aSurfaceDamage').getY(100) > 0);
  assert.equal(original.hp, 0.4, '렌더러는 HP를 바꾸지 않음');
  meshes.setParts([part('replacement')]);
  assert.equal(meshes.isVisible('fragment-99'), false);
});

test('정지 부재와 창틀은 재업로드하지 않으며 위치 변경만 행렬/광선 경계를 갱신', () => {
  const scene = new THREE.Scene(),
    meshes = createPartMeshes(scene);
  const column = part('column');
  const window = createPart({
    id: 'window',
    kind: 'window',
    floor: 1,
    material: 'window',
    size: [1, 1, 0.07],
    position: [0, 1, 2],
    view: { framed: true },
  });
  meshes.setParts([column, window]);
  const attributes = [];
  scene.traverse((mesh) => {
    if (mesh.isInstancedMesh) attributes.push(mesh.instanceMatrix, mesh.instanceColor);
  });
  const versions = attributes.map((attribute) => attribute.version);
  const batch = meshes.pickables()[0];
  batch.computeBoundingSphere();
  const bounds = batch.boundingSphere;
  meshes.sync([column, window]);
  assert.deepEqual(
    attributes.map((attribute) => attribute.version),
    versions,
  );
  assert.equal(batch.boundingSphere, bounds);
  batch.instanceMatrix.onUploadCallback();
  column.position[0] = 3;
  meshes.sync([column, window]);
  assert.equal(batch.instanceMatrix.version, versions[0] + 1);
  assert.deepEqual(batch.instanceMatrix.updateRanges, [{ start: 0, count: 16 }]);
  assert.equal(batch.boundingSphere, null);
  assert.equal(batch.instanceColor.version, versions[1]);
  assert.deepEqual(
    attributes.slice(2).map((attribute) => attribute.version),
    versions.slice(2),
  );
});

test('선택/HP/화재의 표시 갱신은 행렬·초기 표면 좌표를 업로드하지 않음', () => {
  const meshes = createPartMeshes(new THREE.Scene());
  const p = part('one');
  meshes.setParts([p]);
  const mesh = meshes.pickables()[0];
  const matrixVersion = mesh.instanceMatrix.version;
  const origin = mesh.geometry.getAttribute('aSurfaceOrigin');
  const originVersion = origin.version;
  const color = new THREE.Color();
  mesh.getColorAt(0, color);
  meshes.setSelected(p.id);
  meshes.sync([p]);
  const selected = new THREE.Color();
  mesh.getColorAt(0, selected);
  assert.ok(!selected.equals(color));
  meshes.setSelected(null);
  meshes.sync([p]);
  const restored = new THREE.Color();
  mesh.getColorAt(0, restored);
  assert.ok(restored.equals(color));
  p.hp = 0.4;
  p.state = 'damaged';
  meshes.sync([p]);
  meshes.scorchAt({ position: p.position, radius: 2, energy: 1 });
  meshes.sync([p]);
  assert.equal(mesh.instanceMatrix.version, matrixVersion);
  assert.equal(origin.version, originVersion);
  assert.ok(mesh.geometry.getAttribute('aSurfaceDamage').getY(0) > 0);
  const damageVersion = mesh.geometry.getAttribute('aSurfaceDamage').version;
  meshes.sync([p]);
  assert.equal(mesh.geometry.getAttribute('aSurfaceDamage').version, damageVersion);
});

test('회전 경계의 모든 모서리와 접지면이 그림자 카메라 안에 포함됨', () => {
  const roof = part('roof');
  roof.size = [8, 0.16, 4];
  roof.position = [0, 15, 0];
  roof.quaternion = new THREE.Quaternion()
    .setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 6)
    .toArray();
  const bounds = buildingBounds([roof]);
  assert.ok(bounds.max.y > 17);
  const sun = new THREE.DirectionalLight();
  fitSunToBounds(sun, bounds);
  const camera = sun.shadow.camera;
  camera.updateMatrixWorld();
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [0, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const p = new THREE.Vector3(x, y, z).project(camera);
        assert.ok(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && Math.abs(p.z) <= 1);
      }
});

test('반복 폭발에서도 파티클·충격파 수가 제한되고 초기화 시 정리됨', () => {
  const scene = new THREE.Scene();
  const effects = createEffects(scene);
  for (let i = 0; i < 50; i++) effects.play({ position: [0, 1, 0], kind: 'explosion' });
  assert.ok(scene.children.length <= 9);
  const points = scene.children.find((p) => p.isPoints);
  assert.equal(points.geometry.attributes.position.count, 384);
  effects.update(0.1);
  effects.clear();
  effects.update(0.1);
  assert.equal(scene.children.length, 1);
  assert.equal(points.visible, false);
});

test('거리 배치는 결정적이며 중앙 시뮬레이션 필지를 배경 건물이 침범하지 않음', () => {
  const layout = makeNeighborhoodLayout();
  assert.deepEqual(layout, makeNeighborhoodLayout());
  assert.ok(layout.buildings.length >= 24 && layout.buildings.length <= 48);
  for (const b of layout.buildings) {
    const outsideX = b.x + b.width / 2 < -14 || b.x - b.width / 2 > 14;
    const outsideZ = b.z + b.depth / 2 < -14 || b.z - b.depth / 2 > 14;
    assert.ok(outsideX || outsideZ, '중앙 필지 비우기');
  }
  for (const item of layout.objects) {
    assert.ok(item.position.every(Number.isFinite));
    assert.ok(item.size.every((v) => Number.isFinite(v) && v > 0));
  }
  assert.ok(layout.objects.some((o) => o.role === 'crosswalk'));
  assert.ok(layout.trees > 8 && layout.cars === 8);
});

test('건물 변경·초기화가 배경 행렬과 Part 배열을 변경하지 않으며 배경은 선택되지 않음', () => {
  const scene = new THREE.Scene();
  const site = createSite(scene);
  const context = scene.getObjectByName('neighborhood-context');
  const batches = context.children.filter((o) => o.isInstancedMesh);
  const original = batches.map((mesh) => Array.from(mesh.instanceMatrix.array));
  const childrenCount = scene.children.length;
  for (const type of ['house', 'piloti', 'apartment', 'lshape', 'house']) {
    const parts = makeBuilding({ type });
    const snapshot = structuredClone(parts);
    site.setBuilding(parts, buildingBounds(parts));
    assert.deepEqual(parts, snapshot, '환경은 시뮬레이션 데이터를 수정하지 않음');
    assert.deepEqual(
      batches.map((mesh) => Array.from(mesh.instanceMatrix.array)),
      original,
    );
    assert.equal(scene.children.length, childrenCount, '리셋 시 배경이 누적되지 않음');
  }
  const hits = [];
  for (const mesh of batches) mesh.raycast(new THREE.Raycaster(), hits);
  assert.equal(hits.length, 0);
  assert.ok(site.getDiagnostics().batches <= 25, '환경을 재질별로 묶어 그리기 호출 제한');
  site.dispose();
  assert.equal(scene.children.length, 0);
});
