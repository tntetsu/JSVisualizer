/**
 * lifetime/index.js — 変数ライフタイム（Gantt チャート）
 *
 * X 軸 = humanStep インデックス
 * Y 軸 = 変数（行 = 1変数）
 * バー = その変数が env に存在した区間
 * 縦線 = 現在の humanStep カーソル位置
 *
 * callDepth に応じてバーの色を変える（深い関数呼び出しほど異なる色）。
 */

import { BaseView } from '../base-view.js';

const SVG_NS  = 'http://www.w3.org/2000/svg';
const ROW_H   = 26;
const LABEL_W = 90;   // 変数名ラベルの幅
const CHART_W = 560;  // バー描画領域の幅
const PAD_T   = 36;   // 上余白（軸ラベル用）
const PAD_B   = 20;
const PAD_R   = 16;

/** callDepth に応じたバー色（ライト/ダーク両対応の半透明） */
const DEPTH_COLORS = [
  'rgba(76, 155, 232, 0.65)',  // depth 0: blue
  'rgba(232, 107, 76, 0.65)',  // depth 1: orange
  'rgba(76, 232, 132, 0.65)',  // depth 2: green
  'rgba(200, 76, 232, 0.65)',  // depth 3: purple
  'rgba(232, 200, 76, 0.65)',  // depth 4: yellow
  'rgba(76, 232, 232, 0.65)',  // depth 5: cyan
];
function depthColor(d) { return DEPTH_COLORS[d % DEPTH_COLORS.length]; }

/** SVG 要素を生成 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export class Lifetime extends BaseView {
  #container  = null;
  #svgEl      = null;
  #cursorEl   = null;
  #humanSteps = [];
  #intervals  = [];

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#humanSteps = builder ? builder.getHumanStepList() : [];
    this.#intervals  = builder ? builder.buildLifetime() : [];
    this.#cursorEl   = null;

    if (this.#intervals.length === 0) {
      container.innerHTML = '<div class="lf-wrap"><p class="placeholder">変数が見つかりません</p></div>';
      this.#svgEl = null;
      return;
    }

    container.innerHTML = '<div class="lf-wrap"><svg class="lf-svg" xmlns="http://www.w3.org/2000/svg"></svg></div>';
    this.#svgEl = container.querySelector('.lf-svg');

    const N      = this.#intervals.length;
    const MAX_HI = Math.max(1, this.#humanSteps.length - 1);
    const svgW   = LABEL_W + CHART_W + PAD_R;
    const svgH   = PAD_T + N * ROW_H + PAD_B;

    this.#svgEl.setAttribute('width',   svgW);
    this.#svgEl.setAttribute('height',  svgH);
    this.#svgEl.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);

    /** humanStep インデックス → X 座標 */
    const hiToX = (hi) => LABEL_W + (hi / MAX_HI) * CHART_W;

    // ── 軸 ──
    const axisG = svgEl('g', { class: 'lf-axis' });

    // X 軸線
    axisG.appendChild(svgEl('line', {
      class: 'lf-axis-line',
      x1: LABEL_W, y1: PAD_T - 2,
      x2: LABEL_W + CHART_W, y2: PAD_T - 2,
    }));

    // X 軸目盛り（適宜間引き）
    const tickCount = Math.min(10, MAX_HI);
    for (let t = 0; t <= tickCount; t++) {
      const hi = Math.round((t / tickCount) * MAX_HI);
      const x  = hiToX(hi);
      axisG.appendChild(svgEl('line', {
        class: 'lf-tick',
        x1: x, y1: PAD_T - 2, x2: x, y2: PAD_T + 4,
      }));
      const label = svgEl('text', {
        class: 'lf-tick-label',
        x: x, y: PAD_T - 6, 'text-anchor': 'middle',
      });
      label.textContent = hi;
      axisG.appendChild(label);
    }

    this.#svgEl.appendChild(axisG);

    // ── バーと変数名ラベル ──
    const barsG = svgEl('g', { class: 'lf-bars' });

    for (let i = 0; i < N; i++) {
      const iv   = this.#intervals[i];
      const y    = PAD_T + i * ROW_H;
      const x1   = hiToX(iv.startHi);
      const x2   = hiToX(iv.endHi);
      const barW = Math.max(3, x2 - x1);
      const color = depthColor(iv.callDepth);

      // 変数名ラベル
      const labelEl = svgEl('text', {
        class: 'lf-label',
        x: LABEL_W - 6, y: y + ROW_H * 0.68,
        'text-anchor': 'end',
      });
      // callDepth > 0 は indent で視覚的に区別
      labelEl.textContent = ' '.repeat(iv.callDepth * 2) + iv.varName;
      barsG.appendChild(labelEl);

      // バー
      barsG.appendChild(svgEl('rect', {
        class: 'lf-bar',
        x: x1, y: y + 4,
        width: barW, height: ROW_H - 8,
        rx: 3, fill: color,
      }));
    }

    // ── カーソル線（初期位置 x = LABEL_W）──
    this.#cursorEl = svgEl('line', {
      class: 'lf-cursor',
      x1: LABEL_W, x2: LABEL_W,
      y1: PAD_T - 2, y2: PAD_T + N * ROW_H,
    });

    this.#svgEl.append(barsG, this.#cursorEl);
  }

  update(state) {
    if (!this.#cursorEl) return;

    // cursor 以下の最大 humanStep インデックスを探す
    const { cursor } = state;
    let hi = 0;
    for (let i = 0; i < this.#humanSteps.length; i++) {
      if (this.#humanSteps[i] <= cursor) hi = i;
      else break;
    }

    const MAX_HI = Math.max(1, this.#humanSteps.length - 1);
    const x = LABEL_W + (hi / MAX_HI) * CHART_W;
    this.#cursorEl.setAttribute('x1', x);
    this.#cursorEl.setAttribute('x2', x);
  }

  reset() {}

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#svgEl      = null;
    this.#cursorEl   = null;
    this.#humanSteps = [];
    this.#intervals  = [];
  }
}
