/**
 * exec-trace.test.js — 実行トレースの「配列」列（renderRowDiagram）のテスト
 *
 * 利用者に見える例（ADR に書いたプログラムと、表示される／されない）をそのままテストにする。
 */

import { JSDebugger } from '../../../JSInterpreter/src/interpreter/debugger.js';
import { TraceBuilder } from '../../src/core/trace-builder.js';
import { flattenEnv } from '../../src/utils/format.js';
import { computeSubscriptVars } from '../../src/utils/array-grid.js';
import { buildExecRows } from '../../src/utils/line-exec.js';
import { renderRowDiagram } from '../../src/views/exec-trace/index.js';

/**
 * ExecTrace と同じ手順で、ソースの各行（文の実行）の「配列」列の HTML を作る。
 * @returns {{ code: string, html: string }[]} 実行順の行
 */
function diagramRows(src) {
  const trace      = new JSDebugger(src).trace;
  const humanSteps = new TraceBuilder(trace, src).getHumanStepList();
  const { rows }   = buildExecRows(trace, humanSteps);
  const lines      = src.split('\n');

  const arrayVarNames = new Set();
  for (const si of humanSteps) {
    for (const [k, v] of flattenEnv(trace[si].env)) if (Array.isArray(v)) arrayVarNames.add(k);
  }
  const subscriptVars = computeSubscriptVars(src);

  return rows.map(row => {
    const line = trace[humanSteps[row[0]]].loc.line;
    const ev   = trace[humanSteps[row.at(-1)]];
    const html = renderRowDiagram({ envMap: flattenEnv(ev.env), arrayVarNames, subscriptVars, cellPx: 20 });
    return { code: lines[line - 1].trim(), html };
  });
}

const rowOf = (rows, code) => rows.find(r => r.code === code);
const ptrLabels = (html) =>
  [...html.matchAll(/cb-cell cb-cell--ptr"[^>]*>([^<]*)</g)].map(m => m[1]).filter(s => s !== '');

describe('実行トレースの「配列」列', () => {
  test('添字がリテラルだけのプログラムでも、配列を描く（ADR-048）', () => {
    // ADR-048 のプログラム。直す前は、ポインタが見つからず「配列」列がすべての行で空だった
    const rows = diagramRows(`const table = [];
table[0] = 54;
table[1] = 12;
table[3] = 25;
table[4] = 36;
table[10] = 43;`);
    for (const code of ['table[0] = 54;', 'table[3] = 25;', 'table[10] = 43;']) {
      const { html } = rowOf(rows, code);
      expect(html).toContain('cb-array-block');
      expect(ptrLabels(html)).toEqual([]);
    }
    expect(rowOf(rows, 'table[3] = 25;').html).toContain('>25<');
  });

  test('添字に変数を使う前の行にも、配列を描く（ADR-048）', () => {
    // 直す前は、`i` が添字として検出される行から後だけ表示されていた
    const rows = diagramRows(`const table = [];
table[0] = 54;
let i = 1;
table[i] = 12;`);
    expect(rowOf(rows, 'table[0] = 54;').html).toContain('cb-array-block');
    expect(ptrLabels(rowOf(rows, 'table[i] = 12;').html)).toEqual(['i']);
  });
});
