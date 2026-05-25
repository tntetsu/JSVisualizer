/**
 * animated-trace/index.js — アニメーション付きトレーステーブル
 *
 * ステップを進めるたびに行が追加され、戻ると行が削除される。
 * 新しい行はスライドインアニメーションで現れる。
 *
 * 列: # | 行 | イベント | 値
 */

import { BaseView }             from '../base-view.js';
import { esc, formatValue }     from '../../utils/format.js';

/** イベント種別の短縮表記 */
const SHORT_TYPE = {
  ExpressionStatement:  'Expr',
  VariableDeclaration:  'Var',
  IfStatement:          'If',
  WhileStatement:       'While',
  ForStatement:         'For',
  ForOfStatement:       'ForOf',
  ForInStatement:       'ForIn',
  ReturnStatement:      'Return',
  ThrowStatement:       'Throw',
  BreakStatement:       'Break',
  ContinueStatement:    'Continue',
  AssignmentExpression: 'Assign',
  UpdateExpression:     'Update',
  CallExpression:       'Call',
};

export class AnimatedTrace extends BaseView {
  /** @type {HTMLElement|null} */
  #container = null;
  #tbody     = null;

  /** @type {import('../../core/trace-builder.js').TraceBuilder|null} */
  #builder = null;

  /** @type {number[]} humanStep インデックス一覧（ソート済み） */
  #humanSteps = [];

  /** @type {Map<number, HTMLTableRowElement>} stepIdx → tr */
  #rowMap = new Map();

  /** 最後にレンダリング済みの humanSteps 配列インデックス数 */
  #renderedCount = 0;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#builder    = builder;
    this.#humanSteps = builder ? builder.getHumanStepList() : [];
    this.#rowMap.clear();
    this.#renderedCount = 0;

    container.innerHTML = `
      <div class="at-wrap">
        <table class="at-table">
          <thead>
            <tr>
              <th class="at-th at-col-num">#</th>
              <th class="at-th at-col-line">行</th>
              <th class="at-th at-col-type">イベント</th>
              <th class="at-th at-col-val">値</th>
            </tr>
          </thead>
          <tbody class="at-tbody"></tbody>
        </table>
      </div>`;

    this.#tbody = container.querySelector('.at-tbody');
  }

  update(state) {
    if (!this.#tbody || !this.#builder) return;

    const { cursor } = state;
    const humanSteps = this.#humanSteps;

    // cursor 以下の humanStep 数を算出
    let targetCount = 0;
    for (let i = 0; i < humanSteps.length; i++) {
      if (humanSteps[i] <= cursor) targetCount = i + 1;
      else break;
    }

    if (targetCount > this.#renderedCount) {
      // 前進: 新しい行を追加
      for (let i = this.#renderedCount; i < targetCount; i++) {
        const stepIdx = humanSteps[i];
        const tr      = this.#buildRow(i + 1, stepIdx);
        this.#tbody.appendChild(tr);
        this.#rowMap.set(stepIdx, tr);
      }
    } else if (targetCount < this.#renderedCount) {
      // 後退: 余分な行を削除
      for (let i = this.#renderedCount - 1; i >= targetCount; i--) {
        const stepIdx = humanSteps[i];
        const tr = this.#rowMap.get(stepIdx);
        if (tr) { tr.remove(); this.#rowMap.delete(stepIdx); }
      }
    }

    this.#renderedCount = targetCount;

    // アクティブ行をハイライト
    this.#tbody.querySelectorAll('.at-row--active')
      .forEach(r => r.classList.remove('at-row--active'));

    if (targetCount > 0) {
      const activeStepIdx = humanSteps[targetCount - 1];
      const activeRow     = this.#rowMap.get(activeStepIdx);
      if (activeRow) {
        activeRow.classList.add('at-row--active');
        activeRow.scrollIntoView({ block: 'nearest' });
      }
    }
  }

  reset() {
    if (this.#tbody) this.#tbody.innerHTML = '';
    this.#rowMap.clear();
    this.#renderedCount = 0;
    // ViewSwitcher が onReady で destroy → remount するため
    // ここでは DOM のみクリアすれば十分
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container    = null;
    this.#tbody        = null;
    this.#builder      = null;
    this.#humanSteps   = [];
    this.#rowMap.clear();
    this.#renderedCount = 0;
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  #buildRow(humanNum, stepIdx) {
    const trace = this.#builder.trace;
    const ev    = trace[stepIdx];
    const line  = ev?.loc?.line ?? '—';
    const phase = ev?.phase === 'enter' ? '▶' : '◀';
    const type  = ev ? `${phase} ${SHORT_TYPE[ev.nodeType] ?? ev.nodeType}` : '?';
    const val   = ev?.value !== undefined ? formatValue(ev.value) : '';

    const tr = document.createElement('tr');
    tr.className = 'at-row at-row--new';
    tr.innerHTML = `
      <td class="at-td at-col-num">${humanNum}</td>
      <td class="at-td at-col-line">${line}</td>
      <td class="at-td at-col-type">${esc(type)}</td>
      <td class="at-td at-col-val">${val}</td>`;

    // アニメーション用クラスを 1 フレーム後に除去
    requestAnimationFrame(() => tr.classList.remove('at-row--new'));
    return tr;
  }
}
