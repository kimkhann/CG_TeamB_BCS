/**
 * [A] 격자 골조 위에 얹는 건축 요소. 모든 물리 부재는 createPart()로 만듭니다.
 * view는 A 전용 표시 정보이며 B는 기존 Part 필드만 읽으면 됩니다.
 * 지붕/외벽 반복 배치 참고: ch-bas/threejs-sims-house-builder,
 * achrefelouafi/ProceduralBuildingsThreeJS. 구현 설명/출처: A_NOTES.md.
 */
import { createPart } from '../core/types.js';

function add(parts, fields) {
  const part = createPart({ structural: false, ...fields });
  parts.push(part);
  return part;
}

function nearestPlate(parts, floor, x, z) {
  let nearest = null;
  let best = Infinity;
  for (const p of parts) {
    if (p.floor !== floor || !['slab', 'roof'].includes(p.kind) || !p.structural) continue;
    const d = (p.position[0] - x) ** 2 + (p.position[2] - z) ** 2;
    if (d < best) {
      best = d;
      nearest = p;
    }
  }
  return nearest;
}

/** 판 16장을 경사면 위에 배치합니다. 기존 천장과 그 지지 관계는 보존합니다. */
export function addGableRoof(parts, spec, width, depth, floorHeight) {
  const ceiling = parts.filter((p) => p.kind === 'roof');
  const rise = Math.min(width * 0.25, 2.1);
  const slope = rise / (width / 2);
  const angle = Math.atan(slope);
  for (const p of ceiling) {
    p.kind = 'slab';
    p.label = p.label.replace('지붕판', '천장판');
    const x = p.position[0];
    const side = x < 0 ? -1 : 1;
    const edge = Math.abs(x) + p.size[0] / 2 >= width / 2 - 0.01;
    const end = Math.abs(p.position[2]) + p.size[2] / 2 >= depth / 2 - 0.01;
    const rotation = -side * angle;
    const eave = edge ? 0.3 : 0;
    const cx = x + (side * eave) / 2;
    add(parts, {
      id: `pitched-${p.id}`,
      label: `${spec.floors}층 경사 지붕판`,
      kind: 'roof',
      floor: spec.floors,
      material: spec.materials.slab,
      size: [(p.size[0] + eave) / Math.cos(angle), 0.16, p.size[2] + (end ? 0.34 : 0.02)],
      position: [
        cx,
        spec.floors * floorHeight + 0.14 + rise - Math.abs(cx) * slope,
        p.position[2] + (end ? Math.sign(p.position[2]) * 0.16 : 0),
      ],
      quaternion: [0, 0, Math.sin(rotation / 2), Math.cos(rotation / 2)],
      supportedBy: [p.id],
      structural: true,
      view: { surface: 'roof', tint: '#686e73' },
    });
  }
  // 삼각형 끝벽은 짧은 상자들로 근사하여 기존 Box 물리 계약을 유지합니다.
  for (const zSide of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const x = -width / 2 + (width / 8) * (i + 0.5);
      const h = Math.max(0.12, rise - (Math.abs(x) + width / 16) * slope);
      const support = nearestPlate(parts, spec.floors, x, (zSide * depth) / 2);
      add(parts, {
        id: `gable-${zSide}-${i}`,
        label: `${spec.floors}층 박공 끝벽`,
        kind: 'wall',
        floor: spec.floors,
        material: spec.materials.wall,
        size: [width / 8, h, 0.18],
        position: [x, spec.floors * floorHeight + h / 2, (zSide * depth) / 2],
        supportedBy: [support.id],
      });
    }
  }
}

/** 현관: 기존 앞면 한 창 구획을 출입구로 바꿉니다. 다른 ID는 유지합니다. */
export function addEntrance(parts) {
  const candidates = parts.filter((p) => p.floor === 1 && p.kind === 'window' && p.size[2] < 0.1);
  const frontZ = Math.max(...candidates.map((p) => p.position[2]));
  const glass = candidates
    .filter((p) => Math.abs(p.position[2] - frontZ) < 0.01)
    .sort((a, b) => Math.abs(a.position[0]) - Math.abs(b.position[0]))[0];
  const headerId = glass?.id.replace(/^win-/, '');
  const lower = parts.find((p) => p.id === headerId?.replace(/-1$/, '-0'));
  const upper = parts.find((p) => p.id === headerId);
  if (!lower || !upper || !glass) return;
  lower.size[1] = 0.08;
  lower.position[1] = 0.04;
  glass.size[1] = upper.position[1] - upper.size[1] / 2 - 0.08;
  glass.position[1] = 0.08 + glass.size[1] / 2;
  glass.label = '1층 현관문';
  glass.view = { framed: true, door: true, tint: '#668184' };
}

/** 외부 발코니: 데크는 아래층 전면 보, 유리 난간은 데크가 받칩니다. */
export function addBalconies(parts, spec, { span, floorHeight, nx, nz, bays }) {
  for (let f = 2; f <= spec.floors; f++) {
    for (const bay of bays) {
      const x = (-nx * span) / 2 + span * (bay + 0.5);
      const z = (nz * span) / 2 + 0.62;
      const width = span - 0.7;
      const y = (f - 1) * floorHeight;
      const deckId = `balcony-${f}-${bay}`;
      add(parts, {
        id: deckId,
        label: `${f}층 발코니 바닥`,
        kind: 'slab',
        floor: f,
        material: spec.materials.slab,
        size: [width, 0.16, 1.3],
        position: [x, y - 0.08, z],
        supportedBy: [`beam-${f - 1}-x-${bay}-${nz}`],
        structural: true,
      });
      for (const [side, size, position] of [
        ['front', [width, 0.85, 0.06], [x, y + 0.5, z + 0.6]],
        ['left', [0.06, 0.85, 1.15], [x - width / 2, y + 0.5, z]],
        ['right', [0.06, 0.85, 1.15], [x + width / 2, y + 0.5, z]],
      ]) {
        add(parts, {
          id: `${deckId}-${side}`,
          label: `${f}층 발코니 난간`,
          kind: 'window',
          floor: f,
          material: spec.materials.facade,
          size,
          position,
          supportedBy: [deckId],
          view: { framed: true },
        });
      }
    }
  }
}

/** 계단실/옥탑의 단순 상자 부재. 기존 기둥과 별개로 천장판에 연결합니다. */
export function addCore(parts, spec, { x, z, width, depth, floorHeight, rooftop = false }) {
  const first = rooftop ? spec.floors : 1;
  const last = spec.floors;
  for (let f = first; f <= last; f++) {
    const base = rooftop ? f * floorHeight : (f - 1) * floorHeight;
    const h = rooftop ? 1.8 : floorHeight - 0.3;
    const support = nearestPlate(parts, rooftop ? f : Math.max(1, f - 1), x, z);
    const supports = f === 1 && !rooftop ? ['ground'] : [support.id];
    const prefix = rooftop ? 'penthouse' : `core-${f}`;
    for (const [name, size, position] of [
      ['back', [width, h, 0.18], [x, base + h / 2, z + depth / 2]],
      ['left', [0.18, h, depth], [x - width / 2, base + h / 2, z]],
      ['right', [0.18, h, depth], [x + width / 2, base + h / 2, z]],
    ]) {
      add(parts, {
        id: `${prefix}-${name}`,
        label: `${f}층 ${rooftop ? '옥탑' : '계단실'} 벽`,
        kind: 'wall',
        floor: f,
        material: spec.materials.wall,
        size,
        position,
        supportedBy: supports,
        view: { tint: '#c7c3b6' },
      });
    }
    if (rooftop) {
      add(parts, {
        id: `${prefix}-cap`,
        label: `${f}층 옥탑 덮개`,
        kind: 'roof',
        floor: f,
        material: spec.materials.slab,
        size: [width + 0.2, 0.16, depth + 0.2],
        position: [x, base + h + 0.08, z],
        supportedBy: [`${prefix}-left`, `${prefix}-right`],
      });
    }
  }
}

export function addParapets(parts, spec, floorHeight) {
  // 최상층 외벽의 인방 위로 짧은 옥상 난간을 반복 배치합니다. L자 안쪽도 따라갑니다.
  const headers = parts.filter(
    (p) => p.floor === spec.floors && /^wall-.*-1$/.test(p.id) && p.kind === 'wall',
  );
  for (const header of headers) {
    add(parts, {
      id: `parapet-${header.id}`,
      label: `${spec.floors}층 옥상 난간`,
      kind: 'wall',
      floor: spec.floors,
      material: spec.materials.wall,
      size: [header.size[0], 0.48, header.size[2]],
      position: [header.position[0], spec.floors * floorHeight + 0.24, header.position[2]],
      supportedBy: [header.id],
      view: { tint: '#b8b6ab' },
    });
  }
}

export function markBuilding(parts, spec) {
  parts[0].view = { ...parts[0].view, buildingType: spec.type };
  return parts;
}
