/**
 * step-controller.test.js — StepController のユニットテスト
 *
 * DebuggerAdapter をモックして、cursor 移動のみをテストする。
 */

import { StepController } from '../../src/core/step-controller.js';

// ── モック TraceEvent 生成 ─────────────────────────────────────────────────

function makeTrace(length) {
  return Array.from({ length }, (_, i) => ({
    phase:     i % 2 === 0 ? 'enter' : 'exit',
    nodeType:  'ExpressionStatement',
    loc:       { line: i + 1, column: 0 },
    depth:     0,
    callDepth: 0,
    matchIdx:  i % 2 === 0 ? i + 1 : i - 1,
    env:       [{}],
    callStack: [],
  }));
}

/**
 * 実際のJSInterpreterトレースに近い構造を持つ固定トレースを作る。
 *
 *  0  enter Program                          matchIdx 11
 *  1  enter VariableDeclaration (stmt1)       matchIdx 2
 *  2  exit  VariableDeclaration (stmt1)       matchIdx 1
 *  3  enter ExpressionStatement (stmt2, 関数呼び出し) matchIdx 8
 *  4  enter BlockStatement (関数本体)         matchIdx 7
 *  5  enter VariableDeclaration (関数内の文1) matchIdx 6
 *  6  exit  VariableDeclaration (関数内の文1) matchIdx 5
 *  7  exit  BlockStatement                    matchIdx 4
 *  8  exit  ExpressionStatement (stmt2)       matchIdx 3
 *  9  enter VariableDeclaration (stmt3)       matchIdx 10
 * 10  exit  VariableDeclaration (stmt3)       matchIdx 9
 * 11  exit  Program                           matchIdx 0
 */
function makeStmtTrace() {
  const n = (phase, nodeType, matchIdx, callDepth = 0) => ({
    phase, nodeType, loc: { line: 1, column: 0 }, depth: 0, callDepth, matchIdx, env: [{}], callStack: [],
  });
  return [
    n('enter', 'Program', 11),
    n('enter', 'VariableDeclaration', 2),
    n('exit', 'VariableDeclaration', 1),
    n('enter', 'ExpressionStatement', 8),
    n('enter', 'BlockStatement', 7, 1),
    n('enter', 'VariableDeclaration', 6, 1),
    n('exit', 'VariableDeclaration', 5, 1),
    n('exit', 'BlockStatement', 4, 1),
    n('exit', 'ExpressionStatement', 3),
    n('enter', 'VariableDeclaration', 10),
    n('exit', 'VariableDeclaration', 9),
    n('exit', 'Program', 0),
  ];
}

function makeStmtAdapter() {
  const trace = makeStmtTrace();
  const dbg = {
    trace,
    cursor: 0,
    isDone()          { return dbg.cursor >= dbg.trace.length; },
    getCurrentEvent() { return dbg.isDone() ? null : dbg.trace[dbg.cursor]; },
    stepIn()          { if (!dbg.isDone()) dbg.cursor++; },
    stepOver() {
      if (dbg.isDone()) return;
      const ev = dbg.trace[dbg.cursor];
      if (ev?.phase === 'enter') dbg.cursor = ev.matchIdx;
      else dbg.cursor++;
    },
  };
  const adapter = {
    getDebugger: () => dbg,
    moveTo: (n) => { dbg.cursor = Math.max(0, Math.min(n, trace.length)); },
  };
  return { adapter, dbg };
}

// ── ステップ操作（文単位） ────────────────────────────────────────────────

describe('StepController — stepStmtForward（Program/BlockStatementのスキップ不具合の回帰確認）', () => {
  test('cursor=0（enter Program）から呼んでも、Program全体を1回で飛び越えない', () => {
    const { adapter, dbg } = makeStmtAdapter();
    const ctrl = new StepController(adapter);
    ctrl.stepStmtForward();
    // 不具合修正前は cursor=11（exit Program、末尾）まで飛んでいた
    expect(dbg.cursor).toBe(2); // stmt1（VariableDeclaration）のexit
  });

  test('1クリック=1文になっている（トップレベル3文を3回のクリックで辿れる）', () => {
    const { adapter, dbg } = makeStmtAdapter();
    const ctrl = new StepController(adapter);
    ctrl.stepStmtForward();
    expect(dbg.cursor).toBe(2); // stmt1完了
    ctrl.stepStmtForward();
    expect(dbg.cursor).toBe(8); // stmt2（関数呼び出し）完了。関数内部はまとめてスキップ
    ctrl.stepStmtForward();
    expect(dbg.cursor).toBe(10); // stmt3完了
    ctrl.stepStmtForward();
    expect(dbg.cursor).toBe(12); // 末尾（done）
  });

  test('BlockStatement（関数本体）に入った直後でも、本体全体を1回で飛び越えない', () => {
    const { adapter, dbg } = makeStmtAdapter();
    const ctrl = new StepController(adapter);
    dbg.cursor = 4; // enter BlockStatement（関数本体、人/式で入った想定）
    ctrl.stepStmtForward();
    // 不具合修正前は cursor=7（exit BlockStatement）まで飛んでいた
    expect(dbg.cursor).toBe(6); // 関数内の文1のexit
    ctrl.stepStmtForward();
    // 関数本体内に文がこれ以上無いため、呼び出し元の次の文（stmt3）まで一気に進む。
    // 呼び出し文自体の exit（8）は「関数を抜ける」という通過点であり、着地点にはしない
    // （文単位ステップは通過点をまとめてスキップする粗い粒度、という既存方針を維持）
    expect(dbg.cursor).toBe(10); // stmt3のexit
  });
});

describe('StepController — stepStmtBackward（前進との対称性）', () => {
  test('前進を繰り返してから同じ回数後退すると、通過位置を逆順に辿れる', () => {
    const { adapter, dbg } = makeStmtAdapter();
    const ctrl = new StepController(adapter);
    const forwardPositions = [];
    while (!dbg.isDone()) {
      ctrl.stepStmtForward();
      forwardPositions.push(dbg.cursor);
    }
    expect(forwardPositions).toEqual([2, 8, 10, 12]);

    const backwardPositions = [];
    for (let i = 0; i < forwardPositions.length - 1; i++) {
      ctrl.stepStmtBackward();
      backwardPositions.push(dbg.cursor);
    }
    expect(backwardPositions).toEqual([10, 8, 2]);
  });

  test('末尾（isDone）から後退しても、正しく最後の文のexitへ戻る', () => {
    const { adapter, dbg } = makeStmtAdapter();
    const ctrl = new StepController(adapter);
    dbg.cursor = 12; // 末尾（isDone）
    ctrl.stepStmtBackward();
    expect(dbg.cursor).toBe(10); // stmt3のexit
  });

  test('cursor が 0 のときは変化しない', () => {
    const { adapter, dbg } = makeStmtAdapter();
    const ctrl = new StepController(adapter);
    ctrl.stepStmtBackward();
    expect(dbg.cursor).toBe(0);
  });
});

// ── モック DebuggerAdapter ────────────────────────────────────────────────

function makeAdapter(traceLength = 10) {
  const trace = makeTrace(traceLength);
  let cursor = 0;
  const movedTo = [];

  // JSDebugger の最小モック
  const dbg = {
    trace,
    cursor,
    get isDone() { return dbg.cursor >= dbg.trace.length; },
    isDone()     { return dbg.cursor >= dbg.trace.length; },
    getCurrentEvent() { return dbg.isDone() ? null : dbg.trace[dbg.cursor]; },
    stepIn()     { if (!dbg.isDone()) dbg.cursor++; return { done: dbg.isDone(), event: dbg.getCurrentEvent() }; },
    stepOver()   {
      if (dbg.isDone()) return;
      const ev = dbg.trace[dbg.cursor];
      if (ev?.phase === 'enter') dbg.cursor = ev.matchIdx;
      else dbg.cursor++;
    },
    stepOut()    { dbg.cursor = dbg.trace.length; },
    stepBack()   { if (dbg.cursor > 0) dbg.cursor--; },
    humanStep()  { if (!dbg.isDone()) dbg.cursor = Math.min(dbg.cursor + 2, dbg.trace.length); },
    humanStepBack() { dbg.cursor = Math.max(0, dbg.cursor - 2); },
  };

  const adapter = {
    getDebugger: () => dbg,
    moveTo: (n) => {
      const clamped = Math.max(0, Math.min(n, trace.length));
      dbg.cursor = clamped;
      movedTo.push(clamped);
    },
    getMovedTo: () => movedTo,
  };

  return { adapter, dbg, movedTo };
}

// ── setGranularity / getGranularity ──────────────────────────────────────

describe('StepController — 粒度設定', () => {
  test('デフォルト粒度は human', () => {
    const { adapter } = makeAdapter();
    const ctrl = new StepController(adapter);
    expect(ctrl.getGranularity()).toBe('human');
  });

  test('setGranularity で粒度を変更できる', () => {
    const { adapter } = makeAdapter();
    const ctrl = new StepController(adapter);
    ctrl.setGranularity('expr');
    expect(ctrl.getGranularity()).toBe('expr');
  });
});

// ── goToStart / goToEnd ───────────────────────────────────────────────────

describe('StepController — goToStart / goToEnd', () => {
  test('goToStart は cursor を 0 に移動する', () => {
    const { adapter, dbg } = makeAdapter(10);
    const ctrl = new StepController(adapter);
    dbg.cursor = 5;
    ctrl.goToStart();
    expect(dbg.cursor).toBe(0);
  });

  test('goToEnd は cursor を trace.length に移動する', () => {
    const { adapter, dbg } = makeAdapter(10);
    const ctrl = new StepController(adapter);
    ctrl.goToEnd();
    expect(dbg.cursor).toBe(10);
  });
});

// ── jumpTo ────────────────────────────────────────────────────────────────

describe('StepController — jumpTo', () => {
  test('指定の cursor 位置に移動する', () => {
    const { adapter, dbg } = makeAdapter(10);
    const ctrl = new StepController(adapter);
    ctrl.jumpTo(7);
    expect(dbg.cursor).toBe(7);
  });
});

// ── stepForward ───────────────────────────────────────────────────────────

describe('StepController — stepForward (expr)', () => {
  test('expr 粒度で stepIn が呼ばれて cursor が 1 進む', () => {
    const { adapter, dbg } = makeAdapter(10);
    const ctrl = new StepController(adapter);
    ctrl.setGranularity('expr');
    ctrl.stepForward();
    expect(dbg.cursor).toBe(1);
  });
});

describe('StepController — stepForward (human)', () => {
  test('human 粒度で humanStep が呼ばれて cursor が 2 進む（モック）', () => {
    const { adapter, dbg } = makeAdapter(10);
    const ctrl = new StepController(adapter);
    ctrl.setGranularity('human');
    ctrl.stepForward();
    expect(dbg.cursor).toBe(2);
  });
});

// ── stepBackward ──────────────────────────────────────────────────────────

describe('StepController — stepBackward (expr)', () => {
  test('expr 粒度で stepBack が呼ばれて cursor が 1 戻る', () => {
    const { adapter, dbg } = makeAdapter(10);
    dbg.cursor = 5;
    const ctrl = new StepController(adapter);
    ctrl.setGranularity('expr');
    ctrl.stepBackward();
    expect(dbg.cursor).toBe(4);
  });

  test('cursor が 0 のときは変化しない', () => {
    const { adapter, dbg } = makeAdapter(10);
    const ctrl = new StepController(adapter);
    ctrl.setGranularity('expr');
    ctrl.stepBackward();
    expect(dbg.cursor).toBe(0);
  });
});

describe('StepController — stepBackward (human)', () => {
  test('human 粒度で humanStepBack が呼ばれて cursor が 2 戻る（モック）', () => {
    const { adapter, dbg } = makeAdapter(10);
    dbg.cursor = 6;
    const ctrl = new StepController(adapter);
    ctrl.setGranularity('human');
    ctrl.stepBackward();
    expect(dbg.cursor).toBe(4);
  });
});
