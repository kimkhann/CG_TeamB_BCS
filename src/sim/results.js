/**
 * [B · Simulation] Result calculation
 *
 * Collapsed ratio, first failed part, floors lost
 * + collapse time, per-floor damage, damage by cause
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

  // a floor counts as lost when all its slabs have collapsed
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

  // per-floor damage: average hp loss of the floor's structural parts (fallen or failed parts count as 1)
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

  // damage by cause: share of total hp lost (sums to 1; all 0 when nothing was damaged)
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
