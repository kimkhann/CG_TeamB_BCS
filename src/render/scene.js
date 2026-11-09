/**
 * [A · 렌더링] 공개 함수: createRenderer(container) → Renderer
 *
 * Three.js 장면, 카메라, 조명, 바닥을 만들고 부재를 화면에 그립니다.
 * 카메라 "조작"(OrbitControls)과 클릭 처리는 C의 ui/ 가 담당합니다.
 *
 * 절차 표면, 환경 반사, 건물 크기에 맞춘 실시간 그림자, 대상 표시.
 */

import * as THREE from 'three';
import { on, EVENTS } from '../core/events.js';
import { createPartMeshes } from './partMeshes.js';
import { createEffects } from './effects.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildingBounds, fitSunToBounds } from './buildingBounds.js';
import { createSite } from './site.js';

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c6d2db');
  scene.fog = new THREE.Fog('#c6d2db', 60, 175);
  // 네트워크 HDR 대신 Three.js의 절차적 실내 환경을 미리 필터링해 반사에 사용합니다.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room, 0.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = 0.45;
  room.dispose();
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
  camera.position.set(24, 18, 26);
  camera.lookAt(0, 6, 0);

  // 조명
  scene.add(new THREE.HemisphereLight('#e4f0ff', '#8c8172', 1.35));
  const sun = new THREE.DirectionalLight('#fff0d9', 3.1);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 25;
  Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s, near: 1, far: 90 });
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.DirectionalLight('#b6d3f2', 0.8);
  fill.position.set(-16, 10, -20);
  scene.add(fill);

  // 바닥
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: '#929e8d', roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  // 도로는 연석보다 낮게 놓이므로 바탕 지면도 도로 아래로 내려 겹침을 피합니다.
  ground.position.y = -0.06;
  ground.receiveShadow = true;
  scene.add(ground);
  const site = createSite(scene);
  const meshes = createPartMeshes(scene, {
    anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
  });
  const effects = createEffects(scene);
  on(EVENTS.IMPACT, (event) => {
    effects.play(event);
    if (event.kind === 'fire') meshes.scorchAt(event);
  });
  on(EVENTS.SIM_RESET, () => effects.clear());

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
  let shadowTimer = 0;

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
      effects.clear();
      const bounds = buildingBounds(parts);
      fitSunToBounds(sun, bounds.clone().union(site.getShadowBounds()));
      site.setBuilding(parts, bounds);
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
      return buildingBounds(currentParts);
    },
    update(dt) {
      effects.update(dt);
      shadowTimer += dt;
      if (shadowTimer >= 0.5) {
        shadowTimer = 0;
        if (currentParts.some((p) => p.state === 'falling')) {
          fitSunToBounds(sun, buildingBounds(currentParts, false).union(site.getShadowBounds()));
        }
      }
    },
    getDiagnostics() {
      return {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        context: site.getDiagnostics(),
      };
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}
