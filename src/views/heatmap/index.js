/**
 * heatmap/index.js — 実行頻度ヒートマップ
 *
 * ソースコードを行単位で表示し、各行の背景色を実行回数に応じて変化させる。
 * 右端に時系列ドット（humanStep ごとに実行した行を点として記録）を表示する。
 * 実行回数は絶対値ではなく割合（実行回数 / 総 humanStep 数）で表示する。
 */

import { BaseView } from '../base-view.js';
import { esc }      from '../../utils/format.js';

/** ドット1個の幅 px */
const DOT_W = 5;
/** ドット最大表示数（幅超過時は先頭を省略） */
const DOT_MAX = 200;

export class Heatmap extends BaseView {
  #container = null;
  #builder   = null;
  #lineEls   = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#builder   = builder;

    const source     = builder.source;
    const heatmap    = builder.buildHeatmap();
    const humanSteps = builder.getHumanStepList();
    const trace      = builder.trace;

    if (!source) {
      container.innerHTML = '<div class="hm-wrap"><p class="hm-empty">ソースコードが利用できません</p></div>';
      return;
    }

    const lines      = source.split('\n');
    const totalSteps = humanSteps.length;
    const counts     = [...heatmap.values()];
    const maxCnt     = counts.length > 0 ? Math.max(...counts) : 1;

    // humanStep ごとの行遷移を時系列で記録（lineNo の配列）
    const timeline = humanSteps.map(si => trace[si]?.loc?.line ?? 0);

    let html = '<div class="hm-wrap"><div class="hm-lines">';

    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      const count  = heatmap.get(lineNo) ?? 0;
      const alpha  = count === 0 ? 0 : 0.08 + (count / maxCnt) * 0.47;
      const pct    = totalSteps > 0 && count > 0
        ? Math.round((count / totalSteps) * 100)
        : 0;
      const cntStr = count > 0 ? `${count}回 (${pct}%)` : '';

      // このドット列で lineNo が実行されたタイムスタンプ（0-indexed humanStep）
      const dotIndices = [];
      for (let t = 0; t < timeline.length; t++) {
        if (timeline[t] === lineNo) dotIndices.push(t);
      }
      const dotsHtml = this.#buildDots(dotIndices, totalSteps);

      html += `<div class="hm-line" data-line="${lineNo}"
                    style="background:rgba(255,140,0,${alpha.toFixed(3)})">
        <span class="hm-lineno">${lineNo}</span>
        <span class="hm-src">${esc(lines[i] || '')}</span>
        <span class="hm-meta">
          <span class="hm-count">${cntStr}</span>
          <span class="hm-dots">${dotsHtml}</span>
        </span>
      </div>`;
    }

    html += '</div></div>';
    container.innerHTML = html;
    this.#lineEls = container.querySelectorAll('.hm-line');
  }

  update(state) {
    if (!this.#lineEls || !this.#container) return;

    this.#lineEls.forEach(el => el.classList.remove('hm-line--active'));

    const lineNo = state.event?.loc?.line;
    if (!lineNo) return;

    const lineEl = this.#container.querySelector(`.hm-line[data-line="${lineNo}"]`);
    if (lineEl) {
      lineEl.classList.add('hm-line--active');
      lineEl.scrollIntoView({ block: 'nearest' });
    }

    // 現在 cursor に対応するドットをハイライト
    const humanSteps = this.#builder?.getHumanStepList() ?? [];
    const cursor = state.cursor;
    // cursor に最も近い humanStep インデックスを探す
    let hi = 0;
    for (let i = 0; i < humanSteps.length; i++) {
      if (humanSteps[i] <= cursor) hi = i;
      else break;
    }
    this.#container.querySelectorAll('.hm-dot--current').forEach(
      el => el.classList.remove('hm-dot--current')
    );
    const dotEl = this.#container.querySelector(`.hm-dot[data-hi="${hi}"]`);
    dotEl?.classList.add('hm-dot--current');
  }

  reset() {
    if (this.#lineEls) {
      this.#lineEls.forEach(el => el.classList.remove('hm-line--active'));
    }
    this.#container?.querySelectorAll('.hm-dot--current').forEach(
      el => el.classList.remove('hm-dot--current')
    );
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#builder   = null;
    this.#lineEls   = null;
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /**
   * humanStep インデックスの配列からドット HTML を生成する。
   * @param {number[]} indices  この行が実行された humanStep インデックスの配列
   * @param {number}   total    総 humanStep 数
   * @returns {string}
   */
  #buildDots(indices, total) {
    if (indices.length === 0) return '';
    // 表示幅制限: 先頭を切り捨てて最後の DOT_MAX 個を使用
    const visible = indices.length > DOT_MAX ? indices.slice(-DOT_MAX) : indices;
    return visible.map(hi =>
      `<span class="hm-dot" data-hi="${hi}" style="left:${(hi / Math.max(total - 1, 1)) * 100}%"></span>`
    ).join('');
  }
}
