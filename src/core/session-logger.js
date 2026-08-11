/**
 * session-logger.js — 操作ログ記録・エクスポート（評価実験用 + BhvVisualizer連携）
 *
 * シングルトンインスタンス `sessionLogger` をエクスポートする。
 * どのモジュールからも import するだけで使用可能。
 *
 * ログエントリ型:
 *   { t, type: 'lifecycle', phase }
 *   { t, type: 'run',    sampleName, code, success, errorType, errorMessage, errorLoc, traceLength }
 *   { t, type: 'reset' }
 *   { t, type: 'step',   action, cursorBefore, cursorAfter, loc, callDepth }
 *   { t, type: 'view',   viewId }
 *   { t, type: 'visibility', state }
 *   { t, type: 'marker', label }
 *
 * action の値:
 *   exprFwd / exprBack   … 式単位
 *   stmtFwd / stmtBack   … 文単位
 *   humanFwd / humanBack … 人間単位
 *   callFwd / callBack   … 関数単位
 *   goStart / goEnd      … 先頭/末尾ジャンプ
 *   slider               … スライダー操作
 *
 * BHV: BhvVisualizerに埋め込まれ `enableRemoteLogging()` が呼ばれている間は、
 * エントリを記録するたびに window.parent へも postMessage する
 * （詳細は BhvVisualizer/docs/logging-spec.md）。呼ばれていなければ完全に無効。
 */

class SessionLogger {
  /** @type {Array<Object>} */
  #entries = [];

  /** @type {number|null} セッション開始時刻（Date.now()） */
  #sessionStart = null;

  /** @type {Array<(count: number) => void>} カウント変化時のコールバック */
  #listeners = [];

  /** @type {string|null} BHV: BhvVisualizer側で発行されたセッションID */
  #remoteSessionId = null;

  /** @type {string|null} BHV: postMessage送信先オリジン（未設定なら送信しない） */
  #remoteTargetOrigin = null;

  // ── 公開 API ──────────────────────────────────────────────────────────────

  /** セッションが記録中かどうか */
  get isActive() { return this.#sessionStart !== null; }

  /** 現在のエントリ数 */
  get count() { return this.#entries.length; }

  /**
   * 新しいセッションを開始する（既存ログをクリア）。
   * 実験の被験者ごとに呼ぶ。
   */
  startSession() {
    this.#entries    = [];
    this.#sessionStart = Date.now();
    this.#notify();
  }

  /** セッション開始時刻を ISO 文字列で返す（未開始なら null） */
  get sessionStartISO() {
    return this.#sessionStart ? new Date(this.#sessionStart).toISOString() : null;
  }

  // ── ログ記録メソッド ──────────────────────────────────────────────────────

  /**
   * コード実行結果をログに記録する（成功・失敗（構文/実行時エラー）のいずれも）。
   * @param {Object} result
   * @param {string} result.sampleName サンプル名、またはカスタムコードなら 'custom'
   * @param {string} result.code 実行時点のソースコード全文
   * @param {boolean} result.success
   * @param {'parse'|'runtime'|null} [result.errorType]
   * @param {string|null} [result.errorMessage]
   * @param {{line:number,column:number}|null} [result.errorLoc]
   * @param {number|null} [result.traceLength] success: true のときのみ
   */
  logRun({ sampleName, code, success, errorType = null, errorMessage = null, errorLoc = null, traceLength = null }) {
    this.#log({ type: 'run', sampleName, code, success, errorType, errorMessage, errorLoc, traceLength });
  }

  /** リセット（編集モードへ戻る）をログに記録する。 */
  logReset() {
    this.#log({ type: 'reset' });
  }

  /**
   * ステップ操作をログに記録する。
   * @param {string} action     操作の種類（exprFwd, stmtBack, ... など）
   * @param {number} cursorBefore 操作前の cursor 位置
   * @param {number} cursorAfter  操作後の cursor 位置
   * @param {{line:number,column:number}|null} [loc] 操作後の位置に対応するソース上の行・列
   * @param {number|null} [callDepth] 操作後の位置での関数呼び出し深さ
   */
  logStep(action, cursorBefore, cursorAfter, loc = null, callDepth = null) {
    this.#log({ type: 'step', action, cursorBefore, cursorAfter, loc, callDepth });
  }

  /**
   * タブ切り替えをログに記録する。
   * @param {string} viewId ビューの ID（'state', 'trace', ... など）
   */
  logView(viewId) {
    this.#log({ type: 'view', viewId });
  }

  /**
   * タブの表示状態変化をログに記録する。
   * @param {'hidden'|'visible'} state
   */
  logVisibility(state) {
    this.#log({ type: 'visibility', state });
  }

  /**
   * セッション境界（開始・終了）をログに記録する。
   * @param {'start'|'end'} phase
   */
  logLifecycle(phase) {
    this.#log({ type: 'lifecycle', phase });
  }

  /**
   * 実験者が任意のタイミングで記録するマーカー。
   * @param {string} label マーカーラベル（例: 'task1-start', 'task2-end'）
   */
  logMarker(label) {
    this.#log({ type: 'marker', label: label.trim() || '(無題)' });
  }

  // ── BhvVisualizer 連携（BHV） ────────────────────────────────────────────

  /**
   * BhvVisualizerへのリアルタイム送信を有効化する。
   * 以降 startSession() が呼ばれている間、記録したエントリを window.parent へ
   * postMessage するようになる。init ハンドシェイクの受理時にのみ呼ぶこと。
   * @param {string} sessionId BhvVisualizer側で発行されたセッションID
   * @param {string} targetOrigin postMessage の送信先オリジン（検証済みの event.origin）
   */
  enableRemoteLogging(sessionId, targetOrigin) {
    this.#remoteSessionId    = sessionId;
    this.#remoteTargetOrigin = targetOrigin;
  }

  // ── エクスポート ──────────────────────────────────────────────────────────

  /** ログを JSON ファイルとしてダウンロードする。 */
  exportJSON() {
    if (this.#entries.length === 0) return;
    const data = {
      sessionStart: this.sessionStartISO,
      entryCount:   this.#entries.length,
      entries:      this.#entries,
    };
    const timestamp = this.#fileTimestamp();
    this.#download(
      JSON.stringify(data, null, 2),
      `jsv-log-${timestamp}.json`,
      'application/json',
    );
  }

  /** ログを CSV ファイルとしてダウンロードする。 */
  exportCSV() {
    if (this.#entries.length === 0) return;
    const header = 't_ms,type,action,cursor_before,cursor_after,view_id,sample_name,trace_length,label';
    const rows = this.#entries.map(e => [
      e.t,
      e.type,
      e.action        ?? '',
      e.cursorBefore  !== undefined ? e.cursorBefore : '',
      e.cursorAfter   !== undefined ? e.cursorAfter  : '',
      e.viewId        ?? '',
      e.sampleName    ?? '',
      e.traceLength   !== undefined ? e.traceLength  : '',
      e.label ? `"${e.label.replace(/"/g, '""')}"` : '',
    ].join(','));
    const timestamp = this.#fileTimestamp();
    this.#download(
      [header, ...rows].join('\n'),
      `jsv-log-${timestamp}.csv`,
      'text/csv;charset=utf-8;',
    );
  }

  // ── リスナー（UIカウンタ更新用） ─────────────────────────────────────────

  /**
   * エントリ数が変化したとき呼ばれるコールバックを登録する。
   * @param {(count: number) => void} fn
   */
  onCountChange(fn) {
    this.#listeners.push(fn);
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /** セッション未開始のときは記録しない。 */
  #log(entry) {
    if (!this.#sessionStart) return;
    const full = { t: Date.now() - this.#sessionStart, ...entry };
    this.#entries.push(full);
    this.#notify();
    this.#postToParent(full);
  }

  /** BHV: リアルタイム送信が有効なら window.parent へ postMessage する。 */
  #postToParent(entry) {
    if (!this.#remoteTargetOrigin || window.parent === window) return;
    window.parent.postMessage(
      { source: 'jsvisualizer', sessionId: this.#remoteSessionId, ...entry },
      this.#remoteTargetOrigin,
    );
  }

  #notify() {
    const count = this.#entries.length;
    for (const fn of this.#listeners) fn(count);
  }

  /** ファイル名用タイムスタンプ（yyyymmdd-HHmmss） */
  #fileTimestamp() {
    const d   = new Date(this.#sessionStart ?? Date.now());
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
         + `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  /** Blob をファイルとしてダウンロードする。 */
  #download(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

/** モジュール単位のシングルトン。import するだけで使用可能。 */
export const sessionLogger = new SessionLogger();
