/**
 * [C · 화면] 층 정보 도우미 — 부재 목록에서 층 높이 · 기둥 목록을 계산
 */

/** 층 바닥 윗면 높이 (그 층 기둥의 아래 끝) */
export function floorBaseY(parts, floor) {
  let y = Infinity;
  for (const p of parts) {
    if (p.kind === 'column' && p.floor === floor) y = Math.min(y, p.position[1] - p.size[1] / 2);
  }
  return Number.isFinite(y) ? y : 0;
}

/** 층 수 (기둥이 있는 가장 높은 층) */
export function floorCount(parts) {
  let max = 0;
  for (const p of parts) if (p.kind === 'column' && p.floor > max) max = p.floor;
  return max;
}

/** 해당 층 기둥 목록 (격자 순서: 앞줄부터, 왼쪽부터) */
export function columnsOf(parts, floor) {
  return parts
    .filter((p) => p.kind === 'column' && p.floor === floor)
    .sort((a, b) => (a.grid?.j ?? 0) - (b.grid?.j ?? 0) || (a.grid?.i ?? 0) - (b.grid?.i ?? 0));
}
