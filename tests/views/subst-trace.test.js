/**
 * subst-trace.test.js — 置換ビューの行リスト構築（buildSubstitutionLines）のテスト
 *
 * 別の関数の引数になった呼び出しは、引数の値が決まるまで展開しない（ADR-051）。
 */
import { describe, test, expect } from '@jest/globals';
import { JSDebugger } from '../../../JSInterpreter/src/interpreter/debugger.js';
import { buildSubstitutionLines } from '../../src/views/subst-trace/index.js';

function texts(source) {
  let trace;
  try {
    trace = new JSDebugger(source, { maxSteps: 100_000 }).trace;
  } catch (err) {
    trace = err.partialTrace;
  }
  return buildSubstitutionLines(trace, source.split('\n')).map(l => l.text);
}

describe('buildSubstitutionLines', () => {
  test('再帰は式を展開していき、最後に値になる', () => {
    const src = [
      'function power(x, n) {',
      '  if (n === 0) {',
      '    return 1;',
      '  }',
      '  return x * power(x, n - 1);',
      '}',
      'console.log(power(2, 2));',
    ].join('\n');
    expect(texts(src)).toEqual([
      'power(2, 2)',
      '2 * power(2, 1)',
      '2 * 2 * power(2, 0)',
      '2 * 2 * 1',
      '→ 4',
    ]);
  });

  test('引数になった再帰呼び出しの外側の呼び出しを残し、引数の値が決まってから展開する', () => {
    const src = [
      'function twice(y) {',
      '  return y * 2;',
      '}',
      'function f(n) {',
      '  if (n === 0) {',
      '    return 1;',
      '  }',
      '  return twice(f(n - 1));',
      '}',
      'console.log(f(2));',
    ].join('\n');
    expect(texts(src)).toEqual([
      'f(2)',
      'twice(f(1))',
      'twice(twice(f(0)))',
      'twice(twice(1))',
      'twice(1 * 2)',
      'twice(2)',
      '2 * 2',
      '→ 4',
    ]);
  });

  test('トップレベルで引数になった呼び出しも外側を残す', () => {
    const src = [
      'function inc(n) {',
      '  return n + 1;',
      '}',
      'function twice(y) {',
      '  return y * 2;',
      '}',
      'console.log(twice(inc(1)));',
    ].join('\n');
    expect(texts(src)).toEqual([
      'twice(inc(1))',
      'twice(1 + 1)',
      'twice(2)',
      '2 * 2',
      '→ 4',
    ]);
  });

  test('同じ見た目の呼び出しが 2 つあっても、実行順に置き換える', () => {
    const src = [
      'function one(n) {',
      '  return n;',
      '}',
      'function f() {',
      '  return one(1) + one(1);',
      '}',
      'console.log(f());',
    ].join('\n');
    expect(texts(src)).toEqual(['f()', 'one(1) + one(1)', '1 + one(1)', '1 + 1', '→ 2']);
  });

  test('置き換えで計算の順番が変わるときは括弧を付ける', () => {
    const src = [
      'function inc(n) {',
      '  return n + 1;',
      '}',
      'function f(n) {',
      '  return n * inc(n);',
      '}',
      'console.log(f(3));',
    ].join('\n');
    expect(texts(src)).toEqual(['f(3)', '3 * inc(3)', '3 * (3 + 1)', '→ 12']);
  });

  test('終了条件のない再帰は、止まるまで値で展開する', () => {
    const src = [
      'function power(x, n) {',
      '  return x * power(x, n - 1);',
      '}',
      'console.log(power(2, 5));',
    ].join('\n');
    const lines = texts(src);
    expect(lines.slice(0, 3)).toEqual(['power(2, 5)', '2 * power(2, 4)', '2 * 2 * power(2, 3)']);
    expect(lines.length).toBeGreaterThan(10);
    // 止まる位置はホストの JS エンジンによるので、最後の行の末尾の形は決めない
    expect(lines[lines.length - 1]).toMatch(/^2 \* 2 \* 2 \* 2 \* 2 \* .*power\(/);
  });
});
