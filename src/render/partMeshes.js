/**
 * [A · 렌더링] 부재 → 메시 (InstancedMesh)
 *
 * 같은 재료의 부재를 InstancedMesh 하나로 묶어 그립니다. 부재가 1,000개가 넘어도
 * 재료 수만큼만 그리기 명령이 나가서 빠릅니다.
 * 매 프레임 부재의 위치 · 회전 · 상태(색)를 인스턴스에 반영합니다.
 *
 * 숨김: state 'failed' 이거나, setFilter() 로 넘긴 함수가 false 를 돌려주는 부재 (크기 0으로 처리)
 *
 * 🔧 임시 버전(베이스): 재료별 단색 + 상태별 색 섞기.
 * TODO(A): 텍스처, 손상 셰이더(균열 · 그을림), 모서리 강조 등
 */

import * as THREE from 'three';
import { materialLooks } from '../data/materialLooks.js';
import { STATE_COLORS as STATE_COLOR_DATA, HOVER_COLOR } from '../data/stateColors.js';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

/** 상태별 색 (data/stateColors.js — UI 범례와 같은 값) */
const STATE_COLORS = {
  damaged: new THREE.Color(STATE_COLOR_DATA.damaged.color),
  falling: new THREE.Color(STATE_COLOR_DATA.falling.color),
  settled: new THREE.Color(STATE_COLOR_DATA.settled.color),
  selected: new THREE.Color(STATE_COLOR_DATA.selected.color),
  hovered: new THREE.Color(HOVER_COLOR),
};

const ZERO_SCALE = new THREE.Vector3(0, 0, 0);

export function createPartMeshes(scene) {
  const group = new THREE.Group();
  scene.add(group);

  /** 재료 ID → { mesh, capacity, ids:[] } */
  const batches = new Map();
  /** 부재 id → { batch, index } */
  const slots = new Map();
  /** 인스턴스 번호 → 부재 id (raycast 용) */
  let selectedId = null;
  let hoveredId = null;
  /** @type {((part:any)=>boolean)|null} */
  let filter = null;
  /** 현재 화면에 보이는 부재 id (raycast 판정용) */
  const visibleIds = new Set();

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();

  function createBatch(materialId, capacity) {
    const look = materialLooks[materialId] ?? materialLooks.rc;
    const material = new THREE.MeshStandardMaterial({
      color: '#ffffff', // 실제 색은 인스턴스 색으로 지정
      roughness: look.roughness,
      metalness: look.metalness,
      transparent: look.opacity !== undefined,
      opacity: look.opacity ?? 1,
    });
    const mesh = new THREE.InstancedMesh(UNIT_BOX, material, capacity);
    mesh.count = 0;
    mesh.castShadow = look.opacity === undefined;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false; // 부재가 움직이므로 경계 계산 생략
    mesh.userData.materialId = materialId;
    mesh.userData.baseColor = new THREE.Color(look.color);
    group.add(mesh);
    const batch = { mesh, capacity, ids: [] };
    batches.set(materialId, batch);
    return batch;
  }

  function clear() {
    for (const batch of batches.values()) {
      group.remove(batch.mesh);
      batch.mesh.material.dispose();
      batch.mesh.dispose();
    }
    batches.clear();
    slots.clear();
    visibleIds.clear();
  }

  /** 재료별 개수를 세어 넉넉한 크기로 배치를 만듭니다. (조각이 추가될 여유 포함) */
  function allocate(parts) {
    const counts = new Map();
    for (const p of parts) counts.set(p.material, (counts.get(p.material) ?? 0) + 1);
    for (const [materialId, count] of counts) createBatch(materialId, count * 3 + 64);
    for (const p of parts) addSlot(p);
  }

  function addSlot(part) {
    let batch = batches.get(part.material);
    if (!batch) batch = createBatch(part.material, 256);
    if (batch.ids.length >= batch.capacity) {
      // 자리가 모자라면 두 배 크기로 다시 만듭니다.
      const old = batch;
      group.remove(old.mesh);
      old.mesh.dispose();
      batch = createBatch(part.material, old.capacity * 2);
      for (const id of old.ids) {
        slots.set(id, { batch, index: batch.ids.length });
        batch.ids.push(id);
      }
    }
    slots.set(part.id, { batch, index: batch.ids.length });
    batch.ids.push(part.id);
    batch.mesh.count = batch.ids.length;
  }

  function apply(part) {
    let slot = slots.get(part.id);
    if (!slot) {
      addSlot(part); // 시뮬레이션이 추가한 조각
      slot = slots.get(part.id);
    }
    const { batch, index } = slot;
    const visible = part.state !== 'failed' && (!filter || filter(part));

    position.set(part.position[0], part.position[1], part.position[2]);
    quaternion.set(part.quaternion[0], part.quaternion[1], part.quaternion[2], part.quaternion[3]);
    if (visible) {
      scale.set(part.size[0], part.size[1], part.size[2]);
      visibleIds.add(part.id);
    } else {
      scale.copy(ZERO_SCALE);
      visibleIds.delete(part.id);
    }
    matrix.compose(position, quaternion, scale);
    batch.mesh.setMatrixAt(index, matrix);

    color.copy(batch.mesh.userData.baseColor);
    if (part.state === 'falling') color.lerp(STATE_COLORS.falling, 0.45);
    else if (part.state === 'settled') color.lerp(STATE_COLORS.settled, 0.5);
    else if (part.hp < 1) color.lerp(STATE_COLORS.damaged, 0.25 + (1 - part.hp) * 0.6);
    if (part.id === selectedId) color.lerp(STATE_COLORS.selected, 0.75);
    else if (part.id === hoveredId) color.lerp(STATE_COLORS.hovered, 0.45);
    batch.mesh.setColorAt(index, color);
  }

  function markUpdated() {
    for (const { mesh } of batches.values()) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      // 부재가 움직이므로 광선 검사용 경계를 다음 검사 때 다시 계산하게 함
      mesh.boundingSphere = null;
      mesh.boundingBox = null;
    }
  }

  return {
    setParts(parts) {
      clear();
      allocate(parts);
      for (const p of parts) apply(p);
      markUpdated();
    },
    sync(parts) {
      for (const p of parts) apply(p);
      markUpdated();
    },
    setSelected(id) {
      selectedId = id;
    },
    setHovered(id) {
      hoveredId = id;
    },
    setFilter(fn) {
      filter = fn;
    },
    /** 광선 검사 대상 메시와, 맞은 인스턴스를 부재 id로 바꾸는 함수 */
    pickables() {
      return [...batches.values()].map((b) => b.mesh);
    },
    idAt(mesh, instanceId) {
      const batch = batches.get(mesh.userData.materialId);
      const id = batch?.ids[instanceId];
      return id && visibleIds.has(id) ? id : null;
    },
    isVisible(id) {
      return visibleIds.has(id);
    },
  };
}
