/**
 * [A · 렌더링] 부재 → 메시 (InstancedMesh)
 *
 * 같은 재료의 부재를 InstancedMesh 하나로 묶어 그립니다. 부재가 1,000개가 넘어도
 * 기본 부재의 그리기 호출을 재료별로 묶습니다. 창틀/그림자 등은 추가 패스입니다.
 * 매 프레임 비교하되 달라진 위치 · 회전 · 상태(색)만 인스턴스에 반영합니다.
 *
 * 숨김: state 'failed' 이거나, setFilter() 로 넘긴 함수가 false 를 돌려주는 부재 (크기 0으로 처리)
 *
 * 실측 크기 절차 텍스처 + 인스턴스별 균열/그을림, 유리와 함께 움직이는 창틀.
 */

import * as THREE from 'three';
import { materialLooks } from '../data/materialLooks.js';
import { STATE_COLORS as STATE_COLOR_DATA, HOVER_COLOR } from '../data/stateColors.js';
import { createSurfaceTextures } from './surfaceTextures.js';
import { createSurfaceMaterial } from './surfaceMaterial.js';
import { createWindowFrames } from './windowFrames.js';

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

export function createPartMeshes(scene, { anisotropy = 4 } = {}) {
  const group = new THREE.Group();
  scene.add(group);
  const frames = createWindowFrames(group);
  const textureCache = new Map();
  const scorch = new Map();
  const dirtyAttributes = new Set();
  let framesDirty = false;
  let currentParts = [];

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

  function touch(attribute, index) {
    // 렌더링 전 여러 번 바뀌어도 아직 업로드하지 않은 범위를 함께 보존합니다.
    const start = index * attribute.itemSize;
    const range = attribute.updateRanges[0];
    if (range) {
      const end = Math.max(range.start + range.count, start + attribute.itemSize);
      range.start = Math.min(range.start, start);
      range.count = end - range.start;
    } else attribute.addUpdateRange(start, attribute.itemSize);
    dirtyAttributes.add(attribute);
  }

  function createBatch(materialId, capacity) {
    const look = materialLooks[materialId] ?? materialLooks.rc;
    if (!textureCache.has(look.pattern)) {
      textureCache.set(look.pattern, createSurfaceTextures(look.pattern, anisotropy));
    }
    const material = createSurfaceMaterial(look, textureCache.get(look.pattern));
    const geometry = UNIT_BOX.clone();
    geometry.setAttribute(
      'aSurfaceOrigin',
      new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3),
    );
    geometry.setAttribute(
      'aSurfaceDamage',
      new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(
        THREE.DynamicDrawUsage,
      ),
    );
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(capacity * 3),
      3,
    ).setUsage(THREE.DynamicDrawUsage);
    for (const attribute of [
      mesh.instanceMatrix,
      mesh.instanceColor,
      geometry.getAttribute('aSurfaceOrigin'),
      geometry.getAttribute('aSurfaceDamage'),
    ]) {
      attribute.onUpload(() => attribute.clearUpdateRanges());
    }
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
      batch.mesh.geometry.dispose();
      batch.mesh.dispose();
    }
    batches.clear();
    slots.clear();
    visibleIds.clear();
    scorch.clear();
    frames.clear();
    dirtyAttributes.clear();
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
      batch = createBatch(part.material, old.capacity * 2);
      // 분리 조각으로 용량을 늘려도 이미 그린 인스턴스와 초기 텍스처 좌표가 보존됩니다.
      batch.mesh.instanceMatrix.array.set(old.mesh.instanceMatrix.array);
      if (old.mesh.instanceColor) {
        batch.mesh.instanceColor.array.set(old.mesh.instanceColor.array);
      }
      for (const name of ['aSurfaceOrigin', 'aSurfaceDamage']) {
        batch.mesh.geometry
          .getAttribute(name)
          .array.set(old.mesh.geometry.getAttribute(name).array);
      }
      for (const id of old.ids) {
        slots.get(id).batch = batch;
        batch.ids.push(id);
      }
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
      old.mesh.dispose();
    }
    slots.set(part.id, {
      batch,
      index: batch.ids.length,
      pose: new Float64Array(10).fill(NaN),
      parentId: part.id.split('-frag-')[0],
    });
    batch.mesh.geometry.getAttribute('aSurfaceOrigin').setXYZ(batch.ids.length, ...part.position);
    touch(batch.mesh.geometry.getAttribute('aSurfaceOrigin'), batch.ids.length);
    batch.ids.push(part.id);
    batch.mesh.count = batch.ids.length;
  }

  function apply(part) {
    let slot = slots.get(part.id);
    if (!slot) {
      addSlot(part); // 시뮬레이션이 추가한 조각
      slot = slots.get(part.id);
    }
    const { batch, index, pose } = slot;
    const visible = part.state !== 'failed' && (!filter || filter(part));
    let moved = visible !== slot.visible;
    if (visible) {
      for (let i = 0; i < 3; i++)
        moved ||= part.position[i] !== pose[i] || part.size[i] !== pose[i + 7];
      for (let i = 0; i < 4; i++) moved ||= part.quaternion[i] !== pose[i + 3];
    }
    if (moved) {
      position.fromArray(part.position);
      quaternion.fromArray(part.quaternion);
      if (visible) scale.fromArray(part.size);
      else scale.copy(ZERO_SCALE);
      batch.mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
      touch(batch.mesh.instanceMatrix, index);
      batch.mesh.boundingSphere = batch.mesh.boundingBox = null;
      pose.set(part.position);
      pose.set(part.quaternion, 3);
      pose.set(part.size, 7);
      slot.visible = visible;
      if (visible) visibleIds.add(part.id);
      else visibleIds.delete(part.id);
    }
    if (part.kind === 'window' && moved) framesDirty = true;
    if (!visible) return;

    const selected = part.id === selectedId,
      hovered = !selected && part.id === hoveredId;
    const tint = part.view?.tint;
    const hpChanged = slot.hp !== part.hp;
    if (
      slot.state !== part.state ||
      hpChanged ||
      slot.tint !== tint ||
      slot.selected !== selected ||
      slot.hovered !== hovered
    ) {
      color.copy(batch.mesh.userData.baseColor);
      if (tint) color.set(tint);
      if (part.state === 'falling') color.lerp(STATE_COLORS.falling, 0.45);
      else if (part.state === 'settled') color.lerp(STATE_COLORS.settled, 0.5);
      else if (part.hp < 1) color.lerp(STATE_COLORS.damaged, 0.25 + (1 - part.hp) * 0.6);
      if (selected) color.lerp(STATE_COLORS.selected, 0.75);
      else if (hovered) color.lerp(STATE_COLORS.hovered, 0.45);
      batch.mesh.setColorAt(index, color);
      touch(batch.mesh.instanceColor, index);
      Object.assign(slot, { state: part.state, hp: part.hp, tint, selected, hovered });
      if (part.kind === 'window') framesDirty = true;
    }
    const burnt = Math.max(scorch.get(part.id) ?? 0, scorch.get(slot.parentId) ?? 0);
    if (hpChanged || slot.scorch !== burnt) {
      const attribute = batch.mesh.geometry.getAttribute('aSurfaceDamage');
      attribute.setXY(index, Math.max(0, 1 - part.hp), burnt);
      touch(attribute, index);
      slot.scorch = burnt;
    }
  }

  function sync(parts) {
    currentParts = parts;
    framesDirty = false;
    for (const part of parts) apply(part);
    for (const attribute of dirtyAttributes) attribute.needsUpdate = true;
    const changed = dirtyAttributes.size > 0;
    dirtyAttributes.clear();
    if (framesDirty) frames.sync(parts, visibleIds, selectedId, hoveredId);
    return changed;
  }

  return {
    setParts(parts) {
      clear();
      allocate(parts);
      return sync(parts);
    },
    sync,
    /** 불의 표시만 누적합니다. HP/물리/시나리오 계산은 B가 담당합니다. */
    scorchAt({ position, radius = 3, energy = 0.5 }) {
      const point = new THREE.Vector3(),
        inverse = new THREE.Quaternion(),
        center = new THREE.Vector3();
      for (const p of currentParts) {
        if (p.state === 'failed') continue;
        inverse.fromArray(p.quaternion).invert();
        point.fromArray(position).sub(center.fromArray(p.position)).applyQuaternion(inverse);
        let distance2 = 0;
        for (let i = 0; i < 3; i++)
          distance2 += Math.max(0, Math.abs(point.getComponent(i)) - p.size[i] / 2) ** 2;
        const distance = Math.sqrt(distance2);
        if (distance < radius) {
          scorch.set(
            p.id,
            Math.min(1, (scorch.get(p.id) ?? 0) + energy * 0.12 * (1 - distance / radius)),
          );
        }
      }
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
