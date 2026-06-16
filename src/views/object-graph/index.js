/**
 * object-graph/index.js — オブジェクトグラフビュー（SVG）
 *
 * 現在スコープ内のオブジェクト・配列とその参照関係を
 * SVG グラフとして描画する。
 *
 * 機能:
 *   - プリミティブ変数はルートラベルとして表示
 *   - オブジェクト・配列はノードとして表示
 *   - プロパティが別オブジェクトを指す場合エッジを描画
 *   - 循環参照を検出して無限ループを防ぐ
 *   - 力学的レイアウト（Fruchterman-Reingold 簡易版）でノードを配置
 *
 * @module object-graph
 */

import { BaseView }              from '../base-view.js';
import { BUILTIN_NAMES, esc }    from '../../utils/format.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── レイアウト定数 ────────────────────────────────────────────────────────

const NODE_W     = 110;
const NODE_H_MIN = 32;  // 最小高さ（ラベルのみ）
const ROW_H      = 13;  // プロパティ1行の高さ
const MAX_PROPS  = 8;   // 1ノードに表示するプロパティの最大数
const H_SPACING  = 16;  // ノード間の最小水平間隔
const V_SPACING  = 16;  // ノード間の最小垂直間隔
const FD_ITER    = 80;  // 力学的レイアウトのイテレーション数
const INITIAL_SPREAD = 100; // 初期配置の広がり

// ── グラフ構築 ────────────────────────────────────────────────────────────

/**
 * 値がヒープに乗るオブジェクト/配列か
 */
function isHeapObj(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'function')       return false;
  if (typeof v !== 'object')         return false;
  if (v.__type__ === 'JSFunction' || v.__type__ === 'JSClass') return false;
  return true;
}

/**
 * プリミティブ値の短いテキスト表現
 */
function fmtVal(v) {
  if (v === undefined) return 'undef';
  if (v === null)      return 'null';
  if (typeof v === 'string') {
    const s = JSON.stringify(v);
    return s.length > 12 ? s.slice(0, 11) + '…"' : s;
  }
  return String(v);
}

/**
 * scopes を走査してグラフノードとエッジを構築する。
 *
 * @param {Object}   variables  state.variables（フラット化済み）
 * @param {Object[]} scopes     ev.env（env[0] = 最内スコープ）
 * @returns {{ nodes, edges, rootVars }}
 *   nodes:    { id, ref, label, rows: [{key, displayVal, childId|null}], x, y }[]
 *   edges:    { id, from, to, label }[]
 *   rootVars: { name, type: 'prim'|'ref', val, nodeId|null }[]  （変数エントリ）
 */
function buildGraph(variables, scopes) {
  /** @type {Map<id, Node>} */
  const nodeMap  = new Map();
  const refToId  = new WeakMap(); // object ref → node id
  const edges    = [];
  const edgeSet  = new Set(); // `${from}->${to}:${label}` 重複防止
  let   nextId   = 0;

  /**
   * オブジェクトを再帰的にノードとして登録する。
   * 循環参照は visited で検出する。
   */
  function register(v, depth = 0) {
    if (!isHeapObj(v)) return null;
    if (refToId.has(v)) return refToId.get(v);

    const id = String(nextId++);
    refToId.set(v, id);

    const isArr   = Array.isArray(v);
    const label   = isArr ? `Array[${v.length}]` : 'Object';
    const rawList = isArr
      ? v.slice(0, MAX_PROPS).map((x, i) => [String(i), x])
      : Object.entries(v).filter(([k]) => !k.startsWith('__')).slice(0, MAX_PROPS);

    // ノードを先に登録してから rows を埋める（循環参照対策）
    const node = { id, ref: v, label, rows: [], x: 0, y: 0 };
    nodeMap.set(id, node);

    for (const [k, x] of rawList) {
      if (isHeapObj(x) && depth < 6) {
        const childId = register(x, depth + 1);
        if (childId !== null) {
          node.rows.push({ key: k, displayVal: isHeapObj(x) ? `→ ${Array.isArray(x) ? 'Array' : 'Obj'}` : fmtVal(x), childId });
          const eKey = `${id}->${childId}:${k}`;
          if (!edgeSet.has(eKey)) {
            edgeSet.add(eKey);
            edges.push({ id: eKey, from: id, to: childId, label: k });
          }
        } else {
          node.rows.push({ key: k, displayVal: fmtVal(x), childId: null });
        }
      } else {
        node.rows.push({ key: k, displayVal: fmtVal(x), childId: null });
      }
    }

    // 省略した要素の表示
    const total = isArr ? v.length : Object.keys(v).length;
    if (total > MAX_PROPS) {
      node.rows.push({ key: '…', displayVal: `+${total - MAX_PROPS}`, childId: null });
    }

    return id;
  }

  // 変数を処理
  const rootVars = [];
  // スコープ0（最内）のみ rootVars に反映
  const innerScope = scopes[0] ?? {};
  for (const [name, val] of Object.entries(variables)) {
    if (BUILTIN_NAMES.has(name)) continue;
    if (typeof val === 'function') continue;
    if (val?.__type__ === 'JSFunction' || val?.__type__ === 'JSClass') continue;

    if (isHeapObj(val)) {
      const nid = register(val);
      rootVars.push({ name, type: 'ref', val, nodeId: nid });
    } else {
      rootVars.push({ name, type: 'prim', val, nodeId: null });
    }
  }

  return { nodes: [...nodeMap.values()], edges, rootVars };
}

// ── 力学的レイアウト (Fruchterman-Reingold 簡易版) ──────────────────────

/**
 * @param {{ id, x, y }[]} nodes
 * @param {{ from, to }[]}  edges
 */
function forceDirectedLayout(nodes, edges) {
  if (nodes.length === 0) return;
  if (nodes.length === 1) { nodes[0].x = 0; nodes[0].y = 0; return; }

  const K  = Math.sqrt((NODE_W + H_SPACING) * (NODE_H_MIN + V_SPACING) * nodes.length);
  let temp = INITIAL_SPREAD;

  // 初期配置: ランダムではなく格子状に配置（再現性のため）
  const cols = Math.ceil(Math.sqrt(nodes.length));
  nodes.forEach((n, i) => {
    n.x = (i % cols) * (NODE_W + H_SPACING) - (cols / 2) * (NODE_W + H_SPACING);
    n.y = Math.floor(i / cols) * (NODE_H_MIN + V_SPACING) - (nodes.length / cols / 2) * (NODE_H_MIN + V_SPACING);
  });

  const idxMap = new Map(nodes.map((n, i) => [n.id, i]));

  for (let iter = 0; iter < FD_ITER; iter++) {
    const disp = nodes.map(() => ({ x: 0, y: 0 }));

    // 反発力（全ノードペア）
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const repulse = (K * K) / dist;
        const fx = (dx / dist) * repulse;
        const fy = (dy / dist) * repulse;
        disp[i].x += fx;
        disp[i].y += fy;
        disp[j].x -= fx;
        disp[j].y -= fy;
      }
    }

    // 引力（エッジ）
    for (const e of edges) {
      const si = idxMap.get(e.from);
      const ti = idxMap.get(e.to);
      if (si === undefined || ti === undefined) continue;
      const dx = nodes[si].x - nodes[ti].x;
      const dy = nodes[si].y - nodes[ti].y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const attract = (dist * dist) / K;
      const fx = (dx / dist) * attract;
      const fy = (dy / dist) * attract;
      disp[si].x -= fx;
      disp[si].y -= fy;
      disp[ti].x += fx;
      disp[ti].y += fy;
    }

    // 位置更新（温度でクリップ）
    for (let i = 0; i < nodes.length; i++) {
      const d = Math.sqrt(disp[i].x ** 2 + disp[i].y ** 2) || 0.01;
      nodes[i].x += (disp[i].x / d) * Math.min(d, temp);
      nodes[i].y += (disp[i].y / d) * Math.min(d, temp);
    }

    temp = Math.max(1, temp * 0.92); // 冷却
  }
}

// ── SVG 描画 ──────────────────────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * ノードの高さを計算する
 */
function nodeHeight(node) {
  return NODE_H_MIN + node.rows.length * ROW_H;
}

// ── ObjectGraph ビュー ────────────────────────────────────────────────────

export class ObjectGraph extends BaseView {
  #container = null;
  #svgEl     = null;
  #wrapEl    = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, _builder) {
    this.#container = container;
    container.innerHTML = `
      <div class="og-wrap">
        <svg class="og-svg" xmlns="http://www.w3.org/2000/svg"></svg>
      </div>`;
    this.#wrapEl = container.querySelector('.og-wrap');
    this.#svgEl  = container.querySelector('.og-svg');
  }

  update(state) {
    if (!this.#svgEl) return;

    const { variables, scopes } = state;
    if (!variables || !scopes || scopes.length === 0) {
      this.#showPlaceholder('変数がありません');
      return;
    }

    const { nodes, edges, rootVars } = buildGraph(variables, scopes);

    if (nodes.length === 0 && !rootVars.some(rv => rv.type === 'prim')) {
      this.#showPlaceholder('オブジェクトがありません');
      return;
    }

    // 力学的レイアウト
    forceDirectedLayout(nodes, edges);

    // SVG 描画
    this.#render(nodes, edges, rootVars);
  }

  reset() {}

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#svgEl     = null;
    this.#wrapEl    = null;
  }

  // ── 描画 ──────────────────────────────────────────────────────────────────

  #showPlaceholder(msg) {
    this.#svgEl.innerHTML = '';
    const t = svgEl('text', { x: '50%', y: '50%', 'text-anchor': 'middle', class: 'og-placeholder' });
    t.textContent = msg;
    this.#svgEl.setAttribute('width', '100%');
    this.#svgEl.setAttribute('height', '100px');
    this.#svgEl.appendChild(t);
  }

  #render(nodes, edges, rootVars) {
    this.#svgEl.innerHTML = '';

    if (nodes.length === 0) {
      this.#showPlaceholder('オブジェクトがありません');
      return;
    }

    // 原点を中央に移すためのオフセット計算
    const PAD = 16;
    const xs  = nodes.map(n => n.x);
    const ys  = nodes.map(n => n.y);
    const nh  = nodes.map(nodeHeight);
    const minX = Math.min(...xs) - PAD;
    const minY = Math.min(...ys) - PAD;
    const maxX = Math.max(...xs) + NODE_W + PAD;
    const maxY = Math.max(...ys.map((y, i) => y + nh[i])) + PAD;

    const vw = maxX - minX;
    const vh = maxY - minY;

    this.#svgEl.setAttribute('width',   Math.max(300, vw));
    this.#svgEl.setAttribute('height',  Math.max(200, vh));
    this.#svgEl.setAttribute('viewBox', `${minX} ${minY} ${vw} ${vh}`);

    // id → node lookup
    const nodeById = new Map(nodes.map(n => [n.id, n]));

    // ── defs: arrow marker ──
    const defs   = svgEl('defs');
    const marker = svgEl('marker', {
      id: 'og-arr', markerWidth: 8, markerHeight: 8,
      refX: 6, refY: 3, orient: 'auto',
    });
    marker.appendChild(svgEl('path', { class: 'og-arrow-marker', d: 'M0,0 L0,6 L8,3 z' }));
    defs.appendChild(marker);
    this.#svgEl.appendChild(defs);

    const edgesG = svgEl('g', { class: 'og-edges' });
    const nodesG = svgEl('g', { class: 'og-nodes' });

    // ── エッジ描画 ──
    for (const e of edges) {
      const src = nodeById.get(e.from);
      const dst = nodeById.get(e.to);
      if (!src || !dst) continue;

      const srcH = nodeHeight(src);
      const dstH = nodeHeight(dst);

      // 始点: src の右中央
      const x1 = src.x + NODE_W;
      const y1 = src.y + srcH / 2;
      // 終点: dst の左中央
      const x2 = dst.x;
      const y2 = dst.y + dstH / 2;
      const mx = (x1 + x2) / 2;

      const path = svgEl('path', {
        class: 'og-edge',
        d: `M ${x1},${y1} C ${mx},${y1} ${mx},${y2} ${x2},${y2}`,
        fill: 'none',
        'marker-end': 'url(#og-arr)',
      });
      edgesG.appendChild(path);

      // エッジラベル（プロパティ名）
      if (e.label) {
        const lt = svgEl('text', {
          class: 'og-edge-label',
          x: mx, y: (y1 + y2) / 2 - 3,
          'text-anchor': 'middle',
        });
        lt.textContent = e.label;
        edgesG.appendChild(lt);
      }
    }

    // ── ルート変数ラベル（ノードの上に表示） ──
    // rootVars から各ノードへの変数名を収集
    const rootLabelMap = new Map(); // nodeId → string[]
    for (const rv of rootVars) {
      if (rv.type === 'ref' && rv.nodeId !== null) {
        if (!rootLabelMap.has(rv.nodeId)) rootLabelMap.set(rv.nodeId, []);
        rootLabelMap.get(rv.nodeId).push(rv.name);
      }
    }

    // ── ノード描画 ──
    for (const node of nodes) {
      const h  = nodeHeight(node);
      const g  = svgEl('g', { class: 'og-node', transform: `translate(${node.x},${node.y})` });

      // 上部に変数名ラベル
      const labels = rootLabelMap.get(node.id);
      if (labels && labels.length > 0) {
        const lt = svgEl('text', {
          class: 'og-root-label',
          x: NODE_W / 2, y: -3,
          'text-anchor': 'middle',
        });
        lt.textContent = labels.join(', ');
        g.appendChild(lt);
      }

      // ノード枠
      g.appendChild(svgEl('rect', {
        class: 'og-rect', width: NODE_W, height: h, rx: 5,
      }));

      // タイトル
      const titleT = svgEl('text', {
        class: 'og-title', x: NODE_W / 2, y: 11, 'text-anchor': 'middle',
      });
      titleT.textContent = node.label;
      g.appendChild(titleT);

      // 区切り線
      g.appendChild(svgEl('line', {
        class: 'og-divider', x1: 0, y1: NODE_H_MIN - 10, x2: NODE_W, y2: NODE_H_MIN - 10,
      }));

      // プロパティ行
      for (let i = 0; i < node.rows.length; i++) {
        const row = node.rows[i];
        const ry  = NODE_H_MIN + i * ROW_H - 2;

        const keyT = svgEl('text', {
          class: 'og-key', x: 6, y: ry, 'text-anchor': 'start',
        });
        keyT.textContent = row.key;
        g.appendChild(keyT);

        const valT = svgEl('text', {
          class: row.childId !== null ? 'og-val og-val--ref' : 'og-val',
          x: NODE_W - 6, y: ry, 'text-anchor': 'end',
        });
        valT.textContent = row.displayVal;
        g.appendChild(valT);
      }

      nodesG.appendChild(g);
    }

    // プリミティブ変数の一覧（右下ラベル）
    const primVars = rootVars.filter(rv => rv.type === 'prim');
    if (primVars.length > 0) {
      const gp = svgEl('g', { class: 'og-prim-vars', transform: `translate(${minX + 8},${minY + 8})` });
      let lineY = 14;
      for (const pv of primVars) {
        const t = svgEl('text', { class: 'og-prim-label', x: 0, y: lineY });
        t.textContent = `${pv.name} = ${fmtVal(pv.val)}`;
        gp.appendChild(t);
        lineY += ROW_H;
      }
      this.#svgEl.appendChild(gp);
    }

    this.#svgEl.append(edgesG, nodesG);
  }
}
