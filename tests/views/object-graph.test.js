/**
 * object-graph.test.js — オブジェクトビューのグラフ構築（buildGraph）のテスト
 *
 * 関数の実行中も、呼び出し元のフレームが持つオブジェクト・配列を「変数名 (フレーム名)」で描く（ADR-050）。
 */

import { JSDebugger } from '../../../JSInterpreter/src/interpreter/debugger.js';
import { flattenEnv } from '../../src/utils/format.js';
import { buildGraph, fmtVal } from '../../src/views/object-graph/index.js';

/** 名前が name の関数の実行中で、最初の return の時点のグラフを作る */
function graphIn(code, name) {
  const dbg = new JSDebugger(code);
  const ev = dbg.trace.find(e => e.phase === 'enter' && e.nodeType === 'ReturnStatement'
    && e.callStack.at(-1)?.name === name);
  const variables = Object.fromEntries(flattenEnv(ev.env));
  return buildGraph(variables, ev.env, ev);
}

const refNames = (g) => g.rootVars.filter(r => r.type === 'ref').map(r => r.name);

describe('buildGraph: 呼び出し元のオブジェクト', () => {
  test('呼び出し元だけが持つ配列がフレーム名付きで出る', () => {
    const g = graphIn(`
      function f(v) { return v; }
      function main() { let a = [1]; f(0); }
      main();`, 'f');
    expect(refNames(g)).toEqual(['a (main)']);
    expect(g.nodes).toHaveLength(1);
  });

  test('同じ配列を共有する変数は 1 つのノードを指す', () => {
    const g = graphIn(`
      function f(list) { return list; }
      function main() { let a = [1]; let b = [2]; f(a); }
      main();`, 'f');
    const byName = Object.fromEntries(g.rootVars.map(r => [r.name, r.nodeId]));
    expect(byName['a (main)']).toBe(byName.list);
    expect(byName['b (main)']).not.toBe(byName.list);
    expect(g.nodes).toHaveLength(2);
  });

  test('再帰では同じ名前の変数がフレームごとに別のノードになる', () => {
    const g = graphIn(`
      function r(n) { let box = [n]; if (n === 0) { return box; } r(n - 1); }
      r(1);`, 'r');
    expect(refNames(g).sort()).toEqual(['box', 'box (r)']);
    expect(g.nodes).toHaveLength(2);
  });

  test('クロージャで見えている変数は重ねて足さない', () => {
    const g = graphIn(`
      function main() {
        let a = [1];
        function inner() { return a; }
        inner();
      }
      main();`, 'inner');
    expect(refNames(g)).toEqual(['a']);
  });

  test('呼び出し元のプリミティブは足さない', () => {
    const g = graphIn(`
      function f(v) { return v; }
      function main() { let s = 1; f(0); }
      main();`, 'f');
    expect(g.rootVars.some(r => r.name.startsWith('s'))).toBe(false);
  });

  test('グローバルのブロックのオブジェクトは (global) で出る', () => {
    const g = graphIn(`
      function f(v) { return v; }
      for (let i = 0; i < 1; i++) { let t = [i]; f(0); }`, 'f');
    expect(refNames(g)).toEqual(['t (global)']);
  });
});

describe('fmtVal', () => {
  test('宣言前の変数は「—」と表示する', () => {
    expect(fmtVal(Symbol('TDZ'))).toBe('—');
  });

  test('関数とクラスは名前で表示する', () => {
    expect(fmtVal({ __type__: 'JSFunction', name: 'f' })).toBe('ƒ f');
    expect(fmtVal({ __type__: 'JSClass', name: 'P' })).toBe('class P');
  });
});
