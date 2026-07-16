/**
 * session-logger.js — 操作ログ記録・エクスポート（評価実験用）
 *
 * シングルトンインスタンス `sessionLogger` をエクスポートする。
 * どのモジュールからも import するだけで使用可能。
 *
 * ログエントリ型:
 *   { t, type: 'run',    sampleName, traceLength }
 *   { t, type: 'reset' }
 *   { t, type: 'step',   action, cursorBefore, cursorAfter }
 *   { t, type: 'view',   viewId }
 *   { t, type: 'marker', label }
 *
 * action の値:
 *   exprFwd / exprBack   … 式単位
 *   stmtFwd / stmtBack   … 文単位
 *   humanFwd / humanBack … 人間単位
 *   callFwd / callBack   … 関数単位
 *   goStart / goEnd      … 先頭/末尾ジャンプ
 *   slider               … スライダー操作
 */

class SessionLogger {
  /** @type {Array<Object>} */
  #entries = [];

  /** @type {number|null} セッション開始時刻（Date.now()） */
  #sessionStart = null;

  /** @type {Array<(count: number) => void>} カウント変化時のコールバック */
  #listeners = [];

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
   * コード実行をログに記録する。
   * @param {string} sampleName サンプル名、またはカスタムコードなら 'custom'
   * @param {number} traceLength trace 配列の長さ
   */
  logRun(sampleName, traceLength) {
    this.#log({ type: 'run', sampleName, traceLength });
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
   */
  logStep(action, cursorBefore, cursorAfter) {
    this.#log({ type: 'step', action, cursorBefore, cursorAfter });
  }

  /**
   * タブ切り替えをログに記録する。
   * @param {string} viewId ビューの ID（'state', 'trace', ... など）
   */
  logView(viewId) {
    this.#log({ type: 'view', viewId });
  }

  /**
   * 実験者が任意のタイミングで記録するマーカー。
   * @param {string} label マーカーラベル（例: 'task1-start', 'task2-end'）
   */
  logMarker(label) {
    this.#log({ type: 'marker', label: label.trim() || '(無題)' });
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
    this.#entries.push({ t: Date.now() - this.#sessionStart, ...entry });
    this.#notify();
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
