/**
 * [B · 시뮬레이션] 결과 계산
 *
 * 🔧 임시 버전(베이스): 무너진 비율, 처음 기능을 잃은 부재, 무너진 층 수.
 * TODO(B): 가장 위험했던 부재 순위, 붕괴까지 걸린 시간, 재료 비교용 지표
 */

/**
 * @param {import('../core/types.js').Part[]} parts
 * @param {{ time:number, firstFailedPartId:string|null, finished:boolean }} info
 * @returns {import('../core/types.js').SimResults}
 */
export function computeResults(parts, { time, firstFailedPartId, finished }) {
  const counted = parts.filter((p) => p.kind !== 'fragment' && p.structural);
  const collapsed = counted.filter((p) => p.state !== 'intact' && p.state !== 'damaged');

  // 층별로 바닥판이 모두 무너졌으면 그 층은 무너진 것으로 봄
  const slabsByFloor = new Map();
  for (const p of counted) {
    if (p.kind !== 'slab' && p.kind !== 'roof') continue;
    if (!slabsByFloor.has(p.floor)) slabsByFloor.set(p.floor, []);
    slabsByFloor.get(p.floor).push(p);
  }
  let floorsLost = 0;
  for (const slabs of slabsByFloor.values()) {
    if (slabs.every((s) => s.state === 'falling' || s.state === 'settled')) floorsLost++;
  }

  return {
    time,
    totalParts: counted.length,
    collapsedParts: collapsed.length,
    collapsedRatio: counted.length ? collapsed.length / counted.length : 0,
    firstFailedPartId,
    floorsLost,
    finished,
  };
}
