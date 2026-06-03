/**
 * heatmap/index.js — 実行頻度ヒートマップ
 *
 * ソースコードを行単位で表示し、各行の背景色を現在の実行回数に応じて変化させる。
 * 右端に時系列ドット（humanStep ごとの実行タイミングを点で表示）を配置する。
 * - 実行済みドット: アクセントカラー（hm-dot--past）
 * - 現在位置ドット: ハイライト（hm-dot--current）
 * - 未実行ドット: 薄いグレー（デフォルト）
 * 実行回数は「現在の回数 / 総回数」形式で表示し、ステップごとに更新する。
 */

import { BaseView } from '../base-view.js';
import { esc }      from '../../utils/format.js';

/** ドット最大表示数（表示幅超過時は先頭を切り捨て） */
const DOT_MAX = 200;

export class Heatmap extends BaseView {
  #container    = null;
  #builder      = null;
  #lineEls      = null;
  #dotEls       = null;
  #lineTimeline = null;  // Map<lineNo, number[]> — この行が実行された humanStep インデックス列
  #maxTotal     = 1;     // 全行の中の最大実行回数（背景色正規化用）

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
    this.#maxTotal   = counts.length > 0 ? Math.max(...counts) : 1;

    // humanStep ごとの行遷移（lineNo 配列）
    const timeline = humanSteps.map(si => trace[si]?.loc?.line ?? 0);

    // lineNo → 実行された humanStep インデックスの配列
    const lineTimeline = new Map();
    for (let t = 0; t < timeline.length; t++) {
      const lineNo = timeline[t];
      if (lineNo > 0) {
        if (!lineTimeline.has(lineNo)) lineTimeline.set(lineNo, []);
        lineTimeline.get(lineNo).push(t);
      }
    }
    this.#lineTimeline = lineTimeline;

    let html = '<div class="hm-wrap"><div class="hm-lines">';

    for (let i = 0; i < lines.length; i++) {
      const lineNo    = i + 1;
      const dotIndices = lineTimeline.get(lineNo) ?? [];
      const dotsHtml  = this.#buildDots(dotIndices, totalSteps);

      html += `<div class="hm-line" data-line="${lineNo}" style="">
        <span class="hm-lineno">${lineNo}</span>
        <span class="hm-src">${esc(lines[i] || '')}</span>
        <span class="hm-meta">
          <span class="hm-count" data-total="${dotIndices.length}"></span>
          <span class="hm-dots">${dotsHtml}</span>
        </span>
      </div>`;
    }

    html += '</div></div>';
    container.innerHTML = html;
    this.#lineEls = container.querySelectorAll('.hm-line');
    this.#dotEls  = [...container.querySelectorAll('.hm-dot')];
  }

  update(state) {
    if (!this.#lineEls || !this.#container) return;

    const humanSteps = this.#builder?.getHumanStepList() ?? [];
    const cursor     = state.cursor;

    // cursor に対応する humanStep インデックス（hi）を求める
    let hi = 0;
    for (let i = 0; i < humanSteps.length; i++) {
      if (humanSteps[i] <= cursor) hi = i;
      else break;
    }

    // ドットのクラスを更新（past / current / future）
    for (const el of this.#dotEls) {
      const dotHi = Number(el.dataset.hi);
      el.classList.remove('hm-dot--past', 'hm-dot--current');
      if (dotHi < hi)       el.classList.add('hm-dot--past');
      else if (dotHi === hi) el.classList.add('hm-dot--current');
    }

    // 各行の背景色とカウントテキストを更新
    const maxTotal = this.#maxTotal;
    for (const el of this.#lineEls) {
      const lineNo    = Number(el.dataset.line);
      const lineHis   = this.#lineTimeline?.get(lineNo) ?? [];
      const totalCount = Number(el.querySelector('.hm-count')?.dataset.total ?? 0);

      // バイナリサーチ: lineHis 内で値 ≤ hi の個数
      let lo = 0, hi2 = lineHis.length;
      while (lo < hi2) {
        const mid = (lo + hi2) >> 1;
        if (lineHis[mid] <= hi) lo = mid + 1;
        else hi2 = mid;
      }
      const currentCount = lo;

      const alpha = currentCount === 0 ? 0 : 0.08 + (currentCount / maxTotal) * 0.47;
      el.style.background = `rgba(255,140,0,${alpha.toFixed(3)})`;

      const countEl = el.querySelector('.hm-count');
      if (countEl) {
        countEl.textContent = currentCount > 0 ? `${currentCount}回 / ${totalCount}回` : '';
      }
    }

    // アクティブ行をハイライト
    this.#lineEls.forEach(el => el.classList.remove('hm-line--active'));
    const lineNo = state.event?.loc?.line;
    if (lineNo) {
      const lineEl = this.#container.querySelector(`.hm-line[data-line="${lineNo}"]`);
      if (lineEl) {
        lineEl.classList.add('hm-line--active');
        lineEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  reset() {
    if (this.#lineEls) {
      this.#lineEls.forEach(el => {
        el.classList.remove('hm-line--active');
        el.style.background = '';
        const countEl = el.querySelector('.hm-count');
        if (countEl) countEl.textContent = '';
      });
    }
    if (this.#dotEls) {
      for (const el of this.#dotEls) {
        el.classList.remove('hm-dot--past', 'hm-dot--current');
      }
    }
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container    = null;
    this.#builder      = null;
    this.#lineEls      = null;
    this.#dotEls       = null;
    this.#lineTimeline = null;
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
    const visible = indices.length > DOT_MAX ? indices.slice(-DOT_MAX) : indices;
    return visible.map(hi =>
      `<span class="hm-dot" data-hi="${hi}" style="left:${(hi / Math.max(total - 1, 1)) * 100}%"></span>`
    ).join('');
  }
}
