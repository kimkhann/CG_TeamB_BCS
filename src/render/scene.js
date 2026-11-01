/**
 * [A · 렌더링] 공개 함수: createRenderer(container) → Renderer
 *
 * Three.js 장면, 카메라, 조명, 바닥을 만들고 부재를 화면에 그립니다.
 * 카메라 "조작"(OrbitControls)과 클릭 처리는 C의 ui/ 가 담당합니다.
 *
 * 🔧 임시 버전(베이스): 기본 조명 + 그림자 + 바닥 격자 + 대상 표시(반투명 구).
 * TODO(A): 하늘·환경광, 톤매핑 조정, 그림자 품질, 후처리 등
 */

import * as THREE from 'three';
import { on, EVENTS } from '../core/events.js';
import { createPartMeshes } from './partMeshes.js';
import { createEffects } from './effects.js';

/**
 * @typedef {import('../core/types.js').Part} Part
 * @typedef {Object} Renderer
 * @property {THREE.Scene} scene
 * @property {THREE.PerspectiveCamera} camera
 * @property {HTMLCanvasElement} domElement
 * @property {(parts:Part[])=>void} setParts      건물을 새로 그림
 * @property {(parts:Part[])=>void} syncParts     부재 위치·상태를 화면에 반영 (매 프레임)
 * @property {(partId:string|null)=>void} setSelected   선택 강조
 * @property {(partId:string|null)=>void} setHovered    마우스 올림 강조
 * @property {(fn:((part:Part)=>boolean)|null)=>void} setPartFilter  보일 부재 고르기 (외벽 숨기기, 단면 보기)
 * @property {(ndc:{x:number,y:number})=>string|null} raycast  화면 좌표(-1~1) → 보이는 부재 id
 * @property {(ndc:{x:number,y:number}, planeY?:number)=>[number,number,number]|null} raycastPoint
 *           화면 좌표 → 3D 위치. planeY를 주면 그 높이의 수평면과 만나는 점, 없으면 처음 맞는 부재 표면
 * @property {(marker:{position:[number,number,number], radius:number}|null)=>void} setTargetMarker
 *           위치·범위 대상 표시 (null이면 숨김)
 * @property {()=>THREE.Box3} getBounds   현재 건물(서 있는 부재)의 경계 상자
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

  // 위치·범위 대상 표시: 반투명 구 + 바닥 고리 + 중심점
  const marker = new THREE.Group();
  const markerSphere = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20),
    new THREE.MeshBasicMaterial({
      color: '#ff6b63',
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    }),
  );
  const markerWire = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 10),
    new THREE.MeshBasicMaterial({
      color: '#ff6b63',
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    }),
  );
  const markerCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 12, 8),
    new THREE.MeshBasicMaterial({ color: '#ffd1cc' }),
  );
  marker.add(markerSphere, markerWire, markerCore);
  marker.visible = false;
  marker.renderOrder = 10;
  scene.add(marker);

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
  /** @type {Part[]} */
  let currentParts = [];

  function castRay(ndc) {
    raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
    for (const hit of raycaster.intersectObjects(meshes.pickables(), false)) {
      const id = meshes.idAt(hit.object, hit.instanceId);
      if (id) return { id, point: hit.point };
    }
    return null;
  }

  return {
    scene,
    camera,
    domElement: renderer.domElement,
    setParts(parts) {
      currentParts = parts;
      meshes.setParts(parts);
    },
    syncParts(parts) {
      currentParts = parts;
      meshes.sync(parts);
    },
    setSelected: (id) => meshes.setSelected(id),
    setHovered: (id) => meshes.setHovered(id),
    setPartFilter: (fn) => meshes.setFilter(fn),
    raycast(ndc) {
      return castRay(ndc)?.id ?? null;
    },
    raycastPoint(ndc, planeY) {
      if (planeY === undefined) {
        const hit = castRay(ndc);
        return hit ? [hit.point.x, hit.point.y, hit.point.z] : null;
      }
      raycaster.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
      const point = raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      return point ? [point.x, point.y, point.z] : null;
    },
    setTargetMarker(target) {
      marker.visible = !!target;
      if (!target) return;
      marker.position.set(...target.position);
      markerSphere.scale.setScalar(target.radius);
      markerWire.scale.setScalar(target.radius);
    },
    getBounds() {
      const box = new THREE.Box3();
      for (const p of currentParts) {
        if (p.state !== 'intact' && p.state !== 'damaged') continue;
        const half = new THREE.Vector3(p.size[0] / 2, p.size[1] / 2, p.size[2] / 2);
        const center = new THREE.Vector3(...p.position);
        box.expandByPoint(center.clone().sub(half));
        box.expandByPoint(center.add(half));
      }
      return box;
    },
    update(dt) {
      effects.update(dt);
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
