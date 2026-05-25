/**
 * step-controller.js — ステップ粒度の統合管理
 *
 * 粒度:
 *   'expr'  … stepIn  / stepBack      (全 AST ノード)
 *   'stmt'  … stepOver / stepOverBack (文単位)
 *   'func'  … stepOut / stepOutBack   (関数呼び出し単位)
 *   'human' … humanStep / humanStepBack (意味ある変化点)
 */

/** @typedef {'expr'|'stmt'|'func'|'human'} Granularity */

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
    dbg.stepIn();
    this.#adapter.moveTo(dbg.cursor);
  }

  /** 式単位で 1 ステップ後退（stepBack） */
  stepExprBackward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.cursor === 0) return;
    dbg.stepBack();
    this.#adapter.moveTo(dbg.cursor);
  }

  // ── ステップ操作（文単位） ────────────────────────────────────────────────

  /** 文単位で 1 ステップ前進（stepOver） */
  stepStmtForward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.isDone()) return;
    dbg.stepOver();
    this.#adapter.moveTo(dbg.cursor);
  }

  /** 文単位で 1 ステップ後退（stepOver の逆） */
  stepStmtBackward() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg || dbg.cursor === 0) return;
    this.#stepOverBack(dbg);
    this.#adapter.moveTo(dbg.cursor);
  }

  // ── 後方互換: 粒度指定ステップ（Phase 2+ から使用予定） ──────────────────

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
    this.#adapter.moveTo(0);
  }

  /** 末尾（cursor = trace.length）へ移動 */
  goToEnd() {
    const dbg = this.#adapter.getDebugger();
    if (!dbg) return;
    this.#adapter.moveTo(dbg.trace.length);
  }

  /**
   * 任意の cursor 位置へジャンプ
   * @param {number} cursor
   */
  jumpTo(cursor) {
    this.#adapter.moveTo(cursor);
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

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
