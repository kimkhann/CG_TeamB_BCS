/**
 * [A · 렌더링] 재료별 겉모습
 *
 * 키는 data/ids.js 의 재료 ID와 같아야 합니다.
 * pattern: A의 절차적 텍스처 종류. tileSize: 텍스처 한 장의 실제 길이(m).
 * relief: 표면 요철 높이(m). 물리 형상을 바꾸지 않는 시각적 범프입니다.
 */

export const materialLooks = {
  rc: {
    color: '#c4c0b3',
    roughness: 0.88,
    metalness: 0,
    pattern: 'concrete',
    tileSize: 2,
    relief: 0.012,
  },
  steel: {
    color: '#667987',
    roughness: 0.34,
    metalness: 0.85,
    pattern: 'steel',
    tileSize: 1,
    relief: 0.001,
  },
  wood: {
    color: '#b88953',
    roughness: 0.7,
    metalness: 0,
    pattern: 'wood',
    tileSize: 2,
    relief: 0.008,
  },
  brick: {
    color: '#b06d50',
    roughness: 0.94,
    metalness: 0,
    pattern: 'brick',
    tileSize: 2,
    relief: 0.018,
  },
  panel: {
    color: '#d9ded8',
    roughness: 0.62,
    metalness: 0.12,
    pattern: 'panel',
    tileSize: 2,
    relief: 0.006,
  },
  window: {
    color: '#7fa1b0',
    roughness: 0.19,
    metalness: 0.25,
    opacity: 0.58,
    pattern: 'glass',
    tileSize: 2,
    relief: 0,
  },
  curtain: {
    color: '#7199a5',
    roughness: 0.12,
    metalness: 0.45,
    opacity: 0.7,
    pattern: 'glass',
    tileSize: 2,
    relief: 0,
  },
};
