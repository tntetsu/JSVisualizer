/**
 * state-view/index.js — 変数・コールスタック統合ビュー
 *
 * 3 つのカード（Current Step / Variables / Call Stack）を
 * スクロール可能な縦並びで表示する。
 * Console は常時表示パネル（app-main 外の #console-panel）に移動済み。
 */

import { BaseView }                                            from '../base-view.js';
import { esc, formatValue, BUILTIN_NAMES, mergeScopesForDisplay } from '../../utils/format.js';

export class StateView extends BaseView {
  /** @type {HTMLElement|null} */
  #container       = null;
  #currentStepEl   = null;
  #variablesEl     = null;
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
          <div class="card-header">Current Step</div>
          <div class="sv-current current-step">
            <p class="placeholder">Ready…</p>
          </div>
        </div>

        <div class="debug-card">
          <div class="card-header">Variables</div>
          <div class="sv-variables variables">
            <p class="placeholder">—</p>
          </div>
        </div>

        <div class="debug-card">
          <div class="card-header">Call Stack</div>
          <div class="sv-callstack callstack">
            <p class="placeholder">—</p>
          </div>
        </div>

      </div>`;

    this.#currentStepEl   = container.querySelector('.sv-current');
    this.#variablesEl     = container.querySelector('.sv-variables');
    this.#callstackEl     = container.querySelector('.sv-callstack');
  }

  /** @param {import('../../core/debugger-adapter.js').AppState} state */
  update(state) {
    this.#lastState = state;
    this.#renderCurrentStep(state);
    this.#renderVariables(state);
    this.#renderCallStack(state);
  }

  reset() {
    this.#lastState = null;
    if (!this.#container) return;
    this.#currentStepEl.innerHTML = '<p class="placeholder">Ready…</p>';
    this.#variablesEl.innerHTML   = '<p class="placeholder">—</p>';
    this.#callstackEl.innerHTML   = '<p class="placeholder">—</p>';
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container       = null;
    this.#currentStepEl   = null;
    this.#variablesEl     = null;
    this.#callstackEl     = null;
    this.#lastState       = null;
  }

  // ── 内部レンダリング ──────────────────────────────────────────────────────

  #renderCurrentStep(state) {
    const { event, done } = state;
    if (done || !event) {
      this.#currentStepEl.innerHTML = '<p class="placeholder">Done</p>';
      return;
    }
    const phase    = event.phase === 'enter' ? '▶ enter' : '◀ exit';
    const phaseCls = event.phase === 'enter' ? 'cs-phase-enter' : 'cs-phase-exit';
    const loc      = event.loc ? `line ${event.loc.line}` : '';
    const val      = event.value !== undefined
      ? `<span class="cs-value"> → ${formatValue(event.value)}</span>` : '';

    this.#currentStepEl.innerHTML = `
      <div class="cs-line">
        <span class="${phaseCls}">${esc(phase)}</span>
        <span class="cs-node"> ${esc(event.nodeType)}</span>
        <span> ${esc(loc)}</span>
        ${val}
      </div>
      <div class="cs-line">
        depth: <span>${event.depth}</span>
        &nbsp; callDepth: <span>${event.callDepth}</span>
      </div>`;
  }

  #renderVariables(state) {
    const { variables, changedVars, event } = state;
    const changed = new Set(changedVars);

    if (!event) {
      this.#variablesEl.innerHTML = '<p class="placeholder">—</p>';
      return;
    }

    const entries = Object.entries(variables).filter(([k]) => !BUILTIN_NAMES.has(k));
    if (!entries.length) {
      this.#variablesEl.innerHTML = '<p class="placeholder">No variables</p>';
      return;
    }

    let html = '';
    for (const [name, val] of entries) {
      const flash = changed.has(name) ? ' var-row--changed' : '';
      html += `<div class="var-row${flash}">
        <span class="var-name">${esc(name)}</span>
        <span class="var-eq">=</span>
        ${formatValue(val)}
      </div>`;
    }
    this.#variablesEl.innerHTML = html;
  }

  #renderCallStack(state) {
    const { scopes, callStack, changedVars } = state;
    if (!callStack || callStack.length === 0) {
      this.#callstackEl.innerHTML = '<p class="placeholder">—</p>';
      return;
    }
    const changed = new Set(changedVars);
    const displayScopes = mergeScopesForDisplay(scopes, callStack, state.frameEnvs);
    let html = '';
    for (const { label, vars, isInnermost } of displayScopes) {
      const entries = Object.entries(vars).filter(([k]) => !BUILTIN_NAMES.has(k));
      html += `<div class="scv-frame${isInnermost ? ' scv-frame--active' : ''}">
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
    }
    this.#callstackEl.innerHTML = html || '<p class="placeholder">—</p>';
  }

}
