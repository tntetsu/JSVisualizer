/**
 * code-view/index.js — コードハイライトビュー
 *
 * 実行中のコードを行ごとに表示し、現在実行中の行と
 * 現在評価中の式（loc で特定）をハイライトする。
 */

/** HTML エスケープ */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * トークンパターン（簡易シンタックスハイライト用）
 */
const TOKEN_PATTERNS = [
  { cls: 'tok-comment', re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g },
  { cls: 'tok-string',  re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g },
  { cls: 'tok-number',  re: /\b(\d+(?:\.\d+)?)\b/g },
  { cls: 'tok-keyword', re: /\b(function|return|if|else|while|for|let|const|var|new|class|extends|import|export|break|continue|null|undefined|true|false|this|of|in|typeof|instanceof|throw|try|catch|finally|async|await)\b/g },
];

/**
 * ソースコードに簡易シンタックスハイライトを適用して HTML 文字列を返す。
 * @param {string} source
 * @returns {string}
 */
function highlightSyntax(source) {
  // プレースホルダー方式でリテラル/コメントを保護してからキーワードを着色
  const placeholders = [];
  let s = source;

  // コメント・文字列を退避
  for (const { cls, re } of TOKEN_PATTERNS.slice(0, 2)) {
    s = s.replace(re, (m) => {
      const idx = placeholders.length;
      placeholders.push(`<span class="${cls}">${esc(m)}</span>`);
      return `\x00${idx}\x00`;
    });
  }

  // 数値・キーワードも同様にプレースホルダー退避（後続パターンが属性値にマッチするのを防ぐ）
  s = esc(s);
  for (const { cls, re } of TOKEN_PATTERNS.slice(2)) {
    s = s.replace(re, (_, g) => {
      const idx = placeholders.length;
      placeholders.push(`<span class="${cls}">${g}</span>`);
      return `\x00${idx}\x00`;
    });
  }

  // 全プレースホルダーを一括展開
  s = s.replace(/\x00(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]);

  return s;
}

// ── CodeView ─────────────────────────────────────────────────────────────────

export class CodeView {
  /** @type {HTMLElement} マウント先コンテナ */
  #container;

  /** @type {HTMLElement} 行を格納する要素 */
  #linesEl;

  /** @type {string} 現在のソースコード */
  #source = '';

  /** @type {number} 現在ハイライト中の行（1始まり, 0=なし） */
  #currentLine = 0;

  // ── 公開 API ──────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} container
   */
  init(container) {
    this.#container = container;

    this.#linesEl = document.createElement('div');
    this.#linesEl.className = 'cv-lines';
    this.#container.appendChild(this.#linesEl);
  }

  /**
   * ソースコードを設定して行を描画する。
   * @param {string} source
   */
  setSource(source) {
    this.#source = source;
    this.#currentLine = 0;
    this.#render();
  }

  /**
   * @param {import('../../core/debugger-adapter.js').AppState} state
   */
  update(state) {
    const ev = state.event;
    const newLine = ev?.loc?.line ?? 0;

    if (newLine === this.#currentLine) return;

    // 前の行のハイライトを外す
    if (this.#currentLine > 0) {
      this.#getLineEl(this.#currentLine)?.classList.remove('cv-line--active');
    }

    // 新しい行をハイライト
    this.#currentLine = newLine;
    if (newLine > 0) {
      const lineEl = this.#getLineEl(newLine);
      if (lineEl) {
        lineEl.classList.add('cv-line--active');
        lineEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }
  }

  reset() {
    this.#currentLine = 0;
    this.#linesEl.querySelectorAll('.cv-line--active')
      .forEach(el => el.classList.remove('cv-line--active'));
  }

  destroy() {
    this.#linesEl.remove();
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  #render() {
    const lines = this.#source.split('\n');
    const highlighted = highlightSyntax(this.#source).split('\n');

    const frag = document.createDocumentFragment();
    lines.forEach((_, i) => {
      const lineNo = i + 1;
      const row = document.createElement('div');
      row.className = 'cv-line';
      row.dataset.line = String(lineNo);

      const numEl = document.createElement('span');
      numEl.className = 'cv-line-num';
      numEl.textContent = String(lineNo);

      const codeEl = document.createElement('span');
      codeEl.className = 'cv-line-code';
      codeEl.innerHTML = highlighted[i] ?? '';

      row.appendChild(numEl);
      row.appendChild(codeEl);
      frag.appendChild(row);
    });

    this.#linesEl.innerHTML = '';
    this.#linesEl.appendChild(frag);
  }

  /**
   * @param {number} lineNo 1始まり
   * @returns {HTMLElement|null}
   */
  #getLineEl(lineNo) {
    return this.#linesEl.querySelector(`[data-line="${lineNo}"]`);
  }
}
