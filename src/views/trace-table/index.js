/**
 * trace-table/index.js — 静的トレーステーブル
 *
 * init() 時に全 humanStep 行を一括レンダリングする読み取り専用テーブル。
 * update() で現在ステップに対応する行をハイライトしてスクロールする。
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

export class TraceTable extends BaseView {
  /** @type {HTMLElement|null} */
  #container  = null;
  #tbody      = null;

  /** @type {number[]} humanStep インデックス一覧（ソート済み） */
  #humanSteps = [];

  /** @type {HTMLTableRowElement[]} tbody 内の tr 配列（インデックス対応） */
  #rows = [];

  /** @type {HTMLTableRowElement|null} 現在ハイライト中の行 */
  #activeRow = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#humanSteps = builder ? builder.getHumanStepList() : [];
    this.#rows       = [];
    this.#activeRow  = null;

    container.innerHTML = `
      <div class="tt-wrap">
        <table class="tt-table">
          <thead>
            <tr>
              <th class="tt-th tt-col-num">#</th>
              <th class="tt-th tt-col-line">行</th>
              <th class="tt-th tt-col-type">イベント</th>
              <th class="tt-th tt-col-val">値</th>
            </tr>
          </thead>
          <tbody class="tt-tbody"></tbody>
        </table>
      </div>`;

    this.#tbody = container.querySelector('.tt-tbody');

    if (builder) {
      const trace = builder.trace;
      this.#humanSteps.forEach((stepIdx, i) => {
        const tr = this.#buildRow(i + 1, stepIdx, trace);
        this.#tbody.appendChild(tr);
        this.#rows.push(tr);
      });
    }
  }

  update(state) {
    if (!this.#tbody) return;

    // cursor 以下の最後の humanStep 行を特定
    const { cursor } = state;
    let activeIdx = -1;
    for (let i = 0; i < this.#humanSteps.length; i++) {
      if (this.#humanSteps[i] <= cursor) activeIdx = i;
      else break;
    }

    if (this.#activeRow) {
      this.#activeRow.classList.remove('tt-row--active');
      this.#activeRow = null;
    }

    if (activeIdx >= 0 && this.#rows[activeIdx]) {
      this.#activeRow = this.#rows[activeIdx];
      this.#activeRow.classList.add('tt-row--active');
      this.#activeRow.scrollIntoView({ block: 'nearest' });
    }
  }

  reset() {
    // ViewSwitcher が onReady で destroy → remount するのでここは軽量処理のみ
    if (this.#activeRow) {
      this.#activeRow.classList.remove('tt-row--active');
      this.#activeRow = null;
    }
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#tbody      = null;
    this.#humanSteps = [];
    this.#rows       = [];
    this.#activeRow  = null;
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  #buildRow(humanNum, stepIdx, trace) {
    const ev   = trace[stepIdx];
    const line = ev?.loc?.line ?? '—';
    const phase = ev?.phase === 'enter' ? '▶' : '◀';
    const type = ev ? `${phase} ${SHORT_TYPE[ev.nodeType] ?? ev.nodeType}` : '?';
    const val  = ev?.value !== undefined ? formatValue(ev.value) : '';

    const tr = document.createElement('tr');
    tr.className = 'tt-row';
    tr.innerHTML = `
      <td class="tt-td tt-col-num">${humanNum}</td>
      <td class="tt-td tt-col-line">${line}</td>
      <td class="tt-td tt-col-type">${esc(type)}</td>
      <td class="tt-td tt-col-val">${val}</td>`;
    return tr;
  }
}
