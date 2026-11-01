# 데이터 약속 (모듈 간 인터페이스)

세 모듈(A · B · C)은 이 문서의 약속으로만 연결됩니다. 코드 정의는 `src/core/types.js`, `src/core/events.js`, `src/data/ids.js` 에 있습니다.

- **단위**: 1 = 1m, y축이 위, 시간은 초
- **필드는 추가만 자유**. 이름 변경 · 삭제는 통합 담당과 상의합니다.

## 전체 흐름

```
 C (ui)                       main.js                    A (build · render)         B (sim)
 ──────                       ───────                    ──────────────────         ───────
 형태·층수·재료 선택  ──spec──▶  makeBuilding(spec) ──────▶ Part[] 생성
                              renderer.setParts(parts) ─▶ 메시 생성
 "시뮬레이션 시작"   ─screen─▶  createSimulation(parts) ───────────────────────────▶ 강체 준비
 부재 클릭 → raycast ◀────────────────────────────────── renderer.raycast(ndc)
 "실행"  ──SCENARIO_RUN──────▶  sim.runScenario() ──────────────────────────────────▶ 피해 · 붕괴
                              매 1/60초 sim.step(dt) ─────────────────────────────▶ part.position 등 갱신
                              매 프레임 renderer.syncParts(parts) ▶ 메시 위치 · 색 반영
 결과 표시 ◀── store.results ─ 0.2초마다 sim.getResults()
                                                         IMPACT 등 이벤트 ◀──────── emit(...)
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
  kind: 'column',             // column | beam | slab | wall | roof | window | fragment
  floor: 1,                   // 1부터. 지붕도 해당 층 번호
  material: 'rc',             // 재료 ID
  size: [0.4, 2.75, 0.4],     // 상자 크기 [x, y, z]
  position: [x, y, z],        // 중심 위치 (월드 좌표)
  quaternion: [0, 0, 0, 1],   // 회전
  supportedBy: ['ground'],    // 받쳐주는 부재 id 목록. 땅이면 'ground'
  structural: true,           // 하중을 받는 부재인지 (창문 등 장식은 false)
  state: 'intact',            // intact | damaged | failed | falling | settled
  hp: 1,                      // 1 = 멀쩡, 0 = 기능 상실
  sim: { ... },               // B 전용 메모 공간 (A · C는 읽지 않음)
  view: { ... },              // A 전용 메모 공간 (B · C는 읽지 않음)
}
```

| 필드 | 누가 쓰는가 |
|---|---|
| id, kind, floor, material, size, supportedBy, structural | A의 생성기 (`createPart()` 로 만들 것) |
| position, quaternion | 처음에는 A, 시뮬레이션 중에는 B |
| state, hp | B |
| sim | B만 |
| view | A만 |

### 상태(state)의 의미

| 상태 | 뜻 | 화면 (A) | 물리 (B) |
|---|---|---|---|
| intact | 멀쩡함 | 보임 | 고정 |
| damaged | 피해를 입었지만 버팀 (hp < 1) | 보임, 손상 표현 | 고정 |
| failed | 기능 상실 — 조각으로 대체됨 | **숨김** | 강체 제거 |
| falling | 지지를 잃고 떨어지는 중 | 보임 | 움직임 |
| settled | 떨어진 뒤 멈춤 | 보임 | 잠듦 |

### 조각(fragment)

B가 부재를 쪼개면 `kind: 'fragment'` 부재를 **같은 parts 배열에 추가**하고 `PART_ADDED` 이벤트를 보냅니다. 렌더러의 `syncParts()` 는 처음 보는 부재의 메시를 자동으로 만듭니다.

## 3. 공개 함수

| 모듈 | 함수 | 설명 |
|---|---|---|
| build (A) | `makeBuilding(spec) → Part[]` | 설정으로 부재 목록 생성 |
| render (A) | `createRenderer(container) → Renderer` | |
| | `renderer.setParts(parts)` | 건물을 새로 그림 |
| | `renderer.syncParts(parts)` | 매 프레임 위치 · 상태 반영 |
| | `renderer.setSelected(id)` / `setHovered(id)` | 강조 표시 |
| | `renderer.raycast({x, y}) → id \| null` | 화면 좌표(-1~1) → 부재 id |
| | `renderer.getBounds() → THREE.Box3` | 건물 경계 상자 |
| | `renderer.camera`, `renderer.domElement` | 카메라 조작용 (C) |
| sim (B) | `createSimulation(parts, { emit }) → Simulation` | |
| | `sim.runScenario(scenario)` | 시나리오 실행 |
| | `sim.step(dt)` | 1/60초 진행 |
| | `sim.getResults() → SimResults` | 결과 |
| | `sim.dispose()` | 정리 |
| ui (C) | `mountUI(root, { renderer, getParts }) → { update(dt) }` | `getParts()` 는 읽기 전용 |

## 4. Scenario — 시나리오 실행 요청 (C → B)

```js
{ type: 'impact', intensity: 0.6, targetPartId: 'col-1-0-0' }
// type: impact | explosion | earthquake | fire   (지진은 targetPartId: null)
// intensity: 0 ~ 1
```

## 5. SimResults — 결과 (B → C)

```js
{
  time: 7.0,                  // 경과 시간 (초)
  totalParts: 215,            // 구조 부재 수 (조각 · 창문 제외)
  collapsedParts: 90,
  collapsedRatio: 0.42,
  firstFailedPartId: 'col-1-0-0',
  floorsLost: 1,              // 바닥판이 모두 무너진 층 수
  finished: true,             // 모든 움직임이 멈췄는지
}
```

## 6. 상태 저장소 (store) — "지금의 값"

`store.get()`, `store.set({...})`, `store.subscribe((state, prev) => {})`

| 키 | 설명 | 주로 바꾸는 쪽 |
|---|---|---|
| screen | `'select' \| 'configure' \| 'simulate'` | C |
| spec | BuildingSpec — 바뀌면 건물이 새로 만들어짐 | C |
| selectedPartId / hoveredPartId | 선택 · 마우스 올린 부재 | C |
| paused / speed | 일시정지, 재생 속도 (0.25 ~ 2) | C |
| results / simTime | 최근 결과 | main (B의 getResults) |
| buildVersion | 건물을 새로 만들 때마다 +1 | main |

## 7. 이벤트 — "일어난 일"

`emit(EVENTS.X, payload)`, `on(EVENTS.X, fn)`

| 이벤트 | 보내는 쪽 → 받는 쪽 | payload |
|---|---|---|
| SCENARIO_RUN | C → main → B | Scenario |
| SIM_RESET | C → main | {} |
| PART_DAMAGED | B → A, C | { partId, hp } |
| PART_FAILED | B → A, C | { partId } |
| PART_DETACHED | B → A, C | { partId } |
| PART_SETTLED | B → A, C | { partId } |
| PART_ADDED | B → A | { part } |
| IMPACT | B → A (이펙트) | { position, energy, kind: impact \| explosion \| collision \| fire } |
| SIM_FINISHED | B → C | SimResults |

새 이벤트가 필요하면 통합 담당에게 요청해 `core/events.js` 에 추가합니다.
