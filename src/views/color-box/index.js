/**
 * color-box/index.js — 配列アニメーション
 *
 * 配列の各要素を色付きの箱として表示する。
 * - 箱の色は値の大きさに応じて変化（ソートアルゴリズムで各要素を追跡しやすい）
 * - 整数型の変数がポインタ（インデックス）として認識され、対応する箱をハイライト
 * - ポインタ変数は変数ごとに個別の行として表示
 * - チップで複数の配列変数を同時選択可能
 */

import { BaseView }                                   from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES, esc }              from '../../utils/format.js';
import { computeSubscriptVars, detectPointerVars, renderArrayGrid } from '../../utils/array-grid.js';
import { t }                                          from '../../i18n.js';

/** 幅見積り用の1文字あたりの概算ピクセル幅（monospace、OBJ_FONT に対応） */
const OBJ_CHAR_PX = 6.2;
/** オブジェクトセルの左右パディング分の余白 */
const OBJ_CELL_PAD = 14;
/** オブジェクト要素セルのフォントサイズ（幅は文字数で決まるため、数値セルのような幅比例フォントは使わない） */
const OBJ_FONT = 10;

/**
 * オブジェクト・配列要素をキー:値のプレーンテキストで整形する（セル幅の見積り用）。
 * 表示自体は formatValue() の色付き HTML を使う。
 * @param {any} v
 * @returns {string}
 */
function formatObjectPlain(v) {
  if (v === null || v === undefined) return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    return '[' + v.map(formatObjectPlain).join(', ') + ']';
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v).filter(([k]) => !k.startsWith('__'));
    if (entries.length === 0) return '{}';
    return '{' + entries.map(([k, val]) => `${k}: ${formatObjectPlain(val)}`).join(', ') + '}';
  }
  if (typeof v === 'string') return JSON.stringify(v);
  return String(v);
}

export class Arrays extends BaseView {
  static hasContent(builder) {
    if (!builder) return false;
    for (const idx of builder.getHumanStepList()) {
      const ev = builder.trace[idx];
      if (!ev?.env) continue;
      for (const scope of ev.env) {
        for (const [k, v] of Object.entries(scope)) {
          if (!BUILTIN_NAMES.has(k) && Array.isArray(v)) return true;
        }
      }
    }
    return false;
  }

  /** @type {HTMLElement|null} */
  #container   = null;

  /** @type {import('../../core/trace-builder.js').TraceBuilder|null} */
  #builder     = null;

  #chipsEl     = null;
  #boxAreaEl   = null;

  /** @type {Set<string>} 選択中の配列変数名（複数可） */
  #selectedArrays = new Set();

  /** @type {Array<{name:string, maxVal:number}>} */
  #allArrayVars  = [];

  /**
   * ソース中で実際に配列添字として使われている変数名のセット（ホワイトリスト）。
   * `arr[j]` や `arr[j + 1]` に登場する識別子を収集する。
   * このセットに含まれない変数は、値が偶然インデックス範囲に収まっていても
   * ポインタとして表示しない。
   */
  #subscriptVars = new Set();

  /** 最後に描画した変数値マップ */
  #lastVars = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#builder   = builder;

    this.#scanTrace();

    container.innerHTML = `
      <div class="cb-wrap">
        <div class="cb-chips"></div>
        <div class="cb-box-area"></div>
      </div>`;

    this.#chipsEl  = container.querySelector('.cb-chips');
    this.#boxAreaEl = container.querySelector('.cb-box-area');

    if (this.#allArrayVars.length === 0) {
      this.#boxAreaEl.innerHTML = `<p class="cb-empty">${esc(t('colorbox-no-arrays'))}</p>`;
    } else {
      this.#renderChips();
    }
  }

  update(state) {
    if (!this.#boxAreaEl || !state.event) return;
    const vars = flattenEnv(state.event.env ?? []);
    this.#lastVars = vars;
    this.#render(vars);
  }

  reset() {
    if (this.#boxAreaEl) this.#boxAreaEl.innerHTML = '';
    this.#lastVars = null;
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#builder    = null;
    this.#chipsEl    = null;
    this.#boxAreaEl  = null;
    this.#lastVars   = null;
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /** humanStep を全走査して配列変数のメタ情報（最大絶対値・最大表示幅・最大グリッド高）を収集する */
  #scanTrace() {
    const humanSteps = this.#builder.getHumanStepList();
    const trace      = this.#builder.trace;
    const metaMap    = new Map();

    // ソース中で `identifier[varName` の形（配列添字位置）に登場する識別子を収集する。
    this.#subscriptVars = computeSubscriptVars(this.#builder.source ?? '');

    // 第1パス: 配列変数と最大絶対値・オブジェクト要素の最大表示文字数を収集
    for (const si of humanSteps) {
      const ev = trace[si];
      if (!ev?.env) continue;
      const vars = flattenEnv(ev.env);
      for (const [name, val] of vars) {
        if (BUILTIN_NAMES.has(name)) continue;
        if (!Array.isArray(val)) continue;
        const m = metaMap.get(name) ?? { maxVal: 0, maxWidth: 0, maxGridHeight: 0, maxObjectTextLen: 0 };
        for (const v of val) {
          if (typeof v === 'number' && isFinite(v)) m.maxVal = Math.max(m.maxVal, Math.abs(v));
          else if (v !== null && typeof v === 'object') {
            m.maxObjectTextLen = Math.max(m.maxObjectTextLen, formatObjectPlain(v).length);
          }
        }
        metaMap.set(name, m);
      }
    }

    const arrayVarNames = new Set(metaMap.keys());

    // 第2パス: 各ステップでの表示サイズを計算し最大値を確定
    for (const si of humanSteps) {
      const ev = trace[si];
      if (!ev?.env) continue;
      const vars = flattenEnv(ev.env);
      for (const [arrName, arr] of vars) {
        if (!metaMap.has(arrName)) continue;
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const len  = arr.length;
        const CELL = this.#cellWidth(len, metaMap.get(arrName).maxObjectTextLen);
        const IDX_H = Math.round(CELL * 0.55);
        const PTR_H = Math.round(CELL * 0.65);
        let ptrCount = 0;
        for (const [name, val] of vars) {
          if (BUILTIN_NAMES.has(name) || arrayVarNames.has(name)) continue;
          if (!this.#subscriptVars.has(name)) continue;
          if (typeof val === 'number' && Number.isInteger(val) && val >= 0 && val < len) ptrCount++;
        }
        const m = metaMap.get(arrName);
        m.maxWidth      = Math.max(m.maxWidth,      len * CELL);
        m.maxGridHeight = Math.max(m.maxGridHeight, IDX_H + CELL + ptrCount * PTR_H);
      }
    }

    this.#allArrayVars = [...metaMap.entries()].map(([name, meta]) => ({ name, ...meta }));
    // 先頭配列をデフォルト選択
    if (this.#allArrayVars.length > 0) {
      this.#selectedArrays = new Set([this.#allArrayVars[0].name]);
    }
  }

  /**
   * 配列長からセル幅を決める。要素にオブジェクト・配列が含まれる場合は、
   * その内容（キーと値のペア）が全文入り切るよう幅を拡大する。
   * @param {number} len              配列長
   * @param {number} maxObjectTextLen オブジェクト要素の最大表示文字数（0 ならオブジェクトなし）
   * @returns {number}
   */
  #cellWidth(len, maxObjectTextLen = 0) {
    const base = len <= 10 ? 48 : len <= 20 ? 38 : len <= 32 ? 28 : 20;
    if (!maxObjectTextLen) return base;
    return Math.max(base, Math.round(maxObjectTextLen * OBJ_CHAR_PX + OBJ_CELL_PAD));
  }

  /** 配列選択チップを描画する（複数選択トグル） */
  #renderChips() {
    if (!this.#chipsEl) return;

    this.#chipsEl.innerHTML = this.#allArrayVars.map(m =>
      `<button class="cb-chip${this.#selectedArrays.has(m.name) ? ' cb-chip--on' : ''}"
               data-var="${m.name}">
         ${esc(m.name)}[]
       </button>`
    ).join('');

    this.#chipsEl.addEventListener('click', e => {
      const btn = e.target.closest('.cb-chip');
      if (!btn) return;
      const varName = btn.dataset.var;
      if (this.#selectedArrays.has(varName)) {
        if (this.#selectedArrays.size > 1) this.#selectedArrays.delete(varName);
      } else {
        this.#selectedArrays.add(varName);
      }
      this.#chipsEl.querySelectorAll('.cb-chip').forEach(b => {
        b.classList.toggle('cb-chip--on', this.#selectedArrays.has(b.dataset.var));
      });
      if (this.#lastVars) this.#render(this.#lastVars);
    });
  }

  /**
   * 選択中の全配列を縦に並べて描画する。
   * ポインタ変数は変数ごとに個別の行で表示する。
   * @param {Map<string, any>} vars
   */
  #render(vars) {
    if (!this.#boxAreaEl || this.#selectedArrays.size === 0) return;

    // 全配列変数名のセット（ポインタ候補から除外するため）
    const arrayVarNames = new Set(this.#allArrayVars.map(m => m.name));

    let html = '';
    for (const arrName of this.#selectedArrays) {
      const meta = this.#allArrayVars.find(m => m.name === arrName);
      const arr  = vars.get(arrName);
      const ptrByName = detectPointerVars(vars, arr, this.#subscriptVars, arrayVarNames);
      const hasObjects = (meta?.maxObjectTextLen ?? 0) > 0;
      const CELL = this.#cellWidth(Array.isArray(arr) ? arr.length : 0, meta?.maxObjectTextLen ?? 0);

      html += renderArrayGrid({
        arrName,
        arr,
        ptrByName,
        cellPx: CELL,
        // オブジェクト要素はセル幅が文字数で決まるため、幅比例のフォントサイズではなく固定サイズを使う
        fontPx: hasObjects ? OBJ_FONT : undefined,
        maxVal: meta?.maxVal ?? 0,
        minWidthPx: meta?.maxWidth ?? 0,
        minHeightPx: meta?.maxGridHeight ?? 0,
        emptyText: '配列が空です',
      });
    }

    this.#boxAreaEl.innerHTML = html || `<p class="cb-empty">${esc(t('colorbox-empty'))}</p>`;
  }
}
