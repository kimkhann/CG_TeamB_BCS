/**
 * [B · 시뮬레이션] 구조 판단 — "이 부재가 아직 받쳐지고 있는가"
 *
 * 🔧 임시 버전(베이스): 프로포절 데모의 규칙을 일반화한 것
 *   - 받쳐주는 부재(supportedBy) 중 살아 있는 비율이 절반을 넘어야 버팀
 *   - 예) 바닥판은 모서리 기둥 4개 중 3개 이상, 보는 양 끝 기둥 2개 모두 필요
 * TODO(B): 하중 경로 계산(기둥마다 받는 무게), 하중 재분배, 재료 강도 반영
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
  if (supporters.length === 0 || supporters.includes('ground')) return true;
  let alive = 0;
  for (const id of supporters) {
    const supporter = byId.get(id);
    if (supporter && isAlive(supporter)) alive++;
  }
  return alive / supporters.length > 0.5;
}

/**
 * 받쳐지지 않는 부재를 모두 찾습니다. (한 번 무너지면 그 위가 연달아 무너지므로 반복)
 * @param {import('../core/types.js').Part[]} parts
 * @param {Map<string, import('../core/types.js').Part>} byId
 * @param {(part:import('../core/types.js').Part)=>void} onUnsupported  찾을 때마다 호출
 */
export function propagateSupport(parts, byId, onUnsupported) {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 100) {
    changed = false;
    for (const part of parts) {
      if (!isAlive(part)) continue;
      if (!isSupported(part, byId)) {
        onUnsupported(part); // 이 안에서 part.state 가 'falling' 으로 바뀌어야 함
        changed = true;
      }
    }
  }
}
