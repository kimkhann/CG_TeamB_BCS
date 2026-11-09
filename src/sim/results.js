/**
 * [B · 시뮬레이션] 결과 계산
 *
 * 무너진 비율, 처음 기능을 잃은 부재, 무너진 층 수
 * + (B-6) 붕괴 진행 시간, 층별 피해율, 원인별 피해
 */

/**
 * @param {import('../core/types.js').Part[]} parts
 * @param {{ time:number, firstFailedPartId:string|null, finished:boolean,
 *           collapseTime?:number|null, damageByCause?:{scenario:number, collision:number, debris:number} }} info
 * @returns {import('../core/types.js').SimResults}
 */
export function computeResults(
  parts,
  { time, firstFailedPartId, finished, collapseTime = null, damageByCause },
) {
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
    if (slabs.every((s) => s.state === 'falling' || s.state === 'settled' || s.state === 'failed'))
      floorsLost++;
  }

  // 층별 피해율: 그 층 구조 부재의 평균 체력 손실 (떨어졌거나 기능을 잃은 부재는 1)
  const perFloor = new Map();
  for (const p of counted) {
    const loss = p.state === 'intact' || p.state === 'damaged' ? 1 - p.hp : 1;
    const f = perFloor.get(p.floor) ?? { sum: 0, count: 0 };
    f.sum += loss;
    f.count++;
    perFloor.set(p.floor, f);
  }
  const floorDamage = [...perFloor.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([floor, f]) => ({ floor, ratio: f.sum / f.count }));

  // 원인별 피해: 깎인 체력 합의 비율 (합 1). 피해가 없으면 모두 0
  const causes = damageByCause ?? { scenario: 0, collision: 0, debris: 0 };
  const total = causes.scenario + causes.collision + causes.debris;
  const share = (v) => (total > 0 ? v / total : 0);

  return {
    time,
    totalParts: counted.length,
    collapsedParts: collapsed.length,
    collapsedRatio: counted.length ? collapsed.length / counted.length : 0,
    firstFailedPartId,
    floorsLost,
    finished,
    collapseTime,
    floorDamage,
    damageByCause: {
      scenario: share(causes.scenario),
      collision: share(causes.collision),
      debris: share(causes.debris),
    },
  };
}
