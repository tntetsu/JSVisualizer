/**
 * trace-table/index.js — 静的トレーステーブル
 *
 * init() 時に全 humanStep 行を一括レンダリングする読み取り専用テーブル。
 * update() で現在ステップに対応する行をハイライトしてスクロールする。
 *
 * 列: # | 行 | イベント | 対象 | 値
 */

import { BaseView }                               from '../base-view.js';
import { esc, formatValue, flattenEnv, BUILTIN_NAMES } from '../../utils/format.js';

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

/** 関数・クラス値か判定（対象列に載せない） */
function isFunctionVal(v) {
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') {
    return v.__type__ === 'JSFunction' || v.__type__ === 'JSClass';
  }
  return false;
}

/** 値の JSON 表現が等しいか（変化検出用） */
function valEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

/**
 * env diff で変化した最初の変数名を返す。
 * @param {Map<string,any>} prev
 * @param {Map<string,any>} curr
 * @returns {string}
 */
function firstChangedVar(prev, curr) {
  for (const [name, val] of curr) {
    if (BUILTIN_NAMES.has(name)) continue;
    if (isFunctionVal(val)) continue;
    if (!valEqual(val, prev.get(name))) return name;
  }
  return '';
}

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
              <th class="tt-th tt-col-target">対象</th>
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
        const prevStepIdx = i > 0 ? this.#humanSteps[i - 1] : -1;
        const tr = this.#buildRow(i + 1, stepIdx, trace, prevStepIdx);
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

  /**
   * 1ステップ分の <tr> を生成する。
   * @param {number} humanNum   表示用ステップ番号（1始まり）
   * @param {number} stepIdx    trace 内インデックス
   * @param {object[]} trace    全トレース配列
   * @param {number} prevStepIdx 直前 humanStep のインデックス（なければ -1）
   */
  #buildRow(humanNum, stepIdx, trace, prevStepIdx = -1) {
    const ev     = trace[stepIdx];
    const prevEv = prevStepIdx >= 0 ? trace[prevStepIdx] : null;

    const line  = ev?.loc?.line ?? '—';
    const phase = ev?.phase === 'enter' ? '▶' : '◀';
    const type  = ev ? `${phase} ${SHORT_TYPE[ev.nodeType] ?? ev.nodeType}` : '?';
    const val   = ev?.value !== undefined ? formatValue(ev.value) : '';

    // ── 「対象」列の計算 ─────────────────────────────────────────────────────
    let target = '';

    if (ev) {
      switch (ev.nodeType) {

        // 変数宣言・代入・インクリメント: env diff で変化した最初の変数名
        case 'VariableDeclaration':
        case 'AssignmentExpression':
        case 'UpdateExpression': {
          const prev = flattenEnv(prevEv?.env ?? []);
          const curr = flattenEnv(ev.env ?? []);
          target = firstChangedVar(prev, curr);
          break;
        }

        // return: 固定ラベル
        case 'ReturnStatement':
          target = 'return';
          break;

        // 関数呼び出し: enter → 関数名(引数...) / exit → 関数名
        case 'CallExpression': {
          const frame = ev.callStack?.[0];
          const name  = frame?.name ?? '?';
          if (ev.phase === 'enter') {
            const args = (frame?.args ?? [])
              .map(a => formatValue(a).replace(/<[^>]+>/g, ''))  // HTML タグを除去
              .join(', ');
            target = `${name}(${args})`;
          } else {
            target = name;
          }
          break;
        }

        default:
          break;
      }
    }

    const tr = document.createElement('tr');
    tr.className = 'tt-row';
    tr.innerHTML = `
      <td class="tt-td tt-col-num">${humanNum}</td>
      <td class="tt-td tt-col-line">${line}</td>
      <td class="tt-td tt-col-type">${esc(type)}</td>
      <td class="tt-td tt-col-target">${esc(target)}</td>
      <td class="tt-td tt-col-val">${val}</td>`;
    return tr;
  }
}
