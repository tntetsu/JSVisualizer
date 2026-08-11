/**
 * step-controller.js — ステップ粒度の統合管理
 *
 * 粒度:
 *   expr  … stepIn  / stepBack         全 AST ノード（最細粒度）
 *   human … humanStep / humanStepBack  人間にわかりやすい変化点
 *   stmt  … stepOver / stepOverBack    文単位
 *   call  … callDepth 変化点           関数呼び出し/リターン境界（最粗粒度）
 */

import { sessionLogger } from './session-logger.js';

/** @typedef {'expr'|'stmt'|'call'|'human'} Granularity */

export class StepController {
  /** @type {import('./debugger-adapter.js').DebuggerAdapter} */
  #adapter;

  /** @type {Granularity} */
  #granularity = 'human';

  /**
   * @param {import('./debugger-adapter.js').DebuggerAdapter} adapter
   */
  constructor(adapter) {
    this.#adapter = adapter;
  }

  // ── 粒度設定 ──────────────────────────────────────────────────────────────

  /**
   * @param {Granularity} g
   */
  setGranularity(g) {
    this.#granularity = g;
  }

  /** @returns {Granularity} */
  getGranularity() {
    return this.#granularity;
  }

  // ── ステップ操作（式単位） ────────────────────────────────────────────────

  /** 式単位で 1 ステップ前進（stepIn） */
  stepExprForward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.isDone()) return;
    const before = dbg.cursor;
    dbg.stepIn();
    this.#adapter.moveTo(dbg.cursor);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('exprFwd', before, dbg.cursor, loc, callDepth);
  }

  /** 式単位で 1 ステップ後退（stepBack） */
  stepExprBackward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.cursor === 0) return;
    const before = dbg.cursor;
    dbg.stepBack();
    this.#adapter.moveTo(dbg.cursor);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('exprBack', before, dbg.cursor, loc, callDepth);
  }

  // ── ステップ操作（文単位） ────────────────────────────────────────────────

  /** 文単位で 1 ステップ前進（stepOver） */
  stepStmtForward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.isDone()) return;
    const before = dbg.cursor;
    dbg.stepOver();
    this.#adapter.moveTo(dbg.cursor);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('stmtFwd', before, dbg.cursor, loc, callDepth);
  }

  /** 文単位で 1 ステップ後退（stepOver の逆） */
  stepStmtBackward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.cursor === 0) return;
    const before = dbg.cursor;
    this.#stepOverBack(dbg);
    this.#adapter.moveTo(dbg.cursor);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('stmtBack', before, dbg.cursor, loc, callDepth);
  }

  // ── ステップ操作（人間単位） ──────────────────────────────────────────────

  /** 人間単位で 1 ステップ前進（humanStep） */
  stepHumanForward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.isDone()) return;
    const before = dbg.cursor;
    dbg.humanStep();
    this.#adapter.moveTo(dbg.cursor);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('humanFwd', before, dbg.cursor, loc, callDepth);
  }

  /** 人間単位で 1 ステップ後退（humanStepBack） */
  stepHumanBackward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.cursor === 0) return;
    const before = dbg.cursor;
    dbg.humanStepBack();
    this.#adapter.moveTo(dbg.cursor);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('humanBack', before, dbg.cursor, loc, callDepth);
  }

  // ── ステップ操作（関数呼び出し単位） ─────────────────────────────────────

  /**
   * 関数呼び出し単位で前進。
   * callDepth が現在と異なる最初の trace イベントへジャンプする。
   * （関数エントリ↑ or リターン↓ のたびに止まる）
   */
  stepCallForward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.isDone()) return;
    const before      = dbg.cursor;
    const trace       = dbg.trace;
    const startDepth  = trace[dbg.cursor]?.callDepth ?? 0;
    let   next        = dbg.cursor + 1;
    while (next < trace.length && trace[next].callDepth === startDepth) {
      next++;
    }
    const target = Math.min(next, trace.length);
    this.#adapter.moveTo(target);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('callFwd', before, target, loc, callDepth);
  }

  /**
   * 関数呼び出し単位で後退。
   * callDepth が現在と異なる直前の trace イベントへジャンプする。
   */
  stepCallBackward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.cursor === 0) return;
    const before     = dbg.cursor;
    const trace      = dbg.trace;
    const startDepth = trace[dbg.cursor]?.callDepth ?? 0;
    let   prev       = dbg.cursor - 1;
    while (prev > 0 && trace[prev].callDepth === startDepth) {
      prev--;
    }
    this.#adapter.moveTo(prev);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('callBack', before, prev, loc, callDepth);
  }

  // ── 後方互換: 粒度指定ステップ ───────────────────────────────────────────

  /** @deprecated 式/文ボタンを直接使うこと */
  stepForward() {
    switch (this.#granularity) {
      case 'expr':  this.stepExprForward();  break;
      case 'stmt':  this.stepStmtForward();  break;
      case 'func': {
        const dbg = this.#adapter.getDebugger();
        if (!dbg || dbg.isDone()) return;
        dbg.stepOut();
        this.#adapter.moveTo(dbg.cursor);
        break;
      }
      case 'human': {
        const dbg = this.#adapter.getDebugger();
        if (!dbg || dbg.isDone()) return;
        dbg.humanStep();
        this.#adapter.moveTo(dbg.cursor);
        break;
      }
    }
  }

  /** @deprecated 式/文ボタンを直接使うこと */
  stepBackward() {
    switch (this.#granularity) {
      case 'expr':  this.stepExprBackward();  break;
      case 'stmt':  this.stepStmtBackward();  break;
      case 'func': {
        const dbg = this.#adapter.getDebugger();
        if (!dbg || dbg.cursor === 0) return;
        this.#stepOutBack(dbg);
        this.#adapter.moveTo(dbg.cursor);
        break;
      }
      case 'human': {
        const dbg = this.#adapter.getDebugger();
        if (!dbg || dbg.cursor === 0) return;
        dbg.humanStepBack();
        this.#adapter.moveTo(dbg.cursor);
        break;
      }
    }
  }

  /** 先頭（cursor = 0）へ移動 */
  goToStart() {
    const dbg = this.#adapter.getDebugger();
    const before = dbg?.cursor ?? 0;
    this.#adapter.moveTo(0);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('goStart', before, 0, loc, callDepth);
  }

  /** 末尾（cursor = trace.length）へ移動 */
  goToEnd() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg) return;
    const before = dbg.cursor;
    const target = dbg.trace.length;
    this.#adapter.moveTo(target);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('goEnd', before, target, loc, callDepth);
  }

  /**
   * 任意の cursor 位置へジャンプ（スライダー操作）
   * @param {number} cursor
   */
  jumpTo(cursor) {
    const dbg = this.#adapter.getDebugger();
    const before = dbg?.cursor ?? 0;
    this.#adapter.moveTo(cursor);
    const { loc, callDepth } = this.#locInfo(dbg);
    sessionLogger.logStep('slider', before, cursor, loc, callDepth);
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /**
   * 現在の cursor 位置に対応する loc/callDepth を返す（BhvVisualizer連携ログ用）。
   * @param {*} dbg JSDebugger インスタンス（null 許容）
   * @returns {{ loc: {line:number,column:number}|null, callDepth: number|null }}
   */
  #locInfo(dbg) {
    const ev = dbg?.trace?.[dbg.cursor];
    return { loc: ev?.loc ?? null, callDepth: ev?.callDepth ?? null };
  }

  /**
   * stmt 粒度の後退:
   * 現在が exit → 対応する enter へ戻る。
   * 現在が enter → stepBack で 1 つ前へ。
   */
  #stepOverBack(dbg) {
    if (dbg.cursor === 0) return;
    dbg.cursor--;
    const ev = dbg.getCurrentEvent();
    if (ev && ev.phase === 'exit') {
      // matchIdx は対応する enter を指している
      dbg.cursor = ev.matchIdx;
    }
  }

  /**
   * func 粒度の後退:
   * callDepth が増える最初の enter を逆方向に探す。
   */
  #stepOutBack(dbg) {
    if (dbg.cursor === 0) return;
    const currentCallDepth = dbg.getCurrentEvent()?.callDepth ?? 0;

    if (currentCallDepth === 0) {
      dbg.cursor = 0;
      return;
    }

    for (let i = dbg.cursor - 1; i >= 0; i--) {
      const ev = dbg.trace[i];
      if (ev.phase === 'enter' && ev.callDepth < currentCallDepth) {
        dbg.cursor = i;
        return;
      }
    }
    dbg.cursor = 0;
  }
}
