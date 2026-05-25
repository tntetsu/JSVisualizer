/**
 * line-trace/index.js — ソース行×変数トレース表
 *
 * 行   = ソースコードの各行（全行固定表示）
 * 列   = 変数名（ステップが進み変数が宣言されるたびに列を追加）
 * セル = その行を最後に実行した時点での変数値
 *
 * update() のたびに humanStep[0..cursor] を走査して
 * ・各行の最新の変数スナップショットをセルに反映
 * ・cursor 直前との差分セルにフラッシュアニメーション
 */

import { BaseView }                           from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES, formatValue } from '../../utils/format.js';

/** 配列の内容が等しいか判定 */
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** 値の JSON 表現が等しいか（変化検出用） */
function valEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

export class LineTrace extends BaseView {
  /** @type {HTMLElement|null} */
  #container  = null;

  /** @type {import('../../core/trace-builder.js').TraceBuilder|null} */
  #builder    = null;

  /** @type {HTMLTableRowElement|null} thead の <tr> */
  #theadRow   = null;

  /** @type {HTMLTableSectionElement|null} */
  #tbodyEl    = null;

  /** @type {number[]} humanStep カーソル一覧（ソート済み） */
  #humanSteps = [];

  /** @type {Object[]} 生の trace 配列 */
  #trace      = [];

  /** @type {Map<number, HTMLTableRowElement>}  lineNo → <tr> */
  #rowEls     = new Map();

  /**
   * @type {Map<number, HTMLTableCellElement[]>}
   * lineNo → td[] （配列インデックスは #varOrder と対応）
   */
  #cellEls    = new Map();

  /** @type {string[]} 現在表示している変数名（登場順） */
  #varOrder   = [];

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#builder    = builder;
    this.#humanSteps = builder ? builder.getHumanStepList() : [];
    this.#trace      = builder ? builder.trace : [];
    this.#varOrder   = [];
    this.#rowEls.clear();
    this.#cellEls.clear();

    const source = builder?.source ?? '';

    if (!source) {
      container.innerHTML = '<div class="lt-wrap"><p class="placeholder">ソースコードが利用できません</p></div>';
      return;
    }

    const lines = source.split('\n');

    container.innerHTML = `
      <div class="lt-wrap">
        <table class="lt-table">
          <thead>
            <tr class="lt-thead-row">
              <th class="lt-th lt-th-lineno">行</th>
              <th class="lt-th lt-th-src">ソース</th>
            </tr>
          </thead>
          <tbody class="lt-tbody"></tbody>
        </table>
      </div>`;

    this.#theadRow = container.querySelector('.lt-thead-row');
    this.#tbodyEl  = container.querySelector('.lt-tbody');

    // ソース行ごとに <tr> を生成
    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;

      const tr = document.createElement('tr');
      tr.className = 'lt-row';

      const numTd = document.createElement('td');
      numTd.className = 'lt-td lt-td-lineno';
      numTd.textContent = String(lineNo);

      const srcTd = document.createElement('td');
      srcTd.className = 'lt-td lt-td-src';
      srcTd.textContent = lines[i];   // textContent でエスケープ済み

      tr.append(numTd, srcTd);
      this.#tbodyEl.appendChild(tr);
      this.#rowEls.set(lineNo, tr);
      this.#cellEls.set(lineNo, []);
    }
  }

  update(state) {
    if (!this.#theadRow) return;

    const { cursor, event } = state;
    const currentLine = event?.loc?.line ?? -1;

    // ── humanStep[0..cursor] をスキャン ────────────────────────────────────
    /** @type {Map<number, Map<string, any>>}  lineNo → 最新変数スナップショット */
    const lineStates  = new Map();
    const newVarOrder = [];
    const varSeen     = new Set();
    let   prevVars    = null;
    /** @type {Set<string>} cursor 直前との差分変数 */
    const changedVars = new Set();

    for (const si of this.#humanSteps) {
      if (si > cursor) break;
      const ev = this.#trace[si];
      if (!ev?.env || !ev.loc) continue;

      const line = ev.loc.line;
      const vars = flattenEnv(ev.env);

      // 新しい変数を登場順に収集
      for (const [name] of vars) {
        if (!BUILTIN_NAMES.has(name) && !varSeen.has(name)) {
          varSeen.add(name);
          newVarOrder.push(name);
        }
      }

      lineStates.set(line, vars);

      // cursor の直前ステップとの差分を計算
      if (si === cursor && prevVars !== null) {
        for (const name of newVarOrder) {
          if (!valEqual(prevVars.get(name), vars.get(name))) {
            changedVars.add(name);
          }
        }
      }
      prevVars = vars;
    }

    // ── 列が変わった場合のみ再構築 ─────────────────────────────────────────
    if (!arraysEqual(newVarOrder, this.#varOrder)) {
      this.#rebuildColumns(newVarOrder);
    }

    // ── 各行のセルを更新 ───────────────────────────────────────────────────
    for (const [lineNo, rowEl] of this.#rowEls) {
      const isActive = lineNo === currentLine;
      rowEl.classList.toggle('lt-row--active', isActive);

      const vars  = lineStates.get(lineNo);
      const cells = this.#cellEls.get(lineNo);

      for (let i = 0; i < this.#varOrder.length; i++) {
        const cellEl = cells[i];
        if (!cellEl) continue;

        const name    = this.#varOrder[i];
        const val     = vars?.get(name);
        const changed = isActive && changedVars.has(name);

        cellEl.innerHTML = val !== undefined
          ? formatValue(val)
          : '<span class="lt-empty">—</span>';

        // フラッシュアニメーション
        cellEl.classList.remove('lt-flash');
        if (changed) {
          void cellEl.offsetWidth;   // reflow でアニメーションをリセット
          cellEl.classList.add('lt-flash');
        }
      }
    }

    // 現在行をスクロールして見える位置に
    if (currentLine > 0) {
      this.#rowEls.get(currentLine)?.scrollIntoView({ block: 'nearest' });
    }
  }

  reset() {
    if (!this.#tbodyEl) return;
    for (const rowEl of this.#rowEls.values()) {
      rowEl.classList.remove('lt-row--active');
    }
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#builder    = null;
    this.#theadRow   = null;
    this.#tbodyEl    = null;
    this.#rowEls.clear();
    this.#cellEls.clear();
    this.#varOrder   = [];
    this.#humanSteps = [];
    this.#trace      = [];
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /**
   * ヘッダーと全行の変数セルを作り直す。
   * 既存の変数セルは削除してから再生成する。
   * @param {string[]} newVarOrder
   */
  #rebuildColumns(newVarOrder) {
    // 既存の変数ヘッダーを削除
    this.#theadRow.querySelectorAll('.lt-th-var').forEach(el => el.remove());

    // 全行の既存変数セルを削除
    for (const cells of this.#cellEls.values()) {
      cells.forEach(td => td.remove());
      cells.length = 0;
    }

    // 新しいヘッダーセルを追加
    for (const name of newVarOrder) {
      const th = document.createElement('th');
      th.className   = 'lt-th lt-th-var';
      th.textContent = name;
      this.#theadRow.appendChild(th);
    }

    // 新しいデータセルを全行に追加
    for (const [lineNo, rowEl] of this.#rowEls) {
      const cells = this.#cellEls.get(lineNo);
      for (let i = 0; i < newVarOrder.length; i++) {
        const td = document.createElement('td');
        td.className = 'lt-td lt-td-var';
        rowEl.appendChild(td);
        cells.push(td);
      }
    }

    this.#varOrder = [...newVarOrder];
  }
}
