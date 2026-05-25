/**
 * heatmap/index.js — 実行頻度ヒートマップ
 *
 * ソースコードを行単位で表示し、各行の背景色を実行回数に応じて変化させる。
 * - 初期化時に静的レンダリング（ヒートマップは trace から計算済み）
 * - update() 時は現在実行中の行をアウトラインでハイライト
 * - 実行回数をコード右端に表示
 */

import { BaseView } from '../base-view.js';
import { esc }      from '../../utils/format.js';

export class Heatmap extends BaseView {
  /** @type {HTMLElement|null} */
  #container = null;

  /** @type {import('../../core/trace-builder.js').TraceBuilder|null} */
  #builder   = null;

  /** @type {NodeListOf<Element>|null} */
  #lineEls   = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#builder   = builder;

    const source  = builder.source;
    const heatmap = builder.buildHeatmap();

    if (!source) {
      container.innerHTML = '<div class="hm-wrap"><p class="hm-empty">ソースコードが利用できません</p></div>';
      return;
    }

    const lines   = source.split('\n');
    const counts  = [...heatmap.values()];
    const maxCnt  = counts.length > 0 ? Math.max(...counts) : 1;

    let html = '<div class="hm-wrap"><div class="hm-lines">';

    for (let i = 0; i < lines.length; i++) {
      const lineNo  = i + 1;
      const count   = heatmap.get(lineNo) ?? 0;
      // alpha: 実行なし=0、最大実行=0.55 のオレンジ背景
      const alpha   = count === 0 ? 0 : 0.08 + (count / maxCnt) * 0.47;

      html += `<div class="hm-line" data-line="${lineNo}"
                    style="background:rgba(255,140,0,${alpha.toFixed(3)})">
        <span class="hm-lineno">${lineNo}</span>
        <span class="hm-src">${esc(lines[i] || '')}</span>
        <span class="hm-count">${count > 0 ? count : ''}</span>
      </div>`;
    }

    html += '</div></div>';
    container.innerHTML = html;
    this.#lineEls = container.querySelectorAll('.hm-line');
  }

  update(state) {
    if (!this.#lineEls || !this.#container) return;

    // 既存のアクティブハイライトを除去
    this.#lineEls.forEach(el => el.classList.remove('hm-line--active'));

    const lineNo = state.event?.loc?.line;
    if (!lineNo) return;

    const lineEl = this.#container.querySelector(`.hm-line[data-line="${lineNo}"]`);
    if (lineEl) {
      lineEl.classList.add('hm-line--active');
      lineEl.scrollIntoView({ block: 'nearest' });
    }
  }

  reset() {
    // ヒートマップは静的なのでアクティブハイライトだけ除去
    if (this.#lineEls) {
      this.#lineEls.forEach(el => el.classList.remove('hm-line--active'));
    }
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#builder   = null;
    this.#lineEls   = null;
  }
}
