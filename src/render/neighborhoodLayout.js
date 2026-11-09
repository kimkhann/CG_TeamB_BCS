/**
 * [A] 고정 시드의 시각 배경 배치. Part/강체/시나리오와 독립적인 렌더 데이터입니다.
 * 중앙 24m 필지는 네 유형의 최대 평면과 발코니가 들어갈 공간으로 비워 둡니다.
 * 메인 건물의 설정은 이 함수의 입력이 아니므로 주변 풍경이 바뀌지 않습니다.
 */
export const BLOCK_SPACING = 36;
export const LOT_SIZE = 24;
export const ROAD_WIDTH = 8;

export function makeNeighborhoodLayout() {
  const objects = [];
  const buildings = [];
  let seed = 72819;
  let trees = 0;
  let cars = 0;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  function add(role, geometry, material, size, position, color, options = {}) {
    objects.push({ role, geometry, material, size, position, color, ...options });
  }
  const box = (role, material, size, position, color, options) =>
    add(role, 'box', material, size, position, color, options);

  function tree(x, z, central = false) {
    trees++;
    const height = 2.6 + random() * 0.7;
    const r = 0.85 + random() * 0.25;
    add('tree-trunk', 'cylinder', 'stone', [0.12, height, 0.12], [x, height / 2, z], '#71614d', {
      castShadow: central,
    });
    for (const [dx, dy, dz, scale] of [
      [0, 0, 0, 1],
      [-0.45, -0.35, 0.15, 0.76],
      [0.4, -0.45, -0.15, 0.78],
    ]) {
      add(
        'tree-crown',
        'leaf',
        'foliage',
        [r * scale, r * 1.1 * scale, r * scale],
        [x + dx, height + dy, z + dz],
        random() > 0.4 ? '#70846b' : '#8b9a77',
        { castShadow: central },
      );
    }
  }

  function lamp(x, z, angle = 0, central = false) {
    add('lamp-post', 'cylinder', 'metal', [0.055, 4.8, 0.055], [x, 2.4, z], '#43525a', {
      castShadow: central,
    });
    const dx = Math.cos(angle),
      dz = -Math.sin(angle);
    box('lamp-arm', 'metal', [1.2, 0.07, 0.08], [x + dx * 0.5, 4.75, z + dz * 0.5], '#43525a', {
      angle,
      castShadow: central,
    });
    box('lamp-head', 'metal', [0.55, 0.1, 0.28], [x + dx * 1.03, 4.71, z + dz * 1.03], '#43525a', {
      angle,
    });
    box(
      'lamp-panel',
      'light',
      [0.46, 0.025, 0.21],
      [x + dx * 1.03, 4.65, z + dz * 1.03],
      '#fff2cf',
      { angle },
    );
    box('lamp-base', 'stone', [0.23, 0.14, 0.23], [x, 0.09, z], '#677378');
  }

  function bench(x, z, angle) {
    const local = (dx, y, dz) => [
      x + dx * Math.cos(angle) + dz * Math.sin(angle),
      y,
      z - dx * Math.sin(angle) + dz * Math.cos(angle),
    ];
    for (let k = 0; k < 3; k++) {
      box('bench-seat', 'wood', [1.75, 0.065, 0.14], local(0, 0.48, -0.16 + k * 0.16), '#987959', {
        angle,
        castShadow: true,
      });
      if (k < 2)
        box('bench-back', 'wood', [1.75, 0.13, 0.06], local(0, 0.77 + k * 0.16, -0.25), '#987959', {
          angle,
          castShadow: true,
        });
    }
    for (const side of [-1, 1]) {
      box('bench-leg', 'metal', [0.075, 0.5, 0.52], local(side * 0.62, 0.26, 0), '#49555b', {
        angle,
        castShadow: true,
      });
    }
  }

  function car(x, z, angle, color) {
    cars++;
    const local = (dx, y, dz) => [
      x + dx * Math.cos(angle) + dz * Math.sin(angle),
      y,
      z - dx * Math.sin(angle) + dz * Math.cos(angle),
    ];
    box('parked-car', 'metal', [1.65, 0.46, 3.5], local(0, 0.48, 0), color, { angle });
    box('car-cabin', 'glass', [1.43, 0.53, 1.9], local(0, 0.92, -0.12), '#637a87', { angle });
    box('car-roof', 'metal', [1.4, 0.07, 1.5], local(0, 1.21, -0.2), color, { angle });
    for (const side of [-1, 1]) {
      box('car-bumper', 'stone', [1.55, 0.12, 0.1], local(0, 0.37, side * 1.76), '#59616a', {
        angle,
      });
      for (const axle of [-1, 1]) {
        add(
          'car-wheel',
          'cylinder',
          'rubber',
          [0.29, 0.16, 0.29],
          local(side * 0.82, 0.3, axle * 1.08),
          '#31383c',
          { rotation: [0, angle, Math.PI / 2] },
        );
      }
    }
  }

  const streetCenters = [-90, -54, -18, 18, 54, 90];
  const blockCenters = [-72, -36, 0, 36, 72];
  // 수평 도로를 통과시키고 수직 도로는 교차로 사이만 채워 중복 면의 깜빡임을 피합니다.
  for (const road of streetCenters) {
    box('road', 'asphalt', [196, 0.04, ROAD_WIDTH], [0, -0.04, road], '#48535d', {
      receiveShadow: true,
    });
    for (const center of blockCenters) {
      box('road', 'asphalt', [ROAD_WIDTH, 0.04, 28], [road, -0.04, center], '#48535d', {
        receiveShadow: true,
      });
      for (const offset of [-0.12, 0.12]) {
        box(
          'road-centerline',
          'paint',
          [22, 0.006, 0.065],
          [center, -0.014, road + offset],
          '#d6bd77',
        );
        box(
          'road-centerline',
          'paint',
          [0.065, 0.006, 22],
          [road + offset, -0.014, center],
          '#d6bd77',
        );
      }
      for (const side of [-1, 1]) {
        box(
          'road-edgeline',
          'paint',
          [22, 0.006, 0.075],
          [center, -0.014, road + side * 3.5],
          '#d3d8d5',
        );
        box(
          'road-edgeline',
          'paint',
          [0.075, 0.006, 22],
          [road + side * 3.5, -0.014, center],
          '#d3d8d5',
        );
      }
    }
  }

  // 중앙 필지와 그 주변 보도. 바닥은 기존 B의 y=0 지면과 거의 같은 높이입니다.
  box('main-plaza', 'stone', [24, 0.05, 24], [0, -0.012, 0], '#bac2bf', { receiveShadow: true });
  box('entrance-path', 'stone', [2.2, 0.015, 12], [0, 0.021, 6], '#d0d2c9', {
    receiveShadow: true,
  });
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      const central = bx === 0 && bz === 0;
      if (!central) box('block-ground', 'stone', [24, 0.04, 24], [bx, -0.035, bz], '#98a38e');
      for (const side of [-1, 1]) {
        box('sidewalk', 'stone', [28, 0.09, 2], [bx, -0.015, bz + side * 13], '#b3bcb8', {
          receiveShadow: central,
        });
        box('sidewalk', 'stone', [2, 0.09, 24], [bx + side * 13, -0.015, bz], '#b3bcb8', {
          receiveShadow: central,
        });
        box('curb', 'stone', [28, 0.16, 0.16], [bx, 0, bz + side * 13.92], '#cdd0c7', {
          castShadow: central,
        });
        box('curb', 'stone', [0.16, 0.16, 27.7], [bx + side * 13.92, 0, bz], '#cdd0c7', {
          castShadow: central,
        });
      }
      if (central) continue;
      const near = Math.max(Math.abs(bx), Math.abs(bz)) === 36;
      const count = random() > 0.48 ? 2 : 1;
      for (let k = 0; k < count; k++) {
        const width = count === 2 ? 8 + random() * 1.6 : 12 + random() * 4;
        const depth = 10 + random() * 7;
        const height = (near ? 1 + Math.floor(random() * 3) : 2 + Math.floor(random() * 6)) * 3;
        const x = bx + (count === 2 ? (k === 0 ? -5.5 : 5.5) : (random() - 0.5) * 2);
        const z = bz + (random() - 0.5) * 2;
        const palette = ['#a5ada8', '#afb2a7', '#a2abae', '#b4b0a3', '#9da9a4'];
        const color = palette[Math.floor(random() * palette.length)];
        box('context-building', 'context', [width, height, depth], [x, height / 2, z], color);
        buildings.push({ x, z, width, depth, height });
        box('context-foundation', 'stone', [width + 0.8, 0.08, depth + 0.8], [x, 0, z], '#b7bdb6');
        box(
          'context-roof',
          'stone',
          [width + 0.12, 0.16, depth + 0.12],
          [x, height + 0.08, z],
          '#9da7a4',
        );
        box(
          'context-rooftop',
          'stone',
          [width * 0.3, 0.7, depth * 0.25],
          [x - width * 0.15, height + 0.5, z],
          '#a9b0aa',
        );
      }
      tree(bx - 10.8, bz + 9.8);
      if (near) {
        box('context-parking', 'stone', [22, 0.03, 2.2], [bx, 0, bz + 10.8], '#a7b0aa');
        tree(bx + 10.8, bz - 9.8);
        lamp(bx + 12.9, bz + 5, 0);
        if (cars < 8)
          car(
            bx - 7.5,
            bz + 11,
            Math.PI / 2,
            ['#6e8390', '#a39b88', '#a27360', '#566d75'][cars % 4],
          );
      }
    }
  }

  // 중앙 횡단보도 네 곳과 보도 쪽 노란 점자블록.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      for (let k = 0; k < 9; k++) {
        const offset = -3.2 + k * 0.8;
        box(
          'crosswalk',
          'paint',
          [1.65, 0.009, 0.38],
          [sx * 12.3, -0.007, sz * 18 + offset],
          '#e3e5dc',
        );
        box(
          'crosswalk',
          'paint',
          [0.38, 0.009, 1.65],
          [sx * 18 + offset, -0.007, sz * 12.3],
          '#e3e5dc',
        );
      }
      box('tactile-paving', 'paint', [1.6, 0.016, 0.38], [sx * 12.3, 0.038, sz * 13.35], '#c8b77b');
      box('tactile-paving', 'paint', [0.38, 0.016, 1.6], [sx * 13.35, 0.038, sz * 12.3], '#c8b77b');
      box('planter', 'stone', [2.35, 0.2, 2.35], [sx * 10.4, 0.1, sz * 10.4], '#8b9993', {
        castShadow: true,
      });
      box('planter-soil', 'stone', [2.1, 0.03, 2.1], [sx * 10.4, 0.215, sz * 10.4], '#77876b');
      tree(sx * 10.4, sz * 10.4, true);
      lamp(sx * 12.9, sz * 6, sx > 0 ? 0 : Math.PI, true);
      bench(sx * 10.3, sz * 4.5, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
    }
  // 필지 전면의 작은 주차 구역은 건물 설정과 관계없이 유지합니다.
  for (const x of [-9, -6, -3]) {
    box('parking-mark', 'paint', [0.05, 0.008, 3], [x, 0.019, 10], '#dce0d5');
  }
  box('parking-mark', 'paint', [6.05, 0.008, 0.05], [-6, 0.019, 11.5], '#dce0d5');
  return { objects, buildings, trees, cars };
}
