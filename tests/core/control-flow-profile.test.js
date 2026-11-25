/**
 * control-flow-profile.test.js — 言語プロファイルの controlFlow（ADR-055 追記：Java のクラスのメソッドと switch）
 *
 * プロファイルが controlFlow を持たない JS では、従来どおりクラスのメソッドを描かず、switch を 1 つの文として描く。
 */
import { describe, test, expect, afterEach } from '@jest/globals';
import { TraceBuilder } from '../../src/core/trace-builder.js';
import { setLanguage, getLanguage } from '../../src/lang/index.js';

const JS = getLanguage();
afterEach(() => setLanguage(JS));
const withControlFlow = (controlFlow) => setLanguage({ ...JS, controlFlow });

const L = (line) => ({ line, column: 1 });
// public class Main {                      // 1
//   static int f(int k) {                  // 2
//     switch (k) {                         // 3
//       case 1: return 10;                 // 4
//       default: return 0;                 // 5
//     }                                    // 6
//   }                                      // 7
// }                                        // 8
const source = 'public class Main {\n  static int f(int k) {\n    switch (k) {\n      case 1: return 10;\n      default: return 0;\n    }\n  }\n}\n';
const sw = {
  type: 'SwitchStatement', loc: L(3), discriminant: { type: 'Identifier', name: 'k', loc: L(3) },
  cases: [
    { type: 'SwitchCase', loc: L(4), tests: [{ type: 'Literal', value: 1 }], consequent: [{ type: 'ReturnStatement', loc: L(4) }] },
    { type: 'SwitchCase', loc: L(5), default: true, tests: [], consequent: [{ type: 'ReturnStatement', loc: L(5) }] },
  ],
};
const ast = {
  type: 'Program', loc: L(1), body: [{
    type: 'ClassDeclaration', loc: L(1), id: { type: 'Identifier', name: 'Main' },
    body: { type: 'ClassBody', body: [{
      type: 'MethodDefinition', kind: 'method', loc: L(2), key: { type: 'Identifier', name: 'f' },
      value: { type: 'FunctionExpression', params: [{ type: 'Identifier', name: 'k' }], body: { type: 'BlockStatement', loc: L(2), body: [sw] } },
    }] },
  }],
};
const trace = [
  { phase: 'enter', nodeType: 'SwitchStatement', loc: L(3), depth: 0, callDepth: 1 },
  { phase: 'enter', nodeType: 'CaseMatch', loc: L(4), depth: 1, callDepth: 1 },
];
const cfg = () => new TraceBuilder(trace, source, ast).buildCFG();

describe('controlFlow.classMethods・switchCases', () => {
  test('プロファイルが持たない（JS）：クラスのメソッドは描かない（従来どおり）', () => {
    const scopes = cfg();
    expect(scopes.map(s => s.name)).toEqual(['global']);
  });

  test('classMethods：クラスの中のメソッドをスコープとして描き、空のグローバルは出さない', () => {
    withControlFlow({ classMethods: true });
    const scopes = cfg();
    expect(scopes.map(s => [s.name, s.params])).toEqual([['f', ['k']]]);
    // switchCases なし：switch は 1 つの文
    expect(scopes[0].items[0]).toMatchObject({ type: 'stmt', lineStart: 3 });
  });

  test('switchCases：見出しの行のあとに、case を if … else の連なり（default は最後の else）として描く', () => {
    withControlFlow({ classMethods: true, switchCases: true });
    const item = cfg()[0].items[0];
    expect(item.type).toBe('seq');
    const [head, chain] = item.children;
    expect(head).toMatchObject({ type: 'stmt', lineStart: 3, label: 'switch (k) {' });
    expect(chain).toMatchObject({ type: 'if', condLine: 4, condLabel: 'case 1: return 10;', execCount: 1 });
    expect(chain.then_.map(x => x.lineStart)).toEqual([4]);
    expect(chain.else_.map(x => x.lineStart)).toEqual([5]);
  });
});
