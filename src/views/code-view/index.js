/**
 * code-view/index.js — コードハイライトビュー
 *
 * ハイライト 3 層:
 *   1. 行ハイライト (.cv-line--active)
 *      現在の TraceEvent が属する行全体に左ボーダー＋背景を付ける。
 *
 *   2. 式ハイライト (.cv-expr-highlight)
 *      TraceEvent に loc + end が両方揃う式ノードの文字範囲をオレンジで着色。
 *      calc(N * 1ch) でモノスペースフォントの文字幅を利用。
 *
 *   3. 呼び出し元ハイライト (.cv-callsite-highlight)
 *      関数の内部を実行中（callStack.length > 0）のとき、
 *      その関数を呼び出した CallExpression をパープルで着色する。
 *      → 「どこから呼ばれたか」を一目で把握できる。
 */

/** HTML エスケープ */
function esc(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const TOKEN_PATTERNS = [
  { cls: 'tok-comment', re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g },
  { cls: 'tok-string',  re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g },
  { cls: 'tok-number',  re: /\b(\d+(?:\.\d+)?)\b/g },
  { cls: 'tok-keyword', re: /\b(function|return|if|else|while|for|let|const|var|new|class|extends|import|export|break|continue|null|undefined|true|false|this|of|in|typeof|instanceof|throw|try|catch|finally|async|await)\b/g },
];

function highlightSyntax(source) {
  const placeholders = [];
  let s = source;

  for (const { cls, re } of TOKEN_PATTERNS.slice(0, 2)) {
    s = s.replace(re, (m) => {
      const idx = placeholders.length;
      placeholders.push(`<span class="${cls}">${esc(m)}</span>`);
      return `\x00${idx}\x00`;
    });
  }

  s = esc(s);
  for (const { cls, re } of TOKEN_PATTERNS.slice(2)) {
    s = s.replace(re, (_, g) => {
      const idx = placeholders.length;
      placeholders.push(`<span class="${cls}">${g}</span>`);
      return `\x00${idx}\x00`;
    });
  }

  s = s.replace(/\x00(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]);
  return s;
}

// ── CodeView ─────────────────────────────────────────────────────────────────

export class CodeView {
  /** @type {HTMLElement} */
  #container;

  /** @type {HTMLElement} */
  #linesEl;

  /** @type {string} */
  #source = '';

  /** @type {number} 現在ハイライト中の行（1始まり, 0=なし） */
  #currentLine = 0;

  /**
   * 式ハイライト用スパン要素（複数行対応のため配列）
   * @type {HTMLElement[]}
   */
  #exprHighlightEls = [];

  /**
   * 呼び出し元ハイライト用スパン要素
   * @type {HTMLElement[]}
   */
  #callSiteHighlightEls = [];

  /**
   * CallExpression.enter の loc → end のマップ。
   * キー: "${line}:${column}"（呼び出し元の start）
   * 値: end 位置 { line, column }
   * @type {Map<string, {line:number, column:number}>}
   */
  #callSiteEndMap = new Map();

  // ── 公開 API ──────────────────────────────────────────────────────────────

  /** @param {HTMLElement} container */
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
    this.#callSiteHighlightEls = [];
    this.#render();
  }

  /**
   * トレース配列を受け取り、CallExpression の位置→end マップを構築する。
   * app.js の 'ready' ハンドラで adapter.getTrace() を渡す。
   * @param {Object[]} trace
   */
  setTrace(trace) {
    this.#callSiteEndMap.clear();
    if (!trace) return;
    for (const ev of trace) {
      if (ev.nodeType === 'CallExpression' && ev.phase === 'enter'
          && ev.loc && ev.end) {
        const key = `${ev.loc.line}:${ev.loc.column}`;
        // 同じ位置に複数の呼び出しがある場合は上書き（どの呼び出しも同じ範囲なので問題なし）
        this.#callSiteEndMap.set(key, ev.end);
      }
    }
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

    // ── 2. 式ハイライト（評価中の式の文字範囲）────────────────────────────
    this.#clearExprHighlight();
    if (ev?.loc && ev?.end) {
      this.#setHighlight(ev.loc, ev.end, 'cv-expr-highlight', this.#exprHighlightEls);
    }

    // ── 3. 呼び出し元ハイライト ────────────────────────────────────────────
    this.#clearCallSiteHighlight();
    const callStack = state.callStack;
    if (callStack && callStack.length > 0) {
      // callStack[last] が最内側フレーム（push 順: [0]=最外側, [last]=最内側）
      const topFrame = callStack[callStack.length - 1];
      if (topFrame?.loc) {
        const key = `${topFrame.loc.line}:${topFrame.loc.column}`;
        const end = this.#callSiteEndMap.get(key);
        if (end) {
          this.#setHighlight(
            topFrame.loc, end,
            'cv-callsite-highlight', this.#callSiteHighlightEls
          );
        }
      }
    }
  }

  reset() {
    this.#clearExprHighlight();
    this.#clearCallSiteHighlight();
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
      const row    = document.createElement('div');
      row.className  = 'cv-line';
      row.dataset.line = String(lineNo);

      const numEl  = document.createElement('span');
      numEl.className   = 'cv-line-num';
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

  // ── ハイライト共通 ────────────────────────────────────────────────────────

  /**
   * loc (start) ～ end の文字範囲を指定クラスのスパンでハイライトし、
   * 生成したスパン要素を storage 配列に push する。
   *
   * @param {{ line:number, column:number }} loc
   * @param {{ line:number, column:number }} end
   * @param {string}        cls      スパンの className
   * @param {HTMLElement[]} storage  生成スパンを追跡する配列
   */
  #setHighlight(loc, end, cls, storage) {
    if (loc.line === end.line) {
      const startCh = loc.column - 1;
      const length  = end.column - loc.column + 1;
      this.#addHighlightSpan(loc.line, startCh, length, cls, storage);
    } else {
      for (let line = loc.line; line <= end.line; line++) {
        if      (line === loc.line) this.#addHighlightSpan(line, loc.column - 1, 9999, cls, storage);
        else if (line === end.line) this.#addHighlightSpan(line, 0, end.column, cls, storage);
        else                        this.#addHighlightSpan(line, 0, 9999, cls, storage);
      }
    }
  }

  /**
   * @param {number}        lineNo   1始まり
   * @param {number}        startCh  0-based 文字オフセット
   * @param {number}        lengthCh 文字数
   * @param {string}        cls
   * @param {HTMLElement[]} storage
   */
  #addHighlightSpan(lineNo, startCh, lengthCh, cls, storage) {
    const lineEl = this.#getLineEl(lineNo);
    if (!lineEl) return;
    const codeEl = lineEl.querySelector('.cv-line-code');
    if (!codeEl) return;

    const mark = document.createElement('span');
    mark.className   = cls;
    mark.style.left  = `calc(${startCh} * 1ch)`;
    mark.style.width = `calc(${lengthCh} * 1ch)`;
    codeEl.appendChild(mark);
    storage.push(mark);
  }

  #clearExprHighlight() {
    for (const el of this.#exprHighlightEls) el.remove();
    this.#exprHighlightEls = [];
  }

  #clearCallSiteHighlight() {
    for (const el of this.#callSiteHighlightEls) el.remove();
    this.#callSiteHighlightEls = [];
  }

  /** @param {number} lineNo 1始まり */
  #getLineEl(lineNo) {
    return this.#linesEl.querySelector(`[data-line="${lineNo}"]`);
  }
}
