/**
 * subst-trace/index.js — 代入展開トレースビュー
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
 * アルゴリズム:
 *   1. 最初のユーザー定義関数呼び出し (CallExpression enter) を currentExpr に設定
 *   2. ReturnStatement enter ごとに:
 *      - 現在フレームのコール文字列（ex. "factorial(5)"）を computeReturnExpr の結果で置換
 *      - 新しい行を追加
 *   3. トップレベルの CallExpression exit で最終値を追加
 *
 * computeReturnExpr:
 *   ReturnStatement の引数ソーステキストを走査し:
 *   - Identifier exit → 変数値でテキスト範囲を置換
 *   - CallExpression enter → formatFrameLabel(frame) でテキスト範囲を置換、内側 skip
 *   右から左に適用して位置ずれを防ぐ。単一行 return のみ対応。
 */

import { BaseView }         from '../base-view.js';
import { formatFrameLabel } from '../../utils/format.js';

// ── ヘルパー ──────────────────────────────────────────────────────────────────

function isFunctionVal(v) {
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') {
    return v.__type__ === 'JSFunction' || v.__type__ === 'JSClass';
  }
  return false;
}

function fmtPlain(v, depth = 0) {
  if (v === undefined) return 'undefined';
  if (v === null)      return 'null';
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (isFunctionVal(v) || typeof v === 'function') return 'ƒ';
  if (Array.isArray(v)) {
    if (depth >= 3) return '[…]';
    if (v.length === 0) return '[]';
    const elems = v.slice(0, 6).map(x => fmtPlain(x, depth + 1)).join(', ');
    return '[' + elems + (v.length > 6 ? ', …' : '') + ']';
  }
  if (typeof v === 'object') {
    if (depth >= 3) return '{…}';
    const vals = Object.values(v).filter(x => !isFunctionVal(x) && typeof x !== 'function');
    if (vals.length === 0) return '{}';
    const items = vals.slice(0, 6).map(x => fmtPlain(x, depth + 1)).join(', ');
    return '{' + items + (vals.length > 6 ? ', …' : '') + '}';
  }
  return String(v);
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── トレース解析 ──────────────────────────────────────────────────────────────

/**
 * CallExpression enter から呼び出された関数フレーム（name, args）を返す。
 * enter の直後で callStack が 1 段深くなった最初のイベントから取得する。
 * ネイティブ関数など内部イベントがない場合は null。
 */
function getCallFrame(trace, enterIdx) {
  const outerLen = trace[enterIdx].callStack.length;
  const exitIdx  = trace[enterIdx].matchIdx;
  if (exitIdx == null || exitIdx < 0) return null;
  for (let i = enterIdx + 1; i <= exitIdx && i < trace.length; i++) {
    if (trace[i].callStack.length > outerLen) {
      const cs = trace[i].callStack;
      return cs[cs.length - 1];  // { name, args }
    }
  }
  return null;
}

/**
 * ReturnStatement enter 時点の return 引数式を評価済み文字列に変換する。
 *
 * 文字範囲の計算:
 *   loc.column は 1-indexed。end.column は 1-indexed inclusive。
 *   argText 内 0-indexed:
 *     start = (loc.column - 1) - argColStart
 *     end   = end.column - argColStart  (exclusive、= 0-indexed inclusive + 1)
 */
function computeReturnExpr(trace, returnEnterIdx, sourceLines) {
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

  const replacements = [];  // { start, end(exclusive), text } — argText 内 0-indexed

  let i = returnEnterIdx + 1;
  while (i < returnExitIdx && i < trace.length) {
    const inner = trace[i];

    // 同一行以外はスキップ（マルチライン return は非対応）
    if (inner.loc?.line !== returnLine) { i++; continue; }

    if (inner.phase === 'exit' && inner.nodeType === 'Identifier') {
      // 関数値（callee 識別子・function 変数）はスキップ
      if (!isFunctionVal(inner.value) && inner.end) {
        const start = (inner.loc.column - 1) - argColStart;
        const end   = inner.end.column - argColStart;
        if (start >= 0 && end > start && end <= argText.length) {
          replacements.push({ start, end, text: fmtPlain(inner.value) });
        }
      }
      i++;
    } else if (inner.phase === 'enter' && inner.nodeType === 'CallExpression') {
      // サブ呼び出し: name(evaluated_args) に置換して内側イベントをスキップ
      const frame  = getCallFrame(trace, i);
      const exitEv = trace[inner.matchIdx];
      if (frame && exitEv && exitEv.loc?.line === returnLine && exitEv.end) {
        const start = (inner.loc.column - 1) - argColStart;
        const end   = exitEv.end.column - argColStart;
        if (start >= 0 && end > start && end <= argText.length) {
          replacements.push({ start, end, text: formatFrameLabel(frame) });
        }
      }
      // matchIdx まで飛ばす（内側イベントをスキップ）
      i = (inner.matchIdx != null && inner.matchIdx >= 0 ? inner.matchIdx : i) + 1;
    } else {
      i++;
    }
  }

  if (replacements.length === 0) return argText;

  // 右から左へ適用（左側の位置は右の置換に影響されない）
  replacements.sort((a, b) => b.start - a.start);
  let result = argText;
  for (const r of replacements) {
    if (r.start >= 0 && r.end >= r.start && r.end <= result.length) {
      result = result.slice(0, r.start) + r.text + result.slice(r.end);
    }
  }
  return result;
}

/**
 * trace を走査して代入展開トレースの行リストを構築する。
 * @returns {{ traceIdx: number, lineNo: number|null, text: string,
 *             expandedText: string|null, expandedStart: number,
 *             callStrToReplace: string|null }[]}
 *   lineNo:          ReturnStatement の行番号（null = 初期コール行または最終値行）
 *   text:            ReturnStatement 行は展開後の式のみ（"→" なし）、それ以外は表示テキスト全体
 *   expandedText:    この行で置換によって展開された部分文字列（null = 置換なし）
 *   expandedStart:   text 内での expandedText の開始位置（-1 = なし）
 *   callStrToReplace: 次の行で置換される予定の呼び出し文字列（null = なし）
 */
function buildSubstitutionLines(trace, sourceLines) {
  const lines = [];
  let currentExpr = null;

  for (let i = 0; i < trace.length; i++) {
    const ev = trace[i];

    // ── 最初のユーザー定義関数呼び出しでトラッキング開始 ─────────────────
    if (ev.phase === 'enter' && ev.nodeType === 'CallExpression' && currentExpr === null) {
      const frame = getCallFrame(trace, i);
      if (frame) {
        const callStr = formatFrameLabel(frame);
        currentExpr = callStr;
        lines.push({ traceIdx: i, lineNo: null, text: callStr,
                     expandedText: null, expandedStart: -1, callStrToReplace: null });
      }
    }

    // ── ReturnStatement enter: 評価済み return 式で展開行を追加 ──────────
    if (ev.phase === 'enter' && ev.nodeType === 'ReturnStatement' && currentExpr !== null) {
      const cs           = ev.callStack;
      const currentFrame = cs?.[cs.length - 1];
      if (!currentFrame) continue;

      const callStrToReplace = formatFrameLabel(currentFrame);
      const replacePos = currentExpr.indexOf(callStrToReplace);
      if (replacePos < 0) continue;

      const returnExpr = computeReturnExpr(trace, i, sourceLines);
      if (returnExpr === null) continue;

      const newExpr = currentExpr.slice(0, replacePos) + returnExpr + currentExpr.slice(replacePos + callStrToReplace.length);
      if (newExpr === currentExpr) continue;  // 変化なし

      // 前の行に callStrToReplace を記録（元の項ハイライト用）
      if (lines.length > 0) {
        lines[lines.length - 1].callStrToReplace = callStrToReplace;
      }

      currentExpr = newExpr;
      lines.push({ traceIdx: i, lineNo: ev.loc?.line ?? null, text: newExpr,
                   expandedText: returnExpr, expandedStart: replacePos, callStrToReplace: null });
    }

    // ── トップレベルの CallExpression exit: 最終値を追加してリセット ─────
    if (ev.phase === 'exit' && ev.nodeType === 'CallExpression' && currentExpr !== null) {
      if ((ev.callStack?.length ?? 0) === 0 && ev.value !== undefined) {
        lines.push({ traceIdx: i, lineNo: null, text: '→ ' + fmtPlain(ev.value),
                     expandedText: null, expandedStart: -1, callStrToReplace: null });
        currentExpr = null;  // 次のトップレベル呼び出しに備えてリセット
      }
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
    const sourceLines = (builder.source ?? '').split('\n');
    return buildSubstitutionLines(builder.trace, sourceLines).length > 0;
  }

  init(container, builder) {
    this.#container = container;
    this.#activeIdx = -1;

    const sourceLines = (builder.source ?? '').split('\n');
    this.#lines = buildSubstitutionLines(builder.trace, sourceLines);

    if (this.#lines.length === 0) {
      container.innerHTML = '<div class="stx-wrap"><p class="stx-empty">No function calls detected</p></div>';
      this.#lineEls = [];
      return;
    }

    let html = '<div class="stx-wrap"><div class="stx-list">';
    for (let idx = 0; idx < this.#lines.length; idx++) {
      const line = this.#lines[idx];
      const { lineNo, text, expandedText, expandedStart, callStrToReplace } = line;

      // 展開ハイライト範囲（この行で新たに展開された部分）
      const expStart = expandedStart >= 0 && expandedText ? expandedStart : -1;
      const expEnd   = expStart >= 0 ? expStart + expandedText.length : -1;

      // 元の項ハイライト範囲（この行から次行を生成するために置換される呼び出し）
      let penStart = -1, penEnd = -1;
      if (callStrToReplace) {
        const pos = text.indexOf(callStrToReplace);
        if (pos >= 0) { penStart = pos; penEnd = pos + callStrToReplace.length; }
      }

      const exprHtml = buildLineHtml(text, expStart, expEnd, penStart, penEnd);
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
