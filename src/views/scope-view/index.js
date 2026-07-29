/**
 * scope-view/index.js — スコープフレームビュー
 *
 * スコープチェーン全体を視覚化する。
 * 内側スコープが先頭（上）に並び、グローバルスコープが末尾（下）。
 * 現在の最内スコープ（実行中フレーム）をアクセントカラーで強調する。
 */

import { BaseView }                                            from '../base-view.js';
import { esc, formatValue, BUILTIN_NAMES, mergeScopesForDisplay } from '../../utils/format.js';
import { t }                                                   from '../../i18n.js';

export class ScopeView extends BaseView {
  /** @type {HTMLElement|null} */
  #container = null;
  #framesEl  = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, _builder) {
    this.#container = container;
    container.innerHTML = `
      <div class="scv-scroll">
        <div class="scv-frames">
          <p class="placeholder">${esc(t('view-waiting'))}</p>
        </div>
      </div>`;
    this.#framesEl = container.querySelector('.scv-frames');
  }

  update(state) {
    if (!this.#framesEl) return;
    const { scopes, callStack, event, changedVars } = state;
    const changed = new Set(changedVars);

    if (!event || !scopes || scopes.length === 0) {
      this.#framesEl.innerHTML = `<p class="placeholder">${esc(t('scopeview-empty'))}</p>`;
      return;
    }

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
        html += `<span class="scv-empty">${esc(t('scopeview-no-vars'))}</span>`;
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

    this.#framesEl.innerHTML = html;
  }

  reset() {
    if (this.#framesEl) {
      this.#framesEl.innerHTML = `<p class="placeholder">${esc(t('view-waiting'))}</p>`;
    }
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#framesEl  = null;
  }
}
