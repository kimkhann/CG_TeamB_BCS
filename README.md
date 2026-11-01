# Collapse Lab · 건물 붕괴 시뮬레이션 (CG Team B)

건물의 형태 · 층수 · 재료를 직접 정하고, 그 건물에 충격 · 폭발 · 지진 · 화재를 가해
무너지는 과정을 관찰하는 시뮬레이션입니다. **Three.js**(렌더링) + **cannon-es**(물리)로 만듭니다.

```
① 형태 선택  →  ② 층수 · 부위별 재료 설정  →  ③ 붕괴 시뮬레이션 (시나리오 실행 · 재생 제어 · 결과)
```

## 실행 방법

필요한 것: [Node.js](https://nodejs.org) 18 이상 (20 LTS 권장)

```bash
npm install      # 처음 한 번
npm run dev      # 개발 서버 실행 → 브라우저가 자동으로 열림 (http://localhost:5173)
```

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 (코드를 저장하면 바로 반영) |
| `npm run build` | 배포용 빌드 (`dist/`) |
| `npm run format` | 코드 모양 정리 (PR 올리기 전에 실행) |
| `npm run bench -- piloti 5` | 화면 없이 시뮬레이션만 돌려 속도 · 정지 여부 확인 (B용) |

### 개발용 URL 옵션

다른 사람 작업과 상관없이 원하는 상태로 바로 시작할 수 있습니다.

```
http://localhost:5173/?type=apartment&floors=8&frame=wood&screen=simulate&debug=1
```

| 옵션 | 값 |
|---|---|
| `type` | `house` `piloti` `apartment` `lshape` |
| `floors` | 층수 (단독주택 1~3, 필로티 2~5, 아파트 3~8, L자형 2~5) |
| `frame` `wall` `slab` `facade` | 부위별 재료 ID (`rc` `steel` `wood` `brick` `panel` `window` `curtain`) |
| `screen` | `select` `configure` `simulate` |
| `debug` | `1` 이면 FPS · 부재 수 표시 |

브라우저 콘솔에서 `__app.parts()`, `__app.store.get()` 으로 현재 상태를 볼 수 있습니다.

## 폴더 구조와 담당

**자기 담당 폴더의 파일만 수정합니다.** 공용 파일은 통합 담당만 수정합니다.

```
src/
├─ main.js                공용  모듈 연결
├─ core/                  공용  types.js(데이터 약속) events.js state.js loop.js devParams.js
├─ data/
│  ├─ ids.js              공용  형태 · 재료 · 시나리오 ID
│  ├─ stateColors.js      공용  상태별 표시 색
│  ├─ materialLooks.js    A     재료별 겉모습
│  └─ materialPhysics.js  B     재료별 물성
├─ build/                 A     makeBuilding(spec) — 형태별 건물 생성
├─ render/                A     createRenderer() — 장면 · 조명 · 메시 · 이펙트
├─ sim/                   B     createSimulation() — 구조 판단 · 물리 · 시나리오 · 결과
├─ ui/                    C     mountUI() — 3단계 화면 · 부재 선택 · 카메라 · 재생
└─ styles/                C     ui.css  (base.css 는 공용)
scripts/bench-sim.mjs     B
docs/                     공용  CONTRACTS.md(데이터 약속 설명) HANDOFF.md(인수인계 기록)
```

## 진행 방식 — 이어달리기

같은 시간에 `main`을 고치는 사람은 항상 한 명입니다.

| 순서 | 담당 | 기간 | 할 일 |
|---|---|---|---|
| 0 | 통합 담당 | ~ 11/2 (월) 오전 | 베이스 (완료) |
| 1 | A | 11/2 (월) 오후 ~ 11/3 (화) | 형태 4종 생성기, 재료 겉모습, 조명 · 그림자 |
| 2 | B | 11/4 (수) ~ 11/5 (목) 오전 | 하중 · 연쇄 붕괴, 낙하 충돌 피해, 지진 · 화재 |
| 3 | C | 11/5 (목) 오후 ~ 11/6 (금) | 화면 디자인, 결과 · 재료 비교, 재생 제어 → 금요일 밤 기능 동결 |
| 4 | 전원 | 11/7 (토) | A 이펙트 · 셰이더 / B · C 버그 수정 |
| 5 | 전원 | 11/8 (일) | 시연 시나리오, 영상 녹화, 최종 발표 자료 |

### 바통 넘기기

1. 자기 브랜치(`stage1-A` 등)에서 작업 → `npm run format` → `npm run dev` 로 동작 확인
2. PR을 올리고 `main`에 합친 뒤 태그 달기: `git tag handoff-1-A && git push --tags`
3. `docs/HANDOFF.md` 에 인수인계 내용 + 스크린샷 추가
4. 다음 사람이 실행해 보고 "받았음"이라고 답하면 다음 단계 시작

## 협업 규칙

1. 자기 폴더 밖의 파일은 수정하지 않는다. 필요하면 통합 담당에게 요청한다.
2. 다른 사람 폴더의 내부 파일을 `import` 하지 않는다. **공개 함수와 이벤트만** 사용한다.
3. 데이터 약속(`core/types.js`)의 필드는 추가만 가능. 이름 변경 · 삭제는 통합 담당과 상의.
4. 자기 차례가 아니면 `main`에 올리지 않는다. 대기 중에는 개인 연습 폴더에서 준비한다.
5. 마감 시각에 다 못 끝냈으면 된 부분까지만 넘기고, 못 한 것은 `HANDOFF.md`에 적는다.
6. 앞 단계 코드에서 버그를 찾으면 직접 고치지 말고 담당자에게 알린다.
