/**
 * heatmap.test.js — Heatmap の行実行回数（buildLineExecOwners）のユニットテスト
 */

import { JSDebugger } from '../../../JSInterpreter/src/interpreter/debugger.js';
import { TraceBuilder } from '../../src/core/trace-builder.js';
import { buildLineExecOwners } from '../../src/views/heatmap/index.js';

/** ソースを実行し、ヒートマップが表示する行ごとの総実行回数を返す */
function lineCounts(src) {
  const trace      = new JSDebugger(src, { maxSteps: 100_000 }).trace;
  const humanSteps = new TraceBuilder(trace, src).getHumanStepList();
  const owners     = buildLineExecOwners(trace, humanSteps);
  const counts     = {};
  owners.forEach((owner, hi) => {
    if (owner !== hi) return;
    const line = trace[humanSteps[hi]].loc.line;
    counts[line] = (counts[line] ?? 0) + 1;
  });
  return counts;
}

describe('buildLineExecOwners()', () => {
  test('複合代入・インクリメントの文を 1 回と数える（2 倍にならない）', () => {
    const counts = lineCounts(`let n = 6;
let sum = 0;
let count = 1;
while (count <= n) {
  sum += count;
  count++;
}`);
    expect(counts).toEqual({ 1: 1, 2: 1, 3: 1, 4: 7, 5: 6, 6: 6 });
  });

  test('再帰呼び出しを含む return 文と 1 行 if を 1 回と数える', () => {
    const counts = lineCounts(`function f(n) {
  if (n <= 1) return 1;
  return n * f(n - 1);
}
console.log(f(4));`);
    expect(counts[2]).toBe(4);
    expect(counts[3]).toBe(3);
    expect(counts[5]).toBe(1);
  });

  test('Program enter はどの行の実行にも数えない', () => {
    const src        = 'let a = 1;';
    const trace      = new JSDebugger(src).trace;
    const humanSteps = new TraceBuilder(trace, src).getHumanStepList();
    expect(buildLineExecOwners(trace, humanSteps)[0]).toBe(-1);
  });
});
