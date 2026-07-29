/**
 * expr-trace/index.js — 式評価トレースビュー
 *
 * トップレベルの式（代入式・宣言初期化・if/while 条件・return 引数など）が
 * 評価される過程を，部分式の逐次置換で表示する。
 *
 *   a = 1 + 2 * 3   | a: 7
 *   a = 1 + 6       | a: 7
 *   a = 7           | a: 7
 *   7               | a: 7
 *
 * アルゴリズム:
 *   各 exit イベントで「ソース座標 → 評価済みテキスト」の置換リストを更新し，
 *   applySubstitutions で表示テキストを再計算。テキストが変化したときのみ行を追加。
 *   変数列は exitIdx（セクション末尾）の env スナップショットを全行で使用する。
 */

import { BaseView } from '../base-view.js';
import { esc }      from '../../utils/format.js';
import { t }        from '../../i18n.js';

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

const JS_KEYWORDS = new Set([
  'break','case','catch','class','const','continue','debugger','default',
  'delete','do','else','export','extends','false','finally','for','function',
  'if','import','in','instanceof','let','new','null','return','static',
  'super','switch','this','throw','true','try','typeof','undefined','var',
  'void','while','with','yield',
]);

/** createGlobalEnv で定義されている組み込みグローバル名 — 変数列に表示しない */
const GLOBAL_BUILTINS = new Set([
  'undefined','NaN','Infinity','Math','JSON','Date','parseInt','parseFloat',
  'isNaN','isFinite','Number','String','Boolean','Array','Object','Symbol',
  'Promise','Map','Set','WeakMap','WeakSet','Error','TypeError','RangeError',
  'RegExp','console',
]);

/** env スナップショット配列から変数値を検索 */
function getVarFromEnv(envFrames, name) {
  if (!Array.isArray(envFrames)) return undefined;
  for (const frame of envFrames) {
    if (Object.prototype.hasOwnProperty.call(frame, name)) return frame[name];
  }
  return undefined;
}

// ── テキスト置換 ──────────────────────────────────────────────────────────────

/**
 * 置換リストに新たな置換を追加する。
 * [srcStart, srcEnd) に内包される既存置換を除去してから追加（外側が内側を supersede）。
 */
function addSubstitution(subs, srcStart, srcEnd, text) {
  const filtered = subs.filter(s => !(s.start >= srcStart && s.end <= srcEnd));
  return [...filtered, { start: srcStart, end: srcEnd, text }];
}

/**
 * 置換リストをソースに適用して表示テキストを返す。
 * @param {string} srcText  ソース行テキスト（baseCol から始まる）
 * @param {Array}  subs     [{start, end, text}]（絶対列番号 0-indexed）
 * @param {number} baseCol  srcText が対応するソース列の開始位置（0-indexed abs）
 */
function applySubstitutions(srcText, subs, baseCol) {
  const sorted = [...subs].sort((a, b) => a.start - b.start);
  let result = '';
  let pos = baseCol;
  const limit = baseCol + srcText.length;
  for (const s of sorted) {
    if (s.start < pos || s.start >= limit) continue;
    result += srcText.slice(pos - baseCol, s.start - baseCol);
    result += s.text;
    pos = Math.min(s.end, limit);
  }
  result += srcText.slice(pos - baseCol);
  return result;
}

/**
 * ソース位置 srcPos が，置換適用後の displayText において何文字目に対応するかを返す。
 * atEnd=true のとき，範囲の「終端後」（exclusive end）の位置を返す。
 */
function srcPosToDispPos(subs, baseCol, srcPos, atEnd = false) {
  const sorted = [...subs].sort((a, b) => a.start - b.start);
  let dispPos = 0;
  let pos = baseCol;

  for (const s of sorted) {
    if (s.start < pos) continue;

    if (srcPos < s.start) {
      return dispPos + (srcPos - pos);
    }

    if (s.start > pos) dispPos += s.start - pos;
    pos = s.start;

    if (srcPos < s.end) {
      return atEnd ? dispPos + s.text.length : dispPos;
    }

    dispPos += s.text.length;
    pos = s.end;
  }

  return dispPos + (srcPos - pos);
}

/**
 * ソース範囲 [srcStart, srcEnd) → 表示テキスト範囲 { start, end } に変換。
 */
function srcRangeToDispRange(subs, baseCol, srcStart, srcEnd) {
  return {
    start: srcPosToDispPos(subs, baseCol, srcStart, false),
    end:   srcPosToDispPos(subs, baseCol, srcEnd,   true),
  };
}

// ── トレース解析 ──────────────────────────────────────────────────────────────

/**
 * 式評価トレースの変数列に表示すべき変数名リストを返す。
 *
 * 式テキストに登場する識別子のみを返す（関数値・JS キーワード・組み込みグローバルを除外）。
 * env 全変数を追加する拡張は行わない。
 */
function extractVarNames(exprText, trace, enterIdx, exitIdx) {
  const fnNames = new Set();
  const idxBound = Math.min(exitIdx, trace.length - 1);
  for (const idx of [enterIdx, idxBound]) {
    const ev = trace[idx];
    if (!ev?.env) continue;
    for (const frame of ev.env) {
      for (const [k, v] of Object.entries(frame)) {
        if (isFunctionVal(v)) fnNames.add(k);
      }
    }
  }

  const seen = new Set();
  const names = [];
  const re = /\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b/g;
  let m;
  while ((m = re.exec(exprText)) !== null) {
    const name = m[1];
    if (!seen.has(name) && !JS_KEYWORDS.has(name) && !GLOBAL_BUILTINS.has(name) && !fnNames.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }

  return names;
}

function buildEnvMap(varNames, envFrames) {
  const map = {};
  for (const name of varNames) {
    map[name] = getVarFromEnv(envFrames, name);
  }
  return map;
}

/**
 * ひとつの式のセクション行リストを構築する。
 *
 * @param {number}      lineNo        式が存在するソース行番号（1-indexed）
 * @param {number}      initColStart  式テキストのソース列開始（0-indexed abs）
 * @param {string}      displayPrefix 表示テキストの先頭に付ける文字列（例 "x = "）
 * @param {number|null} srcEndCol     式テキストのソース列終端（0-indexed abs exclusive）。
 *                                    null のときは行末まで使用。
 */
/**
 * @param {number|null} loopEnd ループ上限（exclusive）。null のとき exitIdx を使用。
 *                              exitIdx が内側の式 EXIT のとき loopEnd = exitIdx + 1 を渡すことで
 *                              その EXIT イベント自体もループに含められる。
 */
function buildSectionRows(trace, sourceLines, enterIdx, exitIdx, lineNo, initColStart, displayPrefix, srcEndCol = null, loopEnd = null) {
  const line     = sourceLines[lineNo - 1] ?? '';
  const endBound = srcEndCol !== null ? srcEndCol : line.length;
  const srcText  = line.slice(initColStart, endBound).replace(/;\s*$/, '').trimEnd();
  const outerCallDepth = trace[enterIdx].callDepth;
  const prefixLen = displayPrefix.length;

  const initDispText = displayPrefix + srcText;
  const varNames = extractVarNames(initDispText, trace, enterIdx, exitIdx);

  // Row 0: 評価開始時点（enterIdx）の env を使用
  const rows = [{
    traceIdx:          enterIdx,
    displayText:       initDispText,
    envMap:            buildEnvMap(varNames, trace[enterIdx]?.env ?? []),
    subs:              [],
    expandedDispRange: null,
    pendingDispRange:  null,
    nextSrcRange:      null,
  }];

  let subs = [];
  const bound = loopEnd ?? exitIdx;

  for (let i = enterIdx + 1; i < bound && i < trace.length; i++) {
    const ev = trace[i];
    if (ev.phase !== 'exit') continue;
    if (!ev.end) continue;
    if (ev.callDepth !== outerCallDepth) continue;
    if (ev.loc.line !== lineNo || ev.end.line !== lineNo) continue;
    if (isFunctionVal(ev.value)) continue;
    if (ev.value === undefined) continue;
    if (ev.nodeType === 'Literal' || ev.nodeType === 'TemplateLiteral') continue;

    const evSrcStart = ev.loc.column - 1;
    const evSrcEnd   = ev.end.column;

    if (evSrcStart < initColStart) continue;
    if (evSrcEnd > endBound) continue;

    const valueText  = fmtPlain(ev.value);
    const newSubs    = addSubstitution(subs, evSrcStart, evSrcEnd, valueText);
    const rawText    = applySubstitutions(srcText, newSubs, initColStart).replace(/;\s*$/, '').trimEnd();
    const newDisplay = displayPrefix + rawText;

    if (newDisplay === rows[rows.length - 1].displayText) {
      subs = newSubs;
      continue;
    }

    const expRaw = srcRangeToDispRange(newSubs, initColStart, evSrcStart, evSrcEnd);
    const expandedDispRange = {
      start: expRaw.start + prefixLen,
      end:   expRaw.end   + prefixLen,
    };

    rows[rows.length - 1].nextSrcRange = { start: evSrcStart, end: evSrcEnd };

    rows.push({
      traceIdx:          i,
      displayText:       newDisplay,
      envMap:            buildEnvMap(varNames, ev.env ?? []),  // その exit 時点の env
      subs:              newSubs,
      expandedDispRange,
      pendingDispRange:  null,
      nextSrcRange:      null,
    });
    subs = newSubs;
  }

  // pendingDispRange を後填め
  for (let k = 0; k < rows.length - 1; k++) {
    const nextSrc = rows[k].nextSrcRange;
    if (!nextSrc) continue;
    const penRaw = srcRangeToDispRange(rows[k].subs, initColStart, nextSrc.start, nextSrc.end);
    rows[k].pendingDispRange = {
      start: penRaw.start + prefixLen,
      end:   penRaw.end   + prefixLen,
    };
  }

  // 最終行は exitIdx の env に差し替え（2行以上のセクションのみ）
  // 1行のみの場合は enterIdx の env を保持し，評価前に値が表示されるのを防ぐ
  if (rows.length >= 2) {
    const exitEnv = trace[Math.min(exitIdx, trace.length - 1)]?.env ?? [];
    rows[rows.length - 1].envMap = buildEnvMap(varNames, exitEnv);
  }

  return { varNames, rows, enterIdx, exitIdx };
}

/**
 * trace を走査して式評価トレースのセクションリストを構築する。
 *
 * 対象ステートメント種別:
 *   - ExpressionStatement   → 内包する式
 *   - VariableDeclaration   → 初期化式（varName = init の形式で表示）
 *   - IfStatement           → test 式
 *   - WhileStatement        → test 式（イテレーションごとに 1 セクション）
 *   - ReturnStatement       → 引数式（return prefix 付き）
 */
function buildExpressionSections(trace, sourceLines) {
  const sections = [];

  for (let i = 0; i < trace.length; i++) {
    const ev = trace[i];
    if (ev.phase !== 'enter') continue;
    if (ev.matchIdx == null || ev.matchIdx < 0) continue;

    // ── ExpressionStatement ──────────────────────────────────────────────────
    if (ev.nodeType === 'ExpressionStatement') {
      const inner = trace[i + 1];
      if (!inner || inner.phase !== 'enter' || !inner.end) continue;
      if (inner.loc.line !== inner.end.line) continue;

      const lineNo       = inner.loc.line;
      const initColStart = inner.loc.column - 1;
      const srcEndCol    = inner.end.column;

      const sec = buildSectionRows(trace, sourceLines, i, ev.matchIdx, lineNo, initColStart, '', srcEndCol);
      if (sec.rows.length >= 2) sections.push(sec);

    // ── VariableDeclaration ──────────────────────────────────────────────────
    } else if (ev.nodeType === 'VariableDeclaration') {
      // interpreter は decl.init を直接 evaluate() するため VariableDeclarator
      // イベントは trace に存在しない。位置はソース正規表現で取得する。
      const declLine = sourceLines[ev.loc.line - 1] ?? '';
      const mm = declLine.slice(ev.loc.column - 1)
        .match(/^(?:let|const|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*/);
      if (!mm) continue;
      const varName      = mm[1];
      const lineNo       = ev.loc.line;
      const initColStart = ev.loc.column - 1 + mm[0].length;

      // 初期化式の end 位置をトレースイベントから探索（同行・同 callDepth の最初の enter）
      let srcEndCol = null;
      for (let j = i + 1; j < ev.matchIdx && j < trace.length; j++) {
        const t = trace[j];
        if (t.phase === 'enter' && t.end && t.callDepth === ev.callDepth &&
            t.loc.line === lineNo && t.end.line === lineNo) {
          srcEndCol = t.end.column;
          break;
        }
      }

      const sec = buildSectionRows(trace, sourceLines, i, ev.matchIdx, lineNo, initColStart, varName + ' = ', srcEndCol);
      if (sec.rows.length >= 1) sections.push(sec);

    // ── IfStatement (test 式) ────────────────────────────────────────────────
    } else if (ev.nodeType === 'IfStatement') {
      const testEv = trace[i + 1];
      if (!testEv || testEv.phase !== 'enter' || !testEv.end) continue;
      if (testEv.matchIdx == null) continue;
      if (testEv.loc.line !== testEv.end.line) continue;

      const lineNo       = testEv.loc.line;
      const initColStart = testEv.loc.column - 1;
      const srcEndCol    = testEv.end.column;

      // loopEnd = testEv.matchIdx + 1 でループに test の EXIT 自体を含める
      const sec = buildSectionRows(trace, sourceLines, i, testEv.matchIdx, lineNo, initColStart, '', srcEndCol,
        testEv.matchIdx + 1);
      if (sec.rows.length >= 2) sections.push(sec);

    // ── WhileStatement (test 式 × イテレーション数) ──────────────────────────
    } else if (ev.nodeType === 'WhileStatement') {
      // trace[i+1] = 最初のイテレーションの test 式 enter
      const firstTest = trace[i + 1];
      if (!firstTest || firstTest.phase !== 'enter' || !firstTest.end) continue;
      if (firstTest.loc.line !== firstTest.end.line) continue;
      if (firstTest.callDepth !== ev.callDepth) continue;

      const testLine     = firstTest.loc.line;
      const testColStart = firstTest.loc.column;
      const testColEnd   = firstTest.end.column;
      const initColStart = testColStart - 1;

      // whileStatement 全体の範囲内で同 loc の test enter を列挙
      for (let j = i + 1; j < ev.matchIdx && j < trace.length; j++) {
        const t = trace[j];
        if (t.phase !== 'enter') continue;
        if (!t.end || t.matchIdx == null) continue;
        if (t.loc.line !== testLine || t.loc.column !== testColStart) continue;
        if (t.end.column !== testColEnd) continue;
        if (t.callDepth !== ev.callDepth) continue;

        const sec = buildSectionRows(
          trace, sourceLines, j, t.matchIdx,
          testLine, initColStart, '', testColEnd,
          t.matchIdx + 1
        );
        if (sec.rows.length >= 2) sections.push(sec);
      }

    // ── ReturnStatement (引数式) ─────────────────────────────────────────────
    } else if (ev.nodeType === 'ReturnStatement') {
      const argEv = trace[i + 1];
      if (!argEv || argEv.phase !== 'enter' || !argEv.end) continue;
      if (argEv.matchIdx == null) continue;
      if (argEv.loc.line !== argEv.end.line) continue;

      const lineNo       = argEv.loc.line;
      const initColStart = argEv.loc.column - 1;
      const srcEndCol    = argEv.end.column;

      const sec = buildSectionRows(trace, sourceLines, i, argEv.matchIdx, lineNo, initColStart, '', srcEndCol,
        argEv.matchIdx + 1);
      if (sec.rows.length >= 2) sections.push(sec);

    // ── ForStatement (init / test × iteration / update × iteration) ──────────
    } else if (ev.nodeType === 'ForStatement') {
      const forEnd = ev.matchIdx;
      if (!forEnd) continue;

      // init の有無をソースで判定（"for (" の直後が ";" なら init なし）
      const forLine = sourceLines[ev.loc.line - 1] ?? '';
      const noInit  = /^for\s*\(\s*;/.test(forLine.slice(ev.loc.column - 1));

      let afterInit;
      if (noInit) {
        afterInit = i + 1;
      } else {
        const initEv = trace[i + 1];
        if (!initEv || initEv.matchIdx == null) continue;
        afterInit = initEv.matchIdx + 1;

        // 宣言でない bare-expression init（VariableDeclaration は外側ループが処理）
        if (initEv.phase === 'enter' && initEv.end &&
            initEv.nodeType !== 'VariableDeclaration' &&
            initEv.loc.line === initEv.end.line) {
          const s = buildSectionRows(
            trace, sourceLines, i, initEv.matchIdx,
            initEv.loc.line, initEv.loc.column - 1, '', initEv.end.column,
            initEv.matchIdx + 1
          );
          if (s.rows.length >= 1) sections.push(s);
        }
      }

      // test の位置を特定
      const testEv = trace[afterInit];
      if (!testEv || testEv.phase !== 'enter' || !testEv.end || testEv.matchIdx == null) continue;
      if (testEv.loc.line !== testEv.end.line) continue;
      if (testEv.callDepth !== ev.callDepth) continue;

      const testLine     = testEv.loc.line;
      const testColStart = testEv.loc.column;
      const testColEnd   = testEv.end.column;

      // update の位置: 最初の body 終了直後のイベント
      let updateLine = -1, updateColStart = -1, updateColEnd = -1;
      {
        const bodyEv = trace[testEv.matchIdx + 1];
        if (bodyEv && bodyEv.matchIdx != null) {
          const upEv = trace[bodyEv.matchIdx + 1];
          if (upEv && upEv.phase === 'enter' && upEv.end && upEv.matchIdx != null &&
              upEv.callDepth === ev.callDepth && upEv.loc.line === upEv.end.line &&
              // test と同じ loc でなければ update
              (upEv.loc.line !== testLine || upEv.loc.column !== testColStart)) {
            updateLine     = upEv.loc.line;
            updateColStart = upEv.loc.column;
            updateColEnd   = upEv.end.column;
          }
        }
      }

      // ForStatement 範囲内の test / update を列挙してセクション生成
      for (let j = afterInit; j < forEnd && j < trace.length; j++) {
        const t = trace[j];
        if (t.phase !== 'enter' || !t.end || t.matchIdx == null) continue;
        if (t.callDepth !== ev.callDepth) continue;
        if (t.loc.line !== t.end.line) continue;

        const isTest = t.loc.line === testLine && t.loc.column === testColStart &&
                       t.end.column === testColEnd;
        const isUpdate = updateColStart !== -1 &&
                         t.loc.line === updateLine && t.loc.column === updateColStart &&
                         t.end.column === updateColEnd;
        if (!isTest && !isUpdate) continue;

        const s = buildSectionRows(
          trace, sourceLines, j, t.matchIdx,
          t.loc.line, t.loc.column - 1, '', t.end.column,
          t.matchIdx + 1
        );
        if (s.rows.length >= 1) sections.push(s);
      }
    }
  }

  return sections;
}

// ── HTML 生成 ─────────────────────────────────────────────────────────────────

function buildExprHtml(text, expStart, expEnd, penStart, penEnd) {
  const hasExp = expStart >= 0 && expEnd > expStart && expEnd <= text.length;
  const hasPen = penStart >= 0 && penEnd > penStart && penEnd <= text.length;

  if (!hasExp && !hasPen) return esc(text);

  if (hasExp && hasPen) {
    if (penStart >= expStart && penEnd <= expEnd) {
      return esc(text.slice(0, expStart))
        + `<span class="xev-hl-expanded">`
        + esc(text.slice(expStart, penStart))
        + `<span class="xev-hl-pending">${esc(text.slice(penStart, penEnd))}</span>`
        + esc(text.slice(penEnd, expEnd))
        + `</span>`
        + esc(text.slice(expEnd));
    }
    const parts = [
      { start: expStart, end: expEnd, cls: 'xev-hl-expanded' },
      { start: penStart, end: penEnd, cls: 'xev-hl-pending' },
    ].sort((a, b) => a.start - b.start);

    let result = '', pos = 0;
    for (const p of parts) {
      if (p.start < pos) continue;
      result += esc(text.slice(pos, p.start));
      result += `<span class="${p.cls}">${esc(text.slice(p.start, p.end))}</span>`;
      pos = p.end;
    }
    result += esc(text.slice(pos));
    return result;
  }

  if (hasExp) {
    return esc(text.slice(0, expStart))
      + `<span class="xev-hl-expanded">${esc(text.slice(expStart, expEnd))}</span>`
      + esc(text.slice(expEnd));
  }

  return esc(text.slice(0, penStart))
    + `<span class="xev-hl-pending">${esc(text.slice(penStart, penEnd))}</span>`
    + esc(text.slice(penEnd));
}

function fmtEnvVal(v) {
  return v === undefined ? '—' : fmtPlain(v);
}

// ── ExprTrace ─────────────────────────────────────────────────────────────────

export class ExprTrace extends BaseView {
  #container  = null;
  #sections   = null;
  #sectionEls = null;   // セクションごとの <div.xev-section> 要素
  #rowsBySec  = null;   // rowsBySec[si] = [{ el, traceIdx, envMap, varTds }]
  #lastCursor = -1;
  #trace      = null;   // builder.trace への参照（update() でカーソル env を参照）

  init(container, builder) {
    this.#container  = container;
    this.#lastCursor = -1;
    this.#trace      = builder.trace;

    const sourceLines = (builder.source ?? '').split('\n');
    this.#sections = buildExpressionSections(builder.trace, sourceLines);

    if (this.#sections.length === 0) {
      container.innerHTML =
        `<div class="xev-wrap"><p class="xev-empty">${esc(t('exprtrace-empty'))}</p></div>`;
      this.#sectionEls = [];
      this.#rowsBySec  = [];
      return;
    }

    let html = '<div class="xev-wrap">';

    for (let si = 0; si < this.#sections.length; si++) {
      const { varNames, rows } = this.#sections[si];
      // 初期状態は全セクション非表示（update() が表示制御する）
      html += '<div class="xev-section xev-section--hidden"><table class="xev-table">';
      html += '<thead><tr>';
      html += `<th class="xev-th xev-col-expr">${esc(t('exprtrace-col-expr'))}</th>`;
      for (const name of varNames) {
        html += `<th class="xev-th xev-col-var">${esc(name)}</th>`;
      }
      html += '</tr></thead><tbody>';

      for (let ri = 0; ri < rows.length; ri++) {
        const { displayText, envMap, expandedDispRange, pendingDispRange } = rows[ri];

        const expStart = expandedDispRange?.start ?? -1;
        const expEnd   = expandedDispRange?.end   ?? -1;
        const penStart = pendingDispRange?.start  ?? -1;
        const penEnd   = pendingDispRange?.end    ?? -1;

        const exprHtml = buildExprHtml(displayText, expStart, expEnd, penStart, penEnd);

        html += `<tr class="xev-row" data-si="${si}" data-ri="${ri}">`;
        html += `<td class="xev-td xev-col-expr">${exprHtml}</td>`;
        for (const name of varNames) {
          const v   = envMap[name];
          const cls = v !== undefined ? ' xev-val--defined' : '';
          html += `<td class="xev-td xev-col-var${cls}">${esc(fmtEnvVal(v))}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table></div>';
    }
    html += '</div>';

    container.innerHTML = html;

    this.#sectionEls = [...container.querySelectorAll('.xev-section')];
    this.#rowsBySec  = this.#sections.map((sec, si) =>
      [...container.querySelectorAll(`.xev-row[data-si="${si}"]`)]
        .map((el, ri) => ({
          el,
          traceIdx: sec.rows[ri].traceIdx,
          envMap:   sec.rows[ri].envMap,
          varTds:   [...el.querySelectorAll('.xev-col-var')],
        }))
    );
  }

  update(state) {
    if (!this.#rowsBySec) return;
    const cursor = state.cursor;
    if (cursor === this.#lastCursor) return;
    this.#lastCursor = cursor;

    for (let si = 0; si < this.#sections.length; si++) {
      const { enterIdx, exitIdx, varNames } = this.#sections[si];
      const visible = cursor >= enterIdx && cursor <= exitIdx;
      this.#sectionEls[si].classList.toggle('xev-section--hidden', !visible);

      if (!visible) {
        for (const { el } of this.#rowsBySec[si]) {
          el.classList.remove('xev-row--past', 'xev-row--active');
        }
        continue;
      }

      // cursor 以下で最大 traceIdx を持つ行をアクティブに
      const rows = this.#rowsBySec[si];
      let activeRow = 0;
      for (let k = 0; k < rows.length; k++) {
        if (rows[k].traceIdx <= cursor) activeRow = k;
        else break;
      }

      const cursorEnv = this.#trace?.[cursor]?.env ?? [];

      for (let k = 0; k < rows.length; k++) {
        rows[k].el.classList.toggle('xev-row--past',   k < activeRow);
        rows[k].el.classList.toggle('xev-row--active', k === activeRow);

        // アクティブ行はカーソル位置の env をリアルタイムで反映
        // 過去・未来行は事前計算 envMap を表示
        const tds = rows[k].varTds;
        if (tds?.length) {
          for (let vi = 0; vi < varNames.length; vi++) {
            const v = k === activeRow
              ? getVarFromEnv(cursorEnv, varNames[vi])
              : rows[k].envMap[varNames[vi]];
            const isDefined = v !== undefined;
            tds[vi].textContent = isDefined ? fmtPlain(v) : '—';
            tds[vi].classList.toggle('xev-val--defined', isDefined);
          }
        }
      }
      rows[activeRow]?.el.scrollIntoView({ block: 'nearest' });
    }
  }

  reset() {
    for (const el of this.#sectionEls ?? []) {
      el.classList.add('xev-section--hidden');
    }
    for (const rows of this.#rowsBySec ?? []) {
      for (const { el } of rows) {
        el.classList.remove('xev-row--past', 'xev-row--active');
      }
    }
    this.#lastCursor = -1;
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#sectionEls = null;
    this.#rowsBySec  = null;
    this.#sections   = null;
    this.#trace      = null;
  }
}
