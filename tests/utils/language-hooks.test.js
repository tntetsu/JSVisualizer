/**
 * language-hooks.test.js — 言語プロファイルの省略できる項目 varType・globalScope（ADR-055 追記：Java）
 *
 * JS のプロファイルは持たないので、ビューの HTML は変わらない（空文字列・既定の見出し）。
 */
import { describe, test, expect, afterEach } from '@jest/globals';
import { setLanguage, getLanguage } from '../../src/lang/index.js';
import { varTypeHtml, globalScopeOptions } from '../../src/utils/value-model.js';
import { mergeScopesForDisplay } from '../../src/utils/format.js';

const JS = getLanguage();
afterEach(() => setLanguage(JS));

describe('varTypeHtml', () => {
  const frame = { name: 'main', varTypes: { x: 'int' } };

  test('JS（varType なし）は空文字列', () => {
    expect(varTypeHtml('x', frame)).toBe('');
  });

  test('varType が型を返すと、変数名の前に置く要素を作る（HTML はエスケープ）', () => {
    setLanguage({ ...JS, varType: (name, f) => f?.varTypes?.[name] ?? null });
    expect(varTypeHtml('x', frame)).toBe('<span class="var-type">int</span> ');
    expect(varTypeHtml('y', frame)).toBe('');
    setLanguage({ ...JS, varType: () => 'List<int>' });
    expect(varTypeHtml('x', frame, [], 'mv-var-type')).toBe('<span class="mv-var-type">List&lt;int&gt;</span> ');
  });
});

describe('globalScopeOptions', () => {
  test('JS は空（見出しは従来どおり、空でも出す）', () => {
    expect(globalScopeOptions()).toEqual({});
  });
  test('プロファイルの globalScope を返す', () => {
    setLanguage({ ...JS, globalScope: { label: 'static', hideEmpty: true } });
    expect(globalScopeOptions()).toEqual({ label: 'static', hideEmpty: true });
  });
});

describe('mergeScopesForDisplay が各スコープのフレームを持つ', () => {
  test('最も内側・外側のフレームと、グローバル（frame は null）', () => {
    const cs = [{ name: 'main' }, { name: 'f' }];
    const d = mergeScopesForDisplay([{ k: 1 }, { g: 0 }], cs, [{ a: 1 }], {});
    expect(d.map(s => [s.label, s.frame?.name ?? null])).toEqual([['f()', 'f'], ['main()', 'main'], ['global', null]]);
    expect(d.every(s => s.callStack === cs)).toBe(true);
  });
});

// ── C のメモリの見せ方（valueModel の省略できる pointer・inFrame・embedded・stale。ADR-056） ──
import { buildHeap } from '../../src/views/memory-view/index.js';
import { buildGraph } from '../../src/views/object-graph/index.js';

/** C のような値の見せ方：{ ptr: 箱, key } をポインタ（1 つの値）、{ box: [...] } を箱とする */
function cLikeProfile() {
  const isBox = (v) => v?.box !== undefined;
  const isPtr = (v) => v?.ptr !== undefined;
  return {
    ...JS,
    valueModel: {
      ...JS.valueModel,
      kind: (v) => (isBox(v) ? 'sequence' : isPtr(v) ? 'string' : JS.valueModel.kind(v)),
      literal: (v) => (isPtr(v) ? `&a[${v.key}]` : JS.valueModel.literal(v)),
      entries: (v) => (isBox(v) ? v.box.map((x, i) => [i, x]) : JS.valueModel.entries(v)),
      length: (v) => (isBox(v) ? v.box.length : JS.valueModel.length(v)),
      label: (v) => (isBox(v) ? `int [${v.box.length}]` : JS.valueModel.label(v)),
      pointer: (v) => (isPtr(v) ? { target: v.ptr, key: v.key } : null),
      inFrame: (v) => isBox(v) && !!v.stack,
      embedded: (v) => isBox(v),
      stale: (v) => !!v?.freed,
    },
  };
}

describe('C のメモリの見せ方（pointer・inFrame・embedded・stale）', () => {
  test('JS のプロファイルは持たない（ビューは従来どおり）', () => {
    expect(JS.valueModel.pointer).toBeUndefined();
    expect(JS.valueModel.inFrame).toBeUndefined();
  });

  test('メモリのビュー：ポインタが指す箱もヒープに載せる（ポインタ自身は箱にしない）', () => {
    setLanguage(cLikeProfile());
    const heapBox = { box: [1, 2] };
    const { heap, refMap } = buildHeap([{ p: { ptr: heapBox, key: 1 }, n: 3 }]);
    expect(heap.map(h => h.label)).toEqual(['int [2]']);
    expect(refMap.get(heapBox)).toBe(0);
  });

  test('メモリのビュー：箱の中のポインタが指す箱も載せる（連結リスト）', () => {
    setLanguage(cLikeProfile());
    const b = { box: [9] };
    const a = { box: [{ ptr: b, key: 0 }] };
    const { heap } = buildHeap([{ p: { ptr: a, key: 0 } }]);
    expect(heap).toHaveLength(2);
    expect(heap[0].entries[0].heapId).toBeNull();   // ポインタはマスの値（箱の子ではない）
  });

  test('オブジェクトのビュー：ポインタを、指す箱への辺にする', () => {
    setLanguage(cLikeProfile());
    const b = { box: [9] };
    const a = { box: [{ ptr: b, key: 0 }] };
    const g = buildGraph({ p: { ptr: a, key: 0 } }, [{ p: { ptr: a, key: 0 } }]);
    expect(g.rootVars).toEqual([expect.objectContaining({ name: 'p', type: 'ref', nodeId: '0' })]);
    expect(g.edges.map(e => [e.from, e.to, e.label])).toEqual([['0', '1', '0']]);
    expect(g.nodes[0].rows[0].displayVal).toBe('&a[0]');
  });
});
