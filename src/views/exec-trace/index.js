/**
 * exec-trace/index.js — 実行順トレース表
 *
 * 行   = humanStep ごとの実行ステップ（実行順）
 * 列   = # | 行 | コード | 変数値（出現順）| 条件
 *
 * init() で全行を一括生成し、update() は現在行の
 * ハイライト移動とスクロール追従のみを行う（O(n)）。
 *
 * 条件列: IfStatement / WhileStatement / ForStatement 等の enter ステップで、
 * 直後のトレースを走査して深さ D+1 の最初のブール値 exit を取得する。
 */

import { BaseView } from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES, formatValue, esc } from '../../utils/format.js';

const CONDITION_NODES = new Set([
  'IfStatement', 'WhileStatement', 'DoWhileStatement',
  'ForStatement', 'ForInStatement', 'ForOfStatement',
  'ConditionalExpression',
]);

function isFunctionVal(v) {
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') {
    return v.__type__ === 'JSFunction' || v.__type__ === 'JSClass';
  }
  return false;
}

/**
 * 条件文・ループ文の条件式評価結果を返す。
 * si+1 〜 nextSi-1 の trace を走査し、AST 深さ D+1 の
 * 最初のブール値 exit イベントの value を文字列で返す。
 * 見つからない場合は空文字。
 */
function findConditionValue(trace, si, nextSi) {
  const ev = trace[si];
  if (!ev || ev.phase !== 'enter' || !CONDITION_NODES.has(ev.nodeType)) return '';
  const D = ev.depth;
  for (let i = si + 1; i < Math.min(nextSi, trace.length); i++) {
    const t = trace[i];
    if (t.depth < D) break;
    if (t.phase === 'exit' && t.depth === D + 1 && typeof t.value === 'boolean') {
      return String(t.value);
    }
  }
  return '';
}

export class ExecTrace extends BaseView {
  #container  = null;
  #rowEls     = null;   // HTMLElement[]  hi → <tr>
  #humanSteps = null;   // number[]       trace インデックス列
  #activeHi   = -1;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#activeHi   = -1;

    const humanSteps = builder.getHumanStepList();
    const trace      = builder.trace;
    const source     = builder.source ?? '';
    const lines      = source.split('\n');

    this.#humanSteps = humanSteps;

    if (humanSteps.length === 0) {
      container.innerHTML = '<div class="et-wrap"><p class="et-empty">ステップがありません</p></div>';
      this.#rowEls = [];
      return;
    }

    // 全 humanStep を走査して変数名を出現順に収集（関数・クラス値は除外）
    const varNames = [];
    const varSet   = new Set();
    for (const si of humanSteps) {
      const ev = trace[si];
      if (!ev) continue;
      for (const [k, v] of Object.entries(flattenEnv(ev.env))) {
        if (!varSet.has(k) && !BUILTIN_NAMES.has(k) && !isFunctionVal(v)) {
          varSet.add(k);
          varNames.push(k);
        }
      }
    }

    // テーブル HTML 構築
    let html = '<div class="et-wrap"><table class="et-table"><thead>';
    html += '<tr class="et-thead-row">';
    html += '<th class="et-th et-col-num">#</th>';
    html += '<th class="et-th et-col-line">行</th>';
    html += '<th class="et-th et-col-code">コード</th>';
    for (const name of varNames) {
      html += `<th class="et-th et-col-var">${esc(name)}</th>`;
    }
    html += '<th class="et-th et-col-cond">条件</th>';
    html += '</tr></thead><tbody class="et-tbody">';

    for (let hi = 0; hi < humanSteps.length; hi++) {
      const si     = humanSteps[hi];
      const ev     = trace[si];
      if (!ev) continue;

      const lineNo  = ev.loc?.line ?? 0;
      const rawLine = lineNo > 0 ? (lines[lineNo - 1] ?? '') : '';
      const snippet = rawLine.trim().slice(0, 30);
      const env     = flattenEnv(ev.env);
      const nextSi  = hi + 1 < humanSteps.length ? humanSteps[hi + 1] : trace.length;
      const cond    = findConditionValue(trace, si, nextSi);

      html += `<tr class="et-row" data-hi="${hi}">`;
      html += `<td class="et-td et-col-num">${hi + 1}</td>`;
      html += `<td class="et-td et-col-line">${lineNo}</td>`;
      html += `<td class="et-td et-col-code">${esc(snippet)}</td>`;
      for (const name of varNames) {
        const v   = env[name];
        const fmt = v === undefined ? '' : formatValue(v);
        html += `<td class="et-td et-col-var">${esc(fmt)}</td>`;
      }
      html += `<td class="et-td et-col-cond">${esc(cond)}</td>`;
      html += '</tr>';
    }

    html += '</tbody></table></div>';
    container.innerHTML = html;
    this.#rowEls = [...container.querySelectorAll('.et-row')];
  }

  update(state) {
    if (!this.#rowEls || !this.#humanSteps) return;

    const cursor     = state.cursor;
    const humanSteps = this.#humanSteps;

    // cursor 以下の最大 humanStep インデックスを求める
    let newHi = 0;
    for (let i = 0; i < humanSteps.length; i++) {
      if (humanSteps[i] <= cursor) newHi = i;
      else break;
    }

    if (newHi === this.#activeHi) return;

    // 旧ハイライトを解除
    if (this.#activeHi >= 0) {
      this.#rowEls[this.#activeHi]?.classList.remove('et-row--active');
    }
    // 新ハイライトを設定してスクロール追従
    const el = this.#rowEls[newHi];
    if (el) {
      el.classList.add('et-row--active');
      el.scrollIntoView({ block: 'nearest' });
    }
    this.#activeHi = newHi;
  }

  reset() {
    if (this.#activeHi >= 0) {
      this.#rowEls?.[this.#activeHi]?.classList.remove('et-row--active');
    }
    this.#activeHi = -1;
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#rowEls     = null;
    this.#humanSteps = null;
  }
}
