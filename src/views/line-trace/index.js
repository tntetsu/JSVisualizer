/**
 * line-trace/index.js — ソース行×変数トレース表
 *
 * 行   = ソースコードの各行（全行固定表示）
 * 列   = 変数名（ステップが進み変数が宣言されるたびに列を追加）
 * セル = その行を最後に実行した時点での変数値
 *
 * ソース列は表示しない（左ペインのコードエディタと重複するため）。
 * 行高さを code-view と統一し、スクロール位置を同期する。
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

/**
 * 関数・クラス値か判定（列に載せない対象）
 * JSInterpreter の内部型 JSFunction / JSClass、およびネイティブ関数を除外する。
 */
function isFunctionVal(v) {
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') {
    return v.__type__ === 'JSFunction' || v.__type__ === 'JSClass';
  }
  return false;
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

  /** @type {HTMLElement|null} スクロール同期に使う lt-wrap */
  #wrapEl     = null;

  /** @type {number[]} humanStep カーソル一覧（ソート済み） */
  #humanSteps = [];

  /** @type {Object[]} 生の trace 配列 */
  #trace      = [];

  /** @type {Map<number, HTMLTableRowElement>}  lineNo → <tr> */
  #rowEls     = new Map();

  /**
   * @type {Map<number, HTMLTableCellElement[]>}
   * lineNo → td[] （配列インデックスは #varMeta と対応）
   */
  #cellEls    = new Map();

  /**
   * @type {Array<{name: string, visible: boolean}>}
   * 変数メタデータ（表示順・表示フラグ）
   */
  #varMeta    = [];

  /** @type {boolean} スクロール同期の無限ループ防止フラグ */
  #syncing    = false;

  /** @type {HTMLElement|null} code-display 要素（スクロール同期用） */
  #codeDisplay = null;

  /** @type {Function|null} code-display スクロールリスナー */
  #codeScrollHandler = null;

  /** @type {Function|null} lt-wrap スクロールリスナー */
  #ltScrollHandler   = null;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#builder    = builder;
    this.#humanSteps = builder ? builder.getHumanStepList() : [];
    this.#trace      = builder ? builder.trace : [];
    this.#varMeta    = [];
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
        <div class="lt-toolbar" id="lt-toolbar"></div>
        <table class="lt-table">
          <thead>
            <tr class="lt-thead-row">
              <th class="lt-th lt-th-lineno">#</th>
            </tr>
          </thead>
          <tbody class="lt-tbody"></tbody>
        </table>
      </div>`;

    this.#theadRow = container.querySelector('.lt-thead-row');
    this.#tbodyEl  = container.querySelector('.lt-tbody');
    this.#wrapEl   = container.querySelector('.lt-wrap');

    // ソース行ごとに <tr> を生成（ソース列なし）
    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;

      const tr = document.createElement('tr');
      tr.className = 'lt-row';

      const numTd = document.createElement('td');
      numTd.className = 'lt-td lt-td-lineno';
      numTd.textContent = String(lineNo);

      tr.append(numTd);
      this.#tbodyEl.appendChild(tr);
      this.#rowEls.set(lineNo, tr);
      this.#cellEls.set(lineNo, []);
    }

    // スクロール同期設定
    this.#setupScrollSync();
  }

  update(state) {
    if (!this.#theadRow) return;

    const { cursor, event } = state;
    const currentLine = event?.loc?.line ?? -1;

    // ── humanStep[0..cursor] をスキャン ────────────────────────────────────
    /** @type {Map<number, Map<string, any>>}  lineNo → 最新変数スナップショット */
    const lineStates  = new Map();
    const newVarNames = [];
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

      // 新しい変数を登場順に収集（関数・クラス値は除外）
      for (const [name, val] of vars) {
        if (!BUILTIN_NAMES.has(name) && !varSeen.has(name) && !isFunctionVal(val)) {
          varSeen.add(name);
          newVarNames.push(name);
        }
      }

      lineStates.set(line, vars);

      // cursor の直前ステップとの差分を計算
      if (si === cursor && prevVars !== null) {
        for (const name of newVarNames) {
          if (!valEqual(prevVars.get(name), vars.get(name))) {
            changedVars.add(name);
          }
        }
      }
      prevVars = vars;
    }

    // ── 列が変わった場合のみ再構築 ─────────────────────────────────────────
    const currentNames = this.#varMeta.map(m => m.name);
    if (!arraysEqual(newVarNames, currentNames)) {
      // 新しい変数を varMeta に追加（既存の visible フラグは維持）
      const existingMap = new Map(this.#varMeta.map(m => [m.name, m]));
      const newMeta = newVarNames.map(name =>
        existingMap.get(name) ?? { name, visible: true }
      );
      this.#rebuildColumns(newMeta);
    }

    // ── 各行のセルを更新 ───────────────────────────────────────────────────
    for (const [lineNo, rowEl] of this.#rowEls) {
      const isActive = lineNo === currentLine;
      rowEl.classList.toggle('lt-row--active', isActive);

      const vars  = lineStates.get(lineNo);
      const cells = this.#cellEls.get(lineNo);

      for (let i = 0; i < this.#varMeta.length; i++) {
        const cellEl = cells[i];
        if (!cellEl) continue;

        const name    = this.#varMeta[i].name;
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
    this.#teardownScrollSync();
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#builder    = null;
    this.#theadRow   = null;
    this.#tbodyEl    = null;
    this.#wrapEl     = null;
    this.#rowEls.clear();
    this.#cellEls.clear();
    this.#varMeta    = [];
    this.#humanSteps = [];
    this.#trace      = [];
  }

  // ── スクロール同期 ──────────────────────────────────────────────────────

  #setupScrollSync() {
    this.#codeDisplay = document.getElementById('code-display');
    if (!this.#codeDisplay || !this.#wrapEl) return;

    this.#codeScrollHandler = () => {
      if (this.#syncing) return;
      this.#syncing = true;
      this.#wrapEl.scrollTop = this.#codeDisplay.scrollTop;
      this.#syncing = false;
    };

    this.#ltScrollHandler = () => {
      if (this.#syncing) return;
      this.#syncing = true;
      this.#codeDisplay.scrollTop = this.#wrapEl.scrollTop;
      this.#syncing = false;
    };

    this.#codeDisplay.addEventListener('scroll', this.#codeScrollHandler);
    this.#wrapEl.addEventListener('scroll', this.#ltScrollHandler);
  }

  #teardownScrollSync() {
    if (this.#codeDisplay && this.#codeScrollHandler) {
      this.#codeDisplay.removeEventListener('scroll', this.#codeScrollHandler);
    }
    if (this.#wrapEl && this.#ltScrollHandler) {
      this.#wrapEl.removeEventListener('scroll', this.#ltScrollHandler);
    }
    this.#codeDisplay      = null;
    this.#codeScrollHandler = null;
    this.#ltScrollHandler   = null;
  }

  // ── 列操作（修正 7 で拡張予定） ───────────────────────────────────────────

  /**
   * ヘッダーと全行の変数セルを作り直す。
   * @param {Array<{name: string, visible: boolean}>} newMeta
   */
  #rebuildColumns(newMeta) {
    // 既存の変数ヘッダーを削除
    this.#theadRow.querySelectorAll('.lt-th-var').forEach(el => el.remove());

    // 全行の既存変数セルを削除
    for (const cells of this.#cellEls.values()) {
      cells.forEach(td => td.remove());
      cells.length = 0;
    }

    // 新しいヘッダーセルを追加
    for (const meta of newMeta) {
      const th = document.createElement('th');
      th.className   = `lt-th lt-th-var${meta.visible ? '' : ' lt-col-hidden'}`;
      th.textContent = meta.name;
      th.dataset.var = meta.name;
      this.#theadRow.appendChild(th);
    }

    // 新しいデータセルを全行に追加
    for (const [lineNo, rowEl] of this.#rowEls) {
      const cells = this.#cellEls.get(lineNo);
      for (let i = 0; i < newMeta.length; i++) {
        const td = document.createElement('td');
        td.className = `lt-td lt-td-var${newMeta[i].visible ? '' : ' lt-col-hidden'}`;
        rowEl.appendChild(td);
        cells.push(td);
      }
    }

    this.#varMeta = [...newMeta];
    this.#rebuildToolbar();
  }

  /**
   * ツールバーの変数トグルボタンを再構築する（修正 7 の準備）。
   */
  #rebuildToolbar() {
    const toolbar = this.#container?.querySelector('#lt-toolbar');
    if (!toolbar) return;
    toolbar.innerHTML = '';

    for (const meta of this.#varMeta) {
      const btn = document.createElement('button');
      btn.className = `lt-var-toggle${meta.visible ? '' : ' lt-var-toggle--hidden'}`;
      btn.textContent = meta.name;
      btn.dataset.var = meta.name;
      btn.title = `${meta.name} を${meta.visible ? '非表示' : '表示'}`;
      btn.addEventListener('click', () => this.#toggleVar(meta.name));
      toolbar.appendChild(btn);
    }
  }

  /**
   * 指定変数の表示/非表示を切り替える。
   * @param {string} name
   */
  #toggleVar(name) {
    const meta = this.#varMeta.find(m => m.name === name);
    if (!meta) return;
    meta.visible = !meta.visible;

    // ヘッダーとセルのクラスを更新
    const varIdx = this.#varMeta.indexOf(meta);

    // ヘッダー
    const th = this.#theadRow.querySelectorAll('.lt-th-var')[varIdx];
    th?.classList.toggle('lt-col-hidden', !meta.visible);

    // 全行のセル
    for (const cells of this.#cellEls.values()) {
      cells[varIdx]?.classList.toggle('lt-col-hidden', !meta.visible);
    }

    // ツールバーボタン
    this.#rebuildToolbar();
  }
}
