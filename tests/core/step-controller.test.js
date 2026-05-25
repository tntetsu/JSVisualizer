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
