/**
 * array-grid.js — 配列＋ポインタのグリッド表示ロジック（Arrays・ExecTrace共通）
 *
 * 元々 color-box/index.js（Arrays ビュー）にのみ存在していたロジックを純関数化し、
 * exec-trace/index.js（ExecTrace ビュー）でも同じ表現（配列セル＋ポインタラベル行）
 * を再利用できるようにする。HTML生成は `.cb-*` CSSクラス（web/style.css）を使う。
 */

import { BUILTIN_NAMES, esc, formatValue } from './format.js';

/** 識別子のうち、変数ではないもの（右辺から拾わない） */
const NON_VAR_WORDS = new Set([
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'let', 'const', 'var', 'new', 'typeof', 'function', 'return', 'this',
]);

/** 代入（`x = …`・`let x = …`・`x += …`・`x -= …`）。比較演算子・アロー関数・プロパティへの代入は除く */
const ASSIGN_RE = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*(?:\+=|-=|=(?![=>]))\s*([^;\n{}]*)/g;

/**
 * 式の文字列から、変数として使われている識別子を取り出す（`.length` のようなプロパティ名は除く）。
 * @param {string} expr
 * @returns {string[]}
 */
function identifiersIn(expr) {
  const names = [];
  for (const m of expr.matchAll(/(^|[^\w$.])([A-Za-z_$][\w$]*)/g)) {
    if (!NON_VAR_WORDS.has(m[2])) names.push(m[2]);
  }
  return names;
}

/**
 * ソース中で配列添字として実際に使われている識別子のホワイトリストを抽出する。
 *
 * 1. 添字の先頭の識別子: `arr[j]`・`arr[j + 1]` の `j`（`\w\[` なので配列リテラル `[a, b]` は対象外）
 * 2. 足し算・引き算だけでできた添字に出てくる識別子: `arr[n - 1 - i]` の `i`、`grid[i][j]` の `j`
 * 3. 添字の変数と互いに計算し合う変数（ADR-053）: 二分探索の `lo`・`hi` のように、
 *    `mid = Math.floor((lo + hi) / 2)`（添字の変数の右辺に出てくる）と
 *    `lo = mid + 1`（自分の右辺に添字の変数が出てくる）の両方を満たすもの。
 *    片方だけ（`idx = key % size` の `key` など）では範囲の端とはいえないので含めない
 * @param {string} source
 * @returns {Set<string>}
 */
export function computeSubscriptVars(source) {
  const src = source ?? '';
  const result = new Set();

  // 1. 添字の先頭の識別子（従来どおり）
  for (const m of src.matchAll(/\w\[([a-zA-Z_$][a-zA-Z0-9_$]*)/g)) {
    result.add(m[1]);
  }
  // 2. 足し算・引き算だけでできた添字の中の識別子
  for (const m of src.matchAll(/(?<=[\w$\]])\[([\w$\s+-]+)\]/g)) {
    for (const name of identifiersIn(m[1])) result.add(name);
  }

  // 3. 添字の変数と互いに計算し合う変数
  const assigns = [...src.matchAll(ASSIGN_RE)].map(m => ({ name: m[1], rhs: identifiersIn(m[2]) }));
  const derived = new Set();
  for (const { name, rhs } of assigns) {
    if (!result.has(name)) continue;
    for (const x of rhs) {
      if (result.has(x)) continue;
      const feedsBack = assigns.some(a => a.name === x && a.rhs.some(r => result.has(r)));
      if (feedsBack) derived.add(x);
    }
  }
  for (const x of derived) result.add(x);
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
 * @param {string} [opts.note] グリッドの下に添える説明（undefined の要素の「—」の意味など）。空なら出さない
 * @returns {string}
 */
export function renderArrayGrid({
  arrName, arr, ptrByName = new Map(), cellPx, fontPx, maxVal = 0,
  minWidthPx = 0, minHeightPx = 0,
  idxHeightPx, valHeightPx, ptrHeightPx,
  emptyText = '', note = '',
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
    // undefined（値を入れていない要素・穴）は「—」で示す。文字が長くマスに収まらないため（ADR-054）
    const isUndef = v === undefined;
    const content = isUndef ? '—'
                  : typeof v === 'number' ? esc(String(v))
                  : typeof v === 'string' ? esc(v)
                  : typeof v === 'boolean' ? esc(String(v))
                  : isObj ? formatValue(v)
                  : esc(String(v));
    const objCls = isObj ? ' cb-cell--obj' : isUndef ? ' cb-cell--undef' : '';
    const tip    = isUndef ? ' title="undefined"' : '';
    html += `<div class="cb-cell${hlCls}${objCls}"${tip} style="${style};height:${VAL_H}px;${bgColor}">${content}</div>`;
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

  html += '</div>';
  if (note) html += `<p class="cb-note">${esc(note)}</p>`;
  html += '</div>';
  return html;
}
