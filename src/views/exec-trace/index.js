/**
 * exec-trace/index.js — 実行順トレース表
 *
 * 行   = 文の実行ごとの実行ステップ（実行順）。同じ文の実行に属する連続した humanStep
 *        （`console.log(x);` の ExpressionStatement enter と CallExpression exit など）は
 *        1 行にまとめ、値はその最後の humanStep 時点（文の実行後）を表示する（buildExecRows）
 * 列   = # | 行 | コード | 変数値（出現順）| 条件式（出現順）
 *
 * LineTrace と同じ列構成を実行順で表示する。
 * init() で全行・全列を一括生成し、update() は現在行の
 * ハイライト移動と scrollIntoView のみ（O(n)）。
 *
 * 変数列: 各行の最後の humanStep 時点の変数値（flattenEnv で Map を取得）
 * 条件列: 行が条件文 enter / ループ条件式の humanStep を含むときだけ値を表示、それ以外は空
 */

import { BaseView } from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES, formatValue, formatValueDiff, esc } from '../../utils/format.js';
import { computeSubscriptVars, detectPointerVars, renderArrayGrid } from '../../utils/array-grid.js';
import { buildExecRows } from '../../utils/line-exec.js';
import { t } from '../../i18n.js';

/** ExecTrace内のミニ配列図のポインタラベル用フォントサイズ（px、固定） */
const DIAGRAM_FONT_PX = 9;
/** 1文字あたりの概算幅（px、monospace・DIAGRAM_FONT_PX に対応） */
const DIAGRAM_CHAR_PX = 7;
/** セル幅の下限（px） */
const DIAGRAM_MIN_CELL_PX = 18;
/** 各行の高さ（px、固定・コンパクト表示用。Arraysビューのcellpx比例の高さは使わない） */
const DIAGRAM_IDX_H_PX = 9;
const DIAGRAM_VAL_H_PX = 14;
const DIAGRAM_PTR_H_PX = 10;

/** 「配列」列の表示枠の幅（ドラッグでユーザーが変更・localStorageに永続化） */
const DIAGRAM_W_STORAGE_KEY = 'jsv-exectrace-diagram-w';
const DIAGRAM_W_DEFAULT = 220;
const DIAGRAM_W_MIN = 100;
const DIAGRAM_W_MAX = 500;

// ── 条件式ヘルパー（LineTrace と共通ロジック） ──────────────────────────────

const CONDITION_NODES = new Set([
  'IfStatement', 'WhileStatement', 'DoWhileStatement',
  'ForStatement', 'ForInStatement', 'ForOfStatement',
  'ConditionalExpression',
]);

function isFunctionVal(v) {
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') {
    return v.__type__ === 'JSFunction' || v.__type__ === 'JSClass';
  }
  return false;
}

function extractCondText(lines, loc, end) {
  if (!loc || !end) return null;
  const lineText = lines[loc.line - 1] ?? '';
  if (loc.line === end.line) {
    const text = lineText.slice(loc.column - 1, end.column).trim();
    return text || null;
  }
  return (lineText.slice(loc.column - 1).trim() + '…') || null;
}

function buildConditionExitSet(trace) {
  const set = new Set();
  for (let i = 0; i < trace.length; i++) {
    const ev = trace[i];
    if (ev.phase === 'enter' &&
        (ev.nodeType === 'WhileStatement' || ev.nodeType === 'DoWhileStatement')) {
      const D      = ev.depth;
      const endIdx = ev.matchIdx ?? trace.length;
      for (let j = i + 1; j < endIdx; j++) {
        const t = trace[j];
        if (t.phase === 'exit' && t.depth === D + 1 &&
            t.nodeType !== 'BlockStatement' && typeof t.value === 'boolean') {
          set.add(j);
        }
      }
    }
    if (ev.phase === 'enter' && ev.nodeType === 'ForStatement') {
      const D      = ev.depth;
      const endIdx = ev.matchIdx ?? trace.length;
      for (let j = i + 1; j < endIdx; j++) {
        const t = trace[j];
        if (t.phase === 'exit' && t.depth === D + 1 &&
            t.nodeType !== 'VariableDeclaration' &&
            t.nodeType !== 'BlockStatement' &&
            typeof t.value === 'boolean') {
          set.add(j);
        }
      }
    }
  }
  return set;
}

function buildCondInfo(trace, si, lines, conditionExitSet) {
  const ev = trace[si];
  if (!ev) return null;

  // Case 1: while/for 条件式 exit
  if (conditionExitSet.has(si)) {
    const text = extractCondText(lines, ev.loc, ev.end);
    return text ? { text, value: ev.value } : null;
  }

  // Case 2: 条件文 enter（IfStatement / ConditionalExpression）
  if (ev.phase === 'enter' && CONDITION_NODES.has(ev.nodeType)) {
    const D        = ev.depth;
    const endBound = ev.matchIdx != null ? ev.matchIdx + 1 : trace.length;
    for (let i = si + 1; i < endBound; i++) {
      const t = trace[i];
      if (!t || t.depth < D) break;
      if (t.phase === 'exit' && t.depth === D + 1 && typeof t.value === 'boolean') {
        const text = extractCondText(lines, t.loc, t.end);
        if (text) return { text, value: t.value };
        return null;
      }
    }
  }

  return null;
}

// ── ExecTrace ─────────────────────────────────────────────────────────────

export class ExecTrace extends BaseView {
  #container  = null;
  #rowEls     = null;   // HTMLElement[]  行 → <tr>
  #humanSteps = null;   // number[]       trace インデックス列
  #hiToRow    = null;   // number[]       hi → 行（どの行にも含めない場合は -1）
  #activeRow  = -1;

  // ── 「配列」列リサイズ用（destroy() で必ず解除する） ────────────────────────
  #diagResizeHandle   = null;
  #diagResizeDragging = false;
  #diagResizeStartX   = 0;
  #diagResizeStartW   = 0;
  #onDiagResizeMove   = null;
  #onDiagResizeUp     = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#activeRow  = -1;

    const humanSteps = builder.getHumanStepList();
    const trace      = builder.trace;
    const source     = builder.source ?? '';
    const lines      = source.split('\n');
    const { rows, hiToRow } = buildExecRows(trace, humanSteps);

    this.#humanSteps = humanSteps;
    this.#hiToRow    = hiToRow;

    if (rows.length === 0) {
      container.innerHTML = `<div class="et-wrap"><p class="et-empty">${esc(t('exectrace-empty'))}</p></div>`;
      this.#rowEls = [];
      return;
    }

    // ── 変数名を出現順に収集（合わせて配列変数名も収集） ──────────────────────
    const varNames = [];
    const varSet   = new Set();
    const arrayVarNames = new Set();
    for (const si of humanSteps) {
      const ev = trace[si];
      if (!ev) continue;
      for (const [k, v] of flattenEnv(ev.env)) {   // flattenEnv は Map を返す
        if (!varSet.has(k) && !BUILTIN_NAMES.has(k) && !isFunctionVal(v)) {
          varSet.add(k);
          varNames.push(k);
        }
        if (Array.isArray(v)) arrayVarNames.add(k);
      }
    }

    // 配列が1つでもあれば、ポインタ・オーバーレイ用の列を追加する
    // （Arraysビューと同じ「配列セル＋ポインタラベル」表現を統合したもの。ADR-037。
    //  src/utils/array-grid.js に実装を共通化している）
    const showDiagram  = arrayVarNames.size > 0;
    const subscriptVars = showDiagram ? computeSubscriptVars(source) : null;
    // ポインタ候補（配列添字として使われ、配列変数自体ではない識別子）のうち
    // 最も長い名前に合わせてセル幅を決める（"minIdx" のようなラベルが見切れないように）
    let diagramCellPx = DIAGRAM_MIN_CELL_PX;
    if (showDiagram) {
      for (const name of subscriptVars) {
        if (arrayVarNames.has(name) || !varSet.has(name)) continue;
        diagramCellPx = Math.max(diagramCellPx, name.length * DIAGRAM_CHAR_PX + 6);
      }
    }

    // ── 条件式を出現順に収集 ──────────────────────────────────────────────
    const condSet   = new Set();
    const condNames = [];
    const rowCondMap = new Map();  // 行 → {text, value}

    const conditionExitSet = buildConditionExitSet(trace);
    for (let r = 0; r < rows.length; r++) {
      for (const hi of rows[r]) {
        const info = buildCondInfo(trace, humanSteps[hi], lines, conditionExitSet);
        if (!info) continue;
        rowCondMap.set(r, info);
        if (!condSet.has(info.text)) {
          condSet.add(info.text);
          condNames.push(info.text);
        }
        break;
      }
    }

    // ── テーブル HTML 構築 ────────────────────────────────────────────────
    let html = '<div class="et-wrap"><table class="et-table"><thead>';
    html += '<tr class="et-thead-row">';
    html += '<th class="et-th et-col-num">#</th>';
    html += `<th class="et-th et-col-line">${esc(t('exectrace-col-line'))}</th>`;
    html += `<th class="et-th et-col-code">${esc(t('exectrace-col-code'))}</th>`;
    if (showDiagram) {
      html += `<th class="et-th et-col-diagram">${esc(t('exectrace-col-array'))}<span class="et-diag-resize-handle" title="${esc(t('exectrace-col-array'))}"></span></th>`;
    }
    for (const name of varNames) {
      html += `<th class="et-th et-col-var">${esc(name)}</th>`;
    }
    for (const cond of condNames) {
      html += `<th class="et-th et-col-cond">${esc(cond)}</th>`;
    }
    html += '</tr></thead><tbody class="et-tbody">';

    let prevEnvMap = new Map();

    for (let r = 0; r < rows.length; r++) {
      const ev    = trace[humanSteps[rows[r][rows[r].length - 1]]];
      if (!ev) continue;

      const lineNo  = trace[humanSteps[rows[r][0]]]?.loc?.line ?? 0;
      const rawLine = lineNo > 0 ? (lines[lineNo - 1] ?? '') : '';
      const snippet = rawLine.trim().slice(0, 30);
      const envMap  = flattenEnv(ev.env);           // Map<string, any>
      const condInfo = rowCondMap.get(r);

      html += `<tr class="et-row" data-row="${r}">`;
      html += `<td class="et-td et-col-num">${r + 1}</td>`;
      html += `<td class="et-td et-col-line">${lineNo}</td>`;
      html += `<td class="et-td et-col-code">${esc(snippet)}</td>`;

      // 配列＋ポインタのミニ図（ポインタが検出された配列のみ描画。Arraysビューと共通の
      // renderArrayGrid() を使い、アニメーション型のArraysでは見えない「イテレーション横断の
      // ポインタ位置ズレ」を縦スクロールで比較できるようにする）
      if (showDiagram) {
        let diagramHtml = '';
        for (const arrName of arrayVarNames) {
          const arr = envMap.get(arrName);
          const ptrByName = detectPointerVars(envMap, arr, subscriptVars, arrayVarNames);
          if (ptrByName.size === 0) continue;
          const maxVal = Array.isArray(arr)
            ? arr.reduce((m, v) => typeof v === 'number' && isFinite(v) ? Math.max(m, Math.abs(v)) : m, 0)
            : 0;
          diagramHtml += renderArrayGrid({
            arrName, arr, ptrByName, cellPx: diagramCellPx, fontPx: DIAGRAM_FONT_PX, maxVal, emptyText: '',
            idxHeightPx: DIAGRAM_IDX_H_PX, valHeightPx: DIAGRAM_VAL_H_PX, ptrHeightPx: DIAGRAM_PTR_H_PX,
          });
        }
        html += `<td class="et-td et-col-diagram"><div class="et-diag-scroll">${diagramHtml}</div></td>`;
      }

      // 変数列（前ステップとの差分をボールドで強調）
      // envMap.has() で判定する（v === undefined だと「未スコープ」と「値が undefined」を
      // 区別できない。値が undefined の場合は formatValueDiff() 側で "undefined" と表示する）
      for (const name of varNames) {
        const v    = envMap.get(name);
        const prev = prevEnvMap.get(name);
        html += `<td class="et-td et-col-var">${envMap.has(name) ? formatValueDiff(v, prev) : '<span class="lt-empty">—</span>'}</td>`;
      }

      // 条件列（この step が該当条件を評価したときだけ値を表示）
      for (const cond of condNames) {
        if (condInfo && condInfo.text === cond) {
          html += `<td class="et-td et-col-cond"><span class="v-bool">${condInfo.value}</span></td>`;
        } else {
          html += '<td class="et-td et-col-cond"></td>';
        }
      }

      html += '</tr>';
      prevEnvMap = envMap;
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
    this.#rowEls = [...container.querySelectorAll('.et-row')];

    if (showDiagram) {
      const wrapEl = container.querySelector('.et-wrap');
      const saved  = Number(localStorage.getItem(DIAGRAM_W_STORAGE_KEY));
      const width  = (saved >= DIAGRAM_W_MIN && saved <= DIAGRAM_W_MAX) ? saved : DIAGRAM_W_DEFAULT;
      wrapEl?.style.setProperty('--et-diag-w', `${width}px`);

      const handle = container.querySelector('.et-diag-resize-handle');
      if (handle && wrapEl) this.#bindDiagramResizer(handle, wrapEl);
    }
  }

  /**
   * 「配列」列の表示枠の幅をドラッグで変更する（pane-resizer.js と同じパターン、
   * 対象は CSS 変数 --et-diag-w の px 値）。document への mousemove/mouseup リスナーは
   * destroy() で必ず解除する。
   * @param {HTMLElement} handle
   * @param {HTMLElement} wrapEl `.et-wrap` 要素
   */
  #bindDiagramResizer(handle, wrapEl) {
    this.#diagResizeHandle = handle;

    const setWidth = (w) => {
      const clamped = Math.max(DIAGRAM_W_MIN, Math.min(DIAGRAM_W_MAX, w));
      wrapEl.style.setProperty('--et-diag-w', `${clamped}px`);
      localStorage.setItem(DIAGRAM_W_STORAGE_KEY, String(clamped));
    };

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      this.#diagResizeDragging = true;
      this.#diagResizeStartX   = e.clientX;
      const current = getComputedStyle(wrapEl).getPropertyValue('--et-diag-w');
      this.#diagResizeStartW = parseFloat(current) || DIAGRAM_W_DEFAULT;
      handle.classList.add('dragging');
      document.body.style.cursor     = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    this.#onDiagResizeMove = (e) => {
      if (!this.#diagResizeDragging) return;
      setWidth(this.#diagResizeStartW + (e.clientX - this.#diagResizeStartX));
    };
    this.#onDiagResizeUp = () => {
      if (!this.#diagResizeDragging) return;
      this.#diagResizeDragging = false;
      handle.classList.remove('dragging');
      document.body.style.cursor     = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', this.#onDiagResizeMove);
    document.addEventListener('mouseup', this.#onDiagResizeUp);
  }

  update(state) {
    if (!this.#rowEls || !this.#humanSteps || !this.#hiToRow) return;

    const cursor     = state.cursor;
    const humanSteps = this.#humanSteps;

    // cursor 以下の最大 humanStep インデックスを求める
    let newHi = 0;
    for (let i = 0; i < humanSteps.length; i++) {
      if (humanSteps[i] <= cursor) newHi = i;
      else break;
    }

    const newRow = this.#hiToRow[newHi] ?? -1;
    if (newRow === this.#activeRow) return;

    // 旧ハイライトを解除
    if (this.#activeRow >= 0) {
      this.#rowEls[this.#activeRow]?.classList.remove('et-row--active');
    }
    // 新ハイライトを設定してスクロール追従（Program enter など行を持たない hi では何も強調しない）
    const el = newRow >= 0 ? this.#rowEls[newRow] : null;
    if (el) {
      el.classList.add('et-row--active');
      el.scrollIntoView({ block: 'nearest' });
    }
    this.#activeRow = newRow;
  }

  reset() {
    if (this.#activeRow >= 0) {
      this.#rowEls?.[this.#activeRow]?.classList.remove('et-row--active');
    }
    this.#activeRow = -1;
  }

  destroy() {
    if (this.#onDiagResizeMove) document.removeEventListener('mousemove', this.#onDiagResizeMove);
    if (this.#onDiagResizeUp)   document.removeEventListener('mouseup', this.#onDiagResizeUp);
    this.#diagResizeHandle   = null;
    this.#diagResizeDragging = false;
    this.#onDiagResizeMove   = null;
    this.#onDiagResizeUp     = null;

    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#rowEls     = null;
    this.#humanSteps = null;
    this.#hiToRow    = null;
  }
}
