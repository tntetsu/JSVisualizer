/**
 * recursion-tree/index.js — 再帰呼び出しツリー（SVG）
 *
 * buildRecursionTree() が返すノード配列を SVG ツリーとして描画する。
 *
 * ノードの色:
 *   rt-node--future  … まだ呼ばれていない（グレー）
 *   rt-node--active  … 現在実行中（青）
 *   rt-node--done    … 戻り値が確定済み（緑）
 */

import { BaseView } from '../base-view.js';

const SVG_NS  = 'http://www.w3.org/2000/svg';
const NODE_W  = 136;
const NODE_H  = 72;
const COL_GAP = 18;   // 兄弟ノード間の水平隙間
const ROW_GAP = 52;   // 深さレベル間の垂直隙間
const PAD_X   = 24;
const PAD_Y   = 24;

// ── ヘルパー ──────────────────────────────────────────────────────────────

/** SVG 要素を生成 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** 引数値を短い文字列にフォーマット */
function fmtArg(v) {
  if (v === undefined || v === null) return String(v);
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    const s = JSON.stringify(v);
    return s.length > 10 ? s.slice(0, 9) + '…"' : s;
  }
  if (Array.isArray(v)) return '[…]';
  if (typeof v === 'object') return '{…}';
  return String(v).slice(0, 8);
}

function fmtArgs(args) {
  if (!args || args.length === 0) return '()';
  const inner = args.slice(0, 3).map(fmtArg).join(', ') + (args.length > 3 ? ', …' : '');
  return `(${inner})`;
}

function fmtRet(val) {
  if (val === undefined) return '';
  return `→ ${fmtArg(val)}`;
}

/** サブツリー幅（px）を再帰計算 */
function calcSubtreeWidth(node) {
  if (node.children.length === 0) return NODE_W;
  const childrenW = node.children.reduce((s, c) => s + calcSubtreeWidth(c), 0);
  return childrenW + (node.children.length - 1) * COL_GAP;
}

/**
 * ノード中心座標を計算して positions Map に格納する
 * @param {Object} node
 * @param {Map}    positions  id → {cx, cy}
 * @param {number} depth      ツリー深さ
 * @param {number} left       このサブツリーの左端 px
 */
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

/** ツリーの最大深さ */
function getMaxDepth(roots) {
  let d = 0;
  function walk(node, depth) {
    if (depth > d) d = depth;
    node.children.forEach(c => walk(c, depth + 1));
  }
  roots.forEach(r => walk(r, 0));
  return d;
}

/** カーソル位置に基づくノード状態クラス */
function nodeStateClass(node, cursor) {
  if (node.callStepIdx > cursor)   return 'rt-node--future';
  if (node.returnStepIdx === null || node.returnStepIdx > cursor) return 'rt-node--active';
  return 'rt-node--done';
}

// ── ビュークラス ──────────────────────────────────────────────────────────

export class RecursionTree extends BaseView {
  /** @type {HTMLElement|null} */
  #container = null;

  /** @type {SVGSVGElement|null} */
  #svgEl = null;

  /** @type {Object[]} ルートノード配列 */
  #roots = [];

  /** @type {Map<number, {cx:number, cy:number}>} id → 中心座標 */
  #positions = new Map();

  /**
   * @type {Map<number, {g: SVGGElement, retT: SVGTextElement, stateT: SVGTextElement}>}
   * id → SVG 要素参照
   */
  #nodeEls = new Map();

  /** @type {Map<number, Object>} id → ノードオブジェクト */
  #nodeById = new Map();

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#roots     = builder ? builder.buildRecursionTree() : [];
    this.#positions.clear();
    this.#nodeEls.clear();
    this.#nodeById.clear();

    if (this.#roots.length === 0) {
      container.innerHTML = '<div class="rt-wrap"><p class="placeholder">関数呼び出しがありません</p></div>';
      this.#svgEl = null;
      return;
    }

    container.innerHTML = '<div class="rt-wrap"><svg class="rt-svg" role="img" aria-label="再帰呼び出しツリー" xmlns="http://www.w3.org/2000/svg"></svg></div>';
    this.#svgEl = container.querySelector('.rt-svg');

    // 全ノードを id → object に登録
    this.#walkNodes(this.#roots, node => this.#nodeById.set(node.id, node));

    // 座標計算
    let left = PAD_X;
    for (const root of this.#roots) {
      const w = calcSubtreeWidth(root);
      assignPositions(root, this.#positions, 0, left);
      left += w + COL_GAP;
    }

    // SVG サイズ
    const totalW = left - COL_GAP + PAD_X;
    const depth  = getMaxDepth(this.#roots);
    const totalH = PAD_Y + (depth + 1) * (NODE_H + ROW_GAP) - ROW_GAP + PAD_Y;

    this.#svgEl.setAttribute('width',   totalW);
    this.#svgEl.setAttribute('height',  totalH);
    this.#svgEl.setAttribute('viewBox', `0 0 ${totalW} ${totalH}`);

    // エッジを先に描画（ノードの背後に来るよう）
    const edgesG = svgEl('g', { class: 'rt-edges' });
    const nodesG = svgEl('g', { class: 'rt-nodes' });
    this.#svgEl.append(edgesG, nodesG);

    this.#walkNodes(this.#roots, node => {
      const { cx, cy } = this.#positions.get(node.id);

      // 子へのエッジ
      for (const child of node.children) {
        const { cx: cx2, cy: cy2 } = this.#positions.get(child.id);
        edgesG.appendChild(svgEl('line', {
          class: 'rt-edge',
          x1: cx,  y1: cy + NODE_H / 2,
          x2: cx2, y2: cy2 - NODE_H / 2,
        }));
      }

      // ノード <g>
      const g = svgEl('g', {
        class:     'rt-node',
        transform: `translate(${cx - NODE_W / 2},${cy - NODE_H / 2})`,
      });

      const rect = svgEl('rect', {
        class: 'rt-rect',
        width: NODE_W, height: NODE_H, rx: 6,
      });

      // 関数名 + 引数テキスト（2行に折る）
      const nameStr = node.funcName;
      const argsStr = fmtArgs(node.args);
      const nameT = svgEl('text', {
        class: 'rt-name', x: NODE_W / 2, y: 20, 'text-anchor': 'middle',
      });
      nameT.textContent = nameStr;

      const argsT = svgEl('text', {
        class: 'rt-args', x: NODE_W / 2, y: 38, 'text-anchor': 'middle',
      });
      argsT.textContent = argsStr;

      const retT = svgEl('text', {
        class: 'rt-retval', x: NODE_W / 2, y: 58, 'text-anchor': 'middle',
      });
      retT.textContent = '';

      // 状態インジケーター（右上角: 色以外の手がかり）
      const stateT = svgEl('text', {
        class: 'rt-state-icon', x: NODE_W - 8, y: 14, 'text-anchor': 'end',
      });
      stateT.textContent = '…';

      g.append(rect, nameT, argsT, retT, stateT);
      nodesG.appendChild(g);
      this.#nodeEls.set(node.id, { g, retT, stateT });
    });
  }

  update(state) {
    if (!this.#svgEl) return;

    const { cursor } = state;

    for (const [id, { g, retT, stateT }] of this.#nodeEls) {
      const node   = this.#nodeById.get(id);
      const stCls  = nodeStateClass(node, cursor);
      g.className.baseVal = `rt-node ${stCls}`;

      // 状態テキスト（色覚多様性対応: 形・記号でも状態を表現）
      if (stateT) {
        stateT.textContent = stCls === 'rt-node--future' ? '…'
                           : stCls === 'rt-node--active' ? '▶'
                           : '✓';
      }

      if (node.returnStepIdx !== null && node.returnStepIdx <= cursor) {
        retT.textContent = fmtRet(node.returnVal);
      } else {
        retT.textContent = '';
      }
    }
  }

  reset() {
    // ViewSwitcher が onReady で destroy → remount するため軽量処理のみ
  }

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

  /** ツリーを DFS で走査してコールバックを呼ぶ */
  #walkNodes(roots, fn) {
    function walk(node) {
      fn(node);
      node.children.forEach(walk);
    }
    roots.forEach(walk);
  }
}
