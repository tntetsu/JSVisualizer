/**
 * scope-view/index.js — スコープフレームビュー
 *
 * スコープチェーン全体を視覚化する。
 * 内側スコープが先頭（上）に並び、グローバルスコープが末尾（下）。
 * 現在の最内スコープ（実行中フレーム）をアクセントカラーで強調する。
 */

import { BaseView }                        from '../base-view.js';
import { esc, formatValue, BUILTIN_NAMES } from '../../utils/format.js';

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
          <p class="placeholder">実行待ち</p>
        </div>
      </div>`;
    this.#framesEl = container.querySelector('.scv-frames');
  }

  update(state) {
    if (!this.#framesEl) return;
    const { scopes, callStack, event, changedVars } = state;
    const changed = new Set(changedVars);

    if (!event || !scopes || scopes.length === 0) {
      this.#framesEl.innerHTML = '<p class="placeholder">スコープなし</p>';
      return;
    }

    let html = '';
    // scopes[0] = 最内スコープ（実行中）、scopes[last] = グローバル
    for (let i = 0; i < scopes.length; i++) {
      const scope      = scopes[i] ?? {};
      const isInnermost = i === 0;
      const label      = callStack[i]?.name
                       ?? (i === scopes.length - 1 ? 'global' : `scope[${i}]`);
      const entries    = Object.entries(scope).filter(([k]) => !BUILTIN_NAMES.has(k));

      html += `<div class="scv-frame${isInnermost ? ' scv-frame--active' : ''}">
        <div class="scv-frame-header">
          <span class="scv-frame-name">${esc(label)}</span>
          <span class="scv-frame-badge">scope ${i}</span>
        </div>
        <div class="scv-vars">`;

      if (!entries.length) {
        html += '<span class="scv-empty">（変数なし）</span>';
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
      this.#framesEl.innerHTML = '<p class="placeholder">実行待ち</p>';
    }
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#framesEl  = null;
  }
}
