/**
 * call-tree/index.js — 関数呼び出しツリー（SVG）
 *
 * buildCallTree() が返すノード配列（再帰・非再帰を問わず全関数呼び出し）
 * を SVG ツリーとして描画する。
 *
 * RecursionTree との違い:
 *   - 再帰に限らず全ての関数呼び出しをノードとして表示する
 *   - 同名の再帰呼び出しも別ノードとして展開表示する
 * （表示形式・cost はいずれも RecursionTree と共通。RecursionTree は
 *   ADR-027 により非アクティブ化され、CallTree が両者を統合する）
 *
 * ノードの色:
 *   ct-node--future  … まだ呼ばれていない（グレー）
 *   ct-node--active  … 現在実行中（青）
 *   ct-node--done    … 戻り値が確定済み（緑）
 */

import { BaseView } from '../base-view.js';
import { t }        from '../../i18n.js';

const SVG_NS  = 'http://www.w3.org/2000/svg';
const NODE_W  = 160;   // 引数表示のため幅を拡大
const NODE_H  = 80;    // 3行 + 余白
const COL_GAP = 20;
const ROW_GAP = 52;
const PAD_X   = 24;
const PAD_Y   = 24;

// ── ヘルパー ──────────────────────────────────────────────────────────────

/** SVG 要素を生成 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** 引数値を読みやすい文字列にフォーマット（配列要素を展開） */
function fmtArg(v, maxLen = 18) {
  if (v === undefined || v === null) return String(v);
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    const s = JSON.stringify(v);
    return s.length > maxLen ? s.slice(0, maxLen - 1) + '…"' : s;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const elems = v.slice(0, 4).map(e => fmtArg(e, 6)).join(', ');
    return v.length > 4 ? `[${elems}, …]` : `[${elems}]`;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter(k => !k.startsWith('__'));
    return keys.length === 0 ? '{}' : `{${keys[0]}:…}`;
  }
  return String(v).slice(0, maxLen);
}

/** 引数リストを NODE_W に収まるよう2行に分割して返す（['行1', '行2'] or ['行1']） */
function fmtArgsLines(args) {
  if (!args || args.length === 0) return ['()'];
  const inner = args.map(a => fmtArg(a)).join(', ');
  const full  = `(${inner})`;
  if (full.length <= 20) return [full];
  // 長い場合: args を2行に分割
  const half  = Math.ceil(args.length / 2);
  const line1 = `(${args.slice(0, half).map(a => fmtArg(a)).join(', ')}`;
  const line2 = ` ${args.slice(half).map(a => fmtArg(a)).join(', ')})`;
  return [line1, line2];
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
  if (node.callStepIdx > cursor)   return 'ct-node--future';
  if (node.returnStepIdx === null || node.returnStepIdx > cursor) return 'ct-node--active';
  return 'ct-node--done';
}

// ── ビュークラス ──────────────────────────────────────────────────────────

export class CallTree extends BaseView {
  static hasContent(builder) {
    return builder ? builder.buildCallTree().length > 0 : false;
  }

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
    this.#roots     = builder ? builder.buildCallTree() : [];
    this.#positions.clear();
    this.#nodeEls.clear();
    this.#nodeById.clear();

    if (this.#roots.length === 0) {
      container.innerHTML = '<div class="ct-wrap"><p class="placeholder">No function calls</p></div>';
      this.#svgEl = null;
      return;
    }

    container.innerHTML = `<div class="ct-wrap"><svg class="ct-svg" role="img" aria-label="${t('calltree-aria')}" xmlns="http://www.w3.org/2000/svg"></svg></div>`;
    this.#svgEl = container.querySelector('.ct-svg');

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
    const edgesG = svgEl('g', { class: 'ct-edges' });
    const nodesG = svgEl('g', { class: 'ct-nodes' });
    this.#svgEl.append(edgesG, nodesG);

    this.#walkNodes(this.#roots, node => {
      const { cx, cy } = this.#positions.get(node.id);

      // 子へのエッジ
      for (const child of node.children) {
        const { cx: cx2, cy: cy2 } = this.#positions.get(child.id);
        edgesG.appendChild(svgEl('line', {
          class: 'ct-edge',
          x1: cx,  y1: cy + NODE_H / 2,
          x2: cx2, y2: cy2 - NODE_H / 2,
        }));
      }

      // ノード <g>
      const g = svgEl('g', {
        class:     'ct-node',
        transform: `translate(${cx - NODE_W / 2},${cy - NODE_H / 2})`,
      });

      const rect = svgEl('rect', {
        class: 'ct-rect',
        width: NODE_W, height: NODE_H, rx: 6,
      });

      // 関数名（行1）
      const nameT = svgEl('text', {
        class: 'ct-name', x: NODE_W / 2, y: 18, 'text-anchor': 'middle',
      });
      nameT.textContent = node.funcName;

      // 引数（行2, 長ければ行3も使用）
      const argsLines = fmtArgsLines(node.args);
      const argsT = svgEl('text', {
        class: 'ct-args', x: NODE_W / 2, y: 35, 'text-anchor': 'middle',
      });
      argsT.textContent = argsLines[0];

      let argsT2 = null;
      if (argsLines.length > 1) {
        argsT2 = svgEl('text', {
          class: 'ct-args', x: NODE_W / 2, y: 50, 'text-anchor': 'middle',
        });
        argsT2.textContent = argsLines[1];
      }

      // 戻り値（行3 or 行4）
      const retY = argsLines.length > 1 ? 65 : 52;
      const retT = svgEl('text', {
        class: 'ct-retval', x: NODE_W / 2, y: retY, 'text-anchor': 'middle',
      });
      retT.textContent = '';

      // 状態インジケーター（右上角）
      const stateT = svgEl('text', {
        class: 'ct-state-icon', x: NODE_W - 6, y: 14, 'text-anchor': 'end',
      });
      stateT.textContent = '…';

      // コスト（左下角、サブツリーサイズ）
      const costT = svgEl('text', {
        class: 'ct-cost', x: 6, y: NODE_H - 6, 'text-anchor': 'start',
      });
      costT.textContent = node.cost !== undefined ? `cost:${node.cost}` : '';

      const children = [rect, nameT, argsT];
      if (argsT2) children.push(argsT2);
      children.push(retT, stateT, costT);
      g.append(...children);
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
      g.className.baseVal = `ct-node ${stCls}`;

      // 状態テキスト（色覚多様性対応: 形・記号でも状態を表現）
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
