/**
 * [A · 렌더링] 이펙트
 *
 * EVENTS.IMPACT 를 받아 충격 지점에 효과를 그립니다.
 * payload: { position:[x,y,z], energy:number, kind:'impact'|'explosion'|'collision'|'fire', radius?:number }
 *
 * 🔧 임시 버전(베이스): 커졌다 사라지는 반투명 구 하나.
 * TODO(A): 먼지 구름, 파편 파티클, 불꽃 · 연기, 충격파 링
 */

import * as THREE from 'three';

const COLORS = {
  impact: '#ffb15c',
  explosion: '#ff6b3d',
  collision: '#c9c2b6',
  fire: '#ff8a1f',
};

export function createEffects(scene) {
  const active = [];
  const geometry = new THREE.SphereGeometry(1, 16, 12);

  return {
    play({ position, energy = 0.5, kind = 'impact', radius }) {
      if (!position) return;
      const material = new THREE.MeshBasicMaterial({
        color: COLORS[kind] ?? COLORS.impact,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      scene.add(mesh);
      const maxSize = radius ?? (kind === 'explosion' ? 2 + energy * 6 : 0.5 + energy * 1.5);
      active.push({ mesh, age: 0, life: kind === 'explosion' ? 0.9 : 0.5, maxSize });
    },
    update(dt) {
      for (let i = active.length - 1; i >= 0; i--) {
        const e = active[i];
        e.age += dt;
        const t = e.age / e.life;
        e.mesh.scale.setScalar(0.1 + e.maxSize * t);
        e.mesh.material.opacity = 0.6 * (1 - t);
        if (t >= 1) {
          scene.remove(e.mesh);
          e.mesh.material.dispose();
          active.splice(i, 1);
        }
      }
    },
  };
}
