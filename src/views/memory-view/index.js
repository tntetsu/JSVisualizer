/**
 * memory-view/index.js — メモリモデルビュー
 *
 * 左列: スタック（スコープチェーンをフレームとして表示）
 * 右列: ヒープ（オブジェクト・配列を ID 付きボックスで表示）
 * SVG オーバーレイ: スタックの参照セル → ヒープオブジェクトへの矢印
 *
 * スコープチェーン env[0] が最内スコープ（コールスタック最上位と対応）。
 */

import { BaseView }                      from '../base-view.js';
import { formatValue, BUILTIN_NAMES, esc, mergeScopesForDisplay } from '../../utils/format.js';
import { t }                             from '../../i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── ヘルパー ──────────────────────────────────────────────────────────────

/** SVG 要素生成 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** ヒープに乗るべき値か（オブジェクト・配列、関数除く） */
function isHeapVal(v) {
  if (v === null || v === undefined) return false;
  if (typeof v === 'function')       return false;
  if (typeof v !== 'object')         return false;
  if (v.__type__ === 'JSFunction' || v.__type__ === 'JSClass') return false;
  return true;
}

/** ヒープエントリのラベル */
function heapLabel(v) {
  if (Array.isArray(v)) return `Array[${v.length}]`;
  return 'Object';
}

/**
 * スコープチェーンをスキャンしてヒープレジストリを構築する。
 *
 * ヒープエントリ: { id, ref, label, entries: [{key, val, heapId|null}] }
 * ref が WeakMap のキーとして機能するのでオブジェクトの同一性を正確に追跡できる。
 *
 * @param {Object[]} scopes  ev.env（env[0] = 最内スコープ）
 * @returns {{ heap: Object[], refMap: WeakMap }}
 */
function buildHeap(scopes) {
  const heap   = [];
  const refMap = new WeakMap(); // object reference → heapId

  function register(v, depth = 0) {
    if (!isHeapVal(v)) return null;
    if (refMap.has(v)) return refMap.get(v);

    const id = heap.length;
    refMap.set(v, id);

    // エントリを先に push してから entries を埋める（循環参照対策）
    const entry = { id, ref: v, label: heapLabel(v), entries: [] };
    heap.push(entry);

    const isArr    = Array.isArray(v);
    const rawEntries = isArr
      ? v.slice(0, 24).map((x, i) => [i, x])
      : Object.entries(v).filter(([k]) => !k.startsWith('__')).slice(0, 12);

    for (const [k, x] of rawEntries) {
      const childId = depth < 5 ? register(x, depth + 1) : null;
      entry.entries.push({ key: k, val: x, heapId: childId });
    }

    return id;
  }

  for (const scope of scopes) {
    for (const [name, val] of Object.entries(scope ?? {})) {
      if (BUILTIN_NAMES.has(name)) continue;
      register(val);
    }
  }

  return { heap, refMap };
}

/** プリミティブ値の短い HTML 表現 */
function fmtPrim(v) {
  if (v === undefined) return '<span class="v-undef">undef</span>';
  if (v === null)      return '<span class="v-null">null</span>';
  if (typeof v === 'boolean') return `<span class="v-bool">${v}</span>`;
  if (typeof v === 'number')  return `<span class="v-num">${v}</span>`;
  if (typeof v === 'string') {
    const s = JSON.stringify(v);
    return `<span class="v-str">${esc(s.length > 14 ? s.slice(0, 13) + '…"' : s)}</span>`;
  }
  return `<span>${esc(String(v))}</span>`;
}

// ── MemoryView ────────────────────────────────────────────────────────────

export class MemoryView extends BaseView {
  #container  = null;
  #layoutEl   = null;
  #stackEl    = null;
  #heapEl     = null;
  #svgEl      = null;
  #rafId      = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, _builder) {
    this.#container = container;
    container.innerHTML = `
      <div class="mv-wrap">
        <div class="mv-layout">
          <div class="mv-panel mv-stack-panel">
            <div class="mv-panel-title">Stack</div>
            <div class="mv-stack-content"></div>
          </div>
          <div class="mv-panel mv-heap-panel">
            <div class="mv-panel-title">Heap</div>
            <div class="mv-heap-content"></div>
          </div>
        </div>
        <svg class="mv-arrows" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <marker id="mv-arr" markerWidth="8" markerHeight="8"
                    refX="6" refY="3" orient="auto">
              <path class="mv-arrow-marker" d="M0,0 L0,6 L8,3 z"/>
            </marker>
          </defs>
        </svg>
      </div>`;

    this.#layoutEl = container.querySelector('.mv-layout');
    this.#stackEl  = container.querySelector('.mv-stack-content');
    this.#heapEl   = container.querySelector('.mv-heap-content');
    this.#svgEl    = container.querySelector('.mv-arrows');
  }

  update(state) {
    if (!this.#stackEl) return;

    const { scopes, callStack, changedVars, frameEnvs } = state;
    const changed = new Set(changedVars ?? []);

    if (!scopes || scopes.length === 0) {
      this.#stackEl.innerHTML = '<p class="placeholder">—</p>';
      this.#heapEl.innerHTML  = '<p class="placeholder">—</p>';
      this.#clearArrows();
      return;
    }

    const { heap, refMap } = buildHeap(scopes);

    this.#renderStack(scopes, callStack ?? [], changed, refMap, heap, frameEnvs ?? []);
    this.#renderHeap(heap);

    // DOM が確定してから矢印を描画
    if (this.#rafId) cancelAnimationFrame(this.#rafId);
    this.#rafId = requestAnimationFrame(() => this.#drawArrows());
  }

  reset() {}

  destroy() {
    if (this.#rafId) cancelAnimationFrame(this.#rafId);
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#layoutEl  = null;
    this.#stackEl   = null;
    this.#heapEl    = null;
    this.#svgEl     = null;
    this.#rafId     = null;
  }

  // ── レンダリング ──────────────────────────────────────────────────────────

  /**
   * スタックパネルを更新する。
   * mergeScopesForDisplay を使い scope-view と同じラベルで表示する。
   * @param {Object[]} scopes      env スコープチェーン
   * @param {Object[]} callStack   コールスタック
   * @param {Set<string>} changed
   * @param {WeakMap}     refMap
   * @param {Object[]}    heap
   * @param {Object[]}    frameEnvs 各フレームの callEnv スナップショット
   */
  #renderStack(scopes, callStack, changed, refMap, heap, frameEnvs = []) {
    let html = '';

    const displayScopes = mergeScopesForDisplay(scopes, callStack ?? [], frameEnvs);

    for (const { label, vars, isInnermost } of displayScopes) {
      const entries = Object.entries(vars).filter(([k]) => !BUILTIN_NAMES.has(k));

      // 変数なし かつ グローバルでもない外側フレームはスキップ
      if (entries.length === 0 && label !== 'global') continue;

      html += `<div class="mv-frame${isInnermost ? ' mv-frame--top' : ''}">
        <div class="mv-frame-name">${esc(label)}</div>
        <div class="mv-frame-vars">`;

      for (const [name, val] of entries) {
        const changedCls = changed.has(name) ? ' mv-var--changed' : '';

        if (isHeapVal(val)) {
          const heapId = refMap.get(val) ?? '?';
          html += `<div class="mv-var-row${changedCls}" data-ref-heap="${heapId}">
            <span class="mv-var-name">${esc(name)}</span>
            <span class="mv-ref-indicator">→ #${heapId}</span>
          </div>`;
        } else {
          html += `<div class="mv-var-row${changedCls}">
            <span class="mv-var-name">${esc(name)}</span>
            <span class="mv-var-val">${fmtPrim(val)}</span>
          </div>`;
        }
      }

      html += `</div></div>`;
    }

    this.#stackEl.innerHTML = html || '<p class="placeholder">—</p>';
  }

  /** ヒープパネルを更新する */
  #renderHeap(heap) {
    if (heap.length === 0) {
      this.#heapEl.innerHTML = `<p class="placeholder">${esc(t('memoryview-empty'))}</p>`;
      return;
    }

    let html = '';

    for (const item of heap) {
      html += `<div class="mv-heap-obj" data-heap-id="${item.id}">
        <div class="mv-heap-title">#${item.id} ${esc(item.label)}</div>
        <div class="mv-heap-cells">`;

      for (const { key, val, heapId } of item.entries) {
        if (heapId !== null && heapId !== undefined) {
          html += `<span class="mv-heap-cell mv-heap-cell--ref" data-ref-heap="${heapId}">
            <span class="mv-cell-key">${esc(String(key))}</span>
            <span class="mv-cell-sep">:</span>
            <span class="mv-ref-indicator">→#${heapId}</span>
          </span>`;
        } else {
          html += `<span class="mv-heap-cell">
            <span class="mv-cell-key">${esc(String(key))}</span>
            <span class="mv-cell-sep">:</span>
            <span class="mv-cell-val">${fmtPrim(val)}</span>
          </span>`;
        }
      }

      const overflow = item.ref && Array.isArray(item.ref) && item.ref.length > 24
        ? `<span class="mv-heap-overflow">+${item.ref.length - 24}…</span>` : '';
      html += `${overflow}</div></div>`;
    }

    this.#heapEl.innerHTML = html;
  }

  // ── 矢印描画 ──────────────────────────────────────────────────────────────

  #clearArrows() {
    if (!this.#svgEl) return;
    for (const el of this.#svgEl.querySelectorAll('.mv-arrow')) el.remove();
  }

  #drawArrows() {
    if (!this.#svgEl || !this.#layoutEl) return;
    this.#clearArrows();

    const containerRect = this.#layoutEl.getBoundingClientRect();
    if (!containerRect.width) return;

    // SVG サイズを layout に合わせる
    this.#svgEl.setAttribute('width',  containerRect.width);
    this.#svgEl.setAttribute('height', containerRect.height);

    // スタックとヒープ両方の参照インジケーターからの矢印。
    // 同じ heapId を参照する矢印をグループ化し、終点をタイトル幅内で分散させる
    // （矢じり同士が重ならないようにするため）。
    const refEls = this.#layoutEl.querySelectorAll('[data-ref-heap]');
    const byTarget = new Map(); // heapId → refEl[]
    for (const refEl of refEls) {
      const heapId = refEl.dataset.refHeap;
      if (!byTarget.has(heapId)) byTarget.set(heapId, []);
      byTarget.get(heapId).push(refEl);
    }

    for (const [heapId, srcEls] of byTarget) {
      const heapObj = this.#heapEl.querySelector(`[data-heap-id="${heapId}"]`);
      if (!heapObj) continue;
      // 終点は「#1 Object」ラベル要素そのもの（親のヒープボックス全体ではない）
      const titleEl = heapObj.querySelector('.mv-heap-title') || heapObj;
      const toRect  = titleEl.getBoundingClientRect();

      srcEls.forEach((refEl, i) => {
        // 始点は「→ #1」インジケーター要素そのもの（親の行・セルではない）
        const indicatorEl = refEl.querySelector('.mv-ref-indicator') || refEl;
        const from = indicatorEl.getBoundingClientRect();

        // 上下どちらから出す/入れるかは、要素自身を跨がないよう相対位置で決める
        const fromCy = from.top + from.height / 2;
        const toCy   = toRect.top + toRect.height / 2;
        const fromIsBelow = fromCy > toCy;

        const x1 = from.left + from.width / 2 - containerRect.left;
        const y1 = (fromIsBelow ? from.top : from.bottom) - containerRect.top;

        // 終点はタイトル幅内で均等分散（同じ対象に集まる矢印の矢じり重なりを回避）
        const n    = srcEls.length;
        const frac = (i + 1) / (n + 1);
        const x2   = toRect.left + toRect.width * frac - containerRect.left;
        const y2   = (fromIsBelow ? toRect.bottom : toRect.top) - containerRect.top;

        const my = (y1 + y2) / 2;

        const path = svgEl('path', {
          class: 'mv-arrow',
          d: `M ${x1},${y1} C ${x1},${my} ${x2},${my} ${x2},${y2}`,
          fill: 'none',
          'marker-end': 'url(#mv-arr)',
        });
        this.#svgEl.appendChild(path);
      });
    }
  }
}
