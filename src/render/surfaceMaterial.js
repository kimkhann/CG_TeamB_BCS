/**
 * [A] 표준 PBR 조명/그림자는 유지하고 표면 매핑·손상만 확장합니다.
 * 인스턴스별 속성 아이디어: Troika InstancedUniformsMesh (A_NOTES.md 참고).
 * 텍스처 좌표는 초기 위치 + 부재 로컬 좌표: 낙하/회전 시 무늬가 붙어서 움직입니다.
 */
import * as THREE from 'three';

const VARYINGS = `
varying vec3 vSurfacePosition;
varying vec3 vSurfaceNormal;
varying vec2 vSurfaceDamage;
`;

export function createSurfaceMaterial(look, textures) {
  const material = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: look.roughness,
    metalness: look.metalness,
    transparent: look.opacity !== undefined,
    opacity: look.opacity ?? 1,
    depthWrite: look.opacity === undefined,
  });
  material.customProgramCacheKey = () => 'collapse-surface-v1';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uSurfaceColor: { value: textures.color },
      uSurfaceRelief: { value: textures.relief },
      uSurfaceTile: { value: look.tileSize ?? 2 },
      uSurfaceBump: { value: look.relief ?? 0 },
      uSurfaceGlass: { value: look.opacity !== undefined ? 1 : 0 },
    });
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
#include <common>
attribute vec3 aSurfaceOrigin;
attribute vec2 aSurfaceDamage;
${VARYINGS}`,
    );
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
#include <begin_vertex>
vec3 partScale = vec3(1.0);
#ifdef USE_INSTANCING
  partScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
#endif
vSurfacePosition = position * partScale + aSurfaceOrigin;
vSurfaceNormal = normal;
vSurfaceDamage = aSurfaceDamage;
`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `
#include <common>
${VARYINGS}
uniform sampler2D uSurfaceColor;
uniform sampler2D uSurfaceRelief;
uniform float uSurfaceTile;
uniform float uSurfaceBump;
uniform float uSurfaceGlass;
vec3 surfaceWeights() {
  vec3 w = pow(abs(normalize(vSurfaceNormal)), vec3(5.0));
  return w / max(dot(w, vec3(1.0)), 0.0001);
}
vec4 surfaceSample(sampler2D tex) {
  vec3 p = vSurfacePosition / uSurfaceTile;
  vec3 w = surfaceWeights();
  // 평평한 상자 면에서는 한 축만 샘플링합니다. 일반 면은 삼면 혼합을 유지합니다.
  if (w.x > 0.999) return texture2D(tex, p.zy);
  if (w.y > 0.999) return texture2D(tex, p.xz);
  if (w.z > 0.999) return texture2D(tex, p.xy);
  return texture2D(tex, p.zy) * w.x + texture2D(tex, p.xz) * w.y + texture2D(tex, p.xy) * w.z;
}
vec3 surfaceBump(vec3 n, float h) {
  vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
  vec3 r1 = cross(dy, n), r2 = cross(n, dx);
  float det = dot(dx, r1) * (gl_FrontFacing ? 1.0 : -1.0);
  vec3 gradient = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
  return normalize(abs(det) * n - gradient);
}
`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      `
vec4 surfaceColor = surfaceSample(uSurfaceColor);
vec4 surfaceRelief = surfaceSample(uSurfaceRelief);
diffuseColor.rgb *= surfaceColor.rgb;
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.46), surfaceColor.a * 0.76);
float damage = clamp(vSurfaceDamage.x, 0.0, 1.0);
float scorch = clamp(vSurfaceDamage.y, 0.0, 1.0);
if (damage > 0.025) {
  vec3 p = vSurfacePosition;
  vec3 w = surfaceWeights();
  vec2 uv = p.zy * w.x + p.xz * w.y + p.xy * w.z;
  float bend = sin(uv.y * 9.0) * 0.7 + sin(uv.y * 23.0) * 0.18;
  float seam = abs(sin(uv.x * 5.7 + uv.y * 2.8 + bend));
  float lineWidth = 0.018 + damage * 0.055;
  float lineAA = max(fwidth(seam), 0.002);
  float crack = 1.0 - smoothstep(lineWidth, lineWidth + lineAA, seam);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.07, 0.055, 0.04), crack * damage * 0.9);
}
diffuseColor.rgb *= mix(vec3(1.0), vec3(0.17, 0.13, 0.10), scorch);
`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <roughnessmap_fragment>',
      `
#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * (0.8 + surfaceRelief.g * 0.28)
  + vSurfaceDamage.y * 0.20, 0.04, 1.0);
`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `
#include <normal_fragment_maps>
if (uSurfaceBump > 0.0 && uSurfaceGlass < 0.5) {
  normal = surfaceBump(normal, surfaceRelief.r * uSurfaceBump);
}
`,
    );
  };
  return material;
}
