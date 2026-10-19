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
 * ノードは「関数名(引数)」を1行目、cost と戻り値を2行目に並べたコンパクトな2行表示で、
 * 幅はノードごとに文字数から決める（ADR-045）。
 *
 * ノードの色:
 *   ct-node--future  … まだ呼ばれていない（グレー）
 *   ct-node--active  … 現在実行中（青）
 *   ct-node--done    … 戻り値が確定済み（緑）
 */

import { BaseView } from '../base-view.js';
import { t }        from '../../i18n.js';

const SVG_NS  = 'http://www.w3.org/2000/svg';
const NODE_H     = 34;   // 2行（関数名(引数) / cost・戻り値）
const NODE_MIN_W = 44;
const NODE_PAD_X = 6;    // ノード内の左右の余白
const ICON_W     = 12;   // 右上の状態アイコンの幅
const ROW1_Y     = 14;   // 1行目のベースライン
const ROW2_Y     = 28;   // 2行目のベースライン
const COL_GAP    = 12;
const ROW_GAP    = 28;
const PAD_X      = 12;
const PAD_Y      = 12;

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

/** 引数リストを「(a, b)」形式の1行にする */
function fmtArgs(args) {
  if (!args || args.length === 0) return '()';
  return `(${args.map(a => fmtArg(a)).join(', ')})`;
}

function fmtRet(val) {
  if (val === undefined) return '';
  return `→ ${fmtArg(val)}`;
}

/** モノスペース文字列のおおよその描画幅（px）。全角文字は半角2文字分として数える */
function textWidth(str, fontPx) {
  let units = 0;
  for (const ch of str) units += ch.charCodeAt(0) > 0xff ? 1 : 0.6;
  return units * fontPx;
}

/** ノードの幅（px）。1行目（関数名(引数)＋状態アイコン）と2行目（cost・戻り値）の長い方に合わせる */
function calcNodeWidth(node) {
  const row1 = textWidth(node.funcName, 11) + textWidth(fmtArgs(node.args), 10) + ICON_W;
  const cost = node.cost !== undefined ? textWidth(`cost:${node.cost}`, 9) : 0;
  const ret  = textWidth(fmtRet(node.returnVal), 10);
  const row2 = cost + (cost && ret ? 8 : 0) + ret;
  return Math.max(NODE_MIN_W, Math.ceil(Math.max(row1, row2) + NODE_PAD_X * 2));
}

/** 子ノード群を横に並べた幅（px） */
function childrenWidth(node, widths) {
  const sum = node.children.reduce((s, c) => s + calcSubtreeWidth(c, widths), 0);
  return sum + (node.children.length - 1) * COL_GAP;
}

/** サブツリー幅（px）を再帰計算。ノード自身が子の並びより広ければノードの幅 */
function calcSubtreeWidth(node, widths) {
  const w = widths.get(node.id);
  if (node.children.length === 0) return w;
  return Math.max(w, childrenWidth(node, widths));
}

/**
 * ノード中心座標を計算して positions Map に格納する
 * @param {Object} node
 * @param {Map}    positions  id → {cx, cy}
 * @param {Map}    widths     id → ノード幅
 * @param {number} depth      ツリー深さ
 * @param {number} left       このサブツリーの左端 px
 */
function assignPositions(node, positions, widths, depth, left) {
  const w  = calcSubtreeWidth(node, widths);
  const cx = left + w / 2;
  const cy = PAD_Y + depth * (NODE_H + ROW_GAP) + NODE_H / 2;
  positions.set(node.id, { cx, cy });
  if (node.children.length === 0) return;

  // ノードの方が広いときは子の並びを中央に寄せる
  let childLeft = left + (w - childrenWidth(node, widths)) / 2;
  for (const child of node.children) {
    const childW = calcSubtreeWidth(child, widths);
    assignPositions(child, positions, widths, depth + 1, childLeft);
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

  /** @type {Map<number, number>} id → ノード幅 */
  #widths = new Map();

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#roots     = builder ? builder.buildCallTree() : [];
    this.#positions.clear();
    this.#nodeEls.clear();
    this.#nodeById.clear();
    this.#widths.clear();

    if (this.#roots.length === 0) {
      container.innerHTML = `<div class="ct-wrap"><p class="placeholder">${t('view-no-func-calls')}</p></div>`;
      this.#svgEl = null;
      return;
    }

    container.innerHTML = `<div class="ct-wrap"><svg class="ct-svg" role="img" aria-label="${t('calltree-aria')}" xmlns="http://www.w3.org/2000/svg"></svg></div>`;
    this.#svgEl = container.querySelector('.ct-svg');

    // 全ノードを id → object に登録
    this.#walkNodes(this.#roots, node => {
      this.#nodeById.set(node.id, node);
      this.#widths.set(node.id, calcNodeWidth(node));
    });

    // 座標計算
    let left = PAD_X;
    for (const root of this.#roots) {
      const w = calcSubtreeWidth(root, this.#widths);
      assignPositions(root, this.#positions, this.#widths, 0, left);
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
      const nodeW = this.#widths.get(node.id);
      const g = svgEl('g', {
        class:     'ct-node',
        transform: `translate(${cx - nodeW / 2},${cy - NODE_H / 2})`,
      });

      const rect = svgEl('rect', {
        class: 'ct-rect',
        width: nodeW, height: NODE_H, rx: 5,
      });

      // 1行目: 関数名(引数)。状態アイコンの分だけ左に寄せて中央揃え
      const callT = svgEl('text', {
        x: (nodeW - ICON_W) / 2, y: ROW1_Y, 'text-anchor': 'middle',
      });
      const nameS = svgEl('tspan', { class: 'ct-name' });
      nameS.textContent = node.funcName;
      const argsS = svgEl('tspan', { class: 'ct-args' });
      argsS.textContent = fmtArgs(node.args);
      callT.append(nameS, argsS);

      // 状態インジケーター（右上角）
      const stateT = svgEl('text', {
        class: 'ct-state-icon', x: nodeW - 4, y: ROW1_Y - 1, 'text-anchor': 'end',
      });
      stateT.textContent = '…';

      // 2行目: cost（左、サブツリーサイズ）と戻り値（右）
      const costT = svgEl('text', {
        class: 'ct-cost', x: NODE_PAD_X, y: ROW2_Y, 'text-anchor': 'start',
      });
      costT.textContent = node.cost !== undefined ? `cost:${node.cost}` : '';

      const retT = svgEl('text', {
        class: 'ct-retval', x: nodeW - NODE_PAD_X, y: ROW2_Y, 'text-anchor': 'end',
      });
      retT.textContent = '';

      const children = [rect, callT, stateT, costT, retT];
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
    this.#widths.clear();
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
