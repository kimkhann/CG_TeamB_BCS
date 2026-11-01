/**
 * [A · 건물 생성] 격자 골조 도우미
 *
 * 평면을 "칸(cell)" 격자로 보고, 칸의 모서리마다 기둥, 칸의 가장자리마다 보와 벽,
 * 칸마다 바닥판을 만듭니다. 형태별 생성기는 이 함수에 옵션만 바꿔 넘기면 됩니다.
 *
 * 좌표: 1단위 = 1m, y축이 위, 건물 바닥 중심이 원점 근처.
 * supportedBy 규칙
 *  - 땅에 놓인 부재는 'ground'
 *  - 기둥: 아래층 같은 위치 기둥 (1층은 'ground')
 *  - 보: 양 끝 기둥
 *  - 바닥판: 네 모서리 기둥
 *  - 벽: 아래층 바닥판 (1층은 'ground') + 양 끝 기둥
 *  - 창문: 붙어 있는 벽
 */

import { createPart } from '../core/types.js';

const COLUMN_WIDTH = 0.4;
const SLAB_THICKNESS = 0.25;
const BEAM_HEIGHT = 0.35;
const BEAM_WIDTH = 0.3;
const WALL_THICKNESS = 0.2;

/**
 * @param {Object} options
 * @param {import('../core/types.js').BuildingSpec} options.spec
 * @param {number[][]} options.cells        칸 배치 (1 = 있음, 0 = 없음). cells[z][x]
 * @param {number} options.span             칸 한 변 길이 (m)
 * @param {number} options.floorHeight      층 높이 (m)
 * @param {(floor:number)=>boolean} options.hasWalls  해당 층에 바깥 벽이 있는지
 * @param {boolean} [options.beams=true]    보를 만들지
 * @param {boolean} [options.windows=true]  창문을 만들지
 * @returns {import('../core/types.js').Part[]}
 */
export function buildGridFrame({
  spec,
  cells,
  span,
  floorHeight,
  hasWalls,
  beams = true,
  windows = true,
}) {
  const { floors, materials } = spec;
  const nz = cells.length;
  const nx = cells[0].length;
  const parts = [];

  // 건물 중심을 원점에 맞추기 위한 이동량
  const offsetX = (-nx * span) / 2;
  const offsetZ = (-nz * span) / 2;
  const hasCell = (x, z) => x >= 0 && z >= 0 && x < nx && z < nz && cells[z][x] === 1;
  const hasNode = (i, j) =>
    hasCell(i - 1, j - 1) || hasCell(i, j - 1) || hasCell(i - 1, j) || hasCell(i, j);
  const nodeX = (i) => offsetX + i * span;
  const nodeZ = (j) => offsetZ + j * span;

  const colId = (f, i, j) => `col-${f}-${i}-${j}`;
  const slabId = (f, x, z) => `slab-${f}-${x}-${z}`;

  for (let f = 1; f <= floors; f++) {
    const base = (f - 1) * floorHeight; // 이 층 바닥 높이
    const columnHeight = floorHeight - SLAB_THICKNESS;
    const slabY = base + floorHeight - SLAB_THICKNESS / 2;

    // 기둥
    for (let j = 0; j <= nz; j++) {
      for (let i = 0; i <= nx; i++) {
        if (!hasNode(i, j)) continue;
        parts.push(
          createPart({
            id: colId(f, i, j),
            kind: 'column',
            floor: f,
            material: materials.frame,
            size: [COLUMN_WIDTH, columnHeight, COLUMN_WIDTH],
            position: [nodeX(i), base + columnHeight / 2, nodeZ(j)],
            supportedBy: f === 1 ? ['ground'] : [colId(f - 1, i, j)],
          }),
        );
      }
    }

    // 바닥판 (각 층의 천장 = 위층의 바닥)
    for (let z = 0; z < nz; z++) {
      for (let x = 0; x < nx; x++) {
        if (!hasCell(x, z)) continue;
        parts.push(
          createPart({
            id: slabId(f, x, z),
            kind: f === floors ? 'roof' : 'slab',
            floor: f,
            material: materials.slab,
            size: [span, SLAB_THICKNESS, span],
            position: [nodeX(x) + span / 2, slabY, nodeZ(z) + span / 2],
            supportedBy: [
              colId(f, x, z),
              colId(f, x + 1, z),
              colId(f, x, z + 1),
              colId(f, x + 1, z + 1),
            ],
          }),
        );
      }
    }

    // 보: 칸의 가장자리마다 (중복 없이)
    const beamY = base + columnHeight - BEAM_HEIGHT / 2;
    if (beams) {
      for (let j = 0; j <= nz; j++) {
        for (let i = 0; i < nx; i++) {
          // x 방향 가장자리: 위나 아래 칸 중 하나라도 있으면 보가 있음
          if (!hasCell(i, j - 1) && !hasCell(i, j)) continue;
          parts.push(
            createPart({
              id: `beam-${f}-x-${i}-${j}`,
              kind: 'beam',
              floor: f,
              material: materials.frame,
              size: [span - COLUMN_WIDTH, BEAM_HEIGHT, BEAM_WIDTH],
              position: [nodeX(i) + span / 2, beamY, nodeZ(j)],
              supportedBy: [colId(f, i, j), colId(f, i + 1, j)],
            }),
          );
        }
      }
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i <= nx; i++) {
          if (!hasCell(i - 1, j) && !hasCell(i, j)) continue;
          parts.push(
            createPart({
              id: `beam-${f}-z-${i}-${j}`,
              kind: 'beam',
              floor: f,
              material: materials.frame,
              size: [BEAM_WIDTH, BEAM_HEIGHT, span - COLUMN_WIDTH],
              position: [nodeX(i), beamY, nodeZ(j) + span / 2],
              supportedBy: [colId(f, i, j), colId(f, i, j + 1)],
            }),
          );
        }
      }
    }

    // 바깥 벽: 한쪽에만 칸이 있는 가장자리 = 건물 외곽
    if (hasWalls(f)) {
      const wallHeight = columnHeight - (beams ? BEAM_HEIGHT : 0);
      const wallY = base + wallHeight / 2;
      const below = (x, z) => (f === 1 ? ['ground'] : [slabId(f - 1, x, z)]);

      const addWall = (id, position, size, cellBelow, ends, normal) => {
        parts.push(
          createPart({
            id,
            kind: 'wall',
            floor: f,
            material: materials.wall,
            size,
            position,
            supportedBy: [...below(...cellBelow), ...ends],
          }),
        );
        if (windows) {
          const offset = WALL_THICKNESS / 2 + 0.05;
          const along = size[0] > size[2];
          parts.push(
            createPart({
              id: `win-${id}`,
              kind: 'window',
              floor: f,
              material: materials.facade,
              size: along
                ? [span * 0.45, wallHeight * 0.45, 0.08]
                : [0.08, wallHeight * 0.45, span * 0.45],
              position: [
                position[0] + normal[0] * offset,
                position[1] + wallHeight * 0.05,
                position[2] + normal[1] * offset,
              ],
              supportedBy: [id],
              structural: false,
            }),
          );
        }
      };

      for (let j = 0; j <= nz; j++) {
        for (let i = 0; i < nx; i++) {
          const up = hasCell(i, j - 1);
          const down = hasCell(i, j);
          if (up === down) continue;
          const cellZ = down ? j : j - 1;
          addWall(
            `wall-${f}-x-${i}-${j}`,
            [nodeX(i) + span / 2, wallY, nodeZ(j)],
            [span - COLUMN_WIDTH, wallHeight, WALL_THICKNESS],
            [i, cellZ],
            [colId(f, i, j), colId(f, i + 1, j)],
            [0, down ? -1 : 1],
          );
        }
      }
      for (let j = 0; j < nz; j++) {
        for (let i = 0; i <= nx; i++) {
          const left = hasCell(i - 1, j);
          const right = hasCell(i, j);
          if (left === right) continue;
          const cellX = right ? i : i - 1;
          addWall(
            `wall-${f}-z-${i}-${j}`,
            [nodeX(i), wallY, nodeZ(j) + span / 2],
            [WALL_THICKNESS, wallHeight, span - COLUMN_WIDTH],
            [cellX, j],
            [colId(f, i, j), colId(f, i, j + 1)],
            [right ? -1 : 1, 0],
          );
        }
      }
    }
  }
  return parts;
}
