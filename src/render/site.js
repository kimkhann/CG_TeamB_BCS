/** [A] 도로/보도/가로수/주변 건물. 메인 Part[]와 분리된 고정 시각 배경입니다. */
import * as THREE from 'three';
import { makeNeighborhoodLayout } from './neighborhoodLayout.js';

function asphaltTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 27;
  for (let i = 0; i < size * size; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 208 + (seed % 39);
    data.set([value, value, value, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(24, 4);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

/** 배경의 창문은 셰이더로만 반복합니다. 창마다 새 메시/강체를 만들지 않습니다. */
function contextMaterial() {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86 });
  material.customProgramCacheKey = () => 'neighborhood-facade-v1';
  material.onBeforeCompile = (shader) => {
    const varyings =
      'varying vec3 vContextPosition; varying vec3 vContextNormal; varying vec3 vContextSize;';
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\n${varyings}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
#include <begin_vertex>
vContextSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
vContextPosition = position * vContextSize;
vContextNormal = normal;
`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${varyings}`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
#include <map_fragment>
if (abs(vContextNormal.y) < 0.5) {
  vec2 uv = abs(vContextNormal.x) > 0.5
    ? vContextPosition.zy + vContextSize.zy * 0.5
    : vContextPosition.xy + vContextSize.xy * 0.5;
  vec2 cell = fract(uv / vec2(1.8, 3.0));
  float windowMask = step(0.22, cell.x) * step(cell.x, 0.78)
    * step(0.3, cell.y) * step(cell.y, 0.78);
  float lintel = step(0.94, cell.y);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.25, 0.28), windowMask * 0.72);
  diffuseColor.rgb *= 1.0 - lintel * 0.1;
} else {
  diffuseColor.rgb *= 0.9;
}
`,
    );
  };
  return material;
}

export function createSite(scene) {
  const group = new THREE.Group();
  group.name = 'neighborhood-context';
  group.userData.renderOnly = true;
  scene.add(group);
  const layout = makeNeighborhoodLayout();
  const roadTexture = asphaltTexture();
  const materials = {
    asphalt: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      map: roadTexture,
      roughness: 0.98,
    }),
    stone: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.93 }),
    wood: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85 }),
    metal: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.48, metalness: 0.55 }),
    rubber: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1 }),
    paint: new THREE.MeshBasicMaterial({ color: '#ffffff' }),
    foliage: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true }),
    glass: new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, metalness: 0.35 }),
    light: new THREE.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#fff0cc',
      emissiveIntensity: 0.55,
    }),
    context: contextMaterial(),
  };
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(1, 1, 1, 8),
    leaf: new THREE.IcosahedronGeometry(1, 1),
  };
  const batches = new Map();
  for (const object of layout.objects) {
    const key = `${object.geometry}:${object.material}:${!!object.castShadow}:${!!object.receiveShadow}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(object);
  }
  const matrix = new THREE.Matrix4(),
    position = new THREE.Vector3(),
    scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion(),
    euler = new THREE.Euler(),
    color = new THREE.Color();
  for (const [key, list] of batches) {
    const first = list[0];
    const mesh = new THREE.InstancedMesh(
      geometries[first.geometry],
      materials[first.material],
      list.length,
    );
    mesh.name = `context-${key}`;
    mesh.castShadow = !!first.castShadow;
    mesh.receiveShadow = !!first.receiveShadow;
    mesh.userData.renderOnly = true;
    mesh.raycast = () => {}; // 배경은 부재 선택 대상이 아닙니다.
    list.forEach((object, i) => {
      position.fromArray(object.position);
      scale.fromArray(object.size);
      const angles = object.rotation ?? [0, object.angle ?? 0, 0];
      rotation.setFromEuler(euler.set(...angles));
      mesh.setMatrixAt(i, matrix.compose(position, rotation, scale));
      mesh.setColorAt(i, color.set(object.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }

  // 중앙 포장면의 줄눈. 붕괴 계산용 격자와 구분되는 지면 표시입니다.
  const joints = [];
  for (let i = -10; i <= 10; i += 2) {
    joints.push(-12, 0.015, i, 12, 0.015, i, i, 0.015, -12, i, 0.015, 12);
  }
  const jointGeometry = new THREE.BufferGeometry();
  jointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(joints, 3));
  const jointMaterial = new THREE.LineBasicMaterial({
    color: '#9ea9a5',
    transparent: true,
    opacity: 0.4,
  });
  const lines = new THREE.LineSegments(jointGeometry, jointMaterial);
  lines.name = 'plaza-paving-joints';
  group.add(lines);

  return {
    setBuilding(parts) {
      // 필지 밖 환경은 다시 생성하지 않습니다. 리셋/재료 변경에도 같은 거리입니다.
      group.userData.mainBuildingType = parts[0]?.view?.buildingType ?? null;
    },
    getShadowBounds() {
      return new THREE.Box3(new THREE.Vector3(-14, 0, -14), new THREE.Vector3(14, 6, 14));
    },
    getDiagnostics() {
      return {
        buildings: layout.buildings.length,
        trees: layout.trees,
        cars: layout.cars,
        batches: batches.size,
        instances: layout.objects.length,
      };
    },
    dispose() {
      scene.remove(group);
      for (const child of group.children) if (child.isInstancedMesh) child.dispose();
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      jointGeometry.dispose();
      jointMaterial.dispose();
      roadTexture.dispose();
      group.clear();
    },
  };
}
