/**
 * trace-builder.test.js — TraceBuilder のユニットテスト
 */

import { TraceBuilder } from '../../src/core/trace-builder.js';

// ── テスト用の最小 TraceEvent 生成ヘルパー ──────────────────────────────────

function ev(phase, nodeType, line = 1, extras = {}) {
  return { phase, nodeType, loc: { line, column: 0 }, depth: 0, callDepth: 0, ...extras };
}

// ── buildHeatmap ──────────────────────────────────────────────────────────

describe('TraceBuilder.buildHeatmap()', () => {
  test('行ごとの実行回数を正しく集計する', () => {
    const trace = [
      ev('enter', 'ExpressionStatement', 1),
      ev('exit',  'ExpressionStatement', 1),
      ev('enter', 'ExpressionStatement', 2),
      ev('enter', 'ExpressionStatement', 2),
      ev('enter', 'AssignmentExpression', 3),
    ];
    const builder = new TraceBuilder(trace);
    const map = builder.buildHeatmap();

    expect(map.get(1)).toBe(1);
    expect(map.get(2)).toBe(2);
    expect(map.get(3)).toBe(1);
    expect(map.get(4)).toBeUndefined();
  });

  test('exit フェーズはカウントしない', () => {
    const trace = [
      ev('enter', 'IfStatement', 5),
      ev('exit',  'IfStatement', 5),
      ev('exit',  'IfStatement', 5),
    ];
    const builder = new TraceBuilder(trace);
    expect(builder.buildHeatmap().get(5)).toBe(1);
  });

  test('空の trace では空の Map を返す', () => {
    const builder = new TraceBuilder([]);
    expect(builder.buildHeatmap().size).toBe(0);
  });

  test('キャッシュを返す（同一オブジェクト）', () => {
    const builder = new TraceBuilder([ev('enter', 'Program', 1)]);
    expect(builder.buildHeatmap()).toBe(builder.buildHeatmap());
  });
});

// ── buildHumanIndices ─────────────────────────────────────────────────────

describe('TraceBuilder.buildHumanIndices()', () => {
  test('ExpressionStatement の enter を含む', () => {
    const trace = [ev('enter', 'ExpressionStatement', 1)];
    const set = new TraceBuilder(trace).buildHumanIndices();
    expect(set.has(0)).toBe(true);
  });

  test('AssignmentExpression の exit を含む', () => {
    const trace = [
      ev('enter', 'AssignmentExpression', 1),
      ev('exit',  'AssignmentExpression', 1),
    ];
    const set = new TraceBuilder(trace).buildHumanIndices();
    expect(set.has(1)).toBe(true);
  });

  test('VariableDeclaration の exit を含む（値が確定する exit を使う）', () => {
    const trace = [
      ev('enter', 'VariableDeclaration', 1),
      ev('exit',  'VariableDeclaration', 1),
    ];
    const set = new TraceBuilder(trace).buildHumanIndices();
    // exit (index 1) が humanStep
    expect(set.has(1)).toBe(true);
  });

  test('VariableDeclaration の enter は humanStep でない（index 0 ルール除外）', () => {
    // index 0 の場合は set.add(0) ルールで必ず含まれるため、index 1 以降に配置
    const trace = [
      ev('enter', 'ExpressionStatement', 1),       // idx 0: enter ES → human
      ev('enter', 'VariableDeclaration', 2),        // idx 1: enter VarDecl → NOT human
      ev('exit',  'VariableDeclaration', 2),        // idx 2: exit  VarDecl → human
    ];
    const set = new TraceBuilder(trace).buildHumanIndices();
    expect(set.has(1)).toBe(false);  // enter は含まない
    expect(set.has(2)).toBe(true);   // exit は含む
  });

  test('ReturnStatement の exit を含む', () => {
    const trace = [
      ev('enter', 'ReturnStatement', 3),
      ev('exit',  'ReturnStatement', 3),
    ];
    const set = new TraceBuilder(trace).buildHumanIndices();
    // exit (index 1) が humanStep
    expect(set.has(1)).toBe(true);
  });

  test('ThrowStatement の exit を含む', () => {
    const trace = [
      ev('enter', 'ExpressionStatement', 1),       // idx 0
      ev('enter', 'ThrowStatement', 2),             // idx 1: enter → NOT human
      ev('exit',  'ThrowStatement', 2),             // idx 2: exit  → human
    ];
    const set = new TraceBuilder(trace).buildHumanIndices();
    expect(set.has(1)).toBe(false);  // enter は含まない
    expect(set.has(2)).toBe(true);   // exit は含む
  });

  test('CallExpression の exit を含む', () => {
    const trace = [
      ev('enter', 'ExpressionStatement', 1),
      ev('enter', 'CallExpression', 1),
      ev('exit',  'CallExpression', 1),
    ];
    const set = new TraceBuilder(trace).buildHumanIndices();
    expect(set.has(2)).toBe(true);
  });

  test('Identifier の enter は含まない', () => {
    const trace = [
      ev('enter', 'Identifier', 1),
      ev('exit',  'Identifier', 1),
    ];
    const set = new TraceBuilder(trace).buildHumanIndices();
    // index 0 は常に含まれる（初期表示用）
    expect(set.has(0)).toBe(true);
    // Identifier の exit (index 1) は含まない
    expect(set.has(1)).toBe(false);
  });

  test('空の trace ではインデックスなし（または 0 のみ）', () => {
    const set = new TraceBuilder([]).buildHumanIndices();
    expect(set.size).toBe(0);
  });

  test('キャッシュを返す（同一オブジェクト）', () => {
    const builder = new TraceBuilder([ev('exit', 'VariableDeclaration', 1)]);
    expect(builder.buildHumanIndices()).toBe(builder.buildHumanIndices());
  });
});

// ── getHumanStepList ──────────────────────────────────────────────────────

describe('TraceBuilder.getHumanStepList()', () => {
  test('ソート済み配列を返す', () => {
    const trace = [
      ev('enter', 'IfStatement',         1),   // idx 0 → human
      ev('enter', 'Identifier',          2),   // idx 1 → not human
      ev('enter', 'ExpressionStatement', 3),   // idx 2 → human
    ];
    const list = new TraceBuilder(trace).getHumanStepList();
    expect(list).toEqual([...list].sort((a, b) => a - b));
    expect(list.includes(0)).toBe(true);
    expect(list.includes(2)).toBe(true);
    expect(list.includes(1)).toBe(false);
  });
});

// ── buildRecursionTree ────────────────────────────────────────────────────

describe('TraceBuilder.buildRecursionTree()', () => {
  /**
   * fib(3) → fib(2) → fib(1), fib(0)
   *        → fib(1)
   * のような再帰呼び出しトレースを作る
   */
  function makeRecursiveTrace() {
    return [
      ev('enter', 'ExpressionStatement', 1, { callDepth: 0 }),
      // fib(3) 進入
      ev('enter', 'CallExpression', 2, {
        callDepth: 1,
        callStack: [{ name: 'fib', args: [3], loc: { line: 2, column: 0 } }],
      }),
      // fib(2) 進入
      ev('enter', 'CallExpression', 3, {
        callDepth: 2,
        callStack: [
          { name: 'fib', args: [3], loc: { line: 2, column: 0 } },
          { name: 'fib', args: [2], loc: { line: 3, column: 0 } },
        ],
      }),
      // fib(1) 進入
      ev('enter', 'CallExpression', 3, {
        callDepth: 3,
        callStack: [
          { name: 'fib', args: [3], loc: { line: 2, column: 0 } },
          { name: 'fib', args: [2], loc: { line: 3, column: 0 } },
          { name: 'fib', args: [1], loc: { line: 3, column: 0 } },
        ],
      }),
      // fib(1) 復帰
      ev('exit', 'CallExpression', 3, { callDepth: 2, value: 1 }),
      // fib(0) 進入
      ev('enter', 'CallExpression', 3, {
        callDepth: 3,
        callStack: [
          { name: 'fib', args: [3], loc: { line: 2, column: 0 } },
          { name: 'fib', args: [2], loc: { line: 3, column: 0 } },
          { name: 'fib', args: [0], loc: { line: 3, column: 0 } },
        ],
      }),
      // fib(0) 復帰
      ev('exit', 'CallExpression', 3, { callDepth: 2, value: 0 }),
      // fib(2) 復帰
      ev('exit', 'CallExpression', 3, { callDepth: 1, value: 1 }),
      // fib(1) 進入 (fib(3) の 2 番目の再帰呼び出し)
      ev('enter', 'CallExpression', 3, {
        callDepth: 2,
        callStack: [
          { name: 'fib', args: [3], loc: { line: 2, column: 0 } },
          { name: 'fib', args: [1], loc: { line: 3, column: 0 } },
        ],
      }),
      // fib(1) 復帰
      ev('exit', 'CallExpression', 3, { callDepth: 1, value: 1 }),
      // fib(3) 復帰
      ev('exit', 'CallExpression', 2, { callDepth: 0, value: 2 }),
    ];
  }

  test('関数呼び出しのないトレースでは空配列を返す', () => {
    const trace = [
      ev('enter', 'ExpressionStatement', 1, { callDepth: 0 }),
      ev('exit',  'ExpressionStatement', 1, { callDepth: 0 }),
    ];
    expect(new TraceBuilder(trace).buildRecursionTree()).toEqual([]);
  });

  test('非再帰的な呼び出しのみの場合は空配列を返す（outer→inner）', () => {
    const trace = [
      ev('enter', 'ExpressionStatement', 1, { callDepth: 0 }),
      ev('enter', 'CallExpression', 2, {
        callDepth: 1,
        callStack: [{ name: 'outer', args: [], loc: { line: 2, column: 0 } }],
      }),
      ev('enter', 'CallExpression', 3, {
        callDepth: 2,
        callStack: [
          { name: 'outer', args: [], loc: { line: 2, column: 0 } },
          { name: 'inner', args: [], loc: { line: 3, column: 0 } },
        ],
      }),
      ev('exit', 'CallExpression', 3, { callDepth: 1, value: 42 }),
      ev('exit', 'CallExpression', 2, { callDepth: 0, value: 42 }),
    ];
    expect(new TraceBuilder(trace).buildRecursionTree()).toEqual([]);
  });

  test('再帰呼び出しツリーのルートを返す', () => {
    const roots = new TraceBuilder(makeRecursiveTrace()).buildRecursionTree();
    expect(roots).toHaveLength(1);
    expect(roots[0].funcName).toBe('fib');
    // 子は全て同名
    for (const c of roots[0].children) {
      expect(c.funcName).toBe('fib');
    }
  });

  test('非再帰的な子は除外される（fib が print も呼ぶ場合）', () => {
    const trace = [
      ev('enter', 'ExpressionStatement', 1, { callDepth: 0 }),
      // fib(2) 進入
      ev('enter', 'CallExpression', 2, {
        callDepth: 1,
        callStack: [{ name: 'fib', args: [2], loc: { line: 2, column: 0 } }],
      }),
      // print(2) 進入（非再帰）
      ev('enter', 'CallExpression', 3, {
        callDepth: 2,
        callStack: [
          { name: 'fib',   args: [2], loc: { line: 2, column: 0 } },
          { name: 'print', args: [2], loc: { line: 3, column: 0 } },
        ],
      }),
      ev('exit', 'CallExpression', 3, { callDepth: 1, value: undefined }),
      // fib(1) 進入（再帰）
      ev('enter', 'CallExpression', 3, {
        callDepth: 2,
        callStack: [
          { name: 'fib', args: [2], loc: { line: 2, column: 0 } },
          { name: 'fib', args: [1], loc: { line: 3, column: 0 } },
        ],
      }),
      ev('exit', 'CallExpression', 3, { callDepth: 1, value: 1 }),
      // fib(2) 復帰
      ev('exit', 'CallExpression', 2, { callDepth: 0, value: 1 }),
    ];
    const roots = new TraceBuilder(trace).buildRecursionTree();
    expect(roots).toHaveLength(1);
    expect(roots[0].funcName).toBe('fib');
    // print は除外、fib(1) のみ子に残る
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].funcName).toBe('fib');
  });

  test('cost プロパティが設定される（葉=1）', () => {
    const roots = new TraceBuilder(makeRecursiveTrace()).buildRecursionTree();
    function findLeaves(node, acc = []) {
      if (node.children.length === 0) acc.push(node);
      node.children.forEach(c => findLeaves(c, acc));
      return acc;
    }
    const leaves = findLeaves(roots[0]);
    expect(leaves.length).toBeGreaterThan(0);
    leaves.forEach(leaf => expect(leaf.cost).toBe(1));
  });

  test('cost プロパティが設定される（fib(3) のツリーサイズ=5）', () => {
    // fib(3): children=[fib(2),fib(1)]
    // fib(2): children=[fib(1),fib(0)] → cost=1+1+1=3
    // fib(1): cost=1
    // fib(3): cost=1+3+1=5
    const roots = new TraceBuilder(makeRecursiveTrace()).buildRecursionTree();
    expect(roots[0].cost).toBe(5);
    const fib2 = roots[0].children[0];
    expect(fib2.cost).toBe(3);
  });

  test('キャッシュを返す（同一オブジェクト）', () => {
    const builder = new TraceBuilder(makeRecursiveTrace());
    expect(builder.buildRecursionTree()).toBe(builder.buildRecursionTree());
  });
});

// ── buildCallTree ─────────────────────────────────────────────────────────

describe('TraceBuilder.buildCallTree()', () => {
  function makeCallTrace(calls) {
    const steps = [ev('enter', 'ExpressionStatement', 1, { callDepth: 0 })];
    for (const call of calls) {
      steps.push(ev('enter', 'CallExpression', 2, {
        callDepth: 1,
        callStack: [{ name: call.name, args: call.args ?? [], loc: { line: 2, column: 0 } }],
      }));
      steps.push(ev('enter', 'ReturnStatement', 3, { callDepth: 1 }));
      steps.push(ev('exit', 'CallExpression', 2, { callDepth: 0, value: call.retVal }));
    }
    return steps;
  }

  test('関数呼び出しのないトレースでは空配列を返す', () => {
    const trace = [
      ev('enter', 'ExpressionStatement', 1, { callDepth: 0 }),
      ev('exit',  'ExpressionStatement', 1, { callDepth: 0 }),
    ];
    expect(new TraceBuilder(trace).buildCallTree()).toEqual([]);
  });

  test('1 回の関数呼び出しで 1 ルートノードを返す', () => {
    const trace = makeCallTrace([{ name: 'foo', args: [1], retVal: 42 }]);
    const roots = new TraceBuilder(trace).buildCallTree();
    expect(roots).toHaveLength(1);
    expect(roots[0].funcName).toBe('foo');
    expect(roots[0].args).toEqual([1]);
    expect(roots[0].returnVal).toBe(42);
    expect(roots[0].children).toHaveLength(0);
  });

  test('2 回の連続呼び出しで 2 ルートノードを返す', () => {
    const trace = makeCallTrace([
      { name: 'f', args: [1], retVal: 10 },
      { name: 'g', args: [2], retVal: 20 },
    ]);
    const roots = new TraceBuilder(trace).buildCallTree();
    expect(roots).toHaveLength(2);
    expect(roots[0].funcName).toBe('f');
    expect(roots[1].funcName).toBe('g');
  });

  test('ネストした呼び出しでは子ノードに追加される', () => {
    const trace = [
      ev('enter', 'ExpressionStatement', 1, { callDepth: 0 }),
      ev('enter', 'CallExpression', 2, {
        callDepth: 1,
        callStack: [{ name: 'outer', args: [], loc: { line: 2, column: 0 } }],
      }),
      ev('enter', 'CallExpression', 3, {
        callDepth: 2,
        callStack: [
          { name: 'outer', args: [], loc: { line: 2, column: 0 } },
          { name: 'inner', args: [], loc: { line: 3, column: 0 } },
        ],
      }),
      ev('exit', 'CallExpression', 3, { callDepth: 1, value: 'inner-ret' }),
      ev('exit', 'CallExpression', 2, { callDepth: 0, value: 'outer-ret' }),
    ];
    const roots = new TraceBuilder(trace).buildCallTree();
    expect(roots).toHaveLength(1);
    expect(roots[0].funcName).toBe('outer');
    expect(roots[0].children).toHaveLength(1);
    expect(roots[0].children[0].funcName).toBe('inner');
    expect(roots[0].children[0].returnVal).toBe('inner-ret');
  });

  test('キャッシュを返す（同一オブジェクト）', () => {
    const trace = makeCallTrace([{ name: 'f', args: [], retVal: 1 }]);
    const builder = new TraceBuilder(trace);
    expect(builder.buildCallTree()).toBe(builder.buildCallTree());
  });

  test('cost プロパティが設定される（葉=1、親=1+子の合計、同名でなくてもカウントする）', () => {
    const trace = [
      ev('enter', 'ExpressionStatement', 1, { callDepth: 0 }),
      ev('enter', 'CallExpression', 2, {
        callDepth: 1,
        callStack: [{ name: 'outer', args: [], loc: { line: 2, column: 0 } }],
      }),
      ev('enter', 'CallExpression', 3, {
        callDepth: 2,
        callStack: [
          { name: 'outer', args: [], loc: { line: 2, column: 0 } },
          { name: 'inner', args: [], loc: { line: 3, column: 0 } },
        ],
      }),
      ev('exit', 'CallExpression', 3, { callDepth: 1, value: 'inner-ret' }),
      ev('exit', 'CallExpression', 2, { callDepth: 0, value: 'outer-ret' }),
    ];
    const roots = new TraceBuilder(trace).buildCallTree();
    expect(roots[0].funcName).toBe('outer');
    expect(roots[0].children[0].funcName).toBe('inner');
    // outer と inner は同名ではないが、buildCallTree は全呼び出しを対象にするため両方カウントする
    expect(roots[0].children[0].cost).toBe(1);
    expect(roots[0].cost).toBe(2);
  });
});

// ── buildLifetime ─────────────────────────────────────────────────────────

describe('TraceBuilder.buildLifetime()', () => {
  /** humanStep となるトレースイベントを作る */
  function humanEv(line, envChain, callDepth = 0) {
    return ev('enter', 'ExpressionStatement', line, {
      callDepth,
      env: envChain,
    });
  }

  test('変数が登場した humanStep から endHi まで区間を持つ', () => {
    const trace = [
      humanEv(1, [{ x: 1 }], 0),   // hi=0: x=1
      humanEv(2, [{ x: 2 }], 0),   // hi=1: x=2
      humanEv(3, [{ x: 2 }], 0),   // hi=2: x=2 (変化なし)
    ];
    const builder = new TraceBuilder(trace);
    const entries = builder.buildLifetime();
    const xEntry = entries.find(e => e.varName === 'x');
    expect(xEntry).toBeDefined();
    expect(xEntry.startHi).toBe(0);
    expect(xEntry.endHi).toBe(2);
    expect(xEntry.callDepth).toBe(0);
  });

  test('空の trace では空配列を返す', () => {
    const builder = new TraceBuilder([]);
    expect(builder.buildLifetime()).toEqual([]);
  });

  test('組み込み変数（BUILTIN_NAMES）は含まない', () => {
    const trace = [
      humanEv(1, [{ console: {}, x: 1 }], 0),
    ];
    const entries = new TraceBuilder(trace).buildLifetime();
    expect(entries.every(e => e.varName !== 'console')).toBe(true);
  });

  test('異なる callDepth の同名変数は別エントリになる', () => {
    const trace = [
      humanEv(1, [{ n: 3 }], 0),   // グローバルスコープの n
      humanEv(2, [{ n: 1 }], 1),   // 関数スコープの n
    ];
    const entries = new TraceBuilder(trace).buildLifetime();
    const nEntries = entries.filter(e => e.varName === 'n');
    expect(nEntries.length).toBe(2);
    expect(nEntries.some(e => e.callDepth === 0)).toBe(true);
    expect(nEntries.some(e => e.callDepth === 1)).toBe(true);
  });

  test('キャッシュを返す（同一オブジェクト）', () => {
    const trace = [humanEv(1, [{ x: 1 }], 0)];
    const builder = new TraceBuilder(trace);
    expect(builder.buildLifetime()).toBe(builder.buildLifetime());
  });
});

// ── buildControlFlow ──────────────────────────────────────────────────────

describe('TraceBuilder.buildControlFlow()', () => {
  const source = 'let x = 1;\nif (x > 0) {\n  x = 2;\n}\n';

  function humanEv2(line) {
    return ev('enter', 'ExpressionStatement', line, { callDepth: 0, env: [{}] });
  }

  test('通過した行のノードが含まれる', () => {
    const trace = [
      humanEv2(1),
      humanEv2(2),
      humanEv2(3),
    ];
    const { nodes } = new TraceBuilder(trace, source).buildControlFlow();
    const lineNos = nodes.map(n => n.lineNo);
    expect(lineNos).toContain(1);
    expect(lineNos).toContain(2);
    expect(lineNos).toContain(3);
  });

  test('エッジは行番号の遷移ペアを含む', () => {
    const trace = [
      humanEv2(1),
      humanEv2(2),
      humanEv2(3),
    ];
    const { edges } = new TraceBuilder(trace, source).buildControlFlow();
    expect(edges.some(e => e.from === 1 && e.to === 2)).toBe(true);
    expect(edges.some(e => e.from === 2 && e.to === 3)).toBe(true);
  });

  test('同じ行への繰り返し遷移でカウントが増える', () => {
    const trace = [
      humanEv2(2),
      humanEv2(3),
      humanEv2(2),  // ループバック
      humanEv2(3),
    ];
    const { edges } = new TraceBuilder(trace, source).buildControlFlow();
    const loopEdge = edges.find(e => e.from === 3 && e.to === 2);
    expect(loopEdge).toBeDefined();
    expect(loopEdge.count).toBe(1);

    const fwdEdge = edges.find(e => e.from === 2 && e.to === 3);
    expect(fwdEdge?.count).toBe(2);
  });

  test('nodes の firstSeen 順にソートされる', () => {
    const trace = [humanEv2(3), humanEv2(1), humanEv2(2)];
    const { nodes } = new TraceBuilder(trace, source).buildControlFlow();
    // 最初に登場した行番号順 = 3, 1, 2
    expect(nodes[0].lineNo).toBe(3);
    expect(nodes[1].lineNo).toBe(1);
    expect(nodes[2].lineNo).toBe(2);
  });

  test('humanSteps 配列が含まれる', () => {
    const trace = [humanEv2(1), humanEv2(2)];
    const { humanSteps } = new TraceBuilder(trace, source).buildControlFlow();
    expect(Array.isArray(humanSteps)).toBe(true);
    expect(humanSteps.length).toBeGreaterThan(0);
  });

  test('空の trace では空の nodes/edges を返す', () => {
    const { nodes, edges } = new TraceBuilder([], source).buildControlFlow();
    expect(nodes).toEqual([]);
    expect(edges).toEqual([]);
  });

  test('キャッシュを返す（同一オブジェクト）', () => {
    const trace = [humanEv2(1)];
    const builder = new TraceBuilder(trace, source);
    expect(builder.buildControlFlow()).toBe(builder.buildControlFlow());
  });
});
