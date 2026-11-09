# A 구현 / 발표 / B 인수인계 메모

## 수정 범위

외형 구현은 `src/build/`, `src/render/`, `src/data/materialLooks.js`에서 진행했습니다.
추가 성능 최적화에서는 사용자에게 범위를 알린 뒤 B의 `src/sim/simulation.js`와
회귀 테스트 `src/sim/tests/optimization.test.js`도 최소 수정/추가했습니다.
C, 공용 파일, 물리 재료 값, 패키지 목록, 외부 이미지 경로는 변경하지 않았습니다.
새 런타임 의존성을 설치하지 않습니다. Three.js 0.180.0 / WebGL을 유지합니다.

## 건물 생성

- 공통 격자: `frame.js`. 기존 기둥 ID, `grid`, 보/바닥판의 `supportedBy`를 유지합니다.
- 외벽: 창턱과 인방을 실제 상자 부재로 만들고 그 사이에 창을 배치합니다.
  일반 외벽에는 창 사이 벽을 추가하고 L자형은 넓은 커튼월 구획을 사용합니다.
- 주택: 원래 최상층 판은 천장으로 남기고, 그 판이 받치는 경사 지붕 16장을 추가합니다.
  지붕은 회전된 직육면체, 박공 끝벽은 짧은 계단형 상자들의 근사입니다.
- 필로티: 1층 전면 개방, 뒤쪽 계단실, 주차 도색, 주거층 발코니.
- 아파트: 반복 창호/발코니, 옥탑, 옥상 난간.
- L자형: 기존 L자 칸 배치, 넓은 유리 면, 꺾인 외곽을 따라가는 옥상 난간.
- 새 발코니 바닥은 실제 구조 부재로 집계합니다. 창틀은 유리와 함께 움직이는 렌더 전용
  장식입니다. 계단실/옥탑은 비구조 표시 부재이며 아직 층 하중을 전달하는 내력 코어가 아닙니다.
- 단독주택의 실제 하중 전달 방식은 기존 기둥/보 골조입니다. 벽식 구조 해석을 구현했다고
  발표하지 않습니다. 계단실 내부 계단과 엘리베이터 장치는 이번 범위에 포함하지 않았습니다.

## 인스턴싱을 쓰는 이유

기둥/보/판은 단위 상자 지오메트리를 공유하며 재료별 InstancedMesh로 묶습니다.
인스턴스 행렬은 각 부재의 크기/위치/회전을 독립적으로 표현합니다.
부재별 선택, 외벽 숨김, 단면 보기, 분리 파편의 동적 추가를 유지하면서 그리기 호출을 줄입니다.
창틀도 방향별로 배치합니다. `setColorAt`과 인스턴스 속성으로 선택색/손상/그을림을 표현합니다.
용량 확장 시 기존 행렬과 초기 표면 좌표를 복사하여 이전 인스턴스가 사라지지 않게 합니다.
인스턴싱은 렌더링 최적화입니다. B의 강체 수나 물리 연산 비용을 줄이는 기능은 아닙니다.

## 재료 / 텍스처 / 손상

- `surfaceTextures.js`: 결정적 픽셀 생성으로 256x256 색상 및 높이/거칠기 텍스처를 생성합니다.
  콘크리트 기공, 벽돌 줄눈, 목재 결, 철골 브러시, 패널 이음새를 별도로 만듭니다.
  다운로드할 이미지나 별도 텍스처 제작 프로그램은 필요하지 않습니다.
- `surfaceMaterial.js`: MeshStandardMaterial의 PBR/조명/그림자는 유지하며 onBeforeCompile로
  삼면 투영 매핑과 손상 표시를 추가합니다. 색상은 sRGB, 높이/거칠기는 비색상 데이터입니다.
  평평한 상자 면은 해당 축만 샘플링하고, 높이/거칠기 샘플은 한 번 읽어 재사용합니다.
- 좌표는 `초기 위치 + 부재 로컬 위치 x 실측 크기`입니다. 큰 벽과 작은 벽에서 무늬 비율이
  일치하고, 현재 월드 좌표로 다시 샘플링하지 않아 낙하/회전 시 무늬가 부재에 붙어 움직입니다.
- 균열은 HP를 읽는 시각적 셰이더 표시입니다. 실제 파단면/변형/내부 응력 계산이 아닙니다.
- 그을림은 기존 `IMPACT(kind:'fire')` 이벤트 위치/반경에서 시각 값만 누적합니다.
  렌더러는 HP, 물리 강체, 시나리오 입력을 변경하지 않습니다.
- 표면 높이는 범프 표현입니다. 정점 변위로 충돌체와 다른 형상을 만들지 않습니다.

## 조명 / 그림자 / 효과

- 절차적 RoomEnvironment를 PMREM으로 필터링해 금속/유리 반사에 사용합니다.
- 따뜻한 주광, 차가운 보조광, 반구 환경광, ACES 톤매핑을 사용합니다.
- `buildingBounds.js`는 quaternion을 반영한 경계의 여덟 모서리를 광원 좌표로 변환합니다.
  지면과 건물을 포함하도록 방향광의 직교 그림자 카메라를 맞춥니다. 낙하 중에는 0.5초마다 갱신합니다.
- 먼지/불꽃/연기는 최대 384개 렌더 전용 파티클을 재사용합니다. 충격파는 최대 8개입니다.
  별도 물리 강체를 만들지 않으며 기존 IMPACT 이벤트를 사용합니다. 초기화 시 효과도 지웁니다.

## 주변 거리 배경

- `neighborhoodLayout.js`는 고정 시드로 도로 격자, 중앙 광장, 주변 필지와 건물을 배치합니다.
  중앙 24m 필지는 메인 건물 전용이며 도로 폭은 8m, 블록 간격은 36m입니다.
- 차선/횡단보도/보도/연석/화단/가로수/벤치/가로등/주차 차량은 절차적 도형으로 구성합니다.
  외부 모델·이미지·물리 강체는 추가하지 않습니다. 주변 건물의 반복 창문은 셰이더로 표현합니다.
- 배경은 재질/도형/그림자 조건별 InstancedMesh로 묶고 한 번만 생성합니다.
  메인 건물 유형·층수·재료 변경과 리셋 때 배경 배치/인스턴스 행렬은 유지됩니다.
- 배경은 `Part[]`, 부재 선택, 결과 집계, 카메라의 메인 건물 경계에서 제외됩니다.
  충돌/파괴 대상도 아니므로 폭발 시 주변 건물까지 무너지는 기능은 없습니다.
- 중앙의 나무·가로등은 메인 그림자 범위에 포함합니다. 먼 배경은 낮은 대비와 안개로
  구분하고 별도 그림자 광원을 늘리지 않아 메인 건물의 관찰에 집중할 수 있게 합니다.

## 참고 소스와 적용 범위

아래는 구현 원리 참고 자료입니다. 외부 프로젝트 전체나 새 라이브러리를 이식하지 않았습니다.
직접 구현한 부분은 우리 Part 계약에 맞춘 생성/지지 연결, 절차 픽셀, 로컬 실측 매핑,
HP/화재 이벤트의 표시 연결, 동적 배치 확장, 경계/그림자 계산과 검증입니다.

1. [Three.js r180 instancing performance](https://github.com/mrdoob/three.js/blob/r180/examples/webgl_instancing_performance.html)
   / [shadowmap](https://github.com/mrdoob/three.js/blob/r180/examples/webgl_shadowmap.html):
   인스턴싱/개별 메시/병합 비교, 조명과 그림자 카메라 원리.
2. [House builder roof](https://github.com/ch-bas/threejs-sims-house-builder/blob/main/components/room-organizer/three/roof.ts)
   / [wall patterns](https://github.com/ch-bas/threejs-sims-house-builder/blob/main/components/room-organizer/three/wall-patterns.ts)
   / [sun shadow](https://github.com/ch-bas/threejs-sims-house-builder/blob/main/components/room-organizer/lib/sun-shadow.ts):
   치수 기반 지붕, 절차 텍스처, 경계의 광원 좌표 투영 아이디어.
3. [ProceduralBuildingsThreeJS kit](https://github.com/achrefelouafi/ProceduralBuildingsThreeJS/blob/main/src/kit.ts):
   반복 모듈/재료별 인스턴싱. 원본 GLB 모듈/Blender 그래프/도시는 가져오지 않았습니다.
4. [material-maker-threejs](https://github.com/williamchange/material-maker-threejs/blob/master/main.js):
   색공간, PBR 텍스처와 환경 반사. Material Maker 자체와 초고분할 모델은 사용하지 않습니다.
5. [Troika InstancedUniformsMesh](https://github.com/protectwise/troika/blob/main/packages/three-instanced-uniforms-mesh/src/InstancedUniformsMesh.js):
   부재별 셰이더 값을 인스턴스 속성으로 전달하는 개념. Troika는 설치하지 않았습니다.

## 추가 성능 최적화

- 부재별 위치/회전/크기/표시 상태를 비교하고 달라진 인스턴스 행렬만 씁니다.
  선택/호버/HP/그을림도 해당 색상 또는 표면 속성만 변경합니다.
- `BufferAttribute.updateRanges`로 변경 범위를 지정하고 실제 업로드가 끝날 때 범위를
  지웁니다. 첫 업로드, 화면 밖에서의 누적 변경, 배치 용량 확장도 유지합니다.
  레이캐스트 경계는 행렬이 바뀔 때만 무효화합니다.
- 창틀은 창문 표시가 바뀔 때만 다시 동기화합니다. 움직이는 창문이 있으면 기존처럼
  창틀 배치를 갱신합니다. 렌더링 자체는 계속 실행하므로 카메라 조작은 유지됩니다.
- 깨어 있는 동적 강체가 없으면 `world.step`을 생략합니다. 시뮬레이션 시간, 화재/지진
  효과의 시간 처리, 지지 갱신은 계속 진행합니다. 잠든 settled 부재의 좌표 복사는 생략하고,
  충돌/충격으로 다시 깨어난 잔해는 falling으로 돌려 좌표와 종료 판정을 갱신합니다.
- 물리 파편 수 제한/강제 제거, 충돌 필터 변경, Worker 분리는 적용하지 않았습니다.
  앞의 두 방법은 잔해의 지지/충돌 결과를 바꿀 수 있습니다. 현재 변경은 물리 계산을
  렌더링과 분리하는 새 구조나 의존성 없이, 반복되는 불필요한 작업을 줄이는 범위입니다.

로컬 CPU 측정(아파트 8층, 초기 부재 1,144개): 첫 측정에서 정지 상태 렌더 동기화는
변경 전 약 0.55ms, 변경 후 약 0.19~0.27ms였습니다. 이후 재측정에서는 변경 후 약
0.48ms까지 변동했습니다. 주 부재 속성 갱신 표시는 일관되게 8회에서 0회,
부재 하나가 이동할 때는 8회에서 1회로 줄었습니다. 정지 물리 단계는 초기 측정에서
약 1.57ms → 0.02ms, 이전 소스와 같은 스크립트로 다시 비교했을 때 3.39ms → 0.094ms였습니다.
이는 각 함수의 CPU 시간이며 전체 FPS, GPU 성능 또는 대규모 붕괴 중 물리 성능의
개선율을 뜻하지 않습니다. 측정값은 실행 환경과 JIT/부하에 따라 달라집니다.

추가 실험(필로티 5층, seed 123, 전면 기둥 2개 파괴 후 600단계): SAP 축 자동 선택도
기존 X축을 선택했습니다. 후보 판정을 AABB로 바꾸면 해당 실행의 평균 단계 시간이
약 21ms에서 33ms로 늘어 적용하지 않았습니다. 세부 충돌 판정과 솔버가 주된 비용이었으며,
부재 수/충돌 규칙/솔버 정밀도를 낮추는 변경은 하지 않았습니다. 이 시나리오는 여전히
물리 계산 때문에 프레임이 느려질 수 있으며 이번 변경으로 60FPS를 보장하지 않습니다.

최적화 원리 참고:

- [Three.js r180 BufferAttribute](https://github.com/mrdoob/three.js/blob/r180/src/core/BufferAttribute.js)
  / [WebGLAttributes](https://github.com/mrdoob/three.js/blob/r180/src/renderers/webgl/WebGLAttributes.js):
  속성 버전, 부분 갱신 범위와 업로드 후 정리.
- [three-voxel-destruction chips](https://github.com/sbobyn/three-voxel-destruction/blob/main/src/chips.ts):
  제한된 렌더 전용 파편의 재사용 개념. 기존 효과 풀(384개/충격파 8개)을 유지했으며
  참고 프로젝트의 물리 엔진이나 파편 상한을 이식하지 않았습니다.
- [cannon-es 0.20 SAPBroadphase](https://github.com/pmndrs/cannon-es/blob/v0.20.0/src/collision/SAPBroadphase.ts)
  / [Broadphase](https://github.com/pmndrs/cannon-es/blob/v0.20.0/src/collision/Broadphase.ts):
  정렬 축 자동 선택과 구/상자 후보 판정 비교에 참고했습니다. 측정상 이득이 없어 설정은 유지했습니다.
- [Ponytail SKILL](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md):
  기존 기능 재사용, 작은 변경, 측정/회귀 검증 원칙을 이번 작업에 적용했습니다.
  런타임 라이브러리나 전역 스킬 설치는 추가하지 않았습니다.

## B와 공유할 기존 한계

1. 회전된 박공지붕의 렌더링/충돌 상자는 회전을 반영하지만, 기존 B의 범위 피해 거리와
   파편 배치는 회전을 무시합니다. 정확한 범위 판정과 분해 위치는 B에서 역회전/정회전 처리가 필요합니다.
2. 외형을 바꿔도 실제 하중 재분배/코어 강성/벽식 구조가 자동으로 구현되는 것은 아닙니다.
3. 기존 B의 마지막 화재 틱 지지 갱신, failed 바닥판의 층 손실 집계는 그대로입니다.
   settled 강체 재활성화 시 좌표/종료 판정 문제는 위 성능 최적화에서 함께 수정했습니다.
4. 기본 최대 층수의 초기 부재 수는 주택 335 / 필로티 652 / 아파트 1144 / L자형 628입니다.
   추가 파편까지 고려한 물리 성능은 B 단계에서 재평가해야 합니다.

## 확인 방법

```sh
node --test src/build/tests/buildings.test.js src/render/tests/rendering.test.js src/sim/tests/optimization.test.js
node src/render/tests/bench-render.mjs
npm run build
npm run dev
```

- 건물 형태/층수/재료를 바꾸고 개별 부재 선택, 외벽 숨김, 층 단면을 확인합니다.
- 지붕/난간/발코니를 선택해 충격과 범위 폭발을 실행합니다.
- 화재 시 그을림, HP 감소 시 균열, 초기화 시 표시 복원을 확인합니다.
- `__app.renderer.getDiagnostics()`는 그리기 호출/삼각형/지오메트리/텍스처 수를 반환합니다.
  그림자와 유리의 추가 패스가 있으므로 '재료 수 = 전체 draw call 수'로 설명하지 않습니다.
