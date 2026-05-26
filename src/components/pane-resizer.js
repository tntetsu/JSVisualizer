/**
 * pane-resizer.js — 左右ペインのドラッグリサイズ
 *
 * divider 要素をドラッグして editor-pane の幅（%）を変更する。
 * 幅は CSS 変数 --editor-pct で管理し、localStorage に永続化する。
 */

const STORAGE_KEY = 'jsv-editor-pct';
const PCT_MIN     = 15;
const PCT_MAX     = 75;
const PCT_DEFAULT = 30;

export class PaneResizer {
  /** @type {HTMLElement} */
  #divider;

  /** @type {HTMLElement} app-main */
  #mainEl;

  /** @type {boolean} */
  #dragging = false;

  /** @type {number} ドラッグ開始時のマウス X 座標 */
  #startX = 0;

  /** @type {number} ドラッグ開始時の editor-pane 幅（px） */
  #startW = 0;

  /**
   * @param {HTMLElement} divider
   * @param {HTMLElement} mainEl   .app-main 要素
   */
  constructor(divider, mainEl) {
    this.#divider = divider;
    this.#mainEl  = mainEl;

    // localStorage から復元（なければデフォルト）
    const saved = Number(localStorage.getItem(STORAGE_KEY));
    const pct   = (saved >= PCT_MIN && saved <= PCT_MAX) ? saved : PCT_DEFAULT;
    this.#setPct(pct);

    this.#bindEvents();
  }

  // ── 内部ヘルパー ────────────────────────────────────────────────────────────

  /** CSS 変数と localStorage を更新する */
  #setPct(pct) {
    const clamped = Math.max(PCT_MIN, Math.min(PCT_MAX, pct));
    this.#mainEl.style.setProperty('--editor-pct', String(clamped));
    localStorage.setItem(STORAGE_KEY, String(clamped));
  }

  #bindEvents() {
    this.#divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.#dragging = true;
      this.#startX   = e.clientX;
      // 現在の editor-pane 幅（px）
      const editorPane = this.#mainEl.querySelector('.editor-pane');
      this.#startW = editorPane ? editorPane.getBoundingClientRect().width : 0;
      this.#divider.classList.add('dragging');
      document.body.style.cursor  = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.#dragging) return;
      const delta   = e.clientX - this.#startX;
      const mainW   = this.#mainEl.getBoundingClientRect().width;
      const newPxW  = this.#startW + delta;
      const newPct  = (newPxW / mainW) * 100;
      this.#setPct(Math.round(newPct));
    });

    document.addEventListener('mouseup', () => {
      if (!this.#dragging) return;
      this.#dragging = false;
      this.#divider.classList.remove('dragging');
      document.body.style.cursor    = '';
      document.body.style.userSelect = '';
    });
  }
}
