/**
 * code-view/index.js — コードハイライトビュー
 *
 * 実行中のコードを行ごとに表示する。
 *
 * ハイライト 2 層:
 *   1. 行ハイライト (.cv-line--active)
 *      現在の TraceEvent が属する行全体に左ボーダー＋背景色を付ける。
 *
 *   2. 式ハイライト (.cv-expr-highlight)
 *      TraceEvent に loc (start) と end (end) の両方が揃っている場合、
 *      その文字範囲を絶対位置スパンで下地着色する。
 *      モノスペースフォントを前提に 1ch 単位で計算するため再レンダリング不要。
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

  // 数値・キーワードも同様にプレースホルダー退避
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

  /**
   * 式ハイライト用スパン要素の配列。
   * 複数行にまたがる式にも対応するため配列で管理する。
   * @type {HTMLElement[]}
   */
  #exprHighlightEls = [];

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
    this.#exprHighlightEls = [];
    this.#render();
  }

  /**
   * @param {import('../../core/debugger-adapter.js').AppState} state
   */
  update(state) {
    const ev      = state.event;
    const newLine = ev?.loc?.line ?? 0;

    // ── 1. 行ハイライト ────────────────────────────────────────────────────
    if (newLine !== this.#currentLine) {
      if (this.#currentLine > 0) {
        this.#getLineEl(this.#currentLine)?.classList.remove('cv-line--active');
      }
      this.#currentLine = newLine;
      if (newLine > 0) {
        const lineEl = this.#getLineEl(newLine);
        if (lineEl) {
          lineEl.classList.add('cv-line--active');
          lineEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      }
    }

    // ── 2. 式ハイライト ────────────────────────────────────────────────────
    this.#clearExprHighlight();
    if (ev?.loc && ev?.end) {
      this.#setExprHighlight(ev.loc, ev.end);
    }
  }

  reset() {
    this.#clearExprHighlight();
    this.#currentLine = 0;
    this.#linesEl.querySelectorAll('.cv-line--active')
      .forEach(el => el.classList.remove('cv-line--active'));
  }

  destroy() {
    this.#linesEl.remove();
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  #render() {
    const lines       = this.#source.split('\n');
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
   * 式ハイライトをすべて除去する。
   */
  #clearExprHighlight() {
    for (const el of this.#exprHighlightEls) el.remove();
    this.#exprHighlightEls = [];
  }

  /**
   * 指定した loc (start) ～ end の文字範囲を式ハイライトで着色する。
   *
   * loc / end は JSInterpreter が付与する位置情報:
   *   - line   : 1 始まり
   *   - column : 1 始まり（先頭文字が 1）
   *   - end.column は最後の文字の列（inclusive）
   *
   * @param {{ line: number, column: number }} loc   開始位置
   * @param {{ line: number, column: number }} end   終了位置
   */
  #setExprHighlight(loc, end) {
    if (loc.line === end.line) {
      // ── 単一行 ─────────────────────────────────────────────────
      const startCh = loc.column - 1;               // 0-based offset
      const length  = end.column - loc.column + 1;  // 文字数
      this.#addHighlightSpan(loc.line, startCh, length);
    } else {
      // ── 複数行 ─────────────────────────────────────────────────
      for (let line = loc.line; line <= end.line; line++) {
        if (line === loc.line) {
          // 開始行: loc.column から行末まで
          this.#addHighlightSpan(line, loc.column - 1, 9999);
        } else if (line === end.line) {
          // 終了行: 行頭から end.column まで
          this.#addHighlightSpan(line, 0, end.column);
        } else {
          // 中間行: 行全体
          this.#addHighlightSpan(line, 0, 9999);
        }
      }
    }
  }

  /**
   * 指定行の `.cv-line-code` に絶対配置の式ハイライトスパンを追加する。
   *
   * @param {number} lineNo     1 始まり
   * @param {number} startCh    0-based 文字オフセット（left = startCh * 1ch）
   * @param {number} lengthCh   文字数（width = lengthCh * 1ch）
   */
  #addHighlightSpan(lineNo, startCh, lengthCh) {
    const lineEl = this.#getLineEl(lineNo);
    if (!lineEl) return;
    const codeEl = lineEl.querySelector('.cv-line-code');
    if (!codeEl) return;

    const mark = document.createElement('span');
    mark.className   = 'cv-expr-highlight';
    mark.style.left  = `calc(${startCh} * 1ch)`;
    mark.style.width = `calc(${lengthCh} * 1ch)`;
    codeEl.appendChild(mark);
    this.#exprHighlightEls.push(mark);
  }

  /**
   * @param {number} lineNo 1始まり
   * @returns {HTMLElement|null}
   */
  #getLineEl(lineNo) {
    return this.#linesEl.querySelector(`[data-line="${lineNo}"]`);
  }
}
