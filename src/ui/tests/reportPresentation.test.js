import test from 'node:test';
import assert from 'node:assert/strict';
import { presentReport } from '../reportPresentation.js';

test('HTML presentation preserves report data, keeps original headings and uses landscape for comparison', () => {
  const input =
    '<html><head></head><body><main><header><h1>Comparison</h1></header><section><h2>Results</h2><table><thead><tr><th>Ratio</th></tr></thead><tbody><tr><td>39.6%</td></tr></tbody></table></section></main></body></html>';
  const output = presentReport(input, 'compare');
  assert.ok(output.includes('<td>39.6%</td>'));
  assert.ok(output.includes('<h2>Results</h2>'));
  assert.ok(!output.includes('<nav'));
  assert.ok(output.includes('size:A4 landscape'));
  assert.ok(output.includes('window.print()'));
  assert.equal(presentReport(output, 'compare'), output);
  assert.ok(presentReport(input, 'log').includes('size:A4 portrait'));
});
