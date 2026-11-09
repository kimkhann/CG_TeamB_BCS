import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec } from '../../core/types.js';
import { buildReport } from '../reports/index.js';
import { designVariants } from '../reports/designComparison.js';
import { gravityGrade, seismicGrade } from '../reports/keyMembers.js';
import { freshSimulation, runUntil } from '../reports/headless.js';

test('보고서 ①: 로그 분석 — 기록 · 원인 · 연쇄 · CSV', async () => {
  const spec = normalizeSpec({ type: 'house', floors: 2 });
  const { parts, sim } = freshSimulation(spec);
  const column = parts.find((p) => p.kind === 'column' && p.floor === 1);
  sim.runScenario({ type: 'impact', value: 60, target: { kind: 'part', partId: column.id } });
  await runUntil(sim, { maxSeconds: 10, minSeconds: 1 });
  const history = sim.getHistory();
  assert.equal(history.events[0].type, 'scenario');
  assert.ok(history.events.some((e) => e.type === 'failed' && e.partId === column.id));
  assert.ok(history.events.some((e) => e.type === 'detached' && e.trigger.includes(column.id)));
  assert.ok(history.samples.length > 0);
  const report = await buildReport('log', { spec, sim, parts });
  assert.match(report.html, /^<!doctype html>/);
  assert.match(report.html, /연쇄를 일으킨 부재/);
  assert.ok(report.csv.startsWith('﻿시각(초)'));
  sim.dispose();
});

test('보고서 ②: 설계 대안 — 현재 + 다른 재료, 필로티는 1층 벽 보강안', () => {
  const piloti = designVariants({ type: 'piloti', floors: 4 });
  assert.equal(piloti[0].name, '현재 설계');
  assert.ok(piloti.some((v) => v.name.includes('1층 벽')));
  const walls = piloti.find((v) => v.name.includes('1층 벽')).build(piloti[0].spec);
  assert.ok(walls.some((p) => p.kind === 'wall' && p.floor === 1 && p.structural));
  const apartment = designVariants({ type: 'apartment', floors: 3 });
  assert.ok(!apartment.some((v) => v.name === 'RC 골조'), '현재와 같은 재료 조합은 빼기');
});

test('보고서 ③: 핵심 부재 등급 기준', async () => {
  assert.equal(gravityGrade({ spreadLoss: 0.2, slabLoss: 0.5, collapsedOthers: 30 }), 'critical');
  assert.equal(gravityGrade({ spreadLoss: 0, slabLoss: 0.1, collapsedOthers: 5 }), 'caution');
  assert.equal(gravityGrade({ spreadLoss: 0, slabLoss: 0, collapsedOthers: 1 }), 'local');
  assert.equal(seismicGrade(0.12), 'critical');
  assert.equal(seismicGrade(0.01), 'safe');
  const report = await buildReport('keymembers', {
    spec: normalizeSpec({ type: 'house', floors: 1 }),
    floor: 1,
  });
  assert.match(report.html, /핵심 부재 지도/);
  assert.match(report.html, /<svg/);
});
