# 데이터 약속 (모듈 간 인터페이스)

세 모듈(A · B · C)은 이 문서의 약속으로만 연결됩니다. 코드 정의는 `src/core/types.js`, `src/core/events.js`, `src/core/state.js`, `src/data/ids.js` 에 있습니다.

- **단위**: 1 = 1m, y축이 위, 시간은 초
- **필드는 추가만 자유**. 이름 변경 · 삭제는 통합 담당과 상의합니다.

## 전체 흐름

```
 C (ui)                       main.js                    A (build · render)         B (sim)
 ──────                       ───────                    ──────────────────         ───────
 형태·층수·재료 선택  ──spec──▶  makeBuilding(spec) ──────▶ Part[] 생성
                              renderer.setParts(parts) ─▶ 인스턴스 메시 생성
 "시뮬레이션 시작"   ─screen─▶  createSimulation(parts) ───────────────────────────▶ 강체 준비
 부재 클릭 / 위치 클릭 ◀────────────────────────────────── raycast / raycastPoint
 "실행"  ──SCENARIO_RUN──────▶  sim.runScenario() ──────────────────────────────────▶ 피해 · 붕괴
                              매 1/60초 sim.step(dt) ─────────────────────────────▶ part.position 등 갱신
                              매 프레임 renderer.syncParts(parts) ▶ 위치 · 색 반영
 결과 표시 ◀── store.results ─ 0.2초마다 sim.getResults()
 이벤트 로그 ◀─────────────────────────────────────────── IMPACT 등 이벤트 ◀──────── emit(...)
```

## 1. BuildingSpec — 건물 설정 (C가 만들고 A가 받음)

```js
{
  type: 'piloti',          // 'house' | 'piloti' | 'apartment' | 'lshape'
  floors: 4,               // 형태별 범위는 data/ids.js BUILDING_TYPES[type].floors
  materials: {
    frame: 'rc',           // 기둥·보: rc | steel | wood
    wall: 'brick',         // 벽:     rc | brick | panel
    slab: 'rc',            // 바닥판: rc | wood
    facade: 'window',      // 외장:   window | curtain
  },
}
```

항상 `normalizeSpec()` 을 거쳐 범위 밖 값이 들어오지 않게 합니다.

## 2. Part — 부재 (A가 만들고, B가 상태를 바꾸고, A가 그림)

```js
{
  id: 'col-1-0-0',            // 고유 ID
  label: '1층 A1 기둥',        // 화면 표시용 이름 (이벤트 로그 · 대상 표시에 사용)
  kind: 'column',             // column | beam | slab | wall | roof | window | fragment
  floor: 1,                   // 1부터. 지붕판도 해당 층 번호
  material: 'rc',             // 재료 ID
  size: [0.4, 2.75, 0.4],     // 상자 크기 [x, y, z]
  position: [x, y, z],        // 중심 위치 (월드 좌표)
  quaternion: [0, 0, 0, 1],   // 회전
  supportedBy: ['ground'],    // 받쳐주는 부재 id 목록. 땅이면 'ground'
  structural: true,           // 하중을 받는 부재인지 (창문 등 장식은 false)
  state: 'intact',            // intact | damaged | failed | falling | settled
  hp: 1,                      // 1 = 멀쩡, 0 = 기능 상실
  grid: { i: 0, j: 0 },       // (기둥만) 격자 위치 — A1 = i0 j0, B1 = i1 j0
  sim: { ... },               // B 전용 메모 공간 (A · C는 읽지 않음)
  view: { ... },              // A 전용 메모 공간 (B · C는 읽지 않음)
}
```

| 필드 | 누가 쓰는가 |
|---|---|
| id, label, kind, floor, material, size, supportedBy, structural, grid | A의 생성기 (`createPart()` 로 만들 것) |
| position, quaternion | 처음에는 A, 시뮬레이션 중에는 B |
| state, hp | B |
| sim | B만 |
| view | A만 |

### 부재 단위와 하중 경로 (supportedBy 규칙)

부재는 무너질 때 자연스럽게 보이도록 잘게 나뉩니다.

| 부재 | 단위 | supportedBy |
|---|---|---|
| 기둥 | 층마다, 격자 교점마다 1개 | 아래층 같은 위치 기둥 (1층은 `'ground'`) |
| 보 | 층마다, 칸 가장자리마다 1개 | 양 끝 기둥 2개 |
| 바닥판 · 지붕판 | 칸 하나를 **2 × 2 조각** | 맞닿은 보 2개 + 같은 칸의 이웃 조각 2개 |
| 바깥 벽 | 가장자리 하나를 **가로 2 × 세로 2 패널** | 아래(보 · 땅 · 아래 패널), 위(보 · 위 패널), 왼쪽(기둥 · 이웃 패널), 오른쪽(기둥 · 이웃 패널) |
| 창문 | 벽 위쪽 패널마다 1개 | 붙어 있는 벽 패널 |

하중은 **바닥판 → 보 → 기둥 → 아래층 기둥 → 땅** 순서로 내려갑니다.

구조 판단 규칙 (`sim/structure.js`): **받쳐주는 부재 중 살아 있는 비율이 절반을 넘어야 버팀**. `'ground'` 는 항상 살아 있는 것으로 셉니다.
- 보: 2개 중 2개 필요 → 기둥 하나만 잃어도 떨어짐
- 바닥판 조각 · 벽 패널: 4개 중 3개 이상 필요

### 상태(state)의 의미

| 상태 | 뜻 | 화면 (A) | 물리 (B) |
|---|---|---|---|
| intact | 멀쩡함 | 보임 | 고정 |
| damaged | 피해를 입었지만 버팀 (hp < 1) | 보임, 손상 색 | 고정 |
| failed | 기능 상실 — 조각으로 대체됨 | **숨김** | 강체 제거 |
| falling | 지지를 잃고 떨어지는 중 | 보임, 낙하 색 | 움직임 |
| settled | 떨어진 뒤 멈춤 | 보임, 잔해 색 | 잠듦 |

상태별 색은 `data/stateColors.js` 한곳에서 정하고, 렌더러(A)와 범례(C)가 같이 씁니다.

### 조각(fragment)

B가 부재를 쪼개면 `kind: 'fragment'` 부재를 **같은 parts 배열에 추가**하고 `PART_ADDED` 이벤트를 보냅니다. 렌더러의 `syncParts()` 는 처음 보는 부재를 자동으로 그립니다.

## 3. Scenario — 시나리오 실행 요청 (C → B)

```js
// 부재 하나를 대상으로
{ type: 'impact', intensity: 0.6, target: { kind: 'part', partId: 'col-1-0-0' } }

// 위치 + 반경을 대상으로 (건물이 멀쩡해도 내부 빈 공간을 지정할 수 있음)
{ type: 'explosion', intensity: 0.8, target: { kind: 'area', position: [x, y, z], radius: 3, floor: 2 } }

// 지진은 대상 없이 가능
{ type: 'earthquake', intensity: 0.7, target: null }
```

| type | 부재 대상 | 위치 · 범위 대상 |
|---|---|---|
| impact | 그 부재에 피해 | 범위 안 부재 모두에 거리에 따라 약해지는 피해 |
| explosion | 그 부재 위치에서 폭발, 반경 = 2 + 6 × 세기 | 그 위치에서 폭발, 반경 = 지정한 radius |
| fire | 그 부재 위치에서 화재, 반경 3m | 그 위치에서 화재, 반경 = 지정한 radius |
| earthquake | (대상 무시) | (대상 무시) |

거리는 대상 중심에서 **부재 상자 표면까지**로 잽니다 (`sim/simulation.js` 의 `distanceToBox`).

## 4. SimResults — 결과 (B → C)

```js
{
  time: 7.0,                  // 경과 시간 (초)
  totalParts: 215,            // 구조 부재 수 (조각 · 창문 제외)
  collapsedParts: 90,
  collapsedRatio: 0.42,
  firstFailedPartId: 'col-1-0-0', // 처음 기능을 잃은 "구조" 부재
  floorsLost: 1,              // 바닥판이 모두 무너진 층 수
  finished: true,             // 모든 움직임이 멈췄는지
}
```

## 5. 공개 함수

| 모듈 | 함수 | 설명 |
|---|---|---|
| build (A) | `makeBuilding(spec) → Part[]` | 설정으로 부재 목록 생성 |
| render (A) | `createRenderer(container) → Renderer` | |
| | `renderer.setParts(parts)` | 건물을 새로 그림 |
| | `renderer.syncParts(parts)` | 매 프레임 위치 · 상태 반영 |
| | `renderer.setSelected(id)` / `setHovered(id)` | 강조 표시 |
| | `renderer.setPartFilter(fn \| null)` | 보일 부재 고르기 (외벽 숨기기, 단면 보기) |
| | `renderer.raycast({x, y}) → id \| null` | 화면 좌표(-1~1) → 보이는 부재 id |
| | `renderer.raycastPoint({x, y}, planeY?) → [x,y,z] \| null` | 화면 좌표 → 3D 위치 (planeY를 주면 그 높이 수평면과 만나는 점) |
| | `renderer.setTargetMarker({position, radius} \| null)` | 위치 · 범위 대상 표시 |
| | `renderer.getBounds() → THREE.Box3` | 서 있는 부재의 경계 상자 |
| | `renderer.camera`, `renderer.domElement` | 카메라 조작용 (C) |
| sim (B) | `createSimulation(parts, { emit }) → Simulation` | |
| | `sim.runScenario(scenario)` | 시나리오 실행 |
| | `sim.step(dt)` | 1/60초 진행 |
| | `sim.getResults() → SimResults` | 결과 |
| | `sim.dispose()` | 정리 |
| ui (C) | `mountUI(root, { renderer, getParts }) → { update(dt) }` | `getParts()` 는 읽기 전용 |

## 6. 상태 저장소 (store) — "지금의 값"

`store.get()`, `store.set({...})`, `store.subscribe((state, prev) => {})`

| 키 | 설명 | 주로 바꾸는 쪽 |
|---|---|---|
| screen | `'select' \| 'configure' \| 'simulate'` | C |
| spec | BuildingSpec — 바뀌면 건물이 새로 만들어짐 | C |
| selectedPartId / hoveredPartId | 선택 · 마우스 올린 부재 | C |
| targetMode | `'part' \| 'area'` — 대상 지정 방식 | C |
| areaTarget | `{ position, radius, floor }` — 위치 · 범위 대상 | C |
| hideFacade | 외벽 · 창 숨기기 | C |
| cutFloor | 단면 보기: 이 층보다 위층 숨김 (null = 전체) | C |
| paused / speed | 일시정지, 재생 속도 (0.25 ~ 2) | C |
| results / simTime | 최근 결과 | main (B의 getResults) |
| buildVersion | 건물을 새로 만들 때마다 +1 | main |

## 7. 이벤트 — "일어난 일"

`emit(EVENTS.X, payload)`, `on(EVENTS.X, fn)`

| 이벤트 | 보내는 쪽 → 받는 쪽 | payload |
|---|---|---|
| SCENARIO_RUN | C → main → B | Scenario |
| SIM_RESET | C → main | {} (선택 대상은 유지됨) |
| PART_DAMAGED | B → A, C | { partId, hp } |
| PART_FAILED | B → A, C | { partId } |
| PART_DETACHED | B → A, C | { partId } |
| PART_SETTLED | B → A, C | { partId } |
| PART_ADDED | B → A | { part } |
| IMPACT | B → A (이펙트) | { position, energy, kind: impact \| explosion \| collision \| fire, radius? } |
| SIM_FINISHED | B → C | SimResults |

새 이벤트가 필요하면 통합 담당에게 요청해 `core/events.js` 에 추가합니다.
