/**
 * [B · 시뮬레이션] 구조 판단 — "이 부재가 아직 받쳐지고 있는가"
 *
 * 🔧 임시 버전(베이스): 프로포절 데모의 규칙을 일반화한 것
 *   - 받쳐주는 부재(supportedBy) 중 살아 있는 비율이 절반을 넘어야 버팀
 *   - 'ground'(땅)는 항상 살아 있는 지지대로 셈
 *   - 예) 보는 양 끝 기둥 2개 모두 필요, 바닥판 조각과 벽 패널은 4개 중 3개 이상 필요
 *   - 하중 경로는 build/frame.js 맨 위 주석 참고 (바닥판 → 보 → 기둥 → 아래층 기둥 → 땅)
 * TODO(B): 하중 계산(부재마다 받는 무게)과 재분배, 재료 강도 반영,
 *          떨어진 부재의 무게로 아래층이 부서지는 처리
 */

/** 부재가 하중을 전달할 수 있는 상태인지 */
export function isAlive(part) {
  return part.state === 'intact' || part.state === 'damaged';
}

/**
 * @param {import('../core/types.js').Part} part
 * @param {Map<string, import('../core/types.js').Part>} byId
 */
export function isSupported(part, byId) {
  const supporters = part.supportedBy;
  if (supporters.length === 0) return true;
  let alive = 0;
  for (const id of supporters) {
    if (id === 'ground') {
      alive++;
      continue;
    }
    const supporter = byId.get(id);
    if (supporter && isAlive(supporter)) alive++;
  }
  return alive / supporters.length > 0.5;
}

/**
 * 부재 id → 그 부재가 받쳐 주는 부재 목록 (supportedBy 의 반대 방향)
 * @param {import('../core/types.js').Part[]} parts
 */
export function buildDependents(parts) {
  const map = new Map();
  for (const part of parts) {
    for (const id of part.supportedBy) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(part);
    }
  }
  return map;
}

/** 기둥 끝(이음부)을 옆으로 잡아 주는 보 · 바닥판 · 벽이 하나라도 살아 있는지 */
function bracedAt(columnId, dependents) {
  return (dependents.get(columnId) ?? []).some((p) => p.kind !== 'column' && isAlive(p));
}

/**
 * 횡지지(옆으로 잡아 주는 부재) 판단 — 기둥 위에 올라선 기둥이
 * 위 끝(자기가 받치는 보 · 바닥판)과 아래 이음부(아래 기둥이 받치는 보 · 바닥판)를 모두 잃으면
 * 옆으로 잡아 줄 것이 없어 쓰러짐. (세장비: 양 끝이 자유로운 기둥은 좌굴 길이가 무한대)
 * 땅에 선 1층 기둥은 기초에 고정되어 있으므로 혼자 남아도 서 있을 수 있음.
 */
export function isLaterallyStable(part, byId, dependents) {
  if (part.kind !== 'column' || !dependents) return true;
  const below = part.supportedBy.filter((id) => byId.get(id)?.kind === 'column');
  if (below.length === 0) return true; // 땅이나 보 위에 선 기둥
  if (bracedAt(part.id, dependents)) return true;
  return below.some((id) => bracedAt(id, dependents));
}

/**
 * 받쳐지지 않는 부재를 모두 찾습니다. (한 번 무너지면 그 위가 연달아 무너지므로 반복)
 * @param {import('../core/types.js').Part[]} parts
 * @param {Map<string, import('../core/types.js').Part>} byId
 * @param {(part:import('../core/types.js').Part)=>void} onUnsupported  찾을 때마다 호출
 * @param {Map<string, import('../core/types.js').Part[]>} [dependents]  주면 횡지지도 판단
 */
export function propagateSupport(parts, byId, onUnsupported, dependents) {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 100) {
    changed = false;
    for (const part of parts) {
      if (!isAlive(part)) continue;
      if (!isSupported(part, byId) || !isLaterallyStable(part, byId, dependents)) {
        onUnsupported(part); // 이 안에서 part.state 가 'falling' 으로 바뀌어야 함
        changed = true;
      }
    }
  }
}
