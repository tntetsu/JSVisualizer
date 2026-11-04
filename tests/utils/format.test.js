/**
 * format.test.js — formatValue / formatValueDiff の TDZ センチネル表示のユニットテスト
 *
 * JSInterpreter の `Environment` は let/const 宣言前のアクセス検出用に
 * `Symbol('TDZ')` を値として保持する。以前は formatValue/formatValueDiff が
 * この Symbol を素通しして「Symbol(TDZ)」という内部実装詳細をそのまま表示していた
 * （Variable・ExecTrace タブで確認された不具合）。宣言前は空欄（lt-empty）として
 * 表示すべき。
 */

import { JSDebugger } from '../../../JSInterpreter/src/interpreter/debugger.js';
import { formatValue, formatValueDiff, mergeScopesForDisplay } from '../../src/utils/format.js';

const TDZ_LIKE = Symbol('TDZ');

describe('TDZセンチネルの表示', () => {
  test('formatValue: TDZ値は空欄プレースホルダーを返す（"Symbol(TDZ)"を表示しない）', () => {
    const html = formatValue(TDZ_LIKE);
    expect(html).toContain('lt-empty');
    expect(html).not.toContain('Symbol(TDZ)');
  });

  test('formatValueDiff: 現在値がTDZなら空欄プレースホルダーを返す', () => {
    const html = formatValueDiff(TDZ_LIKE, undefined);
    expect(html).toContain('lt-empty');
    expect(html).not.toContain('Symbol(TDZ)');
  });

  test('formatValueDiff: TDZから実値へ変化した場合は通常通り値を表示する', () => {
    const html = formatValueDiff(5, TDZ_LIKE);
    expect(html).toContain('5');
    expect(html).not.toContain('Symbol(TDZ)');
  });

  test('descriptionが異なるSymbolはTDZ扱いしない', () => {
    const other = Symbol('other');
    const html = formatValue(other);
    expect(html).not.toContain('lt-empty');
  });

  test('通常の値の表示は影響を受けない（回帰確認）', () => {
    expect(formatValue(42)).toContain('42');
    expect(formatValue(undefined)).toContain('undefined');
    expect(formatValue(null)).toContain('null');
  });
});

// 関数の実行中も、呼び出し元の let/const やブロックの変数が消えない（ADR-049）
describe('mergeScopesForDisplay: 呼び出し元の変数', () => {
  function frames(code, name) {
    const dbg = new JSDebugger(code);
    const ev = dbg.trace.find(e => e.phase === 'enter' && e.nodeType === 'ReturnStatement'
      && e.callStack.at(-1)?.name === name);
    return mergeScopesForDisplay(ev.env, ev.callStack, ev.frameEnvs, ev.globalBlockVars);
  }

  test('呼び出し元のフレームに関数本体の let とブロックの変数が出る', () => {
    const [inner, outer] = frames(`
      function inner(x) { return x; }
      function outer(a) {
        let total = a + 1;
        for (let i = 0; i < 1; i++) { inner(total); }
      }
      outer(3);`, 'inner');
    expect(inner.label).toBe('inner(4)');
    expect(outer.vars).toMatchObject({ a: 3, total: 4, i: 0 });
  });

  test('グローバルの for から呼ぶと、Global のフレームにブロックの変数が出る', () => {
    const scopes = frames(`
      function f(v) { return v; }
      let s = 1;
      for (let i = 5; i < 6; i++) { let t = 2; f(i); }`, 'f');
    const global = scopes.find(x => x.label === 'global');
    expect(global.vars).toMatchObject({ s: 1, i: 5, t: 2 });
  });
});

