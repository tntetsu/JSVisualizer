/**
 * callstack-view/index.js — コールスタックビジュアライザー
 *
 * 現在のコールスタックをカード形式で表示する。
 * 最上位フレーム（最内側の呼び出し）が先頭に並ぶ。
 * 関数呼び出し時は新規カードがスライドインし、
 * 戻り時はカードが消える。
 */

import { BaseView }                        from '../base-view.js';
import { esc, formatFrameLabel }           from '../../utils/format.js';

export class CallStackView extends BaseView {
  /** @type {HTMLElement|null} */
  #container = null;
  #stackEl   = null;

  /** 前回レンダリング時のフレーム数（深さ変化の検出用） */
  #prevDepth = 0;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, _builder) {
    this.#container = container;
    this.#prevDepth = 0;
    container.innerHTML = `
      <div class="csv-scroll">
        <div class="csv-stack">
          <p class="placeholder">実行待ち</p>
        </div>
      </div>`;
    this.#stackEl = container.querySelector('.csv-stack');
  }

  update(state) {
    if (!this.#stackEl) return;
    const { callStack, event } = state;

    if (!event || !callStack || callStack.length === 0) {
      this.#stackEl.innerHTML = '<p class="placeholder">—</p>';
      this.#prevDepth = 0;
      return;
    }

    const frames    = [...callStack].reverse(); // 最内スコープを先頭に
    const currDepth = frames.length;
    const isDeeper  = currDepth > this.#prevDepth;

    // カード HTML を生成（トップカードだけ enter アニメーション付き）
    this.#stackEl.innerHTML = frames.map((f, i) => {
      const isTop    = i === 0;
      const entering = isTop && isDeeper ? ' csv-card--enter' : '';
      const label    = formatFrameLabel(f);
      const loc      = f.loc ? `line ${f.loc.line}` : '';
      return `<div class="csv-card${isTop ? ' csv-card--top' : ''}${entering}">
        <div class="csv-name">${esc(label)}</div>
        ${loc ? `<div class="csv-loc">${esc(loc)}</div>` : ''}
      </div>`;
    }).join('');

    // グローバルスコープを示すベースカード
    this.#stackEl.innerHTML += `
      <div class="csv-card csv-card--global">
        <div class="csv-name">〈global〉</div>
      </div>`;

    this.#prevDepth = currDepth;
  }

  reset() {
    if (this.#stackEl) {
      this.#stackEl.innerHTML = '<p class="placeholder">実行待ち</p>';
    }
    this.#prevDepth = 0;
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#stackEl   = null;
    this.#prevDepth = 0;
  }

}
