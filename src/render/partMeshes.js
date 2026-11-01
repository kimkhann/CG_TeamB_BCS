/**
 * [A · 렌더링] 부재 → 메시
 *
 * 부재 하나당 상자 메시 하나를 만들고, 매 프레임 부재의 위치 · 회전 · 상태를 반영합니다.
 *
 * 🔧 임시 버전(베이스): 부재마다 재질을 따로 만드는 단순한 방식입니다.
 * TODO(A): 같은 모양은 InstancedMesh로 묶어 성능 개선, 손상 셰이더, 텍스처
 */

import * as THREE from 'three';
import { materialLooks } from '../data/materialLooks.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const DAMAGE_COLOR = new THREE.Color('#e0702f');
const FALLING_TINT = new THREE.Color('#c45a4c');
const SELECT_EMISSIVE = new THREE.Color('#ff9d3c');
const HOVER_EMISSIVE = new THREE.Color('#3c6cff');

export function createPartMeshes(scene) {
  const group = new THREE.Group();
  scene.add(group);

  /** @type {Map<string, THREE.Mesh>} */
  const byId = new Map();
  let selectedId = null;
  let hoveredId = null;

  function makeMesh(part) {
    const look = materialLooks[part.material] ?? materialLooks.rc;
    const material = new THREE.MeshStandardMaterial({
      color: look.color,
      roughness: look.roughness,
      metalness: look.metalness,
      transparent: look.opacity !== undefined,
      opacity: look.opacity ?? 1,
    });
    const mesh = new THREE.Mesh(UNIT_BOX, material);
    mesh.castShadow = look.opacity === undefined;
    mesh.receiveShadow = true;
    mesh.userData.partId = part.id;
    mesh.userData.baseColor = new THREE.Color(look.color);
    mesh.scale.set(...part.size);
    group.add(mesh);
    byId.set(part.id, mesh);
    return mesh;
  }

  function clear() {
    for (const mesh of byId.values()) {
      mesh.material.dispose();
      group.remove(mesh);
    }
    byId.clear();
  }

  function applyState(part, mesh) {
    mesh.visible = part.state !== 'failed';
    mesh.position.set(...part.position);
    mesh.quaternion.set(...part.quaternion);

    const color = mesh.material.color.copy(mesh.userData.baseColor);
    if (part.state === 'falling') color.lerp(FALLING_TINT, 0.35);
    else if (part.hp < 1) color.lerp(DAMAGE_COLOR, (1 - part.hp) * 0.8);

    const emissive = mesh.material.emissive;
    if (part.id === selectedId) emissive.copy(SELECT_EMISSIVE).multiplyScalar(0.55);
    else if (part.id === hoveredId) emissive.copy(HOVER_EMISSIVE).multiplyScalar(0.35);
    else emissive.setRGB(0, 0, 0);
  }

  return {
    setParts(parts) {
      clear();
      for (const part of parts) applyState(part, makeMesh(part));
    },
    sync(parts) {
      for (const part of parts) {
        const mesh = byId.get(part.id) ?? makeMesh(part); // 시뮬레이션이 추가한 조각도 자동 생성
        applyState(part, mesh);
      }
    },
    setSelected(id) {
      selectedId = id;
    },
    setHovered(id) {
      hoveredId = id;
    },
    /** 클릭 가능한 메시 (보이는 것만) */
    pickables() {
      return group.children.filter((m) => m.visible);
    },
    bounds() {
      return new THREE.Box3().setFromObject(group);
    },
  };
}
