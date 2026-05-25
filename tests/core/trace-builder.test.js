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
    const builder = new TraceBuilder([ev('enter', 'VariableDeclaration', 1)]);
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
