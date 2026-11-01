/**
 * [A · 건물 생성] 격자 골조 도우미
 *
 * 평면을 "칸(cell)" 격자로 보고 다음 부재를 만듭니다.
 *   - 기둥: 칸의 모서리마다, 층마다 하나
 *   - 보:   칸의 가장자리마다, 층마다 하나 (바닥판 바로 아래)
 *   - 바닥판: 칸 하나를 SLAB_DIV × SLAB_DIV 조각으로 나눔
 *   - 바깥 벽: 외곽 가장자리마다 WALL_DIV_X × WALL_DIV_Y 패널로 나눔
 *   - 창문: 벽의 위쪽 패널마다 하나 (장식, structural=false)
 *
 * ── 하중 경로 (supportedBy 규칙) ─────────────────────────────
 *   바닥판 조각 → 보 → 기둥 → 아래층 기둥 → 땅('ground')
 *
 *   기둥       : 아래층 같은 위치 기둥 (1층은 'ground')
 *   보         : 양 끝 기둥 2개                  → 기둥 하나만 잃어도 떨어짐
 *   바닥판 조각: 맞닿은 보 2개 + 같은 칸의 이웃 조각 2개 → 4개 중 3개 이상 필요
 *   벽 패널    : 아래(보·땅·아래 패널), 위(보·위 패널), 왼쪽(기둥·이웃 패널), 오른쪽(기둥·이웃 패널)
 *                → 4개 중 3개 이상 필요
 *   창문       : 붙어 있는 벽 패널
 *
 *   B의 구조 판단(sim/structure.js)은 "받쳐주는 부재 중 살아 있는 비율 > 절반"으로 버팀을 판단합니다.
 *   'ground' 는 항상 살아 있는 지지대로 셉니다.
 *
 * 좌표: 1단위 = 1m, y축이 위, 건물 바닥 중심이 원점 근처.
 */

import { createPart } from '../core/types.js';

export const COLUMN_WIDTH = 0.4;
export const SLAB_THICKNESS = 0.25;
export const BEAM_HEIGHT = 0.35;
export const BEAM_WIDTH = 0.3;
export const WALL_THICKNESS = 0.2;

/** 바닥판 한 칸을 몇 × 몇 조각으로 나눌지 */
const SLAB_DIV = 2;
/** 벽 한 면을 가로 · 세로 몇 패널로 나눌지 */
const WALL_DIV_X = 2;
const WALL_DIV_Y = 2;

const KIND_LABEL = {
  column: '기둥',
  beam: '보',
  slab: '바닥판',
  roof: '지붕판',
  wall: '벽',
  window: '창',
};
const colName = (i, j) => `${String.fromCharCode(65 + i)}${j + 1}`; // 격자 이름: A1, B2 …

/**
 * @param {Object} options
 * @param {import('../core/types.js').BuildingSpec} options.spec
 * @param {number[][]} options.cells        칸 배치 (1 = 있음, 0 = 없음). cells[z][x]
 * @param {number} options.span             칸 한 변 길이 (m)
 * @param {number} options.floorHeight      층 높이 (m)
 * @param {(floor:number)=>boolean} options.hasWalls  해당 층에 바깥 벽이 있는지
 * @param {boolean} [options.windows=true]  창문을 만들지
 * @returns {import('../core/types.js').Part[]}
 */
export function buildGridFrame({ spec, cells, span, floorHeight, hasWalls, windows = true }) {
  const { floors, materials } = spec;
  const nz = cells.length;
  const nx = cells[0].length;
  const parts = [];

  const offsetX = (-nx * span) / 2;
  const offsetZ = (-nz * span) / 2;
  const hasCell = (x, z) => x >= 0 && z >= 0 && x < nx && z < nz && cells[z][x] === 1;
  const hasNode = (i, j) =>
    hasCell(i - 1, j - 1) || hasCell(i, j - 1) || hasCell(i - 1, j) || hasCell(i, j);
  const nodeX = (i) => offsetX + i * span;
  const nodeZ = (j) => offsetZ + j * span;

  const colId = (f, i, j) => `col-${f}-${i}-${j}`;
  const beamXId = (f, i, j) => `beam-${f}-x-${i}-${j}`; // 노드 (i,j)–(i+1,j)
  const beamZId = (f, i, j) => `beam-${f}-z-${i}-${j}`; // 노드 (i,j)–(i,j+1)
  const slabId = (f, x, z, a, b) => `slab-${f}-${x}-${z}-${a}-${b}`;

  const columnHeight = floorHeight - SLAB_THICKNESS;
  const wallHeight = columnHeight - BEAM_HEIGHT;

  for (let f = 1; f <= floors; f++) {
    const base = (f - 1) * floorHeight; // 이 층 바닥 윗면 높이
    const add = (fields) =>
      parts.push(
        createPart({
          floor: f,
          label: `${f}층 ${fields.labelSuffix ?? ''}${KIND_LABEL[fields.kind] ?? fields.kind}`,
          ...fields,
        }),
      );

    // ── 기둥 ──────────────────────────────────────
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        if (!hasNode(i, j)) continue;
        add({
          id: colId(f, i, j),
          kind: 'column',
          labelSuffix: `${colName(i, j)} `,
          material: materials.frame,
          size: [COLUMN_WIDTH, columnHeight, COLUMN_WIDTH],
          position: [nodeX(i), base + columnHeight / 2, nodeZ(j)],
          supportedBy: f === 1 ? ['ground'] : [colId(f - 1, i, j)],
          grid: { i, j },
        });
      }
    }

    // ── 보 ───────────────────────────────────────
    const beamY = base + columnHeight - BEAM_HEIGHT / 2;
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i < nx; i++) {
        if (!hasCell(i, j - 1) && !hasCell(i, j)) continue;
        add({
          id: beamXId(f, i, j),
          kind: 'beam',
          labelSuffix: `${colName(i, j)}-${colName(i + 1, j)} `,
          material: materials.frame,
          size: [span - COLUMN_WIDTH, BEAM_HEIGHT, BEAM_WIDTH],
          position: [nodeX(i) + span / 2, beamY, nodeZ(j)],
          supportedBy: [colId(f, i, j), colId(f, i + 1, j)],
        });
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i <= nx; i++) {
        if (!hasCell(i - 1, j) && !hasCell(i, j)) continue;
        add({
          id: beamZId(f, i, j),
          kind: 'beam',
          labelSuffix: `${colName(i, j)}-${colName(i, j + 1)} `,
          material: materials.frame,
          size: [BEAM_WIDTH, BEAM_HEIGHT, span - COLUMN_WIDTH],
          position: [nodeX(i), beamY, nodeZ(j) + span / 2],
          supportedBy: [colId(f, i, j), colId(f, i, j + 1)],
        });
      }
    }

    // ── 바닥판 조각 ──────────────────────────────────
    const piece = span / SLAB_DIV;
    const slabY = base + floorHeight - SLAB_THICKNESS / 2;
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        if (!hasCell(x, z)) continue;
        for (let b = 0; b < SLAB_DIV; b++) {
          for (let a = 0; a < SLAB_DIV; a++) {
            const supporters = [];
            // 칸 가장자리에 닿은 조각은 그 가장자리의 보에 얹힘
            if (b === 0) supporters.push(beamXId(f, x, z));
            if (b === SLAB_DIV - 1) supporters.push(beamXId(f, x, z + 1));
            if (a === 0) supporters.push(beamZId(f, x, z));
            if (a === SLAB_DIV - 1) supporters.push(beamZId(f, x + 1, z));
            // 같은 칸의 이웃 조각과 서로 이어져 있음
            if (a > 0) supporters.push(slabId(f, x, z, a - 1, b));
            if (a < SLAB_DIV - 1) supporters.push(slabId(f, x, z, a + 1, b));
            if (b > 0) supporters.push(slabId(f, x, z, a, b - 1));
            if (b < SLAB_DIV - 1) supporters.push(slabId(f, x, z, a, b + 1));
            add({
              id: slabId(f, x, z, a, b),
              kind: f === floors ? 'roof' : 'slab',
              material: materials.slab,
              size: [piece, SLAB_THICKNESS, piece],
              position: [nodeX(x) + piece * (a + 0.5), slabY, nodeZ(z) + piece * (b + 0.5)],
              supportedBy: supporters,
            });
          }
        }
      }
    }

    // ── 바깥 벽 패널 + 창문 ───────────────────────────
    if (!hasWalls(f)) continue;
    const panelLength = (span - COLUMN_WIDTH) / WALL_DIV_X;
    const panelHeight = wallHeight / WALL_DIV_Y;

    /**
     * @param {string} edgeId    가장자리 식별자 (예: 'x-0-2')
     * @param {'x'|'z'} axis      벽이 놓인 방향
     * @param {[number,number]} start  첫 노드의 (x, z) 좌표
     * @param {[number,number]} normal 바깥 방향
     * @param {string} beamBelow  아래 보 id (1층은 'ground')
     * @param {string} beamAbove  위 보 id
     * @param {string} colStart   시작 기둥 id
     * @param {string} colEnd     끝 기둥 id
     */
    const addWall = (edgeId, axis, start, normal, beamBelow, beamAbove, colStart, colEnd) => {
      const wid = (w, k) => `wall-${f}-${edgeId}-${w}-${k}`;
      for (let k = 0; k < WALL_DIV_Y; k++) {
        for (let w = 0; w < WALL_DIV_X; w++) {
          const along = COLUMN_WIDTH / 2 + panelLength * (w + 0.5);
          const center = [
            start[0] + (axis === 'x' ? along : 0),
            base + panelHeight * (k + 0.5),
            start[1] + (axis === 'z' ? along : 0),
          ];
          const size =
            axis === 'x'
              ? [panelLength, panelHeight, WALL_THICKNESS]
              : [WALL_THICKNESS, panelHeight, panelLength];
          add({
            id: wid(w, k),
            kind: 'wall',
            material: materials.wall,
            size,
            position: center,
            supportedBy: [
              k === 0 ? beamBelow : wid(w, k - 1),
              k === WALL_DIV_Y - 1 ? beamAbove : wid(w, k + 1),
              w === 0 ? colStart : wid(w - 1, k),
              w === WALL_DIV_X - 1 ? colEnd : wid(w + 1, k),
            ],
          });

          if (windows && k === WALL_DIV_Y - 1) {
            const offset = WALL_THICKNESS / 2 + 0.05;
            add({
              id: `win-${wid(w, k)}`,
              kind: 'window',
              material: materials.facade,
              size:
                axis === 'x'
                  ? [panelLength * 0.6, panelHeight * 0.75, 0.08]
                  : [0.08, panelHeight * 0.75, panelLength * 0.6],
              position: [center[0] + normal[0] * offset, center[1], center[2] + normal[1] * offset],
              supportedBy: [wid(w, k)],
              structural: false,
            });
          }
        }
      }
    };

    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i < nx; i++) {
        const up = hasCell(i, j - 1);
        const down = hasCell(i, j);
        if (up === down) continue;
        addWall(
          `x-${i}-${j}`,
          'x',
          [nodeX(i), nodeZ(j)],
          [0, down ? -1 : 1],
          f === 1 ? 'ground' : beamXId(f - 1, i, j),
          beamXId(f, i, j),
          colId(f, i, j),
          colId(f, i + 1, j),
        );
      }
    }
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i <= nx; i++) {
        const left = hasCell(i - 1, j);
        const right = hasCell(i, j);
        if (left === right) continue;
        addWall(
          `z-${i}-${j}`,
          'z',
          [nodeX(i), nodeZ(j)],
          [right ? -1 : 1, 0],
          f === 1 ? 'ground' : beamZId(f - 1, i, j),
          beamZId(f, i, j),
          colId(f, i, j),
          colId(f, i, j + 1),
        );
      }
    }
  }

  // createPart 에 넘긴 labelSuffix 는 내부용이므로 지웁니다.
  for (const p of parts) delete p.labelSuffix;
  return parts;
}
