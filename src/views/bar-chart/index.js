/**
 * bar-chart/index.js — 棒グラフアニメーション
 *
 * 数値変数・数値配列の各要素を棒グラフで表示。
 * ステップが進むたびに棒の高さが CSS transition でアニメーションする。
 *
 * - チップで表示する変数を選択
 * - 配列は各要素を 1 本の棒として表示（ソートアルゴリズムの可視化に最適）
 * - 棒の色は値の大きさに応じて青 → 赤で変化
 */

import { BaseView }                       from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES }      from '../../utils/format.js';

/** グラフ本体の高さ (px) */
const CHART_H = 160;

/**
 * 値の大きさに応じた HSL カラーを返す（小 → 青、大 → 赤）
 * @param {number} val
 * @param {number} maxVal
 * @returns {string}
 */
function valueToHsl(val, maxVal) {
  if (maxVal === 0) return 'hsl(200, 65%, 55%)';
  const ratio = Math.min(Math.abs(val) / maxVal, 1);
  const hue   = Math.round(220 - ratio * 220); // 220 (blue) → 0 (red)
  return `hsl(${hue}, 65%, 55%)`;
}

export class BarChart extends BaseView {
  /** @type {HTMLElement|null} */
  #container = null;

  /** @type {import('../../core/trace-builder.js').TraceBuilder|null} */
  #builder = null;

  #chipsEl  = null;
  #chartEl  = null;

  /** @type {Set<string>} 選択中の変数名 */
  #selectedVars = new Set();

  /** @type {Array<{name:string, isArray:boolean, maxVal:number}>} */
  #allVarMeta = [];

  /** @type {Map<string, HTMLElement>}  varName → group 要素 */
  #groupEls = new Map();

  /** @type {Map<string, HTMLElement[]>} varName → bar 要素配列 */
  #barEls   = new Map();

  /** 最後に描画した変数値マップ（チップ切り替え時に再描画するため） */
  #lastVars = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#builder   = builder;

    this.#scanTrace();

    container.innerHTML = `
      <div class="bc-wrap">
        <div class="bc-chips"></div>
        <div class="bc-chart"></div>
      </div>`;

    this.#chipsEl = container.querySelector('.bc-chips');
    this.#chartEl = container.querySelector('.bc-chart');

    if (this.#allVarMeta.length === 0) {
      this.#chartEl.innerHTML = '<p class="bc-empty">数値変数・配列が見つかりません</p>';
    } else {
      this.#renderChips();
    }
  }

  update(state) {
    if (!this.#chartEl || !state.event) return;
    const vars = flattenEnv(state.event.env ?? []);
    this.#lastVars = vars;
    this.#renderBars(vars);
  }

  reset() {
    if (this.#chartEl) this.#chartEl.innerHTML = '';
    this.#groupEls.clear();
    this.#barEls.clear();
    this.#lastVars = null;
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#builder   = null;
    this.#chipsEl   = null;
    this.#chartEl   = null;
    this.#groupEls.clear();
    this.#barEls.clear();
    this.#lastVars = null;
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /**
   * humanStep を全走査して「数値変数 / 数値配列」とその最大絶対値を収集する。
   */
  #scanTrace() {
    const humanSteps = this.#builder.getHumanStepList();
    const trace      = this.#builder.trace;
    const metaMap    = new Map();   // name → {maxVal, isArray}

    for (const si of humanSteps) {
      const ev = trace[si];
      if (!ev?.env) continue;
      const vars = flattenEnv(ev.env);

      for (const [name, val] of vars) {
        if (BUILTIN_NAMES.has(name)) continue;

        if (typeof val === 'number' && isFinite(val)) {
          const m = metaMap.get(name) ?? { maxVal: 0, isArray: false };
          if (!m.isArray) m.maxVal = Math.max(m.maxVal, Math.abs(val));
          metaMap.set(name, m);
        } else if (
          Array.isArray(val) && val.length > 0
          && val.every(v => typeof v === 'number' && isFinite(v))
        ) {
          const m = metaMap.get(name) ?? { maxVal: 0, isArray: true };
          m.isArray = true;
          for (const v of val) m.maxVal = Math.max(m.maxVal, Math.abs(v));
          metaMap.set(name, m);
        }
      }
    }

    this.#allVarMeta = [...metaMap.entries()].map(([name, meta]) => ({ name, ...meta }));

    // デフォルト選択: 配列変数優先、なければスカラーを全選択
    const arrays  = this.#allVarMeta.filter(m => m.isArray);
    const scalars = this.#allVarMeta.filter(m => !m.isArray);
    (arrays.length > 0 ? arrays : scalars).forEach(m => this.#selectedVars.add(m.name));
  }

  /** 変数選択チップを描画する */
  #renderChips() {
    if (!this.#chipsEl) return;

    this.#chipsEl.innerHTML = this.#allVarMeta.map(m =>
      `<button class="bc-chip${this.#selectedVars.has(m.name) ? ' bc-chip--on' : ''}"
               data-var="${m.name}">
         ${m.name}${m.isArray ? '[]' : ''}
       </button>`
    ).join('');

    this.#chipsEl.addEventListener('click', e => {
      const btn = e.target.closest('.bc-chip');
      if (!btn) return;
      const name = btn.dataset.var;

      if (this.#selectedVars.has(name)) {
        this.#selectedVars.delete(name);
        btn.classList.remove('bc-chip--on');
        // グループ要素を即時除去
        const grp = this.#groupEls.get(name);
        if (grp) { grp.remove(); this.#groupEls.delete(name); this.#barEls.delete(name); }
      } else {
        this.#selectedVars.add(name);
        btn.classList.add('bc-chip--on');
        if (this.#lastVars) this.#renderBars(this.#lastVars);
      }
    });
  }

  /**
   * 棒グラフを描画・更新する。
   * DOM 要素を再利用して CSS transition によるアニメーションを実現する。
   * @param {Map<string, any>} vars
   */
  #renderBars(vars) {
    if (!this.#chartEl) return;

    // 既存の「初期待ち」メッセージを除去
    const emptyEl = this.#chartEl.querySelector('.bc-empty-step');
    if (emptyEl) emptyEl.remove();

    let anyRendered = false;

    for (const meta of this.#allVarMeta) {
      if (!this.#selectedVars.has(meta.name)) continue;
      const val = vars.get(meta.name);
      if (val === undefined) continue;

      const values = meta.isArray
        ? (Array.isArray(val) ? val : [])
        : (typeof val === 'number' ? [val] : []);

      if (values.length === 0) continue;

      anyRendered = true;

      let groupEl = this.#groupEls.get(meta.name);
      let barEls  = this.#barEls.get(meta.name);

      if (!groupEl || !barEls || barEls.length !== values.length) {
        // 要素数が変わったとき or 初回: グループを再生成
        if (groupEl) groupEl.remove();
        groupEl = this.#makeGroupEl(meta.name, values, meta.maxVal);
        this.#chartEl.appendChild(groupEl);
        this.#groupEls.set(meta.name, groupEl);
        barEls = [...groupEl.querySelectorAll('.bc-bar')];
        this.#barEls.set(meta.name, barEls);
      } else {
        // 高さと色を更新（CSS transition が発動）
        for (let i = 0; i < values.length; i++) {
          const v = values[i];
          const h = meta.maxVal > 0
            ? Math.max(2, Math.round((Math.abs(v) / meta.maxVal) * CHART_H))
            : 2;
          barEls[i].style.height     = `${h}px`;
          barEls[i].style.background = valueToHsl(v, meta.maxVal);

          // 値ラベルも更新
          const wrap = barEls[i].parentElement;
          if (wrap) {
            const valSpan = wrap.querySelector('.bc-bar-val');
            if (valSpan) valSpan.textContent = v;
          }
        }
      }
    }

    // 非選択になったグループを除去
    for (const [name, el] of this.#groupEls) {
      if (!this.#selectedVars.has(name)) {
        el.remove();
        this.#groupEls.delete(name);
        this.#barEls.delete(name);
      }
    }

    // 何も描画できなかった場合はガイドメッセージを表示
    if (!anyRendered && this.#groupEls.size === 0) {
      const msg = document.createElement('p');
      msg.className   = 'bc-empty bc-empty-step';
      msg.textContent = 'ステップを進めると棒グラフが現れます';
      this.#chartEl.appendChild(msg);
    }
  }

  /**
   * 1 変数分のグループ要素を生成する（DOM 操作、innerHTML 使用なし）。
   * @param {string}   name
   * @param {number[]} values
   * @param {number}   maxVal
   * @returns {HTMLElement}
   */
  #makeGroupEl(name, values, maxVal) {
    const barW = values.length <= 8  ? 36
               : values.length <= 16 ? 26
               : values.length <= 32 ? 18
               : 12;

    const group = document.createElement('div');
    group.className = 'bc-group';

    const label = document.createElement('div');
    label.className = 'bc-group-label';
    label.textContent = name;
    group.appendChild(label);

    const barsRow = document.createElement('div');
    barsRow.className = 'bc-bars-row';
    barsRow.style.height = `${CHART_H}px`;
    group.appendChild(barsRow);

    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      const h = maxVal > 0
        ? Math.max(2, Math.round((Math.abs(v) / maxVal) * CHART_H))
        : 2;

      const wrap = document.createElement('div');
      wrap.className = 'bc-bar-wrap';
      wrap.style.width = `${barW}px`;

      const valSpan = document.createElement('span');
      valSpan.className = 'bc-bar-val';
      valSpan.textContent = v;
      valSpan.style.fontSize = `${Math.max(8, Math.min(10, barW - 4))}px`;

      const bar = document.createElement('div');
      bar.className = 'bc-bar';
      bar.style.width      = `${barW}px`;
      bar.style.height     = `${h}px`;
      bar.style.background = valueToHsl(v, maxVal);

      const idxSpan = document.createElement('span');
      idxSpan.className = 'bc-bar-idx';
      idxSpan.textContent = values.length > 1 ? String(i) : '';
      idxSpan.style.fontSize = `${Math.max(8, Math.min(10, barW - 4))}px`;

      wrap.appendChild(valSpan);
      wrap.appendChild(bar);
      wrap.appendChild(idxSpan);
      barsRow.appendChild(wrap);
    }

    return group;
  }
}
