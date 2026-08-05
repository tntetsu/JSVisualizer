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

const NODE_W      = 110;
const NODE_H_MIN  = 32;  // 最小高さ（ラベルのみ）
const ROW_H       = 13;  // プロパティ1行の高さ
const MAX_PROPS   = 8;   // 1ノードに表示するプロパティの最大数
const COLUMN_GAP  = 80;  // 列間の水平間隔（エッジラベルが8文字以上収まる幅）
const ROW_GAP     = 16;  // 同列内ノード間の垂直間隔
const COMP_GAP    = 24;  // 連結成分間の垂直間隔

// ノード背景色パレット（CSS 変数 → style.css で定義）
const NODE_BG = [
  'var(--og-bg-0)', 'var(--og-bg-1)', 'var(--og-bg-2)',
  'var(--og-bg-3)', 'var(--og-bg-4)', 'var(--og-bg-5)',
];

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

// ── 階層型レイアウト（左→右、データ構造を反映）────────────────────────

/**
 * DAG の最長パス法で各ノードに列番号を割り当て、
 * 左→右の階層レイアウトを生成する。
 * 同じプロパティのエッジが同じ方向（右向き）に統一される。
 *
 * @param {{ id, x, y }[]} nodes
 * @param {{ from, to }[]}  edges
 */
function hierarchicalLayout(nodes, edges) {
  if (nodes.length === 0) return;
  if (nodes.length === 1) { nodes[0].x = 0; nodes[0].y = 0; return; }

  // 隣接リストと入次数を構築
  const adj   = new Map(nodes.map(n => [n.id, []]));
  const inDeg = new Map(nodes.map(n => [n.id, 0]));
  for (const e of edges) {
    adj.get(e.from)?.push(e.to);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }

  // Kahn のアルゴリズムでトポロジカル順を取得
  const deg  = new Map(inDeg);
  const topo = [];
  const q    = nodes.filter(n => deg.get(n.id) === 0).map(n => n.id);
  while (q.length) {
    const id = q.shift();
    topo.push(id);
    for (const nid of (adj.get(id) ?? [])) {
      const d = deg.get(nid) - 1;
      deg.set(nid, d);
      if (d === 0) q.push(nid);
    }
  }
  // 循環参照ノード（検出済みのため通常は空）を末尾に追加
  const inTopo = new Set(topo);
  for (const n of nodes) if (!inTopo.has(n.id)) topo.push(n.id);

  // 列番号 = ルートからの最長パス距離
  const col = new Map(nodes.map(n => [n.id, 0]));
  for (const id of topo) {
    for (const nid of (adj.get(id) ?? [])) {
      if (col.get(nid) < col.get(id) + 1) col.set(nid, col.get(id) + 1);
    }
  }

  // 列ごとにグループ化（トポロジカル順を維持）
  const byCol = new Map();
  for (const id of topo) {
    const c = col.get(id);
    if (!byCol.has(c)) byCol.set(c, []);
    byCol.get(c).push(id);
  }

  // 座標を割り当て: X = 列番号 × (NODE_W + COLUMN_GAP)、Y = 列内の積み上げ
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const sortedCols = [...byCol.keys()].sort((a, b) => a - b);
  let x = 0;
  for (const c of sortedCols) {
    let y = 0;
    for (const id of byCol.get(c)) {
      const n = nodeById.get(id);
      n.x = x;
      n.y = y;
      y += nodeHeight(n) + ROW_GAP;
    }
    x += NODE_W + COLUMN_GAP;
  }
}

/**
 * 連結成分ごとに独立した階層レイアウトを行い、縦に積み上げる。
 * 各成分の外接矩形が他と重ならない（Y 方向に COMP_GAP を挟む）。
 *
 * @param {{ id, x, y }[]} nodes
 * @param {{ from, to }[]}  edges
 * @returns {{ nodes, edges }[]} 成分ごとの配列（背景矩形描画用）
 */
function layoutGraph(nodes, edges) {
  if (nodes.length === 0) return [];

  // 無向グラフで連結成分を BFS 検出
  const unadj  = new Map(nodes.map(n => [n.id, []]));
  for (const e of edges) {
    unadj.get(e.from)?.push(e.to);
    unadj.get(e.to)?.push(e.from);
  }
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const visited  = new Set();
  const comps    = [];

  for (const n of nodes) {
    if (visited.has(n.id)) continue;
    const ids = [];
    const q   = [n.id];
    visited.add(n.id);
    while (q.length) {
      const id = q.shift();
      ids.push(id);
      for (const nid of (unadj.get(id) ?? [])) {
        if (!visited.has(nid)) { visited.add(nid); q.push(nid); }
      }
    }
    const cNodes = ids.map(id => nodeById.get(id));
    const idSet  = new Set(ids);
    const cEdges = edges.filter(e => idSet.has(e.from));
    comps.push({ nodes: cNodes, edges: cEdges });
  }

  // 各成分を独立に階層レイアウト → Y オフセットで縦積み
  let yOffset = 0;
  for (const comp of comps) {
    hierarchicalLayout(comp.nodes, comp.edges);
    let compH = 0;
    for (const n of comp.nodes) compH = Math.max(compH, n.y + nodeHeight(n));
    for (const n of comp.nodes) n.y += yOffset;
    yOffset += compH + COMP_GAP;
  }

  return comps;
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
  static hasContent(builder) {
    if (!builder) return false;
    for (const idx of builder.getHumanStepList()) {
      const ev = builder.trace[idx];
      if (!ev?.env) continue;
      for (const scope of ev.env) {
        for (const [k, v] of Object.entries(scope)) {
          if (!BUILTIN_NAMES.has(k) && isHeapObj(v)) return true;
        }
      }
    }
    return false;
  }

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
      this.#showPlaceholder('No variables');
      return;
    }

    const { nodes, edges, rootVars } = buildGraph(variables, scopes);

    if (nodes.length === 0 && !rootVars.some(rv => rv.type === 'prim')) {
      this.#showPlaceholder('No objects');
      return;
    }

    // 連結成分ごとに独立レイアウト → 縦積み
    const comps = layoutGraph(nodes, edges);

    // SVG 描画
    this.#render(nodes, edges, rootVars, comps);
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

  #render(nodes, edges, rootVars, comps = []) {
    this.#svgEl.innerHTML = '';

    if (nodes.length === 0) {
      this.#showPlaceholder('No objects');
      return;
    }

    // プリミティブ変数一覧が必要とする高さを事前計算する。
    // ルート変数ラベル（ノード上、y=-4）はノード群のすぐ上（PAD 分の余白内）に描画されるため、
    // プリミティブ変数一覧をその同じ余白に重ねて描画すると重なってしまう。
    // そのため、プリミティブ変数一覧専用の帯をノード群のさらに上に確保する。
    const primVars = rootVars.filter(rv => rv.type === 'prim');
    const primH    = primVars.length > 0 ? primVars.length * ROW_H + 10 : 0;

    // 原点を中央に移すためのオフセット計算
    const PAD = 20;
    const xs  = nodes.map(n => n.x);
    const ys  = nodes.map(n => n.y);
    const nh  = nodes.map(nodeHeight);
    const minX = Math.min(...xs) - PAD;
    const minY = Math.min(...ys) - PAD - primH;
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

    const compBgG = svgEl('g', { class: 'og-comps' });
    const edgesG  = svgEl('g', { class: 'og-edges' });
    const nodesG  = svgEl('g', { class: 'og-nodes' });

    // ── 連結成分の背景矩形（複数成分がある場合のみ） ──
    if (comps.length > 1) {
      const CPAD = 8;  // 成分外接矩形の内側パディング
      for (const { nodes: cNodes } of comps) {
        let cx0 = Infinity, cy0 = Infinity, cx1 = -Infinity, cy1 = -Infinity;
        for (const n of cNodes) {
          cx0 = Math.min(cx0, n.x);
          cy0 = Math.min(cy0, n.y);
          cx1 = Math.max(cx1, n.x + NODE_W);
          cy1 = Math.max(cy1, n.y + nodeHeight(n));
        }
        compBgG.appendChild(svgEl('rect', {
          class: 'og-comp-bg',
          x: cx0 - CPAD, y: cy0 - CPAD,
          width:  (cx1 - cx0) + CPAD * 2,
          height: (cy1 - cy0) + CPAD * 2,
          rx: 8,
        }));
      }
    }

    // ── エッジポート位置を事前計算（同ノード複数エッジが重ならないよう分散） ──
    // 出口ポート: ソース右辺を宛先 Y 順に等分
    const srcPort = new Map();  // e.id → absolute y
    const byFrom  = new Map();
    for (const e of edges) {
      if (!byFrom.has(e.from)) byFrom.set(e.from, []);
      byFrom.get(e.from).push(e);
    }
    for (const [fromId, es] of byFrom) {
      const s = nodeById.get(fromId);
      if (!s) continue;
      const h = nodeHeight(s);
      es.sort((a, b) => (nodeById.get(a.to)?.y ?? 0) - (nodeById.get(b.to)?.y ?? 0));
      es.forEach((e, i) => srcPort.set(e.id, s.y + (i + 1) * h / (es.length + 1)));
    }
    // 入口ポート: 宛先左辺をソース Y 順に等分
    const dstPort = new Map();  // e.id → absolute y
    const byTo    = new Map();
    for (const e of edges) {
      if (!byTo.has(e.to)) byTo.set(e.to, []);
      byTo.get(e.to).push(e);
    }
    for (const [toId, es] of byTo) {
      const d = nodeById.get(toId);
      if (!d) continue;
      const h = nodeHeight(d);
      es.sort((a, b) => (nodeById.get(a.from)?.y ?? 0) - (nodeById.get(b.from)?.y ?? 0));
      es.forEach((e, i) => dstPort.set(e.id, d.y + (i + 1) * h / (es.length + 1)));
    }

    // ── エッジ描画（エルボーコネクタ: 右→縦→右） ──
    for (const e of edges) {
      const src = nodeById.get(e.from);
      const dst = nodeById.get(e.to);
      if (!src || !dst) continue;

      const x1 = src.x + NODE_W;
      const y1 = Math.round(srcPort.get(e.id) ?? (src.y + nodeHeight(src) / 2));
      const x2 = dst.x;
      const y2 = Math.round(dstPort.get(e.id) ?? (dst.y + nodeHeight(dst) / 2));

      let pathD, labelX, labelY, labelAnchor;
      if (x2 > x1 + 4) {
        // 前向きエッジ: エルボーコネクタ（中間 x で折れる）
        const mx   = Math.round((x1 + x2) / 2);
        pathD      = `M ${x1},${y1} H ${mx} V ${y2} H ${x2}`;
        // ラベルは縦セグメントの左側・縦中央（エッジごとに y が異なるため重ならない）
        labelX      = mx - 2;
        labelY      = Math.round((y1 + y2) / 2);
        labelAnchor = 'end';
      } else {
        // 後向き・同列エッジ: 右へ張り出したベジェ弧
        const bow  = Math.max(28, Math.abs(y2 - y1) * 0.4);
        pathD      = `M ${x1},${y1} C ${x1+bow},${y1} ${x2+bow},${y2} ${x2},${y2}`;
        labelX      = x1 + bow * 0.5;
        labelY      = Math.round((y1 + y2) / 2) - 3;
        labelAnchor = 'middle';
      }

      edgesG.appendChild(svgEl('path', {
        class: 'og-edge',
        d: pathD,
        fill: 'none',
        'marker-end': 'url(#og-arr)',
      }));

      if (e.label) {
        const lt = svgEl('text', {
          class: 'og-edge-label',
          x: labelX, y: labelY,
          'text-anchor': labelAnchor,
        });
        lt.textContent = e.label.length > 10 ? e.label.slice(0, 9) + '…' : e.label;
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
    for (let ni = 0; ni < nodes.length; ni++) {
      const node   = nodes[ni];
      const h      = nodeHeight(node);
      const bgFill = NODE_BG[ni % NODE_BG.length];
      const g      = svgEl('g', { class: 'og-node', transform: `translate(${node.x},${node.y})` });

      // 上部に変数名ラベル
      const labels = rootLabelMap.get(node.id);
      if (labels && labels.length > 0) {
        const lt = svgEl('text', {
          class: 'og-root-label',
          x: NODE_W / 2, y: -4,
          'text-anchor': 'middle',
        });
        lt.textContent = labels.join(', ');
        g.appendChild(lt);
      }

      // ノード枠（ノードごとに背景色を変えて境界を明確化）
      const rect = svgEl('rect', {
        class: 'og-rect', width: NODE_W, height: h, rx: 4,
      });
      rect.style.fill = bgFill;
      g.appendChild(rect);

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

    // プリミティブ変数の一覧（ノード群・ルート変数ラベルと重ならないよう、上部に確保した専用の帯に描画）
    let primG = null;
    if (primVars.length > 0) {
      primG = svgEl('g', { class: 'og-prim-vars', transform: `translate(${minX + 8},${minY + 8})` });
      let lineY = 14;
      for (const pv of primVars) {
        const t = svgEl('text', { class: 'og-prim-label', x: 0, y: lineY });
        t.textContent = `${pv.name} = ${fmtVal(pv.val)}`;
        primG.appendChild(t);
        lineY += ROW_H;
      }
    }

    // 描画順: 成分背景 → エッジ → ノード → プリミティブラベル
    this.#svgEl.append(compBgG, edgesG, nodesG, ...(primG ? [primG] : []));
  }
}
