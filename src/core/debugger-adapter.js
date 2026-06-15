/**
 * debugger-adapter.js — JSDebugger ラッパー
 *
 * 責務:
 *  - JSDebugger のライフサイクル管理（load / moveTo）
 *  - AppState への正規化
 *  - 前後スナップショット差分検出（changedVars）
 *  - 'ready' / 'step' カスタムイベントの発火
 */

import { JSDebugger, MaxStepsError, ExecutionError } from '../../web/interpreter.bundle.js';

// ── ヘルパー ────────────────────────────────────────────────────────────────

/**
 * env スナップショット（スコープチェーン配列）をフラット化して
 * { name: value } の Map を返す。内側スコープが外側を上書きする。
 * @param {Object[]} envChain
 * @returns {Map<string, any>}
 */
function flattenEnv(envChain) {
  const map = new Map();
  if (!envChain) return map;
  // env[0] が最内スコープ、末尾がグローバル → 外→内の順で上書き
  for (let i = envChain.length - 1; i >= 0; i--) {
    for (const [k, v] of Object.entries(envChain[i] ?? {})) {
      map.set(k, v);
    }
  }
  return map;
}

/**
 * 2 つの値が「表示上同じ」かを判定する簡易比較。
 * オブジェクト・配列はシリアライズ比較（循環参照は同一参照扱い）。
 * @param {any} a
 * @param {any} b
 * @returns {boolean}
 */
function shallowEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a === 'object') {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return a === b;
    }
  }
  return false;
}

/**
 * 変化した変数名の配列を返す。
 * @param {Map<string, any>} prev
 * @param {Map<string, any>} curr
 * @returns {string[]}
 */
function detectChanges(prev, curr) {
  const changed = [];
  for (const [name, val] of curr) {
    if (!shallowEqual(val, prev.get(name))) {
      changed.push(name);
    }
  }
  // 削除された変数（スコープを抜けた場合）
  for (const name of prev.keys()) {
    if (!curr.has(name)) changed.push(name);
  }
  return changed;
}

// ── DebuggerAdapter ─────────────────────────────────────────────────────────

/**
 * @typedef {Object} AppState
 * @property {number}        cursor        現在の cursor 値
 * @property {number}        totalSteps    trace.length
 * @property {Object|null}   event         現在の TraceEvent（null = 完了）
 * @property {Object}        variables     全スコープをフラット化した変数マップ
 * @property {Object[][]}    scopes        env[] スコープチェーン（配列の配列）
 * @property {Object[]}      callStack     現在のコールスタック
 * @property {Object[]}      frameEnvs     各アクティブフレームの callEnv スナップショット（外→内の順、callStack と対応）
 * @property {string[]}      changedVars   前ステップから変化した変数名
 * @property {Object[]}      consoleOutput 現在 cursor までのコンソール出力
 * @property {boolean}       done          実行完了フラグ
 * @property {string|null}   error         エラーメッセージ（正常時 null）
 */

export class DebuggerAdapter extends EventTarget {
  /** @type {JSDebugger|null} */
  #dbg = null;

  /** @type {Map<string, any>} 前ステップの変数マップ（差分検出用） */
  #prevFlat = new Map();

  // ── 公開 API ──────────────────────────────────────────────────────────────

  /**
   * ソースコードをロードして全ステップを記録する。
   * 成功時に 'ready' イベント、失敗時に 'error' イベントを dispatch する。
   * @param {string} source
   */
  load(source) {
    try {
      this.#dbg = new JSDebugger(source, { maxSteps: 10_000 });
      this.#prevFlat = new Map();
      this.dispatchEvent(new CustomEvent('ready', { detail: this.#buildState([]) }));
    } catch (err) {
      this.#dbg = null;
      // maxSteps 超過 / 実行エラー: 部分トレースで閲覧可能にしつつエラーを表示する
      if (err instanceof MaxStepsError || err instanceof ExecutionError) {
        const hasTrace = err.partialTrace?.length > 0;
        if (hasTrace) {
          this.#dbg = JSDebugger.fromTrace(
            err.partialSource, err.partialTrace, err.partialAst, err.partialConsoleLogs
          );
          this.#prevFlat = new Map();
          this.dispatchEvent(new CustomEvent('ready', { detail: this.#buildState([]) }));
        }
        const errorType = err instanceof MaxStepsError ? 'maxsteps' : 'runtime';
        this.dispatchEvent(new CustomEvent('error', {
          detail: { message: err.message, errorType },
        }));
        return;
      }
      // SyntaxError またはパーサーエラーはパースエラー、それ以外は実行時エラーとして区別する
      const msg = err?.message ?? '';
      const isParseError = err instanceof SyntaxError
        || err?.name === 'SyntaxError'
        || /^\[Parser\]/i.test(msg)
        || /^(Unexpected token|Unexpected end of|SyntaxError|Invalid or unexpected)/i.test(msg);
      this.dispatchEvent(new CustomEvent('error', {
        detail: {
          message:   err.message ?? String(err),
          errorType: isParseError ? 'parse' : 'runtime',
        },
      }));
    }
  }

  /**
   * cursor を指定位置に移動して状態を更新する。
   * 'step' イベントを dispatch する（payload = AppState）。
   * @param {number} nextCursor
   */
  moveTo(nextCursor) {
    if (!this.#dbg) return;
    const clamped = Math.max(0, Math.min(nextCursor, this.#dbg.trace.length));
    this.#dbg.cursor = clamped;
    const changed = this.#calcChanged();
    const state = this.#buildState(changed);
    this.dispatchEvent(new CustomEvent('step', { detail: state }));
  }

  /**
   * 正規化された現在の AppState を返す。
   * @returns {AppState}
   */
  getState() {
    return this.#buildState([]);
  }

  /**
   * trace 配列全体を返す（TraceBuilder 用）。
   * @returns {Object[]}
   */
  getTrace() {
    return this.#dbg?.trace ?? [];
  }

  /** JSDebugger インスタンスを直接返す（StepController 用）。 */
  getDebugger() {
    return this.#dbg;
  }

  /** 解析済み AST を返す（TraceBuilder.buildCFG() 用）。 */
  getAST() {
    return this.#dbg?.ast ?? null;
  }

  /** ロード済みか */
  isLoaded() {
    return this.#dbg !== null;
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /**
   * 前スナップショットと現在スナップショットの差分変数名を計算し、
   * 前スナップショットを現在値に更新する。
   * @returns {string[]}
   */
  #calcChanged() {
    const ev = this.#dbg.getCurrentEvent();
    const currFlat = flattenEnv(ev?.env ?? []);
    const changed = detectChanges(this.#prevFlat, currFlat);
    this.#prevFlat = currFlat;
    return changed;
  }

  /**
   * @param {string[]} changedVars
   * @returns {AppState}
   */
  #buildState(changedVars) {
    if (!this.#dbg) {
      return {
        cursor: 0, totalSteps: 0, event: null,
        variables: {}, scopes: [], callStack: [],
        changedVars: [], consoleOutput: [], done: true, error: null,
      };
    }

    const ev   = this.#dbg.getCurrentEvent();
    const flat = flattenEnv(ev?.env ?? []);
    const variables = Object.fromEntries(flat);

    return {
      cursor:        this.#dbg.cursor,
      totalSteps:    this.#dbg.trace.length,
      event:         ev,
      variables,
      scopes:        ev?.env ?? [],
      callStack:     this.#dbg.getCallStack(),
      frameEnvs:     ev?.frameEnvs ?? [],
      changedVars,
      consoleOutput: this.#dbg.getConsoleOutput(),
      done:          this.#dbg.isDone(),
      error:         null,
    };
  }
}
