/**
 * [A] 기존 IMPACT 이벤트를 먼지/불꽃/연기/충격파로 표시합니다.
 * 최대 384개 시각 파티클을 재사용하며 B의 강체/HP/시나리오에는 관여하지 않습니다.
 */
import * as THREE from 'three';

const LIMIT = 384;

export function createEffects(scene) {
  const positions = new Float32Array(LIMIT * 3);
  const colors = new Float32Array(LIMIT * 3);
  const alphas = new Float32Array(LIMIT);
  const sizes = new Float32Array(LIMIT);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'color',
    new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'aAlpha',
    new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geometry.setAttribute(
    'aSize',
    new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage),
  );
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    vertexShader: `
attribute float aAlpha;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_PointSize = clamp(aSize * 450.0 / max(1.0, -p.z), 1.0, 96.0);
  vColor = color; vAlpha = aAlpha;
}`,
    fragmentShader: `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
  float a = vAlpha * exp(-r * r * 2.5) * (1.0 - smoothstep(0.65, 1.0, r));
  if (a < 0.008) discard;
  gl_FragColor = vec4(vColor, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  const particles = Array.from({ length: LIMIT }, () => ({ active: false }));
  const rings = [];
  const ringGeometry = new THREE.RingGeometry(0.92, 1, 64);
  let cursor = 0;
  let seed = 41;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const color = new THREE.Color();

  function spawn(position, kind, energy, radius) {
    const i = cursor++ % LIMIT;
    const flame = kind === 'fire';
    const smoke = flame && random() > 0.55;
    const angle = random() * Math.PI * 2;
    const speed = (flame ? 0.4 : 1.5 + energy * 4) * random();
    const spread = flame ? Math.min(radius * 0.22, 0.8) : 0.18;
    particles[i] = {
      active: true,
      age: 0,
      life: flame ? (smoke ? 2.2 : 0.65) : 1.2 + random() * 0.9,
      x: position[0] + (random() - 0.5) * spread,
      y: Math.max(0.08, position[1] + (random() - 0.5) * spread),
      z: position[2] + (random() - 0.5) * spread,
      vx: Math.cos(angle) * speed,
      vz: Math.sin(angle) * speed,
      vy: flame ? 1.1 + random() : 0.8 + random() * 2.2,
      baseSize: flame ? (smoke ? 0.8 : 0.45) : 0.65 + random() * 0.9,
      lift: flame ? 0.45 : -1.2,
      alpha: flame ? (smoke ? 0.32 : 0.85) : 0.38,
    };
    color.set(flame ? (smoke ? '#5d6267' : '#ff9d32') : '#a99e8c');
    colors.set([color.r, color.g, color.b], i * 3);
  }

  function clear() {
    for (const p of particles) p.active = false;
    alphas.fill(0);
    geometry.attributes.aAlpha.needsUpdate = true;
    for (const ring of rings) {
      scene.remove(ring.mesh);
      ring.mesh.material.dispose();
    }
    rings.length = 0;
  }

  return {
    clear,
    play({ position, energy = 0.5, kind = 'impact', radius = 3 }) {
      if (!position) return;
      const count = kind === 'fire' ? 18 : Math.round(16 + energy * 32);
      for (let i = 0; i < count; i++) spawn(position, kind, energy, radius);
      if (kind === 'explosion' || kind === 'impact') {
        // 효과가 겹쳐도 충격파 메시를 계속 늘리지 않도록 제한합니다.
        if (rings.length >= 8) {
          const old = rings.shift();
          scene.remove(old.mesh);
          old.mesh.material.dispose();
        }
        const mesh = new THREE.Mesh(
          ringGeometry,
          new THREE.MeshBasicMaterial({
            color: kind === 'explosion' ? '#ffb66f' : '#f5dbad',
            transparent: true,
            opacity: 0.5,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(position[0], Math.max(0.04, position[1]), position[2]);
        scene.add(mesh);
        rings.push({ mesh, age: 0, radius: kind === 'explosion' ? radius : 1.5 });
      }
    },
    update(dt) {
      let active = false;
      for (let i = 0; i < LIMIT; i++) {
        const p = particles[i];
        if (!p.active) continue;
        p.age += dt;
        if (p.age >= p.life) {
          p.active = false;
          alphas[i] = 0;
          continue;
        }
        active = true;
        p.vy += p.lift * dt;
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.y = Math.max(0.06, p.y + p.vy * dt);
        p.vx *= Math.exp(-dt);
        p.vz *= Math.exp(-dt);
        positions.set([p.x, p.y, p.z], i * 3);
        const t = p.age / p.life;
        alphas[i] = p.alpha * Math.min(1, t * 12) * (1 - t);
        sizes[i] = p.baseSize * (0.6 + t * 1.7);
      }
      points.visible = active;
      if (active) {
        for (const attr of Object.values(geometry.attributes)) attr.needsUpdate = true;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.age += dt;
        ring.mesh.scale.setScalar(Math.max(0.01, (ring.radius * ring.age) / 0.65));
        ring.mesh.material.opacity = Math.max(0, 0.45 * (1 - ring.age / 0.65));
        if (ring.age >= 0.65) {
          scene.remove(ring.mesh);
          ring.mesh.material.dispose();
          rings.splice(i, 1);
        }
      }
    },
  };
}
