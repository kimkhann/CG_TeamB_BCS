import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSpec } from '../../core/types.js';
import { buildReport } from '../reports/index.js';
import { designVariants } from '../reports/designComparison.js';
import { gravityGrade, seismicGrade } from '../reports/keyMembers.js';
import { freshSimulation, runUntil } from '../reports/headless.js';

test('report ①: log analysis — history, causes, cascade, CSV', async () => {
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
  assert.match(report.html, /Cascade triggers/);
  assert.ok(report.csv.startsWith('﻿Time (s)'));
  sim.dispose();
});

test('report ②: design alternatives — current + other materials, ground-floor walls for a piloti', () => {
  const piloti = designVariants({ type: 'piloti', floors: 4 });
  assert.equal(piloti[0].name, 'Current design');
  assert.ok(piloti.some((v) => v.name.includes('ground-floor walls')));
  const walls = piloti.find((v) => v.name.includes('ground-floor walls')).build(piloti[0].spec);
  assert.ok(walls.some((p) => p.kind === 'wall' && p.floor === 1 && p.structural));
  const apartment = designVariants({ type: 'apartment', floors: 3 });
  assert.ok(
    !apartment.some((v) => v.name === 'RC frame'),
    'skip the material set identical to the current one',
  );
});

test('report ③: key member grading', async () => {
  assert.equal(gravityGrade({ spreadLoss: 0.2, slabLoss: 0.5, collapsedOthers: 30 }), 'critical');
  assert.equal(gravityGrade({ spreadLoss: 0, slabLoss: 0.1, collapsedOthers: 5 }), 'caution');
  assert.equal(gravityGrade({ spreadLoss: 0, slabLoss: 0, collapsedOthers: 1 }), 'local');
  assert.equal(seismicGrade(0.12), 'critical');
  assert.equal(seismicGrade(0.01), 'safe');
  const report = await buildReport('keymembers', {
    spec: normalizeSpec({ type: 'house', floors: 1 }),
    floor: 1,
  });
  assert.match(report.html, /Key member map/);
  assert.match(report.html, /<svg/);
});
