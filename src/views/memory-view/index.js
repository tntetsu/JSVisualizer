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
import { vm, isContainer, truncLiteral, varTypeHtml, globalScopeOptions } from '../../utils/value-model.js';
import { t }                             from '../../i18n.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── ヘルパー ──────────────────────────────────────────────────────────────

/** SVG 要素生成 */
function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * ヒープに乗るべき値か（オブジェクト・配列・dict など、関数除く）。
 * 言語プロファイルの valueModel.onHeap(v) が true の値（Java の String）も、ヒープの箱として置く（ADR-055 追記）
 */
function isHeapVal(v) {
  return isContainer(v) || isHeapScalar(v);
}

/** ヒープに置くスカラー（Java の String）か。JS・Python の valueModel は onHeap を持たない */
function isHeapScalar(v) {
  const f = vm().onHeap;
  return !!f && v !== null && typeof v === 'object' && f(v);
}

/** ヒープエントリのラベル */
function heapLabel(v) {
  return vm().label(v);
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
    if (isHeapScalar(v)) {   // 中身はその値の書き方 1 つ（"hello"）
      entry.scalar = true;
      return id;
    }

    const isArr    = vm().kind(v) === 'sequence';
    const rawEntries = vm().entries(v).slice(0, isArr ? 24 : 12);

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
  const m = vm();
  switch (m.kind(v)) {
    case 'tdz':       return '<span class="lt-empty">—</span>';   // 宣言前の let/const（ADR-038）
    case 'undefined': return '<span class="v-undef">undef</span>';
    case 'none':      return `<span class="v-null">${m.literal(v)}</span>`;
    case 'bool':      return `<span class="v-bool">${m.literal(v)}</span>`;
    case 'number':    return `<span class="v-num">${m.literal(v)}</span>`;
    case 'string':    return `<span class="v-str">${esc(truncLiteral(m.literal(v), 14))}</span>`;
    case 'function':  return `<span class="v-fn">ƒ ${esc(v.name || '(anonymous)')}</span>`;
    case 'class':     return `<span class="v-fn">class ${esc(v.name || '(anonymous)')}</span>`;
    case 'native':    return '<span class="v-fn">[native]</span>';
  }
  return `<span>${esc(String(v))}</span>`;
}

/** ヒープの箱に置くスカラーの書き方（切り詰めを長めにする） */
function fmtPrimFull(v) {
  return `<span class="v-str">${esc(truncLiteral(vm().literal(v), 40))}</span>`;
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

    const { scopes, callStack, changedVars, frameEnvs, globalBlockVars } = state;
    const changed = new Set(changedVars ?? []);

    if (!scopes || scopes.length === 0) {
      this.#stackEl.innerHTML = '<p class="placeholder">—</p>';
      this.#heapEl.innerHTML  = '<p class="placeholder">—</p>';
      this.#clearArrows();
      return;
    }

    // 呼び出し元のフレームだけが持つ配列・オブジェクトもヒープに載せる（ADR-049）。
    // JSInterpreter が同じ値を同じクローンで記録するので、共有している値は 1 つのヒープ要素になる
    const { heap, refMap } = buildHeap([...scopes, ...(frameEnvs ?? []), globalBlockVars ?? {}]);

    this.#renderStack(scopes, callStack ?? [], changed, refMap, heap, frameEnvs ?? [], globalBlockVars ?? {});
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
   * @param {Object[]}    frameEnvs 各フレームの変数のスナップショット
   * @param {Object}      globalBlockVars 関数の呼び出し中に、グローバルのブロックにある変数
   */
  #renderStack(scopes, callStack, changed, refMap, heap, frameEnvs = [], globalBlockVars = {}) {
    let html = '';

    const displayScopes = mergeScopesForDisplay(scopes, callStack ?? [], frameEnvs, globalBlockVars);

    for (const { label, vars, isInnermost, frame, callStack: cs } of displayScopes) {
      const entries = Object.entries(vars).filter(([k]) => !BUILTIN_NAMES.has(k));

      // 変数なし かつ グローバルでもない外側フレームはスキップ。グローバルも、言語プロファイルが
      // 空のときに隠すとしていればスキップ（Java の static フィールド。ADR-055 追記）
      const g = globalScopeOptions();
      if (entries.length === 0 && (label !== 'global' || g.hideEmpty)) continue;

      html += `<div class="mv-frame${isInnermost ? ' mv-frame--top' : ''}">
        <div class="mv-frame-name">${esc(label === 'global' ? (g.label ?? label) : label)}</div>
        <div class="mv-frame-vars">`;

      for (const [name, val] of entries) {
        const changedCls = changed.has(name) ? ' mv-var--changed' : '';

        if (isHeapVal(val)) {
          const heapId = refMap.get(val) ?? '?';
          html += `<div class="mv-var-row${changedCls}" data-ref-heap="${heapId}">
            <span class="mv-var-name">${varTypeHtml(name, frame, cs, 'mv-var-type')}${esc(name)}</span>
            <span class="mv-ref-indicator">→ #${heapId}</span>
          </div>`;
        } else {
          html += `<div class="mv-var-row${changedCls}">
            <span class="mv-var-name">${varTypeHtml(name, frame, cs, 'mv-var-type')}${esc(name)}</span>
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

      if (item.scalar) html += `<span class="mv-heap-cell"><span class="mv-cell-val">${fmtPrimFull(item.ref)}</span></span>`;
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

      const seqLen = item.ref && vm().kind(item.ref) === 'sequence' ? vm().length(item.ref) : 0;
      const overflow = seqLen > 24
        ? `<span class="mv-heap-overflow">+${seqLen - 24}…</span>` : '';
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

        const n    = srcEls.length;
        const frac = (i + 1) / (n + 1);
        let d;

        if (from.right + 8 < toRect.left) {
          // 始点が終点より左に離れている（STACK → HEAP）: 右へ出して、見出しの左端へ横から入れる。
          // 上下から入れると、矢印が途中のヒープ要素のマスを横切ってしまうため（ADR-053）。
          // 同じ対象に集まる矢印は、見出しの高さの中で終点を分散させる
          const x1 = from.right - containerRect.left;
          const y1 = from.top + from.height / 2 - containerRect.top;
          const x2 = toRect.left - containerRect.left;
          const y2 = toRect.top + toRect.height * frac - containerRect.top;
          // 自分の行の高さのまま右へ進み、終点の手前（STACK と HEAP のあいだ）でだけ曲げる。
          // 途中で曲げ始めると、上下にあるほかの変数の行やフレームの上を斜めに横切るため
          const bend = Math.min(40, Math.max(16, (x2 - x1) / 2));
          const xb   = x2 - bend;
          d = `M ${x1},${y1} H ${xb} C ${xb + bend * 0.6},${y1} ${x2 - bend * 0.6},${y2} ${x2},${y2}`;
        } else {
          // 上下どちらから出す/入れるかは、要素自身を跨がないよう相対位置で決める
          const fromCy = from.top + from.height / 2;
          const toCy   = toRect.top + toRect.height / 2;
          const fromIsBelow = fromCy > toCy;

          const x1 = from.left + from.width / 2 - containerRect.left;
          const y1 = (fromIsBelow ? from.top : from.bottom) - containerRect.top;

          // 終点はタイトル幅内で均等分散（同じ対象に集まる矢印の矢じり重なりを回避）
          const x2   = toRect.left + toRect.width * frac - containerRect.left;
          const y2   = (fromIsBelow ? toRect.bottom : toRect.top) - containerRect.top;

          const my = (y1 + y2) / 2;
          d = `M ${x1},${y1} C ${x1},${my} ${x2},${my} ${x2},${y2}`;
        }

        const path = svgEl('path', {
          class: 'mv-arrow',
          d,
          fill: 'none',
          'marker-end': 'url(#mv-arr)',
        });
        this.#svgEl.appendChild(path);
      });
    }
  }
}
