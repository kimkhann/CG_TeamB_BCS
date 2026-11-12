import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBuilding } from '../../build/generator.js';
import { defaultSpec } from '../../core/types.js';
import { store } from '../../core/state.js';
import { emit, on, EVENTS } from '../../core/events.js';
import { createSimulation } from '../../sim/simulation.js';
import { renderSelectScreen } from '../screens/selectScreen.js';
import { renderConfigureScreen } from '../screens/configureScreen.js';
import { renderSimulateScreen } from '../screens/simulateScreen.js';
import { showWelcome } from '../screens/welcomeScreen.js';
import { partLabel } from '../english.js';

// A small DOM fixture for event wiring and lifecycle checks; this does not test layout.
class Element {
  constructor(tag = '#text', text = '') {
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.attrs = {};
    this.dataset = {};
    this.listeners = {};
    this._text = text;
    this.className = '';
    this.classList = {
      add: (v) => this.classList.toggle(v, true),
      remove: (v) => this.classList.toggle(v, false),
      toggle: (v, active) => {
        const set = new Set(this.className.split(' ').filter(Boolean));
        if (active) set.add(v);
        else set.delete(v);
        this.className = [...set].join(' ');
      },
    };
  }
  get children() {
    return this.childNodes.filter((c) => c.tagName !== '#TEXT');
  }
  get textContent() {
    return this._text + this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this._text = String(v);
    this.childNodes = [];
  }
  set innerHTML(v) {
    assert.equal(v, '');
    this.textContent = '';
  }
  get value() {
    return this._value ?? this.attrs.value ?? '';
  }
  set value(v) {
    this._value = String(v);
  }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k.startsWith('data-')) this.dataset[k.slice(5)] = String(v);
  }
  append(...children) {
    for (const c of children) {
      c.parentElement = this;
      this.childNodes.push(c);
    }
  }
  replaceChildren(...children) {
    this.childNodes = [];
    this._text = '';
    this.append(...children);
  }
  prepend(c) {
    c.parentElement = this;
    this.childNodes.unshift(c);
  }
  get lastChild() {
    return this.childNodes.at(-1);
  }
  remove() {
    if (this.parentElement)
      this.parentElement.childNodes = this.parentElement.childNodes.filter((c) => c !== this);
  }
  addEventListener(k, fn) {
    (this.listeners[k] ??= []).push(fn);
  }
  async fire(k) {
    for (const fn of this.listeners[k] ?? []) await fn({ target: this });
  }
  focus() {
    document.activeElement = this;
  }
  querySelector(tag) {
    return all(this).find((e) => e.tagName === tag.toUpperCase());
  }
}
function all(el) {
  return [el, ...el.children.flatMap(all)];
}
function setup() {
  globalThis.Node = Element;
  const app = new Element('div');
  const root = new Element('aside');
  app.append(root);
  globalThis.document = {
    body: new Element('body'),
    activeElement: null,
    createElement: (tag) => new Element(tag),
    createTextNode: (text) => new Element('#text', text),
    getElementById: (id) => (id === 'app' ? app : null),
  };
  globalThis.window = {};
  return { app, root };
}
const button = (root, name) =>
  all(root).find((e) => e.tagName === 'BUTTON' && e.textContent === name);

test('title screen starts the flow; every building configures with English labels', async () => {
  const { root } = setup();
  let started = false;
  showWelcome(() => {
    started = true;
  });
  assert.equal(document.activeElement.tagName, 'BUTTON');
  await document.activeElement.fire('click');
  assert.ok(started);
  for (const type of ['house', 'piloti', 'apartment', 'lshape']) {
    const spec = defaultSpec(type);
    store.set({ spec, screen: 'select' });
    root.replaceChildren();
    renderSelectScreen(root);
    assert.equal(all(root).filter((e) => e.className.includes('type-card')).length, 4);
    await button(root, 'Configure building →').fire('click');
    assert.equal(store.get().screen, 'configure');
    root.replaceChildren();
    renderConfigureScreen(root);
    const slider = all(root).find((e) => e.attrs.type === 'range');
    slider.value = spec.floors + 1;
    await slider.fire('input');
    assert.equal(store.get().spec.floors, Math.min(spec.floors + 1, Number(slider.attrs.max)));
    assert.doesNotMatch(root.textContent, /[가-힣]/);
    assert.ok(makeBuilding(spec).every((p) => !/[가-힣]/.test(partLabel(p.label))));
  }
});

test('live controls, result fields, baseline and report exports work through the public contracts', async () => {
  const { app, root } = setup();
  const spec = defaultSpec('house');
  const parts = makeBuilding(spec);
  const sim = createSimulation(parts, { emit });
  store.set({
    spec,
    screen: 'simulate',
    results: sim.getResults(),
    selectedPartId: null,
    targetMode: 'part',
    areaTarget: null,
    paused: false,
    hideFacade: false,
    cutFloor: null,
    speed: 1,
  });
  const screen = renderSimulateScreen(root, { getParts: () => parts, getSim: () => sim });
  const bridge = on(EVENTS.SCENARIO_RUN, (s) => sim.runScenario(s));
  try {
    assert.equal(button(root, 'Run scenario →').disabled, true);
    const column = all(root).find((e) => e.dataset.part);
    await column.fire('click');
    screen.refresh(store.get(), store.get());
    assert.equal(button(root, 'Run scenario →').disabled, false);
    await button(root, 'Run scenario →').fire('click');
    for (let i = 0; i < 600; i++) sim.step(1 / 60);
    store.set({ results: sim.getResults() });
    screen.refresh(store.get(), store.get());
    assert.match(app.textContent, /Collapse duration/);
    assert.match(app.textContent, /Damage by floor/);
    assert.match(app.textContent, /Damage by cause/);
    assert.doesNotMatch(app.textContent, /[가-힣]|NaN|undefined/);
    await button(app, 'Pin as baseline').fire('click');
    assert.match(app.textContent, /BASELINE/);
    const make = button(root, 'Generate report');
    const reportType = all(root).find((e) => e.attrs['aria-label'] === 'Report type');
    const reportFloor = all(root).find((e) => e.attrs['aria-label'] === 'Analysis level');
    assert.equal(make.hidden, true);
    // whole-building reports need no level choice
    reportType.value = 'log';
    await reportType.fire('change');
    assert.equal(make.hidden, false);
    const saved = [];
    window.claude = { use: async () => ({ save: async (value) => saved.push(value) }) };
    await make.fire('click');
    assert.match(app.textContent, /Ready: Simulation log analysis/);
    assert.equal(saved.length, 0, 'nothing is saved until a format is chosen');
    const downloads = all(root).find((e) => e.className === 'row report-downloads');
    assert.equal(downloads.hidden, false);
    // one generated report exports every format without re-running the analysis
    await button(root, 'Download HTML').fire('click');
    await button(root, 'Download CSV').fire('click');
    assert.equal(saved.length, 2);
    assert.match(saved[0].filename, /_log_.*\.html$/);
    assert.match(saved[1].filename, /_log_.*\.csv$/);
    assert.ok(button(root, 'Open / Print PDF'));
    // the key member map needs a level
    reportType.value = 'keymembers';
    await reportType.fire('change');
    assert.equal(make.hidden, true);
    assert.equal(reportFloor.value, '');
    assert.equal(downloads.hidden, true);
    reportFloor.value = '1';
    await reportFloor.fire('change');
    assert.equal(make.hidden, false);
    await button(app, 'Clear').fire('click');
    assert.doesNotMatch(app.textContent, /BASELINE/);
  } finally {
    bridge();
    screen.cleanup();
    sim.dispose();
  }
  assert.equal(app.children.length, 1, 'leaving simulation removes the observation column');
});
