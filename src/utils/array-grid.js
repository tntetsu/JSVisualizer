/**
 * array-grid.js — 配列＋ポインタのグリッド表示ロジック（Arrays・ExecTrace共通）
 *
 * 元々 color-box/index.js（Arrays ビュー）にのみ存在していたロジックを純関数化し、
 * exec-trace/index.js（ExecTrace ビュー）でも同じ表現（配列セル＋ポインタラベル行）
 * を再利用できるようにする。HTML生成は `.cb-*` CSSクラス（web/style.css）を使う。
 */

import { BUILTIN_NAMES, esc, formatValue } from './format.js';

/**
 * ソース中で配列添字として実際に使われている識別子のホワイトリストを抽出する。
 * `arr[j]` や `arr[j + 1]` に登場する `j` のような識別子を収集する。
 * `\w\[` とすることで配列リテラル `[a, b]` の `a` を誤検出しない。
 * @param {string} source
 * @returns {Set<string>}
 */
export function computeSubscriptVars(source) {
  const SUBSCRIPT_RE = /\w\[([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
  const result = new Set();
  for (const m of (source ?? '').matchAll(SUBSCRIPT_RE)) {
    result.add(m[1]);
  }
  return result;
}

/**
 * ある1スナップショットの変数群から、指定した配列を指すポインタ変数を検出する。
 * 条件: `BUILTIN_NAMES` に含まれない・他の配列変数名でない・`subscriptVars` に
 * 登場する・整数型で `[0, arr.length)` に収まる。
 * @param {Map<string, any>} vars 現在のスナップショットの全変数
 * @param {any[]} arr 対象配列（配列でなければ常に空のMapを返す）
 * @param {Set<string>} subscriptVars computeSubscriptVars() の結果
 * @param {Set<string>} arrayVarNames プログラム中の全配列変数名
 * @returns {Map<string, number>} 変数名 → 指しているインデックス
 */
export function detectPointerVars(vars, arr, subscriptVars, arrayVarNames) {
  const ptrByName = new Map();
  if (!Array.isArray(arr) || arr.length === 0) return ptrByName;
  for (const [name, val] of vars) {
    if (BUILTIN_NAMES.has(name)) continue;
    if (arrayVarNames.has(name)) continue;
    if (!subscriptVars.has(name)) continue;
    if (
      typeof val === 'number'
      && Number.isInteger(val)
      && val >= 0
      && val < arr.length
    ) {
      ptrByName.set(name, val);
    }
  }
  return ptrByName;
}

/**
 * 値の大きさに応じた背景色を返す（小 → 青系、大 → 赤系）
 * @param {number} val
 * @param {number} maxVal
 * @returns {string}
 */
export function valueToBoxColor(val, maxVal) {
  if (maxVal === 0 || typeof val !== 'number') return 'var(--surface2)';
  const ratio = Math.min(Math.abs(val) / maxVal, 1);
  const hue   = Math.round(220 - ratio * 220); // 220 (blue) → 0 (red)
  return `hsl(${hue}, 65%, 70%)`;
}

/**
 * 配列1つ分の「インデックス行＋値行＋ポインタ行」グリッドHTMLを生成する
 * （`.cb-array-block` 全体、Arrays ビューの表示と同じ構造）。
 * @param {Object} opts
 * @param {string} opts.arrName 配列変数名
 * @param {any[]} opts.arr 配列値（配列でない／空なら「配列が空です」ブロックを返す）
 * @param {Map<string, number>} [opts.ptrByName] detectPointerVars() の結果
 * @param {number} opts.cellPx セル幅（px）
 * @param {number} [opts.fontPx] セル内フォントサイズ（省略時は cellPx から算出）
 * @param {number} [opts.maxVal] 色分け用の最大絶対値
 * @param {number} [opts.minWidthPx] グリッド全体の最小幅（レイアウト固定用）
 * @param {number} [opts.minHeightPx] グリッド全体の最小高（レイアウト固定用）
 * @param {number} [opts.idxHeightPx] インデックス行の高さ（省略時は cellPx*0.55）
 * @param {number} [opts.valHeightPx] 値行の高さ（省略時は cellPx）
 * @param {number} [opts.ptrHeightPx] ポインタ行の高さ（省略時は cellPx*0.65）
 * @param {string} [opts.emptyText] 配列が空/無効なときのメッセージ
 * @returns {string}
 */
export function renderArrayGrid({
  arrName, arr, ptrByName = new Map(), cellPx, fontPx, maxVal = 0,
  minWidthPx = 0, minHeightPx = 0,
  idxHeightPx, valHeightPx, ptrHeightPx,
  emptyText = '',
}) {
  const minW = minWidthPx  ? `min-width:${minWidthPx}px;`   : '';
  const minH = minHeightPx ? `min-height:${minHeightPx}px;` : '';

  if (!Array.isArray(arr) || arr.length === 0) {
    return `<div class="cb-array-block">`
      + `<div class="cb-array-name">${esc(arrName)}</div>`
      + `<div class="cb-grid" style="${minW}${minH}"><p class="cb-empty">${esc(emptyText)}</p></div>`
      + `</div>`;
  }

  const highlightedSet = new Set(ptrByName.values());
  const FONT  = fontPx ?? Math.max(9, Math.round(cellPx * 0.34));
  const style = `width:${cellPx}px;font-size:${FONT}px`;
  const IDX_H = idxHeightPx ?? Math.round(cellPx * 0.55);
  const VAL_H = valHeightPx ?? cellPx;
  const PTR_H = ptrHeightPx ?? Math.round(cellPx * 0.65);

  let html = `<div class="cb-array-block">`;
  html += `<div class="cb-array-name">${esc(arrName)}</div>`;
  html += `<div class="cb-grid" style="${minW}${minH}">`;

  // インデックス行
  html += '<div class="cb-row cb-idx-row">';
  for (let i = 0; i < arr.length; i++) {
    html += `<div class="cb-cell cb-cell--idx" style="${style};height:${IDX_H}px">${i}</div>`;
  }
  html += '</div>';

  // 値行
  html += '<div class="cb-row cb-val-row">';
  for (let i = 0; i < arr.length; i++) {
    const v      = arr[i];
    const isHl   = highlightedSet.has(i);
    const bgColor = typeof v === 'number'
      ? `background:${valueToBoxColor(v, maxVal)};`
      : '';
    const hlCls  = isHl ? ' cb-cell--hl' : '';
    const isObj  = v !== null && typeof v === 'object';
    const content = typeof v === 'number' ? esc(String(v))
                  : typeof v === 'string' ? esc(v)
                  : typeof v === 'boolean' ? esc(String(v))
                  : isObj ? formatValue(v)
                  : esc(String(v));
    const objCls = isObj ? ' cb-cell--obj' : '';
    html += `<div class="cb-cell${hlCls}${objCls}" style="${style};height:${VAL_H}px;${bgColor}">${content}</div>`;
  }
  html += '</div>';

  // ポインタ行（変数ごとに1行）
  for (const [ptrName, ptrIdx] of ptrByName) {
    html += '<div class="cb-row cb-ptr-row">';
    for (let i = 0; i < arr.length; i++) {
      const label = i === ptrIdx ? ptrName : '';
      html += `<div class="cb-cell cb-cell--ptr" style="${style};height:${PTR_H}px">${esc(label)}</div>`;
    }
    html += '</div>';
  }

  html += '</div></div>';
  return html;
}
