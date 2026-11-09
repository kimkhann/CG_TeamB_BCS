/** [A] 외부 파일 없이 결정적으로 만드는 타일형 색/높이/거칠기 텍스처. */
import * as THREE from 'three';

function noise(x, y, seed = 17) {
  let n = Math.imul(x + 1, 374761393) ^ Math.imul(y + 1, 668265263) ^ seed;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const fract = (x) => x - Math.floor(x);
const byte = (x) => Math.round(Math.max(0, Math.min(1, x)) * 255);

/** 순수 픽셀 생성 함수이므로 Node에서도 크기·반복성·재현성을 검증할 수 있습니다. */
export function makeSurfacePixels(pattern, size = 256) {
  const color = new Uint8Array(size * size * 4);
  const relief = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size,
        v = y / size;
      const grain = noise(x, y);
      let tone = 0.91,
        height = 0.5,
        rough = 0.9,
        mortar = 0;
      if (pattern === 'brick') {
        const row = Math.floor(v * 16);
        const bx = fract(u * 8 + (row % 2) * 0.5);
        const by = fract(v * 16);
        const joint = Math.min(bx, 1 - bx) < 0.035 || Math.min(by, 1 - by) < 0.09;
        const variation = noise(Math.floor(u * 8 + (row % 2) * 0.5), row, 37);
        tone = joint ? 0.74 : 0.78 + variation * 0.19 + grain * 0.03;
        mortar = joint ? 1 : 0;
        height = joint ? 0.12 : 0.7 + grain * 0.12;
      } else if (pattern === 'wood') {
        const wave = Math.sin(2 * Math.PI * (u * 28 + Math.sin(v * Math.PI * 4) * 0.45));
        const fine = Math.sin(u * Math.PI * 180 + Math.sin(v * Math.PI * 8));
        const seam = Math.min(fract(u * 6), 1 - fract(u * 6)) < 0.018;
        tone = seam ? 0.39 : 0.81 + wave * 0.065 + fine * 0.025 + grain * 0.08;
        height = seam ? 0.1 : 0.55 + wave * 0.1;
        rough = 0.75 + grain * 0.2;
      } else if (pattern === 'concrete') {
        const pore = grain > 0.975;
        const formwork = Math.min(fract(v * 2), 1 - fract(v * 2)) < 0.005;
        tone = pore ? 0.61 : 0.84 + grain * 0.13;
        if (formwork) tone *= 0.9;
        height = pore ? 0.1 : 0.4 + grain * 0.2;
      } else if (pattern === 'steel') {
        tone = 0.86 + noise(x, 0, 9) * 0.1 + grain * 0.025;
        height = noise(x, 0, 9) * 0.16 + 0.45;
        rough = 0.72 + grain * 0.18;
      } else if (pattern === 'panel') {
        const seam = Math.min(fract(u * 4), 1 - fract(u * 4)) < 0.012;
        tone = seam ? 0.65 : 0.94 + grain * 0.035;
        height = seam ? 0.12 : 0.6;
        rough = 0.8;
      } else {
        tone = 0.98;
        rough = 0.85;
      }
      const i = (y * size + x) * 4;
      color[i] = color[i + 1] = color[i + 2] = byte(tone);
      color[i + 3] = byte(mortar); // 커스텀 셰이더의 회색 줄눈 마스크, 투명도와 별개
      relief[i] = byte(height);
      relief[i + 1] = byte(rough);
      relief[i + 2] = 0;
      relief[i + 3] = 255;
    }
  }
  return { color, relief, size };
}

export function createSurfaceTextures(pattern, anisotropy = 4) {
  const pixels = makeSurfacePixels(pattern);
  function texture(data, colorSpace) {
    const map = new THREE.DataTexture(data, pixels.size, pixels.size, THREE.RGBAFormat);
    map.colorSpace = colorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter;
    map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true;
    map.anisotropy = anisotropy;
    map.needsUpdate = true;
    return map;
  }
  return {
    color: texture(pixels.color, THREE.SRGBColorSpace),
    relief: texture(pixels.relief, THREE.NoColorSpace),
  };
}
