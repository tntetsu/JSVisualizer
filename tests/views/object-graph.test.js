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

// ── 輪のある構造の配置（ADR-053） ─────────────────────────────────────────

import { findBackEdges, layoutGraph } from '../../src/views/object-graph/index.js';

const nodesOf = (...ids) => ids.map(id => ({ id, rows: [] }));
const edge = (from, to, label = 'next') => ({ id: `${from}->${to}:${label}`, from, to, label });

describe('findBackEdges / layoutGraph: 輪のある構造', () => {
  test('輪のない構造（木・連結リスト）には後退辺がない', () => {
    const edges = [edge('a', 'b', 'left'), edge('a', 'c', 'right'), edge('b', 'd')];
    expect(findBackEdges(nodesOf('a', 'b', 'c', 'd'), edges).size).toBe(0);
  });

  test('自己参照は後退辺になる', () => {
    const self = edge('a', 'a');
    expect([...findBackEdges(nodesOf('a'), [self])]).toEqual([self]);
  });

  test('双方向リストは next の向きに 1 列に並び、prev が後退辺になる', () => {
    const nodes = nodesOf('a', 'b', 'c');
    const edges = [edge('a', 'b'), edge('b', 'a', 'prev'), edge('b', 'c'), edge('c', 'b', 'prev')];
    const back = findBackEdges(nodes, edges);
    expect([...back].map(e => e.label)).toEqual(['prev', 'prev']);
    layoutGraph(nodes, edges);
    const [a, b, c] = nodes;
    expect(a.x < b.x && b.x < c.x).toBe(true);
    expect(a.y === b.y && b.y === c.y).toBe(true);
  });

  test('循環リストも 1 列に並ぶ（最後から先頭へ戻る矢印だけが後退辺）', () => {
    const nodes = nodesOf('a', 'b', 'c');
    const edges = [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')];
    expect([...findBackEdges(nodes, edges)].map(e => e.id)).toEqual(['c->a:next']);
    layoutGraph(nodes, edges);
    expect(nodes[0].x < nodes[1].x && nodes[1].x < nodes[2].x).toBe(true);
  });
});
