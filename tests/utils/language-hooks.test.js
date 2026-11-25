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
