/**
 * [A · 렌더링] 공개 함수: createRenderer(container) → Renderer
 *
 * Three.js 장면, 카메라, 조명, 바닥을 만들고 부재를 화면에 그립니다.
 * 카메라 "조작"(OrbitControls)은 C의 ui/cameraRig.js 가 담당합니다.
 *
 * 🔧 임시 버전(베이스): 기본 조명 + 그림자 + 바닥 격자.
 * TODO(A): 하늘·환경광, 톤매핑 조정, 그림자 품질, 후처리 등
 */

import * as THREE from 'three';
import { on, EVENTS } from '../core/events.js';
import { createPartMeshes } from './partMeshes.js';
import { createEffects } from './effects.js';

/**
 * @typedef {Object} Renderer
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {HTMLCanvasElement} domElement
 * @property {(parts:import('../core/types.js').Part[])=>void} setParts   건물을 새로 그림
 * @property {(parts:import('../core/types.js').Part[])=>void} syncParts  부재 위치·상태를 화면에 반영 (매 프레임)
 * @property {(partId:string|null)=>void} setSelected   선택 강조
 * @property {(partId:string|null)=>void} setHovered    마우스 올림 강조
 * @property {(ndc:{x:number,y:number})=>string|null} raycast  화면 좌표(-1~1) → 부재 id
 * @property {()=>THREE.Box3} getBounds   현재 건물의 경계 상자
 * @property {(dt:number)=>void} update   이펙트 등 시간 갱신
 * @property {()=>void} render
 */

/**
 * @param {HTMLElement} container
 * @returns {Renderer}
 */
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1c2533');
  scene.fog = new THREE.Fog('#1c2533', 60, 160);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(24, 18, 26);
  camera.lookAt(0, 6, 0);

  // 조명
  scene.add(new THREE.HemisphereLight('#dfe9f5', '#3a3328', 1.2));
  const sun = new THREE.DirectionalLight('#ffffff', 2.2);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 25;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 90 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);

  // 바닥
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: '#3b4553', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(120, 60, '#56657a', '#46536a');
  grid.position.y = 0.01;
  scene.add(grid);

  const meshes = createPartMeshes(scene);
  const effects = createEffects(scene);
  on(EVENTS.IMPACT, (event) => effects.play(event));

  // 크기 맞추기
  function resize() {
    const { clientWidth: w, clientHeight: h } = container;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const raycaster = new THREE.Raycaster();

  return {
    scene,
    camera,
    domElement: renderer.domElement,
    setParts: (parts) => meshes.setParts(parts),
    syncParts: (parts) => meshes.sync(parts),
    setSelected: (id) => meshes.setSelected(id),
    setHovered: (id) => meshes.setHovered(id),
    raycast(ndc) {
      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
      const hit = raycaster.intersectObjects(meshes.pickables(), false)[0];
      return hit ? hit.object.userData.partId : null;
    },
    getBounds: () => meshes.bounds(),
    update(dt) {
      effects.update(dt);
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
