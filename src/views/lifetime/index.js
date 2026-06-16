/**
 * lifetime/index.js — コールスタック時系列ビュー（フレームグラフ）
 *
 * X 軸 = humanStep インデックス
 * Y 軸 = 呼び出し深さ（depth 0 が最下段 = グローバル、上に行くほど深い）
 * 各バーに「実引数付き関数名＋その時点の変数」を init() 時に静的描画
 * 縦線 = 現在の humanStep カーソル位置
 */

import { BaseView } from '../base-view.js';
import { esc, BUILTIN_NAMES, mergeScopesForDisplay } from '../../utils/format.js';

const SVG_NS      = 'http://www.w3.org/2000/svg';
const XHTML       = 'http://www.w3.org/1999/xhtml';
const ROW_H       = 68;
const LABEL_W     = 32;
const MIN_CHART_W = 580;
const CHAR_PX     = 5;   // approximate px per character at 11px monospace (Cascadia Code ~6px, 0.7× scale)
const BAR_PAD     = 14;  // horizontal padding inside a bar
const PAD_T       = 36;
const PAD_B       = 8;

const DEPTH_COLORS = [
  'rgba(76, 155, 232, 0.72)',
  'rgba(232, 107,  76, 0.72)',
  'rgba( 76, 200, 132, 0.72)',
  'rgba(200,  76, 232, 0.72)',
  'rgba(232, 200,  76, 0.72)',
  'rgba( 76, 232, 232, 0.72)',
];
function depthColor(d) { return DEPTH_COLORS[d % DEPTH_COLORS.length]; }

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** 値をプレーン文字列に変換（バー内表示用） */
function fmtPlain(v) {
  if (v === null)      return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'function') return '[native fn]';
  if (typeof v !== 'object') {
    const s = typeof v === 'string' ? JSON.stringify(v) : String(v);
    return s.length > 18 ? s.slice(0, 17) + '…' : s;
  }
  if (v.__type__ === 'JSFunction') return '[Function]';
  if (v.__type__ === 'JSClass')    return '[Class]';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    const elems = v.slice(0, 3).map(fmtPlain).join(', ');
    return v.length > 3 ? `[${elems}, …]` : `[${elems}]`;
  }
  const keys = Object.keys(v).filter(k => !k.startsWith('__'));
  if (!keys.length) return '{}';
  const pairs = keys.slice(0, 2).map(k => `${k}: ${fmtPlain(v[k])}`).join(', ');
  return '{' + pairs + (keys.length > 2 ? ', …' : '') + '}';
}

function isJSFunc(v) {
  return typeof v === 'function' ||
    (v != null && typeof v === 'object' &&
      (v.__type__ === 'JSFunction' || v.__type__ === 'JSClass'));
}

/**
 * トレースから深さ別の関数呼び出し区間リストを構築する。
 * 各 humanStep で callStack を参照し、同じ深さで同じ関数が連続する区間を
 * ひとつのセグメントにまとめる。
 */
function buildFlameSegments(trace, humanSteps) {
  if (!humanSteps.length) return { segments: [], maxDepth: 0 };

  let maxDepth = 0;
  for (const idx of humanSteps) {
    maxDepth = Math.max(maxDepth, trace[idx].callDepth);
  }

  const segments = [];
  const N = humanSteps.length;

  for (let d = 0; d <= maxDepth; d++) {
    let curName  = null;
    let curStart = 0;

    for (let hi = 0; hi < N; hi++) {
      const ev = trace[humanSteps[hi]];
      const name = d === 0
        ? '(global)'
        : ev.callDepth >= d
          ? (ev.callStack[d - 1]?.name || '(anonymous)')
          : null;

      if (name !== curName) {
        if (curName !== null) {
          segments.push({ depth: d, startHi: curStart, endHi: hi - 1, name: curName });
        }
        curName  = name;
        curStart = hi;
      }
    }
    if (curName !== null) {
      segments.push({ depth: d, startHi: curStart, endHi: N - 1, name: curName });
    }
  }

  return { segments, maxDepth };
}

/**
 * バー 1 本分の HTML コンテンツを構築する。
 * トレースイベント ev（バー末尾の humanStep）から変数スナップショットを取得し、
 * depth に対応するフレームの「実引数付き関数名＋変数一覧」を返す。
 */
function buildBarHTML(seg, ev) {
  // depth d のフレームは displayScopes[N - d]（N = ev.callDepth）
  const N = ev.callDepth;
  const displayIdx = seg.depth === 0 ? N : N - seg.depth;
  const displayScopes = mergeScopesForDisplay(ev.env, ev.callStack, ev.frameEnvs);
  const scope = displayIdx >= 0 && displayIdx < displayScopes.length
    ? displayScopes[displayIdx]
    : null;

  if (!scope) {
    return `<div class="lf-bc-name">${esc(seg.name)}</div>`;
  }

  const entries = Object.entries(scope.vars)
    .filter(([k, v]) => !BUILTIN_NAMES.has(k) && !isJSFunc(v));

  let html = `<div class="lf-bc-name">${esc(scope.label)}</div>`;
  if (entries.length) {
    html += '<div class="lf-bc-vars">';
    for (const [vname, val] of entries) {
      html += `<div class="lf-bc-var">` +
        `<span class="lf-bc-vn">${esc(vname)}</span>` +
        `<span class="lf-bc-eq">=</span>` +
        `<span class="lf-bc-vv">${esc(fmtPlain(val))}</span>` +
        `</div>`;
    }
    html += '</div>';
  }
  return html;
}

export class Lifetime extends BaseView {
  #container  = null;
  #svgEl      = null;
  #cursorEl   = null;
  #humanSteps = [];
  #barEls     = [];   // { rectEl, startHi, endHi }[]
  #hiToX      = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#humanSteps = builder ? builder.getHumanStepList() : [];
    this.#barEls     = [];
    this.#cursorEl   = null;
    this.#hiToX      = null;

    const trace = builder ? builder.trace : [];
    const { segments, maxDepth } = buildFlameSegments(trace, this.#humanSteps);
    const N = this.#humanSteps.length;

    if (N === 0 || segments.length === 0) {
      container.innerHTML = '<div class="lf-wrap"><p class="placeholder">No execution data</p></div>';
      this.#svgEl = null;
      return;
    }

    container.innerHTML = '<div class="lf-wrap"><svg class="lf-svg" xmlns="http://www.w3.org/2000/svg"></svg></div>';
    this.#svgEl = container.querySelector('.lf-svg');

    const MAX_HI = Math.max(1, N - 1);
    const rows   = maxDepth + 1;

    // Compute minimum CHART_W needed so that even the shortest bar can show its label.
    // Each segment needs: barW = (span / MAX_HI) * CHART_W >= approxLabelPx
    // => CHART_W >= approxLabelPx * MAX_HI / span
    let neededW = MIN_CHART_W;
    for (const seg of segments) {
      const span = seg.endHi - seg.startHi + 1;
      const approxChars = Math.max(seg.name.length + 6, 8); // name + "(args)\nn=v" overhead
      const approxLabelPx = approxChars * CHAR_PX + BAR_PAD;
      neededW = Math.max(neededW, Math.ceil(approxLabelPx * MAX_HI / span));
    }
    // Cap at 3× MIN_CHART_W to avoid excessive horizontal scroll
    const CHART_W = Math.min(neededW, MIN_CHART_W * 3);
    const svgW    = LABEL_W + CHART_W + 12;
    const svgH    = PAD_T + rows * ROW_H + PAD_B;

    this.#svgEl.setAttribute('width',   svgW);
    this.#svgEl.setAttribute('height',  svgH);
    this.#svgEl.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);

    const hiToX    = (hi) => LABEL_W + (hi / MAX_HI) * CHART_W;
    const depthToY = (d)  => PAD_T + (maxDepth - d) * ROW_H;
    this.#hiToX = hiToX;

    // ── X 軸 ──────────────────────────────────────────────────────────────
    const axisG = svgEl('g', { class: 'lf-axis' });
    axisG.appendChild(svgEl('line', {
      class: 'lf-axis-line',
      x1: LABEL_W, y1: PAD_T - 2,
      x2: LABEL_W + CHART_W, y2: PAD_T - 2,
    }));
    const tickCount = Math.min(10, MAX_HI);
    for (let t = 0; t <= tickCount; t++) {
      const hi = Math.round((t / tickCount) * MAX_HI);
      const x  = hiToX(hi);
      axisG.appendChild(svgEl('line', {
        class: 'lf-tick',
        x1: x, y1: PAD_T - 2, x2: x, y2: PAD_T + 4,
      }));
      const lbl = svgEl('text', {
        class: 'lf-tick-label',
        x, y: PAD_T - 6, 'text-anchor': 'middle',
      });
      lbl.textContent = hi;
      axisG.appendChild(lbl);
    }
    this.#svgEl.appendChild(axisG);

    // ── 行区切り線と深さラベル ────────────────────────────────────────────
    const rowsG = svgEl('g', { class: 'lf-rows' });
    for (let d = 0; d <= maxDepth; d++) {
      const y = depthToY(d);
      rowsG.appendChild(svgEl('line', {
        class: 'lf-row-sep',
        x1: LABEL_W, y1: y, x2: LABEL_W + CHART_W, y2: y,
      }));
      const depthLbl = svgEl('text', {
        class: 'lf-depth-label',
        x: LABEL_W - 4, y: y + ROW_H * 0.5,
        'text-anchor': 'end',
      });
      depthLbl.textContent = d;
      rowsG.appendChild(depthLbl);
    }
    rowsG.appendChild(svgEl('line', {
      class: 'lf-row-sep',
      x1: LABEL_W, y1: depthToY(0) + ROW_H,
      x2: LABEL_W + CHART_W, y2: depthToY(0) + ROW_H,
    }));
    this.#svgEl.appendChild(rowsG);

    // ── フレームバー（全て静的に描画） ────────────────────────────────────
    const barsG = svgEl('g', { class: 'lf-bars' });
    for (const seg of segments) {
      const x1   = hiToX(seg.startHi);
      const x2   = seg.endHi >= MAX_HI ? LABEL_W + CHART_W : hiToX(seg.endHi + 1);
      const barW = Math.max(2, x2 - x1);
      const y    = depthToY(seg.depth);

      // 背景矩形
      const rectEl = svgEl('rect', {
        class: 'lf-bar',
        x: x1, y: y + 2,
        width: barW, height: ROW_H - 4,
        rx: 3, fill: depthColor(seg.depth),
      });
      barsG.appendChild(rectEl);
      this.#barEls.push({ rectEl, startHi: seg.startHi, endHi: seg.endHi });

      // コンテンツ（foreignObject 内 HTML）
      // 変数値はバー末尾の humanStep 時点のスナップショットを使用
      const fo = document.createElementNS(SVG_NS, 'foreignObject');
      fo.setAttribute('x',      x1 + 4);
      fo.setAttribute('y',      y + 4);
      fo.setAttribute('width',  Math.max(0, barW - 8));
      fo.setAttribute('height', ROW_H - 8);

      const contentEl = document.createElementNS(XHTML, 'div');
      contentEl.className = 'lf-bc';

      const endEv = trace[this.#humanSteps[seg.endHi]];
      contentEl.innerHTML = buildBarHTML(seg, endEv);

      fo.appendChild(contentEl);
      barsG.appendChild(fo);
    }
    this.#svgEl.appendChild(barsG);

    // ── カーソル線 ────────────────────────────────────────────────────────
    this.#cursorEl = svgEl('line', {
      class: 'lf-cursor',
      x1: LABEL_W, x2: LABEL_W,
      y1: PAD_T - 2, y2: depthToY(0) + ROW_H,
    });
    this.#svgEl.appendChild(this.#cursorEl);
  }

  update(state) {
    if (!this.#cursorEl) return;

    let hi = 0;
    const { cursor } = state;
    for (let i = 0; i < this.#humanSteps.length; i++) {
      if (this.#humanSteps[i] <= cursor) hi = i;
      else break;
    }

    // カーソル線を移動
    const x = this.#hiToX(hi);
    this.#cursorEl.setAttribute('x1', x);
    this.#cursorEl.setAttribute('x2', x);

    // カーソルが重なるバーをハイライト
    for (const { rectEl, startHi, endHi } of this.#barEls) {
      rectEl.classList.toggle('lf-bar--active', hi >= startHi && hi <= endHi);
    }
  }

  reset() {}

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#svgEl      = null;
    this.#cursorEl   = null;
    this.#humanSteps = [];
    this.#barEls     = [];
    this.#hiToX      = null;
  }
}
