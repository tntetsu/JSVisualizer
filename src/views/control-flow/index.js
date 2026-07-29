/**
 * control-flow/index.js — 構造的制御フロービュー（AST ベース）
 *
 * buildCFG() が返すスコープ配列を DOM ベースのフローチャートで描画する。
 * 各スコープ（グローバル / 関数）は独立したパネルに表示される。
 *
 * ノード種別:
 *   stmt    — 通常の文（矩形）
 *   return  — return 文（緑枠）
 *   jump    — break / continue（紫枠）
 *   if      — 条件分岐（◇ アイコン + true/false 列）
 *   while   — while ループ（↺ アイコン + インデント本体）
 *   for     — for / for-of / for-in ループ（同上）
 *   do-while— do-while ループ（同上）
 *   seq     — 文列（グループ）
 */

import { BaseView } from '../base-view.js';
import { t }        from '../../i18n.js';

const MAX_LABEL = 46;  // ラベルの最大文字数

/** ラベルを最大文字数で切り詰める */
function clip(s) {
  return s.length > MAX_LABEL ? s.slice(0, MAX_LABEL - 1) + '…' : s;
}

export class ControlFlow extends BaseView {
  #container  = null;
  #activeEl   = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container = container;
    this.#activeEl  = null;

    const scopes = builder ? builder.buildCFG() : [];

    if (!scopes.length) {
      container.innerHTML = '<div class="cf-wrap"><p class="placeholder">No execution data</p></div>';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'cf-wrap';

    for (const scope of scopes) {
      wrap.appendChild(this.#renderScope(scope));
    }

    container.innerHTML = '';
    container.appendChild(wrap);
  }

  update(state) {
    if (!this.#container) return;

    // 前のアクティブ解除
    if (this.#activeEl) {
      this.#activeEl.classList.remove('cf-node--active');
      this.#activeEl = null;
    }

    const line = state.event?.loc?.line;
    if (!line) return;

    // data-line が一致する最初の cf-node を探す
    const el = this.#container.querySelector(`.cf-node[data-line="${line}"]`);
    if (el) {
      el.classList.add('cf-node--active');
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      this.#activeEl = el;
    }
  }

  reset() {}

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container = null;
    this.#activeEl  = null;
  }

  // ── スコープパネル ─────────────────────────────────────────────────────────

  #renderScope(scope) {
    const panel = document.createElement('div');
    panel.className = 'cf-scope';

    const hdr = document.createElement('div');
    hdr.className = 'cf-scope-hdr';
    if (scope.name === 'global') {
      hdr.textContent = t('controlflow-global');
    } else {
      const pStr = scope.params.length ? scope.params.join(', ') : '';
      hdr.textContent = `ƒ ${scope.name}(${pStr})`;
    }
    panel.appendChild(hdr);

    const body = document.createElement('div');
    body.className = 'cf-region';
    this.#renderItems(scope.items, body);

    if (!body.hasChildNodes()) {
      const ph = document.createElement('p');
      ph.className = 'placeholder';
      ph.textContent = '—';
      body.appendChild(ph);
    }

    panel.appendChild(body);
    return panel;
  }

  // ── アイテムのレンダリング ─────────────────────────────────────────────────

  #renderItems(items, container) {
    for (const item of items ?? []) {
      const el = this.#renderItem(item);
      if (el) container.appendChild(el);
    }
  }

  #renderItem(item) {
    switch (item.type) {
      case 'stmt':    return this.#mkBlock(item, '');
      case 'return':  return this.#mkBlock(item, 'cf-node--return');
      case 'jump':    return this.#mkBlock(item, 'cf-node--jump');
      case 'if':      return this.#mkIf(item);
      case 'while':
      case 'for':
      case 'do-while':return this.#mkLoop(item);
      case 'seq':     return this.#mkSeq(item);
      default:        return null;
    }
  }

  // ── 基本ブロック ───────────────────────────────────────────────────────────

  #mkBlock(item, extraClass) {
    const div = document.createElement('div');
    div.className = `cf-node${extraClass ? ' ' + extraClass : ''}${item.execCount === 0 ? ' cf-node--dead' : ''}`;
    div.dataset.line = item.lineStart ?? item.condLine ?? 0;

    if (item.execCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'cf-exec-badge';
      badge.textContent = `×${item.execCount}`;
      div.appendChild(badge);
    }

    const code = document.createElement('code');
    code.textContent = clip(item.label ?? '');
    div.appendChild(code);

    return div;
  }

  // ── if/else ──────────────────────────────────────────────────────────────

  #mkIf(item) {
    const wrap = document.createElement('div');
    wrap.className = 'cf-if-group';

    // 条件ノード
    const cond = document.createElement('div');
    cond.className = `cf-node cf-node--cond${item.execCount === 0 ? ' cf-node--dead' : ''}`;
    cond.dataset.line = item.condLine;

    if (item.execCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'cf-exec-badge';
      badge.textContent = `×${item.execCount}`;
      cond.appendChild(badge);
    }
    const code = document.createElement('code');
    code.textContent = clip(item.condLabel ?? '');
    cond.appendChild(code);
    wrap.appendChild(cond);

    // true / false 列
    const branches = document.createElement('div');
    branches.className = 'cf-if-branches';

    // true 枝
    const trueBranch = this.#mkBranch('true', item.then_);
    branches.appendChild(trueBranch);

    // false 枝
    const falseBranch = this.#mkBranch('false', item.else_);
    branches.appendChild(falseBranch);

    wrap.appendChild(branches);
    return wrap;
  }

  #mkBranch(label, items) {
    const branch = document.createElement('div');
    branch.className = `cf-if-branch cf-if-branch--${label}`;

    const hdr = document.createElement('div');
    hdr.className = 'cf-branch-hdr';
    hdr.textContent = label;
    branch.appendChild(hdr);

    if (items && items.length > 0) {
      this.#renderItems(items, branch);
    } else {
      const ph = document.createElement('div');
      ph.className = 'cf-no-else';
      ph.textContent = '—';
      branch.appendChild(ph);
    }

    return branch;
  }

  // ── ループ ────────────────────────────────────────────────────────────────

  #mkLoop(item) {
    const wrap = document.createElement('div');
    wrap.className = 'cf-loop-group';

    // 条件ノード（↺ は CSS で付与）
    const cond = document.createElement('div');
    cond.className = `cf-node cf-node--cond cf-node--loop${item.execCount === 0 ? ' cf-node--dead' : ''}`;
    cond.dataset.line = item.condLine;

    if (item.execCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'cf-exec-badge';
      badge.textContent = `×${item.execCount}`;
      cond.appendChild(badge);
    }
    const code = document.createElement('code');
    code.textContent = clip(item.condLabel ?? '');
    cond.appendChild(code);
    wrap.appendChild(cond);

    // ループ本体
    const body = document.createElement('div');
    body.className = 'cf-loop-body';
    this.#renderItems(item.body, body);
    if (!body.hasChildNodes()) {
      const ph = document.createElement('div');
      ph.className = 'cf-no-else';
      ph.textContent = '—';
      body.appendChild(ph);
    }
    wrap.appendChild(body);

    return wrap;
  }

  // ── 文列 ──────────────────────────────────────────────────────────────────

  #mkSeq(item) {
    const div = document.createElement('div');
    div.className = 'cf-seq';
    this.#renderItems(item.children, div);
    return div;
  }
}
