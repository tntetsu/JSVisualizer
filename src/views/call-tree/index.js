/**
 * call-tree/index.js — 関数呼び出しツリー（SVG）
 *
 * buildCallTree() が返すノード配列（再帰・非再帰を問わず全関数呼び出し）
 * を SVG ツリーとして描画する。
 *
 * RecursionTree との違い:
 *   - 再帰に限らず全ての関数呼び出しをノードとして表示する
 *   - ノードラベルを `funcName(args)` 形式にして読みやすくする
 *   - 同名の再帰呼び出しも別ノードとして展開表示する
 *
 * ノードの色:
 *   ct-node--future  … まだ呼ばれていない（グレー）
 *   ct-node--active  … 現在実行中（青）
 *   ct-node--done    … 戻り値が確定済み（緑）
 */

import { BaseView }        from '../base-view.js';
import { formatFrameLabel } from '../../utils/format.js';

const SVG_NS  = 'http://www.w3.org/2000/svg';
const NODE_W  = 180;
const NODE_H  = 56;
const COL_GAP = 16;
const ROW_GAP = 44;
const PAD_X   = 20;
const PAD_Y   = 20;

// ── ヘルパー ──────────────────────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function fmtArgShort(v) {
  if (v === undefined || v === null) return String(v);
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    const s = JSON.stringify(v);
    return s.length > 8 ? s.slice(0, 7) + '…"' : s;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const elems = v.slice(0, 3).map(e => fmtArgShort(e)).join(',');
    return v.length > 3 ? `[${elems},…]` : `[${elems}]`;
  }
  if (typeof v === 'object') return '{…}';
  return String(v).slice(0, 10);
}

function fmtNodeLabel(node) {
  const name = node.funcName;
  if (!node.args || node.args.length === 0) return `${name}()`;
  const inner = node.args.map(fmtArgShort).join(', ');
  return `${name}(${inner})`;
}

function fmtRet(val) {
  if (val === undefined) return '';
  return `→ ${fmtArgShort(val)}`;
}

function calcSubtreeWidth(node) {
  if (node.children.length === 0) return NODE_W;
  const childrenW = node.children.reduce((s, c) => s + calcSubtreeWidth(c), 0);
  return childrenW + (node.children.length - 1) * COL_GAP;
}

function assignPositions(node, positions, depth, left) {
  const w  = calcSubtreeWidth(node);
  const cx = left + w / 2;
  const cy = PAD_Y + depth * (NODE_H + ROW_GAP) + NODE_H / 2;
  positions.set(node.id, { cx, cy });
  let childLeft = left;
  for (const child of node.children) {
    const childW = calcSubtreeWidth(child);
    assignPositions(child, positions, depth + 1, childLeft);
    childLeft += childW + COL_GAP;
  }
}

function getMaxDepth(roots) {
  let d = 0;
  function walk(node, depth) {
    if (depth > d) d = depth;
    node.children.forEach(c => walk(c, depth + 1));
  }
  roots.forEach(r => walk(r, 0));
  return d;
}

function nodeStateClass(node, cursor) {
  if (node.callStepIdx > cursor)  return 'ct-node--future';
  if (node.returnStepIdx === null || node.returnStepIdx > cursor) return 'ct-node--active';
  return 'ct-node--done';
}

// ── ビュークラス ──────────────────────────────────────────────────────────

export class CallTree extends BaseView {
  #container = null;
  #svgEl     = null;
  #roots     = [];
  #positions = new Map();
  #nodeEls   = new Map();
  #nodeById  = new Map();

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#roots     = builder ? builder.buildCallTree() : [];
    this.#positions.clear();
    this.#nodeEls.clear();
    this.#nodeById.clear();

    if (this.#roots.length === 0) {
      container.innerHTML = '<div class="ct-wrap"><p class="placeholder">関数呼び出しがありません</p></div>';
      this.#svgEl = null;
      return;
    }

    container.innerHTML = '<div class="ct-wrap"><svg class="ct-svg" role="img" aria-label="関数呼び出しツリー" xmlns="http://www.w3.org/2000/svg"></svg></div>';
    this.#svgEl = container.querySelector('.ct-svg');

    this.#walkNodes(this.#roots, node => this.#nodeById.set(node.id, node));

    let left = PAD_X;
    for (const root of this.#roots) {
      const w = calcSubtreeWidth(root);
      assignPositions(root, this.#positions, 0, left);
      left += w + COL_GAP;
    }

    const totalW = left - COL_GAP + PAD_X;
    const depth  = getMaxDepth(this.#roots);
    const totalH = PAD_Y + (depth + 1) * (NODE_H + ROW_GAP) - ROW_GAP + PAD_Y;

    this.#svgEl.setAttribute('width',   totalW);
    this.#svgEl.setAttribute('height',  totalH);
    this.#svgEl.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

    const edgesG = svgEl('g', { class: 'ct-edges' });
    const nodesG = svgEl('g', { class: 'ct-nodes' });
    this.#svgEl.append(edgesG, nodesG);

    this.#walkNodes(this.#roots, node => {
      const { cx, cy } = this.#positions.get(node.id);

      for (const child of node.children) {
        const { cx: cx2, cy: cy2 } = this.#positions.get(child.id);
        edgesG.appendChild(svgEl('line', {
          class: 'ct-edge',
          x1: cx,  y1: cy + NODE_H / 2,
          x2: cx2, y2: cy2 - NODE_H / 2,
        }));
      }

      const g = svgEl('g', {
        class:     'ct-node',
        transform: `translate(${cx - NODE_W / 2},${cy - NODE_H / 2})`,
      });

      const rect = svgEl('rect', {
        class: 'ct-rect',
        width: NODE_W, height: NODE_H, rx: 6,
      });

      // 行1: funcName(args) ラベル（長い場合は省略）
      const label = fmtNodeLabel(node);
      const nameT = svgEl('text', {
        class: 'ct-label', x: NODE_W / 2, y: 22, 'text-anchor': 'middle',
      });
      nameT.textContent = label.length > 26 ? label.slice(0, 25) + '…' : label;

      // 行2: 戻り値
      const retT = svgEl('text', {
        class: 'ct-retval', x: NODE_W / 2, y: 40, 'text-anchor': 'middle',
      });
      retT.textContent = '';

      // 状態インジケーター（右上）
      const stateT = svgEl('text', {
        class: 'ct-state-icon', x: NODE_W - 6, y: 14, 'text-anchor': 'end',
      });
      stateT.textContent = '…';

      g.append(rect, nameT, retT, stateT);
      nodesG.appendChild(g);
      this.#nodeEls.set(node.id, { g, retT, stateT });
    });
  }

  update(state) {
    if (!this.#svgEl) return;
    const { cursor } = state;

    for (const [id, { g, retT, stateT }] of this.#nodeEls) {
      const node  = this.#nodeById.get(id);
      const stCls = nodeStateClass(node, cursor);
      g.className.baseVal = `ct-node ${stCls}`;

      if (stateT) {
        stateT.textContent = stCls === 'ct-node--future' ? '…'
                           : stCls === 'ct-node--active' ? '▶'
                           : '✓';
      }

      if (node.returnStepIdx !== null && node.returnStepIdx <= cursor) {
        retT.textContent = fmtRet(node.returnVal);
      } else {
        retT.textContent = '';
      }
    }
  }

  reset() {}

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#svgEl     = null;
    this.#roots     = [];
    this.#positions.clear();
    this.#nodeEls.clear();
    this.#nodeById.clear();
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  #walkNodes(roots, fn) {
    function walk(node) { fn(node); node.children.forEach(walk); }
    roots.forEach(walk);
  }
}
