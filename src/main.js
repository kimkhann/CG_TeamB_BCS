/**
 * [BASE · 공용] 앱 시작점 — 모듈들을 연결하는 곳
 *
 * 이 파일은 통합 담당만 수정합니다.
 * 각 모듈은 아래 "공개 함수"로만 연결됩니다.
 *   build  (A) makeBuilding(spec) → Part[]
 *   render (A) createRenderer(container) → Renderer
 *   sim    (B) createSimulation(parts, { emit }) → Simulation
 *   ui     (C) mountUI(root, { renderer, getParts }) → { update(dt) }
 */

import './styles/base.css';
import './styles/ui.css';

import { store } from './core/state.js';
import { on, emit, EVENTS } from './core/events.js';
import { startLoop } from './core/loop.js';
import { readDevParams } from './core/devParams.js';
import { makeBuilding } from './build/generator.js';
import { createRenderer } from './render/scene.js';
import { createSimulation } from './sim/simulation.js';
import { mountUI } from './ui/ui.js';

const viewportEl = document.getElementById('viewport');
const panelEl = document.getElementById('panel');
const debugEl = document.getElementById('debug');

// ── 개발용 URL 옵션 적용 ─────────────────────────────
const dev = readDevParams();
if (dev.spec) store.set({ spec: dev.spec });
if (dev.screen) store.set({ screen: dev.screen });

// ── 모듈 생성 ────────────────────────────────────────
/** 현재 건물의 부재 목록 (시뮬레이션이 조각을 추가하면 이 배열에 들어옴) */
let parts = [];

const renderer = createRenderer(viewportEl);
const ui = mountUI(panelEl, { renderer, getParts: () => parts });
/** 시뮬레이션 화면에서만 존재 */
let sim = null;

/** 설정(spec)으로 건물을 새로 만들고, 시뮬레이션 화면이면 시뮬레이션도 새로 준비합니다. */
function rebuild() {
  sim?.dispose();
  sim = null;

  const { spec, screen, buildVersion } = store.get();
  parts = makeBuilding(spec);
  renderer.setParts(parts);

  if (screen === 'simulate') {
    sim = createSimulation(parts, { emit });
  }
  store.set({
    simTime: 0,
    results: sim ? sim.getResults() : null,
    selectedPartId: null,
    hoveredPartId: null,
    paused: false,
    buildVersion: buildVersion + 1,
  });
}

// 설정이 바뀌거나, 시뮬레이션 화면에 들어오고 나갈 때 건물을 새로 만듭니다.
store.subscribe((state, prev) => {
  const enteredOrLeftSim = (state.screen === 'simulate') !== (prev.screen === 'simulate');
  if (state.spec !== prev.spec || enteredOrLeftSim) rebuild();
  if (state.selectedPartId !== prev.selectedPartId) renderer.setSelected(state.selectedPartId);
  if (state.hoveredPartId !== prev.hoveredPartId) renderer.setHovered(state.hoveredPartId);
});

// UI가 보내는 요청 처리
on(EVENTS.SCENARIO_RUN, (scenario) => {
  if (!sim) return;
  store.set({ paused: false });
  sim.runScenario(scenario);
});
on(EVENTS.SIM_RESET, () => rebuild());

// ── 루프 ─────────────────────────────────────────────
let resultsTimer = 0;
const fps = { frames: 0, time: 0, value: 0 };

startLoop({
  isRunning: () => !!sim && !store.get().paused,
  getSpeed: () => store.get().speed,
  step: (dt) => sim.step(dt),
  frame: (frameDt) => {
    renderer.syncParts(parts);
    renderer.update(frameDt);
    ui.update(frameDt);
    renderer.render();

    // 결과는 0.2초마다 상태 저장소에 반영 (UI가 구독해서 표시)
    resultsTimer += frameDt;
    if (sim && resultsTimer > 0.2) {
      resultsTimer = 0;
      const results = sim.getResults();
      store.set({ results, simTime: results.time });
    }

    if (dev.debug) {
      fps.frames++;
      fps.time += frameDt;
      if (fps.time > 0.5) {
        fps.value = Math.round(fps.frames / fps.time);
        fps.frames = 0;
        fps.time = 0;
        const moving = parts.filter((p) => p.state === 'falling').length;
        debugEl.textContent = `FPS ${fps.value}\nparts ${parts.length}  falling ${moving}`;
      }
    }
  },
});

debugEl.hidden = !dev.debug;
rebuild();

// 브라우저 콘솔에서 상태를 확인할 수 있도록 노출 (예: __app.parts())
window.__app = { store, emit, EVENTS, parts: () => parts, sim: () => sim, renderer };
