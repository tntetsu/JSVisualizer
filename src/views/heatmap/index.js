/**
 * heatmap/index.js — 実行頻度ヒートマップ
 *
 * ソースコードを行単位で表示し、各行の背景色を現在の実行回数に応じて変化させる。
 * 右端に時系列ドット（humanStep ごとの実行タイミングを点で表示）を配置する。
 * - 実行済みドット: アクセントカラー（hm-dot--past）
 * - 現在位置ドット: ハイライト（hm-dot--current）
 * - 未実行ドット: 薄いグレー（デフォルト）
 * 実行回数は「現在の回数 / 総回数」形式で表示し、ステップごとに更新する。
 *
 * 連結線: 異なる行に遷移する連続 humanStep のドット間を縦線で接続する。
 * dotA の右端 → dotB の左端 を .hm-lines 上の オーバーレイ SVG に描画する。
 */

import { BaseView } from '../base-view.js';
import { esc }      from '../../utils/format.js';

/** ドット最大表示数（表示幅超過時は先頭を切り捨て） */
const DOT_MAX = 200;

/** この実行回数以上の行を「異常」として赤表示する */
const ANOMALY_THRESHOLD = 1_000;

export class Heatmap extends BaseView {
  #container      = null;
  #builder        = null;
  #lineEls        = null;
  #dotEls         = null;
  #lineTimeline   = null;  // Map<lineNo, number[]>
  #maxTotal       = 1;
  #crossLinePairs = null;  // [hiA, hiB][] — 異なる行に遷移する連続 humanStep ペア
  #dotMap         = null;  // Map<hi, HTMLElement>
  #overlaySvg     = null;
  #linesEl        = null;

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

    // humanStep ごとの行番号列
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

    // 異なる行に遷移する連続 humanStep ペアを事前計算
    this.#crossLinePairs = [];
    for (let t = 0; t + 1 < timeline.length; t++) {
      if (timeline[t] !== timeline[t + 1] && timeline[t] > 0 && timeline[t + 1] > 0) {
        this.#crossLinePairs.push([t, t + 1]);
      }
    }

    // ── HTML 構築 ─────────────────────────────────────────────────────────
    let html = '<div class="hm-wrap">';
    html += '<div class="hm-lines">';

    for (let i = 0; i < lines.length; i++) {
      const lineNo     = i + 1;
      const dotIndices = lineTimeline.get(lineNo) ?? [];
      const dotsHtml   = this.#buildDots(dotIndices, totalSteps);

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

    // hi → dotElement マップ（連結線描画用）
    this.#dotMap = new Map();
    for (const el of this.#dotEls) {
      this.#dotMap.set(Number(el.dataset.hi), el);
    }

    // オーバーレイ SVG を .hm-lines 内に追加
    const linesEl = container.querySelector('.hm-lines');
    this.#linesEl = linesEl;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('hm-overlay-svg');
    linesEl.appendChild(svg);
    this.#overlaySvg = svg;

    // 連結線を常時表示
    requestAnimationFrame(() => this.#drawConnectLines());
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
      if (dotHi < hi)        el.classList.add('hm-dot--past');
      else if (dotHi === hi) el.classList.add('hm-dot--current');
    }

    // 各行の背景色とカウントテキストを更新
    const maxTotal = this.#maxTotal;
    for (const el of this.#lineEls) {
      const lineNo     = Number(el.dataset.line);
      const lineHis    = this.#lineTimeline?.get(lineNo) ?? [];
      const totalCount = Number(el.querySelector('.hm-count')?.dataset.total ?? 0);

      // バイナリサーチ: lineHis 内で値 ≤ hi の個数
      let lo = 0, hi2 = lineHis.length;
      while (lo < hi2) {
        const mid = (lo + hi2) >> 1;
        if (lineHis[mid] <= hi) lo = mid + 1;
        else hi2 = mid;
      }
      const currentCount = lo;

      el.classList.remove('hm-line--anomaly');
      if (currentCount === 0) {
        el.style.background = '';
      } else if (currentCount >= ANOMALY_THRESHOLD) {
        el.style.background = 'rgba(200,0,0,0.80)';
        el.classList.add('hm-line--anomaly');
      } else {
        // オレンジグラデーション: 999回をスケール上限として正規化
        const normalMax = Math.max(Math.min(maxTotal, ANOMALY_THRESHOLD - 1), 1);
        const alpha = 0.08 + (currentCount / normalMax) * 0.47;
        el.style.background = `rgba(255,140,0,${alpha.toFixed(3)})`;
      }

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
        el.classList.remove('hm-line--active', 'hm-line--anomaly');
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
    this.#container      = null;
    this.#builder        = null;
    this.#lineEls        = null;
    this.#dotEls         = null;
    this.#lineTimeline   = null;
    this.#crossLinePairs = null;
    this.#dotMap         = null;
    this.#overlaySvg     = null;
    this.#linesEl        = null;
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /**
   * humanStep インデックスの配列からドットスパンの HTML を生成する。
   * @param {number[]} indices  この行が実行された humanStep インデックスの配列
   * @param {number}   total    総 humanStep 数
   * @returns {string}
   */
  #buildDots(indices, total) {
    if (indices.length === 0) return '';
    const visible = indices.length > DOT_MAX ? indices.slice(-DOT_MAX) : indices;
    const denom   = Math.max(total - 1, 1);
    return visible.map(hi =>
      `<span class="hm-dot" data-hi="${hi}" style="left:${(hi / denom) * 100}%"></span>`
    ).join('');
  }

  /**
   * 異なる行に遷移する連続 humanStep ペアをオーバーレイ SVG に縦線として描画する。
   * dotA の右端 (x1, y1) → dotB の左端 (x2, y2) を .hm-lines のコンテンツ座標で表す。
   */
  #drawConnectLines() {
    const svg     = this.#overlaySvg;
    const linesEl = this.#linesEl;
    if (!svg || !linesEl || !this.#crossLinePairs) return;

    this.#clearConnectLines();

    const linesRect = linesEl.getBoundingClientRect();
    const scrollTop = linesEl.scrollTop;
    const totalH    = linesEl.scrollHeight;
    const totalW    = linesRect.width;

    svg.setAttribute('width',   totalW.toFixed(0));
    svg.setAttribute('height',  totalH);
    svg.setAttribute('viewBox', `0 0 ${totalW.toFixed(0)} ${totalH}`);
    svg.style.display = 'block';

    for (const [hiA, hiB] of this.#crossLinePairs) {
      const dotA = this.#dotMap.get(hiA);
      const dotB = this.#dotMap.get(hiB);
      if (!dotA || !dotB) continue;

      const rA = dotA.getBoundingClientRect();
      const rB = dotB.getBoundingClientRect();

      // コンテンツ座標 = ビューポート座標 - linesRect.top + scrollTop
      const x1 = rA.right  - linesRect.left;
      const y1 = rA.top + rA.height / 2 - linesRect.top + scrollTop;
      const x2 = rB.left   - linesRect.left;
      const y2 = rB.top + rB.height / 2 - linesRect.top + scrollTop;

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', x1.toFixed(1));
      line.setAttribute('y1', y1.toFixed(1));
      line.setAttribute('x2', x2.toFixed(1));
      line.setAttribute('y2', y2.toFixed(1));
      line.setAttribute('class', 'hm-vline');
      svg.appendChild(line);
    }
  }

  #clearConnectLines() {
    const svg = this.#overlaySvg;
    if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.style.display = 'none';
  }
}
