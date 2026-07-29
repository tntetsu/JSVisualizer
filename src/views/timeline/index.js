/**
 * timeline/index.js — 変数の時系列グラフ
 *
 * humanStep ごとの数値変数の値を SVG 折れ線グラフで表示する。
 * - init() 時に trace 全体からヒストリを構築（O(n) の事前計算）
 * - update() 時は現在ステップを示す縦線を移動するだけ（O(log n)）
 * - チップで表示する変数をトグル選択
 */

import { BaseView }                  from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES } from '../../utils/format.js';
import { t }                         from '../../i18n.js';

/** 折れ線グラフの色パレット */
const LINE_COLORS = [
  '#4c9be8', '#e86b4c', '#4ce884', '#e8c84c',
  '#c84ce8', '#4ce8e8', '#e84c8a', '#8ae84c',
];

/** SVG 名前空間 */
const SVG_NS = 'http://www.w3.org/2000/svg';

/** パディング (px) */
const PAD = { top: 12, bottom: 28, left: 44, right: 12 };

export class Timeline extends BaseView {
  /** @type {HTMLElement|null} */
  #container   = null;

  /** @type {import('../../core/trace-builder.js').TraceBuilder|null} */
  #builder     = null;

  #chipsEl     = null;
  #svgEl       = null;
  #cursorLine  = null;

  /** @type {Set<string>} 表示中の変数名 */
  #selectedVars = new Set();

  /** @type {Array<{name:string, color:string}>} 全数値変数のメタ情報 */
  #allVarMeta   = [];

  /**
   * humanStep ごとのスナップショット
   * @type {Array<{stepIdx:number, vars:Map<string, number>}>}
   */
  #history = [];

  #minVal = 0;
  #maxVal = 1;

  /** SVG の描画サイズ（カーソル更新時に使用） */
  #svgW = 0;
  #svgH = 0;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#builder   = builder;

    this.#buildHistory();

    container.innerHTML = `
      <div class="tl-wrap">
        <div class="tl-chips"></div>
        <div class="tl-chart">
          <svg class="tl-svg" xmlns="${SVG_NS}"></svg>
        </div>
      </div>`;

    this.#chipsEl = container.querySelector('.tl-chips');
    this.#svgEl   = container.querySelector('.tl-svg');

    if (this.#allVarMeta.length === 0) {
      this.#chipsEl.innerHTML = `<span class="tl-empty">${t('timeline-empty')}</span>`;
      return;
    }

    this.#renderChips();

    // レイアウト確定後に SVG を描画
    requestAnimationFrame(() => {
      requestAnimationFrame(() => this.#renderSVG());
    });
  }

  update(state) {
    this.#moveCursor(state.cursor);
  }

  reset() {
    // destroy → remount されるため、何もしなくて良い
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#builder    = null;
    this.#chipsEl    = null;
    this.#svgEl      = null;
    this.#cursorLine = null;
    this.#history    = [];
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /**
   * humanStep を全走査して数値変数のヒストリを構築する。
   * 各エントリは { stepIdx, vars: Map<name, number> } 。
   */
  #buildHistory() {
    const humanSteps = this.#builder.getHumanStepList();
    const trace      = this.#builder.trace;
    const varNames   = new Set();

    this.#history = [];
    let minVal =  Infinity;
    let maxVal = -Infinity;

    for (const si of humanSteps) {
      const ev = trace[si];
      if (!ev?.env) continue;
      const allVars = flattenEnv(ev.env);
      const numVars = new Map();

      for (const [name, val] of allVars) {
        if (BUILTIN_NAMES.has(name)) continue;
        if (typeof val === 'number' && isFinite(val)) {
          numVars.set(name, val);
          varNames.add(name);
          if (val < minVal) minVal = val;
          if (val > maxVal) maxVal = val;
        }
      }

      this.#history.push({ stepIdx: si, vars: numVars });
    }

    this.#allVarMeta = [...varNames].map((name, i) => ({
      name,
      color: LINE_COLORS[i % LINE_COLORS.length],
    }));

    this.#minVal = isFinite(minVal) ? minVal : 0;
    this.#maxVal = isFinite(maxVal) ? maxVal : 1;
    if (this.#minVal === this.#maxVal) {
      this.#minVal -= 1;
      this.#maxVal += 1;
    }

    // デフォルト: 最初の 6 変数を表示
    this.#allVarMeta.slice(0, 6).forEach(m => this.#selectedVars.add(m.name));
  }

  /** 変数選択チップを描画する */
  #renderChips() {
    if (!this.#chipsEl) return;

    this.#chipsEl.innerHTML = this.#allVarMeta.map(m =>
      `<button class="tl-chip${this.#selectedVars.has(m.name) ? ' tl-chip--on' : ''}"
               data-var="${m.name}"
               style="--chip-color:${m.color}">
         ${m.name}
       </button>`
    ).join('');

    this.#chipsEl.addEventListener('click', e => {
      const btn = e.target.closest('.tl-chip');
      if (!btn) return;
      const name = btn.dataset.var;
      if (this.#selectedVars.has(name)) {
        this.#selectedVars.delete(name);
        btn.classList.remove('tl-chip--on');
      } else {
        this.#selectedVars.add(name);
        btn.classList.add('tl-chip--on');
      }
      this.#renderSVG();
    });
  }

  /** SVG 全体を再描画する */
  #renderSVG() {
    if (!this.#svgEl) return;

    // 既存コンテンツを削除
    while (this.#svgEl.firstChild) this.#svgEl.removeChild(this.#svgEl.firstChild);
    this.#cursorLine = null;

    const rect = this.#svgEl.getBoundingClientRect();
    const W = rect.width  > 0 ? rect.width  : 400;
    const H = rect.height > 0 ? rect.height : 240;
    this.#svgW = W;
    this.#svgH = H;

    this.#svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);
    this.#svgEl.setAttribute('width',  W);
    this.#svgEl.setAttribute('height', H);

    const chartW = W - PAD.left - PAD.right;
    const chartH = H - PAD.top  - PAD.bottom;
    const n      = this.#history.length;

    // 選択中の変数のみで Y 軸スケールを動的計算
    let dynMin =  Infinity;
    let dynMax = -Infinity;
    for (const snap of this.#history) {
      for (const name of this.#selectedVars) {
        const v = snap.vars.get(name);
        if (v !== undefined) {
          if (v < dynMin) dynMin = v;
          if (v > dynMax) dynMax = v;
        }
      }
    }
    if (!isFinite(dynMin)) dynMin = this.#minVal;
    if (!isFinite(dynMax)) dynMax = this.#maxVal;
    if (dynMin === dynMax) { dynMin -= 1; dynMax += 1; }

    // スケール関数
    const xOf = (i)  => PAD.left + (n <= 1 ? chartW / 2 : (i / (n - 1)) * chartW);
    const yOf = (val) => PAD.top + chartH
      - ((val - dynMin) / (dynMax - dynMin)) * chartH;

    // ── Y 軸 ───────────────────────────────────────────────────────────────
    const yAxis = this.#el('line', {
      x1: PAD.left, y1: PAD.top,
      x2: PAD.left, y2: PAD.top + chartH,
      stroke: 'var(--border)', 'stroke-width': 1,
    });
    this.#svgEl.appendChild(yAxis);

    // Y 軸ラベル（min / max）
    for (const v of [dynMin, dynMax]) {
      const t = this.#el('text', {
        x: PAD.left - 5, y: yOf(v) + 4,
        'text-anchor': 'end', 'font-size': 10,
        fill: 'var(--text-muted)',
      });
      t.textContent = Number.isInteger(v) ? String(v) : v.toFixed(1);
      this.#svgEl.appendChild(t);
    }

    // ── X 軸 ───────────────────────────────────────────────────────────────
    const xAxis = this.#el('line', {
      x1: PAD.left, y1: PAD.top + chartH,
      x2: PAD.left + chartW, y2: PAD.top + chartH,
      stroke: 'var(--border)', 'stroke-width': 1,
    });
    this.#svgEl.appendChild(xAxis);

    // ── 折れ線 + ドット ────────────────────────────────────────────────────
    const activeMeta = this.#allVarMeta.filter(m => this.#selectedVars.has(m.name));

    for (const meta of activeMeta) {
      const pts = [];
      for (let i = 0; i < n; i++) {
        const val = this.#history[i].vars.get(meta.name);
        if (val !== undefined) pts.push([xOf(i), yOf(val), val]);
      }
      if (pts.length < 1) continue;

      if (pts.length >= 2) {
        const polyline = this.#el('polyline', {
          points: pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '),
          fill: 'none',
          stroke: meta.color,
          'stroke-width': 2,
          'stroke-linejoin': 'round',
        });
        this.#svgEl.appendChild(polyline);
      }

      // ドット（点数が少ないときだけ描く）
      if (n <= 80) {
        for (const [x, y] of pts) {
          const dot = this.#el('circle', {
            cx: x.toFixed(1), cy: y.toFixed(1), r: 3,
            fill: meta.color,
          });
          this.#svgEl.appendChild(dot);
        }
      }
    }

    // ── 現在ステップ縦線（最前面） ─────────────────────────────────────────
    const cursor = this.#el('line', {
      x1: PAD.left, y1: PAD.top,
      x2: PAD.left, y2: PAD.top + chartH,
      stroke: 'var(--text-muted)',
      'stroke-width': 1.5,
      'stroke-dasharray': '4 3',
      opacity: 0.8,
    });
    this.#svgEl.appendChild(cursor);
    this.#cursorLine = cursor;

    // ── 凡例 ───────────────────────────────────────────────────────────────
    let legendX = PAD.left;
    const legendY = H - 8;

    for (const meta of activeMeta) {
      const rect2 = this.#el('rect', {
        x: legendX, y: legendY - 9, width: 12, height: 9,
        fill: meta.color, rx: 2,
      });
      this.#svgEl.appendChild(rect2);

      const t = this.#el('text', {
        x: legendX + 14, y: legendY - 1,
        'font-size': 10, fill: 'var(--text-muted)',
      });
      t.textContent = meta.name;
      this.#svgEl.appendChild(t);

      legendX += meta.name.length * 7 + 22;
    }
  }

  /**
   * カーソル縦線を cursor に対応する X 座標に移動する。
   * @param {number} cursor  現在の trace カーソル
   */
  #moveCursor(cursor) {
    if (!this.#cursorLine || this.#history.length === 0) return;

    const n   = this.#history.length;
    const W   = this.#svgW || 400;
    const chartW = W - PAD.left - PAD.right;

    // cursor 以下の最後の humanStep インデックスを探す
    let hi = -1;
    for (let i = 0; i < n; i++) {
      if (this.#history[i].stepIdx <= cursor) hi = i;
      else break;
    }
    if (hi < 0) hi = 0;

    const x = PAD.left + (n <= 1 ? chartW / 2 : (hi / (n - 1)) * chartW);

    this.#cursorLine.setAttribute('x1', x.toFixed(1));
    this.#cursorLine.setAttribute('x2', x.toFixed(1));
  }

  /**
   * SVG 要素を生成するヘルパー。
   * @param {string} tag
   * @param {Object} attrs
   * @returns {SVGElement}
   */
  #el(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }
}
