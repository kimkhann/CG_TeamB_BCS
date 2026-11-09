/**
 * [B · Simulation] Support check — "is this part still supported?"
 *
 * Rule (generalized from the proposal demo):
 *   - a part stands only if more than half of its supporters (supportedBy) are alive
 *   - 'ground' always counts as an alive supporter
 *   - e.g. a beam needs both end columns; slab pieces and wall panels need 3 of 4
 *   - load path: see the header comment of build/frame.js (slab → beam → column → column below → ground)
 * Plus lateral bracing for stacked columns (isLaterallyStable).
 * Weight-driven damage to lower floors lives in impact.js / simulation.js.
 */

/** Whether a part can still carry load */
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
 * part id → parts it supports (the reverse of supportedBy)
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

/** Whether any beam, slab or wall bracing this column end (joint) is still alive */
function bracedAt(columnId, dependents) {
  return (dependents.get(columnId) ?? []).some((p) => p.kind !== 'column' && isAlive(p));
}

/**
 * Lateral bracing — a column standing on another column topples when it loses
 * both its top end (beams/slabs it supports) and its bottom joint (beams/slabs the column below supports):
 * nothing holds it sideways (slenderness: a column free at both ends has an unbounded buckling length).
 * A ground-floor column is fixed to its foundation, so it can stand alone.
 */
export function isLaterallyStable(part, byId, dependents) {
  if (part.kind !== 'column' || !dependents) return true;
  const below = part.supportedBy.filter((id) => byId.get(id)?.kind === 'column');
  if (below.length === 0) return true; // column on the ground or on a beam
  if (bracedAt(part.id, dependents)) return true;
  return below.some((id) => bracedAt(id, dependents));
}

/**
 * Finds every unsupported part. (repeats, because one collapse makes the parts above collapse in turn)
 * @param {import('../core/types.js').Part[]} parts
 * @param {Map<string, import('../core/types.js').Part>} byId
 * @param {(part:import('../core/types.js').Part)=>void} onUnsupported  called for each one found
 * @param {Map<string, import('../core/types.js').Part[]>} [dependents]  when given, lateral bracing is checked too
 */
export function propagateSupport(parts, byId, onUnsupported, dependents) {
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 100) {
    changed = false;
    for (const part of parts) {
      if (!isAlive(part)) continue;
      if (!isSupported(part, byId) || !isLaterallyStable(part, byId, dependents)) {
        onUnsupported(part); // must change part.state to 'falling' inside
        changed = true;
      }
    }
  }
}
