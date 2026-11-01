/**
 * [A · 렌더링] 재료별 겉모습
 *
 * 키는 data/ids.js 의 재료 ID와 같아야 합니다.
 * 🔧 임시 버전(베이스): 색 · 거칠기 · 금속성 · 투명도만 있습니다.
 * TODO(A): 텍스처(public/textures/), 노멀맵, 손상 표현 등
 */

export const materialLooks = {
  rc: { color: '#9a9b97', roughness: 0.9, metalness: 0.0 },
  steel: { color: '#6f7d89', roughness: 0.45, metalness: 0.6 },
  wood: { color: '#a8743f', roughness: 0.8, metalness: 0.0 },
  brick: { color: '#a45a3f', roughness: 0.95, metalness: 0.0 },
  panel: { color: '#cfcac0', roughness: 0.7, metalness: 0.1 },
  window: { color: '#6fa6c9', roughness: 0.15, metalness: 0.2, opacity: 0.7 },
  curtain: { color: '#8cc6e4', roughness: 0.05, metalness: 0.4, opacity: 0.5 },
};
