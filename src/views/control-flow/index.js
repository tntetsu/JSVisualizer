/**
 * control-flow/index.js — 制御フロービュー（SVG フローチャート）
 *
 * buildControlFlow() が返すノード・エッジデータを SVG で描画する。
 *
 * レイアウト:
 *   ノードは「最初に実行された順」に上から下へ並ぶ。
 *   前向きエッジ（firstSeen が小さい方 → 大きい方）: 右側に弧を描く。
 *   後ろ向きエッジ（ループの戻り）: 左側に弧を描く。
 *   実行回数に応じてノードを青 → 赤でグラデーション表示。
 */

import { BaseView } from '../base-view.js';

const SVG_NS   = 'http://www.w3.org/2000/svg';
const NODE_H   = 36;
const NODE_W   = 320;
const STEP_H   = NODE_H + 26;   // ノード間の垂直ピッチ
const LEFT_PAD = 70;             // 後ろ向きエッジ用の左余白
const RIGHT_PAD = 60;            // 前向きエッジ用の右余白
const PAD_T    = 16;
const PAD_B    = 16;

/** SVG 要素を生成 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** 実行回数に応じたノード塗り色（青 → 橙） */
function nodeColor(count, maxCount) {
  if (maxCount <= 1 || count <= 1) return 'rgba(76,155,232,0.30)';
  const t = Math.min(1, (count - 1) / (maxCount - 1));
  const h = Math.round(220 + t * (-200)); // 220(blue) → 20(orange)
  return `hsla(${h},75%,60%,0.40)`;
}

/** エッジの stroke-opacity を count に応じて決定 */
function edgeOpacity(count) {
  return Math.min(1, 0.35 + count * 0.06).toFixed(2);
}

export class ControlFlow extends BaseView {
  #container = null;
  #svgEl     = null;
  /** @type {Map<number, SVGGElement>} lineNo → <g> */
  #nodeEls   = new Map();
  /** @type {Object|null} buildControlFlow() の結果 */
  #cfData    = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#cfData    = builder ? builder.buildControlFlow() : null;
    this.#nodeEls.clear();

    if (!this.#cfData || this.#cfData.nodes.length === 0) {
      container.innerHTML = '<div class="cf-wrap"><p class="placeholder">実行データがありません</p></div>';
      this.#svgEl = null;
      return;
    }

    container.innerHTML = '<div class="cf-wrap"><svg class="cf-svg" xmlns="http://www.w3.org/2000/svg"></svg></div>';
    this.#svgEl = container.querySelector('.cf-svg');

    const { nodes, edges } = this.#cfData;
    const maxCount = Math.max(...nodes.map(n => n.count), 1);

    // firstSeen インデックス（配列インデックス）で Y 位置を決める
    const indexMap = new Map(nodes.map((n, i) => [n.lineNo, i]));
    const nodeY    = (lineNo) => PAD_T + (indexMap.get(lineNo) ?? 0) * STEP_H;
    const nodeCY   = (lineNo) => nodeY(lineNo) + NODE_H / 2;

    const svgW  = LEFT_PAD + NODE_W + RIGHT_PAD;
    const svgH  = PAD_T + nodes.length * STEP_H + PAD_B;

    this.#svgEl.setAttribute('width',   svgW);
    this.#svgEl.setAttribute('height',  svgH);
    this.#svgEl.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);

    // ── defs: 矢印マーカー（前向き・後ろ向き） ──
    const defs = svgEl('defs');

    const mkMarker = (id, cls) => {
      const m = svgEl('marker', {
        id, markerWidth: 8, markerHeight: 8, refX: 6, refY: 3, orient: 'auto',
      });
      const p = svgEl('path', { class: cls, d: 'M0,0 L0,6 L8,3 z' });
      m.appendChild(p);
      return m;
    };
    defs.appendChild(mkMarker('cf-arr-fwd',  'cf-marker-fwd'));
    defs.appendChild(mkMarker('cf-arr-back', 'cf-marker-back'));
    this.#svgEl.appendChild(defs);

    // ── エッジ（ノードの背後） ──
    const edgesG = svgEl('g', { class: 'cf-edges' });

    for (const edge of edges) {
      const fromIdx = indexMap.get(edge.from);
      const toIdx   = indexMap.get(edge.to);
      if (fromIdx === undefined || toIdx === undefined) continue;

      const isBack = toIdx <= fromIdx;
      const y1  = nodeCY(edge.from);
      const y2  = nodeCY(edge.to);
      const op  = edgeOpacity(edge.count);
      let   d;

      if (isBack) {
        // 後ろ向きエッジ: 左側を通って戻る
        const span  = fromIdx - toIdx;
        const xLeft = Math.max(4, LEFT_PAD - 12 - span * 4);
        d = [
          `M ${LEFT_PAD},${y1 + NODE_H / 2 - 4}`,
          `L ${xLeft},${y1 + NODE_H / 2 - 4}`,
          `L ${xLeft},${y2 - NODE_H / 2 + 4}`,
          `L ${LEFT_PAD},${y2 - NODE_H / 2 + 4}`,
        ].join(' ');
      } else {
        // 前向きエッジ: 右側を通って下る
        const span  = toIdx - fromIdx;
        const xRight = LEFT_PAD + NODE_W + 10 + (span - 1) * 5;
        const cappedX = Math.min(xRight, svgW - 6);
        d = [
          `M ${LEFT_PAD + NODE_W},${y1}`,
          `L ${cappedX},${y1}`,
          `L ${cappedX},${y2}`,
          `L ${LEFT_PAD + NODE_W},${y2}`,
        ].join(' ');
      }

      edgesG.appendChild(svgEl('path', {
        class: isBack ? 'cf-edge cf-edge--back' : 'cf-edge cf-edge--fwd',
        d, fill: 'none',
        'stroke-opacity': op,
        'marker-end': isBack ? 'url(#cf-arr-back)' : 'url(#cf-arr-fwd)',
      }));
    }

    // ── ノード ──
    const nodesG = svgEl('g', { class: 'cf-nodes' });

    for (const node of nodes) {
      const y     = nodeY(node.lineNo);
      const color = nodeColor(node.count, maxCount);

      const g = svgEl('g', {
        class:     'cf-node',
        transform: `translate(${LEFT_PAD},${y})`,
      });

      g.appendChild(svgEl('rect', {
        class: 'cf-rect',
        width: NODE_W, height: NODE_H, rx: 4,
        fill: color,
      }));

      const lnT = svgEl('text', {
        class: 'cf-lineno',
        x: 8, y: NODE_H * 0.66,
      });
      lnT.textContent = node.lineNo;
      g.appendChild(lnT);

      const srcT = svgEl('text', {
        class: 'cf-src',
        x: 34, y: NODE_H * 0.66,
      });
      const maxSrcLen = 34;
      srcT.textContent = node.text.length > maxSrcLen
        ? node.text.slice(0, maxSrcLen - 1) + '…'
        : node.text;
      g.appendChild(srcT);

      const cntT = svgEl('text', {
        class: 'cf-count',
        x: NODE_W - 5, y: NODE_H * 0.66,
        'text-anchor': 'end',
      });
      cntT.textContent = `×${node.count}`;
      g.appendChild(cntT);

      nodesG.appendChild(g);
      this.#nodeEls.set(node.lineNo, g);
    }

    this.#svgEl.append(edgesG, nodesG);
  }

  update(state) {
    if (!this.#svgEl) return;

    const currentLine = state.event?.loc?.line ?? -1;

    for (const [lineNo, g] of this.#nodeEls) {
      if (lineNo === currentLine) {
        g.className.baseVal = 'cf-node cf-node--active';
        g.scrollIntoView?.({ block: 'nearest' });
      } else {
        g.className.baseVal = 'cf-node';
      }
    }
  }

  reset() {}

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#svgEl     = null;
    this.#cfData    = null;
    this.#nodeEls.clear();
  }
}
