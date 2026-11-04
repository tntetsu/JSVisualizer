/**
 * expr-trace.test.js — 式評価ビューの変数列（extractVarNames）のテスト
 */
import { describe, test, expect } from '@jest/globals';
import { extractVarNames } from '../../src/views/expr-trace/index.js';

const trace = [{ env: [{ user: null, x: 1, s: 'a', f: { __type__: 'JSFunction' } }] }];
const names = (text) => extractVarNames(text, trace, 0, 0);

describe('extractVarNames', () => {
  test('式に出てくる変数を出てきた順に返す', () => {
    expect(names('x + user')).toEqual(['x', 'user']);
  });

  test('プロパティ名は変数として扱わない', () => {
    expect(names('user !== null && user.age >= 20')).toEqual(['user']);
    expect(names('user?.x')).toEqual(['user']);
  });

  test('文字列の中身は変数として扱わない', () => {
    expect(names('console.log("x", \'s\')')).toEqual([]);
  });

  test('テンプレートリテラルは ${...} の中だけを見る', () => {
    expect(names('`x = ${s}`')).toEqual(['s']);
  });

  test('スコープにない名前（オブジェクトのキーなど）と関数は除く', () => {
    expect(names('{ age: x }')).toEqual(['x']);
    expect(names('f(x)')).toEqual(['x']);
  });
});
