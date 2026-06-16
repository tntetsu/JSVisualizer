/**
 * color-box/index.js — 配列アニメーション
 *
 * 配列の各要素を色付きの箱として表示する。
 * - 箱の色は値の大きさに応じて変化（ソートアルゴリズムで各要素を追跡しやすい）
 * - 整数型の変数がポインタ（インデックス）として認識され、対応する箱をハイライト
 * - ポインタ変数は変数ごとに個別の行として表示
 * - チップで複数の配列変数を同時選択可能
 */

import { BaseView }                       from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES, esc } from '../../utils/format.js';

/**
 * 値の大きさに応じた背景色を返す（小 → 青系、大 → 赤系）
 * @param {number} val
 * @param {number} maxVal
 * @returns {string}
 */
function valueToBoxColor(val, maxVal) {
  if (maxVal === 0 || typeof val !== 'number') return 'var(--surface2)';
  const ratio = Math.min(Math.abs(val) / maxVal, 1);
  const hue   = Math.round(220 - ratio * 220); // 220 (blue) → 0 (red)
  return `hsl(${hue}, 65%, 70%)`;
}

export class ColorBox extends BaseView {
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
      this.#boxAreaEl.innerHTML = '<p class="cb-empty">No array variables found</p>';
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
    // `\w\[` とすることで配列リテラル `[a, b]` の `a` を誤検出しない。
    const SUBSCRIPT_RE = /\w\[([a-zA-Z_$][a-zA-Z0-9_$]*)/g;
    this.#subscriptVars = new Set();
    for (const m of (this.#builder.source ?? '').matchAll(SUBSCRIPT_RE)) {
      this.#subscriptVars.add(m[1]);
    }

    // 第1パス: 配列変数と最大絶対値を収集
    for (const si of humanSteps) {
      const ev = trace[si];
      if (!ev?.env) continue;
      const vars = flattenEnv(ev.env);
      for (const [name, val] of vars) {
        if (BUILTIN_NAMES.has(name)) continue;
        if (!Array.isArray(val)) continue;
        const m = metaMap.get(name) ?? { maxVal: 0, maxWidth: 0, maxGridHeight: 0 };
        for (const v of val) {
          if (typeof v === 'number' && isFinite(v)) m.maxVal = Math.max(m.maxVal, Math.abs(v));
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
        const CELL = len <= 10 ? 48 : len <= 20 ? 38 : len <= 32 ? 28 : 20;
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

      const minW = meta?.maxWidth      ? `min-width:${meta.maxWidth}px;`      : '';
      const minH = meta?.maxGridHeight ? `min-height:${meta.maxGridHeight}px;` : '';

      if (!Array.isArray(arr) || arr.length === 0) {
        html += `<div class="cb-array-block">`;
        html += `<div class="cb-array-name">${esc(arrName)}</div>`;
        html += `<div class="cb-grid" style="${minW}${minH}"><p class="cb-empty">配列が空です</p></div>`;
        html += `</div>`;
        continue;
      }

      // ポインタ変数を収集：整数型で [0, arr.length) に収まる変数
      // name → idx のマップ（配列変数自体は除外）
      const ptrByName = new Map();
      for (const [name, val] of vars) {
        if (BUILTIN_NAMES.has(name)) continue;
        if (arrayVarNames.has(name)) continue;
        if (!this.#subscriptVars.has(name)) continue;
        if (
          typeof val === 'number'
          && Number.isInteger(val)
          && val >= 0
          && val < arr.length
        ) {
          ptrByName.set(name, val);
        }
      }

      const highlightedSet = new Set(ptrByName.values());
      const maxVal = meta?.maxVal ?? 0;

      const CELL = arr.length <= 10 ? 48
                 : arr.length <= 20 ? 38
                 : arr.length <= 32 ? 28
                 : 20;
      const FONT = Math.max(9, Math.round(CELL * 0.34));
      const style = `width:${CELL}px;font-size:${FONT}px`;

      html += `<div class="cb-array-block">`;
      html += `<div class="cb-array-name">${esc(arrName)}</div>`;
      html += `<div class="cb-grid" style="${minW}${minH}">`;

      // インデックス行
      html += '<div class="cb-row cb-idx-row">';
      for (let i = 0; i < arr.length; i++) {
        html += `<div class="cb-cell cb-cell--idx" style="${style};height:${Math.round(CELL * 0.55)}px">${i}</div>`;
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
        const display = typeof v === 'number' ? String(v)
                      : typeof v === 'string' ? v
                      : typeof v === 'boolean' ? String(v)
                      : '?';
        html += `<div class="cb-cell${hlCls}" style="${style};height:${CELL}px;${bgColor}">${esc(display)}</div>`;
      }
      html += '</div>';

      // ポインタ行（変数ごとに1行）
      for (const [ptrName, ptrIdx] of ptrByName) {
        html += '<div class="cb-row cb-ptr-row">';
        for (let i = 0; i < arr.length; i++) {
          const label = i === ptrIdx ? ptrName : '';
          html += `<div class="cb-cell cb-cell--ptr" style="${style};height:${Math.round(CELL * 0.65)}px">${esc(label)}</div>`;
        }
        html += '</div>';
      }

      html += '</div></div>';
    }

    this.#boxAreaEl.innerHTML = html || '<p class="cb-empty">選択された配列が見つかりません</p>';
  }
}
