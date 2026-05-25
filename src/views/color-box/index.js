/**
 * color-box/index.js — 色付き箱アニメーション
 *
 * 配列の各要素を色付きの箱として表示する。
 * - 箱の色は値の大きさに応じて変化（ソートアルゴリズムで各要素を追跡しやすい）
 * - 整数型の変数がポインタ（インデックス）として認識され、対応する箱をハイライト
 * - チップで表示する配列変数を切り替え
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
  // ライト/ダーク両対応: ライトネスを固定してテーマ影響を受けにくくする
  return `hsl(${hue}, 65%, 70%)`;
}

export class ColorBox extends BaseView {
  /** @type {HTMLElement|null} */
  #container   = null;

  /** @type {import('../../core/trace-builder.js').TraceBuilder|null} */
  #builder     = null;

  #chipsEl     = null;
  #boxAreaEl   = null;

  /** @type {string|null} 選択中の配列変数名 */
  #selectedArray = null;

  /** @type {Array<{name:string, maxVal:number}>} */
  #allArrayVars  = [];

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
      this.#boxAreaEl.innerHTML = '<p class="cb-empty">配列変数が見つかりません</p>';
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

  /** humanStep を全走査して配列変数とその最大絶対値を収集する */
  #scanTrace() {
    const humanSteps = this.#builder.getHumanStepList();
    const trace      = this.#builder.trace;
    const metaMap    = new Map();

    for (const si of humanSteps) {
      const ev = trace[si];
      if (!ev?.env) continue;
      const vars = flattenEnv(ev.env);

      for (const [name, val] of vars) {
        if (BUILTIN_NAMES.has(name)) continue;
        if (!Array.isArray(val)) continue;

        const m = metaMap.get(name) ?? { maxVal: 0 };
        for (const v of val) {
          if (typeof v === 'number' && isFinite(v)) {
            m.maxVal = Math.max(m.maxVal, Math.abs(v));
          }
        }
        metaMap.set(name, m);
      }
    }

    this.#allArrayVars = [...metaMap.entries()].map(([name, meta]) => ({ name, ...meta }));
    if (this.#allArrayVars.length > 0) {
      this.#selectedArray = this.#allArrayVars[0].name;
    }
  }

  /** 配列選択チップを描画する */
  #renderChips() {
    if (!this.#chipsEl) return;

    this.#chipsEl.innerHTML = this.#allArrayVars.map(m =>
      `<button class="cb-chip${this.#selectedArray === m.name ? ' cb-chip--on' : ''}"
               data-var="${m.name}">
         ${m.name}[]
       </button>`
    ).join('');

    this.#chipsEl.addEventListener('click', e => {
      const btn = e.target.closest('.cb-chip');
      if (!btn) return;
      this.#selectedArray = btn.dataset.var;
      this.#chipsEl.querySelectorAll('.cb-chip').forEach(b => b.classList.remove('cb-chip--on'));
      btn.classList.add('cb-chip--on');
      if (this.#lastVars) this.#render(this.#lastVars);
    });
  }

  /**
   * 配列の箱を描画する。
   * - インデックス行 / 値行 / ポインタ行 の 3 行構成
   * @param {Map<string, any>} vars
   */
  #render(vars) {
    if (!this.#boxAreaEl || !this.#selectedArray) return;

    const meta = this.#allArrayVars.find(m => m.name === this.#selectedArray);
    const arr  = vars.get(this.#selectedArray);

    if (!Array.isArray(arr) || arr.length === 0) {
      this.#boxAreaEl.innerHTML = '<p class="cb-empty">配列が空です</p>';
      return;
    }

    // ── ポインタ変数を収集 ──────────────────────────────────────────────────
    // 整数値が [0, arr.length) に収まる変数を「ポインタ」とみなす
    /** @type {Map<number, string[]>} idx → 変数名リスト */
    const ptrMap = new Map();
    for (const [name, val] of vars) {
      if (BUILTIN_NAMES.has(name)) continue;
      if (name === this.#selectedArray) continue;
      if (
        typeof val === 'number'
        && Number.isInteger(val)
        && val >= 0
        && val < arr.length
      ) {
        if (!ptrMap.has(val)) ptrMap.set(val, []);
        ptrMap.get(val).push(name);
      }
    }

    const highlightedSet = new Set(ptrMap.keys());
    const maxVal = meta?.maxVal ?? 0;

    // セルサイズ（配列の長さに応じて縮小）
    const CELL = arr.length <= 10 ? 48
               : arr.length <= 20 ? 38
               : arr.length <= 32 ? 28
               : 20;
    const FONT = Math.max(9, Math.round(CELL * 0.34));

    // ── HTML 生成 ──────────────────────────────────────────────────────────
    const style = `width:${CELL}px;font-size:${FONT}px`;

    let html = '<div class="cb-grid">';

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
      const bgColor = typeof v === 'number' && !isHl
        ? `background:${valueToBoxColor(v, maxVal)};`
        : '';
      const hlCls  = isHl ? ' cb-cell--hl' : '';
      const display = typeof v === 'number' ? String(v)
                    : typeof v === 'string' ? v.slice(0, 5)
                    : '?';

      html += `<div class="cb-cell${hlCls}" style="${style};height:${CELL}px;${bgColor}">${esc(display)}</div>`;
    }
    html += '</div>';

    // ポインタ行（ポインタが存在する場合のみ）
    if (ptrMap.size > 0) {
      html += '<div class="cb-row cb-ptr-row">';
      for (let i = 0; i < arr.length; i++) {
        const names = ptrMap.get(i);
        const label  = names ? names.join('/') : '';
        html += `<div class="cb-cell cb-cell--ptr" style="${style};height:${Math.round(CELL * 0.65)}px">${esc(label)}</div>`;
      }
      html += '</div>';
    }

    html += '</div>';

    this.#boxAreaEl.innerHTML = html;
  }
}
