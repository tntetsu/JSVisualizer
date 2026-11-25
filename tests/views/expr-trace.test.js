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

import { buildExpressionSections } from '../../src/views/expr-trace/index.js';

describe('buildExpressionSections：型を書く宣言（ADR-055 追記）', () => {
  // 1: int total = a + b;   （Java。let・const・var の正規表現には当てはまらない）
  const lines = ['int total = a + b;'];
  const E = (phase, nodeType, col, endCol, matchIdx, value, env = [{ a: 1, b: 2 }]) =>
    ({ phase, nodeType, loc: { line: 1, column: col }, end: endCol ? { line: 1, column: endCol } : null, depth: 0, callDepth: 0, matchIdx, value, env });
  const trace = [
    E('enter', 'VariableDeclaration', 1, null, 7),
    E('enter', 'BinaryExpression', 13, 17, 6),
    E('enter', 'Identifier', 13, 13, 3),
    E('exit', 'Identifier', 13, 13, 2, 1),
    E('enter', 'Identifier', 17, 17, 5),
    E('exit', 'Identifier', 17, 17, 4, 2),
    E('exit', 'BinaryExpression', 13, 17, 1, 3),
    E('exit', 'VariableDeclaration', 1, null, 0, undefined, [{ a: 1, b: 2, total: 3 }]),
  ];

  test('int total = … の宣言も、初期化子の位置から変数名を読んで式評価の行を作る', () => {
    const secs = buildExpressionSections(trace, lines);
    expect(secs).toHaveLength(1);
    const text = JSON.stringify(secs[0]);
    expect(text).toContain('total = ');
  });

  test('JS の let の宣言は、従来どおり正規表現で読む', () => {
    const js = ['let total = a + b;'];
    const t2 = trace.map(e => ({ ...e, loc: { ...e.loc, column: e.loc.column === 1 ? 1 : e.loc.column } }));
    expect(buildExpressionSections(t2, js)).toHaveLength(1);
  });
});
