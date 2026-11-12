import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/** @param {import('../render/scene.js').Renderer} renderer */
export function createCameraRig(renderer) {
  const controls = new OrbitControls(renderer.camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 5;
  controls.maxDistance = 120;
  controls.autoRotateSpeed = 0.8;

  return {
    frameBuilding() {
      const box = renderer.getBounds();
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      // Fit both portrait and landscape viewports, including the results column.
      const radius = size.length() / 2;
      const vertical = THREE.MathUtils.degToRad(renderer.camera.fov) / 2;
      const horizontal = Math.atan(Math.tan(vertical) * renderer.camera.aspect);
      const distance = (radius / Math.sin(Math.min(vertical, horizontal))) * 1.12;
      const direction = renderer.camera.position.clone().sub(controls.target).normalize();
      controls.target.copy(center);
      renderer.camera.position.copy(center).addScaledVector(direction, distance);
      controls.update();
    },
    setAutoRotate(enabled) {
      controls.autoRotate =
        enabled && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    },
    update() {
      controls.update();
    },
  };
}
