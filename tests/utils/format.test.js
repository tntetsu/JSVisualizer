/**
 * format.test.js — formatValue / formatValueDiff の TDZ センチネル表示のユニットテスト
 *
 * JSInterpreter の `Environment` は let/const 宣言前のアクセス検出用に
 * `Symbol('TDZ')` を値として保持する。以前は formatValue/formatValueDiff が
 * この Symbol を素通しして「Symbol(TDZ)」という内部実装詳細をそのまま表示していた
 * （Variable・ExecTrace タブで確認された不具合）。宣言前は空欄（lt-empty）として
 * 表示すべき。
 */

import { formatValue, formatValueDiff } from '../../src/utils/format.js';

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
