/**
 * subst-trace/index.js — 置換トレースビュー
 *
 * 再帰関数呼び出しを「置換モデル」で逐次展開して表示する。
 *
 *   factorial(5)
 *   → 5 * factorial(4)
 *   → 5 * 4 * factorial(3)
 *   → ...
 *   → 5 * 4 * 3 * 2 * 1
 *   → 120
 *
 * 別の関数の引数になった呼び出しは、引数の値が決まるまで展開しない。
 *
 *   f(2)
 *   → twice(f(1))
 *   → twice(twice(f(0)))
 *   → twice(twice(1))
 *   → twice(2)             引数の値が決まって twice に入った
 *   → ...
 *
 * アルゴリズム（ADR-051）:
 *   1. 最初のユーザー定義関数呼び出し (CallExpression enter) を式の木の根に設定
 *   2. 関数に入ったとき: 引数に呼び出しを含むノードを、引数の値で書き直す
 *   3. ReturnStatement enter ごとに: 実行中の呼び出しのノードを computeReturnExpr の結果で置換
 *   4. 根の CallExpression exit で最終値を追加
 *
 * computeReturnExpr:
 *   ReturnStatement の引数ソーステキストを走査し（renderSource）:
 *   - Identifier exit → 変数値でテキスト範囲を置換
 *   - ユーザー定義関数の CallExpression enter → 呼び出しノードでテキスト範囲を置換、内側 skip
 *   単一行 return のみ対応。
 */

import { BaseView }         from '../base-view.js';
import { BUILTIN_NAMES, formatFrameLabel, formatPlain as fmtPlain } from '../../utils/format.js';
import { t }                from '../../i18n.js';

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function isFunctionVal(v) {
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') {
    return v.__type__ === 'JSFunction' || v.__type__ === 'JSClass';
  }
  return false;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── トレース解析 ──────────────────────────────────────────────────────────────

/** CallExpression enter がユーザー定義関数の呼び出しかを、callee の評価結果で判定する */
function isUserCall(trace, enterIdx) {
  const calleeExit = trace[trace[enterIdx + 1]?.matchIdx];
  const v = calleeExit?.value;
  return !!v && typeof v === 'object' && isFunctionVal(v);
}

/**
 * CallExpression enter から呼び出された関数フレーム（name, args）を返す。
 * 引数の中の呼び出しのフレームと取り違えないよう、呼び出しの exit の直前（＝本体の最後）から取得する。
 * exit がない（実行が途中で止まった）場合は、callStack が 1 段深くなった最初のイベントから取得する。
 * ネイティブ関数など内部イベントがない場合は null。
 */
function getCallFrame(trace, enterIdx) {
  const outerLen = trace[enterIdx].callStack.length;
  const exitIdx  = trace[enterIdx].matchIdx;
  if (exitIdx == null || exitIdx < 0) return null;
  if (exitIdx < trace.length) {
    const cs = trace[exitIdx - 1]?.callStack;
    return cs?.length > outerLen ? cs[outerLen] : null;
  }
  for (let i = enterIdx + 1; i < trace.length; i++) {
    if (trace[i].callStack.length > outerLen) return trace[i].callStack[outerLen];
  }
  return null;
}

// ── 式の木 ────────────────────────────────────────────────────────────────────
// 式は「文字列と呼び出しノードの配列」で持つ。呼び出しノードは CallExpression enter の
// trace 位置（enterIdx）と結びつくので、同じ見た目の呼び出しが複数あっても取り違えない。
//   square(2 * fastPower(2, 4))
//   → [ { enterIdx, parts: ['square(', '2 * ', { enterIdx, parts: ['fastPower(2, 4)'] }, ')'] } ]

function serialize(parts) {
  return parts.map(p => (typeof p === 'string' ? p : serialize(p.parts))).join('');
}

/** parts の中の node の開始位置（serialize した文字列での位置）を返す。ない場合は -1 */
function offsetOf(parts, node) {
  let pos = 0;
  for (const p of parts) {
    if (p === node) return pos;
    if (typeof p !== 'string') {
      const inner = offsetOf(p.parts, node);
      if (inner >= 0) return pos + inner;
    }
    pos += (typeof p === 'string' ? p : serialize(p.parts)).length;
  }
  return -1;
}

/**
 * 呼び出しの式を作り、nodes に登録して返す。
 * 引数の中にユーザー定義関数の呼び出しがあるときは、その呼び出しを子に持つ
 * （外側の呼び出しは、引数の値が決まるまで展開できない）。
 */
function buildCall(trace, enterIdx, lineText, nodes) {
  const ev     = trace[enterIdx];
  const colStart = ev.loc.column - 1;
  const argFrom  = (trace[enterIdx + 1]?.matchIdx ?? enterIdx) + 1;
  const argTo    = Math.min(ev.matchIdx ?? trace.length, trace.length);
  const text     = lineText.slice(colStart, ev.end.column);
  const parts    = renderSource(trace, argFrom, argTo, ev.loc.line, colStart, text, lineText, nodes);
  const frame    = getCallFrame(trace, enterIdx);
  const hasChild = parts.some(p => typeof p !== 'string');
  const node     = { enterIdx, parts: hasChild || !frame ? parts : [formatFrameLabel(frame)] };
  nodes.set(enterIdx, node);
  return node;
}

/**
 * ソースの text（colStart 列から始まる）を、trace[from, to) のイベントで評価済みの式に変換する。
 * - Identifier exit → 変数値で置換（関数値・組み込みオブジェクトはそのまま）
 * - ユーザー定義関数の CallExpression enter → 呼び出しノードで置換し、内側を飛ばす
 * - ネイティブ関数の呼び出しは、中へ進んで引数の変数を置換する
 * 単一行のみ対応。
 *
 * 文字範囲の計算: loc.column は 1-indexed、end.column は 1-indexed inclusive。
 */
function renderSource(trace, from, to, lineNo, colStart, text, lineText, nodes) {
  const baseLen = trace[from - 1]?.callStack?.length ?? 0;
  const replacements = [];  // { start, end(exclusive), part } — text 内 0-indexed

  let i = from;
  while (i < to && i < trace.length) {
    const inner = trace[i];
    if (inner.callStack.length > baseLen) break;  // 呼び出された関数の本体に入った

    // 同一行以外はスキップ（マルチライン return は非対応）
    if (inner.loc?.line !== lineNo) { i++; continue; }

    if (inner.phase === 'exit' && inner.nodeType === 'Identifier') {
      const start = (inner.loc.column - 1) - colStart;
      const end   = inner.end ? inner.end.column - colStart : -1;
      if (!isFunctionVal(inner.value) && start >= 0 && end > start && end <= text.length
          && !BUILTIN_NAMES.has(text.slice(start, end))) {
        replacements.push({ start, end, part: fmtPlain(inner.value) });
      }
      i++;
    } else if (inner.phase === 'enter' && inner.nodeType === 'CallExpression' && isUserCall(trace, i)) {
      const start = (inner.loc.column - 1) - colStart;
      const end   = inner.end?.line === lineNo ? inner.end.column - colStart : -1;
      if (start >= 0 && end > start && end <= text.length) {
        replacements.push({ start, end, part: buildCall(trace, i, lineText, nodes) });
      }
      // matchIdx まで飛ばす（内側イベントをスキップ）
      i = (inner.matchIdx != null && inner.matchIdx >= 0 ? inner.matchIdx : i) + 1;
    } else {
      i++;
    }
  }

  replacements.sort((a, b) => a.start - b.start);
  const parts = [];
  let pos = 0;
  for (const r of replacements) {
    if (r.start < pos) continue;
    if (r.start > pos) parts.push(text.slice(pos, r.start));
    parts.push(r.part);
    pos = r.end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return parts;
}

/**
 * ReturnStatement enter 時点の return 引数式を評価済みの式（parts）に変換する。
 * 引数がない・単一行でないなど変換できない場合は null。
 */
function computeReturnExpr(trace, returnEnterIdx, sourceLines, nodes) {
  const ev = trace[returnEnterIdx];
  if (ev.nodeType !== 'ReturnStatement') return null;

  const returnExitIdx = ev.matchIdx;
  if (returnExitIdx == null || returnExitIdx < 0) return null;

  const returnLine = ev.loc?.line;
  if (!returnLine) return null;

  const line    = sourceLines[returnLine - 1] ?? '';
  const retCol0 = ev.loc.column - 1;          // 0-indexed: 'r' of "return"
  const retStr  = line.slice(retCol0);
  const m       = retStr.match(/^return\s*/);
  if (!m) return null;

  const argColStart = retCol0 + m[0].length;  // 0-indexed: return 引数の開始位置
  const argText     = line.slice(argColStart).replace(/;\s*$/, '').trimEnd();
  if (!argText) return null;

  return renderSource(trace, returnEnterIdx + 1, returnExitIdx, returnLine, argColStart, argText, line, nodes);
}

/** 文字列のうち、括弧の外にある演算子を返す */
function topLevelOperators(text) {
  const ops = [];
  let depth = 0;
  for (const m of text.matchAll(/"(?:[^"\\]|\\.)*"|[([{]|[)\]}]|&&|\|\||[<>=!]=+|[-+*/%<>?]/g)) {
    if ('([{'.includes(m[0])) depth++;
    else if (')]}'.includes(m[0])) depth--;
    else if (depth === 0 && m[0][0] !== '"') ops.push(m[0]);
  }
  return ops;
}

/**
 * 呼び出しを returnExpr に置き換えるとき、計算の順番が変わらないよう括弧が要るかを判定する。
 * 2 * f(1) の f(1) を n + 1 に置き換えるなら括弧が要る。2 * f(1) の f(1) を n * 2 に置き換えるなら
 * 要らない（同じ + どうし、* どうしは括弧なしで並べる）。
 */
function needsParens(before, after, returnExpr) {
  const ops = topLevelOperators(returnExpr);
  if (ops.length === 0) return false;
  const left  = before.trimEnd().match(/(&&|\|\||[<>=!]=+|[-+*/%<>?:])$/)?.[1];
  const right = after.trimStart().match(/^(&&|\|\||[<>=!]=+|[-+*/%<>?:])/)?.[1];
  for (const op of [left, right]) {
    if (op === undefined) continue;
    if ((op !== '+' && op !== '*') || ops.some(o => o !== op)) return true;
  }
  return false;
}

/**
 * trace を走査して置換トレースの行リストを構築する。
 * @returns {{ traceIdx: number, lineNo: number|null, text: string,
 *             expandedText: string|null, expandedStart: number,
 *             pendingStart: number, pendingEnd: number }[]}
 *   lineNo:        ReturnStatement の行番号（null = 初期コール行または最終値行）
 *   text:          ReturnStatement 行は展開後の式のみ（"→" なし）、それ以外は表示テキスト全体
 *   expandedText:  この行で置換によって展開された部分文字列（null = 置換なし）
 *   expandedStart: text 内での expandedText の開始位置（-1 = なし）
 *   pendingStart / pendingEnd: 次の行で置換される呼び出しの範囲（-1 = なし）
 */
export function buildSubstitutionLines(trace, sourceLines) {
  const lines = [];
  let root  = null;       // 追跡中の式（parts）
  let nodes = new Map();  // enterIdx → 呼び出しノード
  let rootEnterIdx = -1;
  const open = [];        // 実行中の CallExpression enter の位置
  let prevDepth = 0;

  /** node の中身を newParts に置き換えて、新しい行を追加する */
  const replaceNode = (node, newParts, traceIdx, lineNo) => {
    const start  = offsetOf(root, node);
    const before = serialize(node.parts);
    if (lines.length > 0) {
      lines[lines.length - 1].pendingStart = start;
      lines[lines.length - 1].pendingEnd   = start + before.length;
    }
    node.parts = newParts;
    const expandedText = serialize(newParts);
    lines.push({ traceIdx, lineNo, text: serialize(root), expandedText, expandedStart: start,
                 pendingStart: -1, pendingEnd: -1 });
  };

  for (let i = 0; i < trace.length; i++) {
    const ev    = trace[i];
    const depth = ev.callStack?.length ?? 0;

    // ── 最初のユーザー定義関数呼び出しでトラッキング開始 ─────────────────
    if (ev.phase === 'enter' && ev.nodeType === 'CallExpression' && root === null
        && ev.end?.line === ev.loc?.line && isUserCall(trace, i)) {
      nodes = new Map();
      const node = buildCall(trace, i, sourceLines[ev.loc.line - 1] ?? '', nodes);
      root = [node];
      rootEnterIdx = i;
      lines.push({ traceIdx: i, lineNo: null, text: serialize(root),
                   expandedText: null, expandedStart: -1, pendingStart: -1, pendingEnd: -1 });
    }

    if (root !== null && ev.nodeType === 'CallExpression') {
      if (ev.phase === 'enter') open.push(i);
      else {
        const enterIdx = ev.matchIdx;
        while (open.length > 0 && open.pop() !== enterIdx) { /* 例外で exit のない呼び出しを捨てる */ }
      }
    }

    // ── 関数に入った: 引数の値が決まったので、呼び出しを引数の値で書き直す ──
    if (root !== null && depth > prevDepth) {
      const enterIdx = open[open.length - 1];
      const node     = nodes.get(enterIdx);
      const frame    = ev.callStack[depth - 1];
      if (node && frame) {
        const label = formatFrameLabel(frame);
        if (serialize(node.parts) !== label) {
          replaceNode(node, [label], i, trace[enterIdx].loc?.line ?? null);
        }
      }
    }
    prevDepth = depth;

    // ── ReturnStatement enter: 評価済み return 式で展開行を追加 ──────────
    if (ev.phase === 'enter' && ev.nodeType === 'ReturnStatement' && root !== null) {
      const node = nodes.get(open[open.length - 1]);
      if (!node) continue;

      const returnExpr = computeReturnExpr(trace, i, sourceLines, nodes);
      if (returnExpr === null) continue;

      const text  = serialize(root);
      const start = offsetOf(root, node);
      const after = start + serialize(node.parts).length;
      const newParts = needsParens(text.slice(0, start), text.slice(after), serialize(returnExpr))
        ? ['(', ...returnExpr, ')']
        : returnExpr;
      if (serialize(newParts) === serialize(node.parts)) continue;  // 変化なし

      replaceNode(node, newParts, i, ev.loc?.line ?? null);
    }

    // ── トップレベルの CallExpression exit: 最終値を追加してリセット ─────
    if (ev.phase === 'exit' && ev.nodeType === 'CallExpression' && root !== null
        && ev.matchIdx === rootEnterIdx) {
      if (ev.value !== undefined) {
        lines.push({ traceIdx: i, lineNo: null, text: '→ ' + fmtPlain(ev.value),
                     expandedText: null, expandedStart: -1, pendingStart: -1, pendingEnd: -1 });
      }
      root = null;  // 次のトップレベル呼び出しに備えてリセット
      open.length = 0;
    }
  }

  return lines;
}

/**
 * 展開ハイライト（stx-hl-expanded）と元の項ハイライト（stx-hl-pending）を
 * 含む HTML 文字列を生成する。
 *
 * pending が expanded の中に含まれる場合はネストした span を生成する。
 * それ以外は独立した span を生成する。
 * 有効範囲外（-1）の場合はプレーンテキストのみ返す。
 */
function buildLineHtml(text, expStart, expEnd, penStart, penEnd) {
  const hasExp = expStart >= 0 && expEnd > expStart && expEnd <= text.length;
  const hasPen = penStart >= 0 && penEnd > penStart && penEnd <= text.length;

  if (!hasExp && !hasPen) return esc(text);

  if (hasExp && hasPen) {
    // pending が expanded 内に完全に含まれる（最頻ケース）
    if (penStart >= expStart && penEnd <= expEnd) {
      return esc(text.slice(0, expStart))
        + `<span class="stx-hl-expanded">`
        + esc(text.slice(expStart, penStart))
        + `<span class="stx-hl-pending">${esc(text.slice(penStart, penEnd))}</span>`
        + esc(text.slice(penEnd, expEnd))
        + `</span>`
        + esc(text.slice(expEnd));
    }
    // 重なりなし: expanded と pending を別々にマーク
    const parts = [
      { start: expStart, end: expEnd, cls: 'stx-hl-expanded' },
      { start: penStart, end: penEnd, cls: 'stx-hl-pending' },
    ].sort((a, b) => a.start - b.start);

    let result = '';
    let pos = 0;
    for (const p of parts) {
      if (p.start < pos) continue;  // 重複スキップ
      result += esc(text.slice(pos, p.start));
      result += `<span class="${p.cls}">${esc(text.slice(p.start, p.end))}</span>`;
      pos = p.end;
    }
    result += esc(text.slice(pos));
    return result;
  }

  if (hasExp) {
    return esc(text.slice(0, expStart))
      + `<span class="stx-hl-expanded">${esc(text.slice(expStart, expEnd))}</span>`
      + esc(text.slice(expEnd));
  }

  // hasPen のみ
  return esc(text.slice(0, penStart))
    + `<span class="stx-hl-pending">${esc(text.slice(penStart, penEnd))}</span>`
    + esc(text.slice(penEnd));
}

// ── SubstTrace ────────────────────────────────────────────────────────────────

export class SubstTrace extends BaseView {
  #container = null;
  #lineEls   = null;
  #lines     = null;
  #activeIdx = -1;

  static hasContent(builder) {
    // 行は最初のユーザー定義関数の呼び出しで始まるので、全行を作らなくても判定できる
    return builder.trace.some((ev, i) => ev.phase === 'enter' && ev.nodeType === 'CallExpression'
      && ev.end?.line === ev.loc?.line && isUserCall(builder.trace, i));
  }

  init(container, builder) {
    this.#container = container;
    this.#activeIdx = -1;

    const sourceLines = (builder.source ?? '').split('\n');
    this.#lines = buildSubstitutionLines(builder.trace, sourceLines);

    if (this.#lines.length === 0) {
      container.innerHTML = `<div class="stx-wrap"><p class="stx-empty">${t('subst-empty')}</p></div>`;
      this.#lineEls = [];
      return;
    }

    let html = '<div class="stx-wrap"><div class="stx-list">';
    for (let idx = 0; idx < this.#lines.length; idx++) {
      const line = this.#lines[idx];
      const { lineNo, text, expandedText, expandedStart, pendingStart, pendingEnd } = line;

      // 展開ハイライト範囲（この行で新たに展開された部分）
      const expStart = expandedStart >= 0 && expandedText ? expandedStart : -1;
      const expEnd   = expStart >= 0 ? expStart + expandedText.length : -1;

      // 元の項ハイライト範囲（この行から次行を生成するために置換される呼び出し）
      const exprHtml = buildLineHtml(text, expStart, expEnd, pendingStart, pendingEnd);
      const inner = lineNo != null
        ? `<span class="stx-lineno">Line ${lineNo}</span><span class="stx-arrow"> → </span>${exprHtml}`
        : exprHtml;
      html += `<div class="stx-line" data-idx="${idx}">${inner}</div>`;
    }
    html += '</div></div>';
    container.innerHTML = html;
    this.#lineEls = [...container.querySelectorAll('.stx-line')];
  }

  update(state) {
    if (!this.#lineEls || !this.#lines) return;
    const cursor = state.cursor;

    // cursor 以下の最大 traceIdx を持つ行を求める
    let newIdx = 0;
    for (let i = 0; i < this.#lines.length; i++) {
      if (this.#lines[i].traceIdx <= cursor) newIdx = i;
      else break;
    }

    if (newIdx === this.#activeIdx) return;

    // past / active / future の状態を一括更新
    for (let k = 0; k < this.#lineEls.length; k++) {
      this.#lineEls[k].classList.toggle('stx-line--past',   k < newIdx);
      this.#lineEls[k].classList.toggle('stx-line--active', k === newIdx);
    }
    this.#lineEls[newIdx]?.scrollIntoView({ block: 'nearest' });
    this.#activeIdx = newIdx;
  }

  reset() {
    for (const el of this.#lineEls ?? []) {
      el.classList.remove('stx-line--past', 'stx-line--active');
    }
    this.#activeIdx = -1;
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#lineEls   = null;
    this.#lines     = null;
  }
}
