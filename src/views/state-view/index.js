/**
 * state-view/index.js — コールスタックビュー
 *
 * Call Stack カード1枚をスクロール可能な縦並びで表示する。
 * 先頭に常時「Global」疑似フレームを表示し、コールスタックの深さに関わらず
 * グローバルスコープの変数を可視化する（callStack が空でも変数が見えるように）。
 * Console は常時表示パネル（app-main 外の #console-panel）に移動済み。
 */

import { BaseView }                                            from '../base-view.js';
import { esc, formatValue, BUILTIN_NAMES, mergeScopesForDisplay } from '../../utils/format.js';

export class CallStackView extends BaseView {
  /** @type {HTMLElement|null} */
  #container       = null;
  #callstackEl     = null;
  /** @type {import('../../core/debugger-adapter.js').AppState|null} */
  #lastState       = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  /**
   * @param {HTMLElement} container
   * @param {*}           _builder  不使用（BaseView インターフェース準拠）
   */
  init(container, _builder) {
    this.#container = container;
    container.innerHTML = `
      <div class="sv-scroll">
        <div class="debug-card">
          <div class="card-header">Call Stack</div>
          <div class="sv-callstack callstack">
            <p class="placeholder">—</p>
          </div>
        </div>

      </div>`;

    this.#callstackEl = container.querySelector('.sv-callstack');
  }

  /** @param {import('../../core/debugger-adapter.js').AppState} state */
  update(state) {
    this.#lastState = state;
    this.#renderCallStack(state);
  }

  reset() {
    this.#lastState = null;
    if (!this.#container) return;
    this.#callstackEl.innerHTML = '<p class="placeholder">—</p>';
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container       = null;
    this.#callstackEl     = null;
    this.#lastState       = null;
  }

  // ── 内部レンダリング ──────────────────────────────────────────────────────

  #renderFrame(label, vars, changed, { active = false } = {}) {
    const entries = Object.entries(vars).filter(([k]) => !BUILTIN_NAMES.has(k));
    let html = `<div class="scv-frame${active ? ' scv-frame--active' : ''}">
      <div class="scv-frame-header">
        <span class="scv-frame-name">${esc(label)}</span>
      </div>
      <div class="scv-vars">`;
    if (!entries.length) {
      html += '<span class="scv-empty">(no variables)</span>';
    } else {
      for (const [name, val] of entries) {
        const flash = changed.has(name) ? ' var-row--changed' : '';
        html += `<div class="var-row${flash}">
          <span class="var-name">${esc(name)}</span>
          <span class="var-eq">=</span>
          ${formatValue(val)}
        </div>`;
      }
    }
    html += '</div></div>';
    return html;
  }

  #renderCallStack(state) {
    const { scopes, callStack, changedVars, event } = state;
    if (!event) {
      this.#callstackEl.innerHTML = '<p class="placeholder">—</p>';
      return;
    }
    const changed = new Set(changedVars);
    const displayScopes = mergeScopesForDisplay(scopes, callStack, state.frameEnvs);

    // Global フレームは mergeScopesForDisplay() が返す順序（関数呼び出し中は末尾）に
    // 関わらず、このビューでは常に先頭に表示する（callStack が空でも変数を可視化するため）
    const globalIdx = displayScopes.findIndex(s => s.label === 'global');
    if (globalIdx > 0) {
      const [g] = displayScopes.splice(globalIdx, 1);
      displayScopes.unshift(g);
    }

    let html = '';
    for (const { label, vars, isInnermost } of displayScopes) {
      const displayLabel = label === 'global' ? 'Global' : label;
      html += this.#renderFrame(displayLabel, vars, changed, { active: isInnermost });
    }
    this.#callstackEl.innerHTML = html || '<p class="placeholder">—</p>';
  }

}
