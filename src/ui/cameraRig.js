/**
 * [C · 화면] 카메라 조작
 *
 * 드래그 회전, 스크롤 확대, 건물에 맞춰 카메라 위치 조정, 설정 화면에서 자동 회전.
 *
 * 🔧 임시 버전(베이스): OrbitControls 기본 설정.
 * TODO(C): 녹화용 자동 카메라 경로, 부재 선택 시 해당 위치로 이동
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** @param {import('../render/scene.js').Renderer} renderer */
export function createCameraRig(renderer) {
  const controls = new OrbitControls(renderer.camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49; // 바닥 아래로 내려가지 않게
  controls.minDistance = 5;
  controls.maxDistance = 120;
  controls.autoRotateSpeed = 0.8;

  return {
    /** 현재 건물이 화면에 들어오도록 카메라 거리 · 중심을 맞춥니다. */
    frameBuilding() {
      const box = renderer.getBounds();
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z);
      const direction = renderer.camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(center);
      renderer.camera.position.copy(center).addScaledVector(direction, radius * 1.9 + 6);
      controls.update();
    },
    setAutoRotate(enabled) {
      controls.autoRotate = enabled;
    },
    update() {
      controls.update();
    },
  };
}
