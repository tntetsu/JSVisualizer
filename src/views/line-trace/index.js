/**
 * line-trace/index.js — ソース行×変数トレース表
 *
 * 行   = ソースコードの各行（全行固定表示）
 * 列   = 変数名（ステップが進み変数が宣言されるたびに列を追加）
 * セル = その行を最後に実行した時点での変数値
 *
 * 左側にソースコードパネルを内包し、右側に変数列テーブルを配置する。
 * 2 ペイン間はドラッグリサイザーで幅変更可能。
 * ソースと変数テーブルの縦スクロールを同期する。
 */

import { BaseView }                           from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES, formatValue, esc } from '../../utils/format.js';

const SRC_WIDTH_KEY = 'jsv-lt-src-w';
const SRC_W_DEFAULT = 220;
const SRC_W_MIN     = 80;
const SRC_W_MAX     = 600;

// ── シンタックスハイライト（code-view と同一ロジック） ─────────────────────

const TOKEN_PATTERNS = [
  { cls: 'tok-comment', re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g },
  { cls: 'tok-string',  re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g },
  { cls: 'tok-number',  re: /\b(\d+(?:\.\d+)?)\b/g },
  { cls: 'tok-keyword', re: /\b(function|return|if|else|while|for|let|const|var|new|class|extends|import|export|break|continue|null|undefined|true|false|this|of|in|typeof|instanceof|throw|try|catch|finally|async|await)\b/g },
];

function highlightSyntax(source) {
  const placeholders = [];
  let s = source;
  for (const { cls, re } of TOKEN_PATTERNS.slice(0, 2)) {
    s = s.replace(re, (m) => {
      const idx = placeholders.length;
      placeholders.push(`<span class="${cls}">${esc(m)}</span>`);
      return `\x00x${idx}\x00`;
    });
  }
  s = esc(s);
  for (const { cls, re } of TOKEN_PATTERNS.slice(2)) {
    s = s.replace(re, (_, g) => {
      const idx = placeholders.length;
      placeholders.push(`<span class="${cls}">${g}</span>`);
      return `\x00x${idx}\x00`;
    });
  }
  return s.replace(/\x00x(\d+)\x00/g, (_, idx) => placeholders[Number(idx)]);
}

// ── ヘルパー ──────────────────────────────────────────────────────────────

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function valEqual(a, b) {
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}

function isFunctionVal(v) {
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') {
    return v.__type__ === 'JSFunction' || v.__type__ === 'JSClass';
  }
  return false;
}

// ── LineTrace ─────────────────────────────────────────────────────────────

export class LineTrace extends BaseView {
  #container  = null;
  #builder    = null;
  #theadRow   = null;
  #tbodyEl    = null;
  #varArea    = null;   // 右ペイン（変数テーブル含む）
  #srcLines   = null;   // 左ペイン内のソース行コンテナ
  #srcPanel   = null;   // 左ペイン全体
  #humanSteps = [];
  #trace      = [];
  #rowEls     = new Map();
  #cellEls    = new Map();
  #srcRowEls  = new Map(); // lineNo → source 行 div
  #varMeta    = [];
  #syncing    = false;
  #currentActiveLine = 0;

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#builder    = builder;
    this.#humanSteps = builder ? builder.getHumanStepList() : [];
    this.#trace      = builder ? builder.trace : [];
    this.#varMeta    = [];
    this.#rowEls.clear();
    this.#cellEls.clear();
    this.#srcRowEls.clear();
    this.#currentActiveLine = 0;

    const source = builder?.source ?? '';
    if (!source) {
      container.innerHTML = '<div class="lt-outer"><p class="placeholder">ソースコードが利用できません</p></div>';
      return;
    }

    const lines      = source.split('\n');
    const highlighted = highlightSyntax(source).split('\n');
    const savedW     = parseInt(localStorage.getItem(SRC_WIDTH_KEY), 10);
    const srcW       = isNaN(savedW) ? SRC_W_DEFAULT : Math.min(SRC_W_MAX, Math.max(SRC_W_MIN, savedW));

    container.innerHTML = `
      <div class="lt-outer">
        <div class="lt-source-panel" style="width:${srcW}px">
          <div class="lt-source-scroll">
            <div class="lt-source-lines"></div>
          </div>
        </div>
        <div class="lt-src-divider" title="ドラッグして幅変更"></div>
        <div class="lt-var-area">
          <div class="lt-wrap">
            <div class="lt-toolbar" id="lt-toolbar"></div>
            <div class="lt-table-wrap">
              <table class="lt-table">
                <thead>
                  <tr class="lt-thead-row">
                    <th class="lt-th lt-th-lineno">#</th>
                  </tr>
                </thead>
                <tbody class="lt-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>`;

    this.#theadRow = container.querySelector('.lt-thead-row');
    this.#tbodyEl  = container.querySelector('.lt-tbody');
    this.#varArea  = container.querySelector('.lt-var-area');
    this.#srcPanel = container.querySelector('.lt-source-panel');
    this.#srcLines = container.querySelector('.lt-source-lines');

    // ソース行を生成
    const srcFrag = document.createDocumentFragment();
    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      const row = document.createElement('div');
      row.className = 'lt-src-row';
      row.dataset.line = String(lineNo);
      row.innerHTML = `<span class="lt-src-lineno">${lineNo}</span><span class="lt-src-code">${highlighted[i] ?? ''}</span>`;
      srcFrag.appendChild(row);
      this.#srcRowEls.set(lineNo, row);
    }
    this.#srcLines.appendChild(srcFrag);

    // 変数テーブルの行を生成
    const tbodyFrag = document.createDocumentFragment();
    for (let i = 0; i < lines.length; i++) {
      const lineNo = i + 1;
      const tr = document.createElement('tr');
      tr.className = 'lt-row';
      const numTd = document.createElement('td');
      numTd.className = 'lt-td lt-td-lineno';
      numTd.textContent = String(lineNo);
      tr.append(numTd);
      tbodyFrag.appendChild(tr);
      this.#rowEls.set(lineNo, tr);
      this.#cellEls.set(lineNo, []);
    }
    this.#tbodyEl.appendChild(tbodyFrag);

    // スクロール同期（ソースパネル ↔ 変数エリア）
    this.#setupScrollSync();

    // ソースパネルリサイザー
    this.#setupSrcResizer(container.querySelector('.lt-src-divider'));
  }

  update(state) {
    if (!this.#theadRow) return;

    const { cursor, event } = state;
    const currentLine = event?.loc?.line ?? -1;

    // humanStep[0..cursor] をスキャン
    const lineStates  = new Map();
    const newVarNames = [];
    const varSeen     = new Set();
    let   prevVars    = null;
    const changedVars = new Set();

    for (const si of this.#humanSteps) {
      if (si > cursor) break;
      const ev = this.#trace[si];
      if (!ev?.env || !ev.loc) continue;

      const line = ev.loc.line;
      const vars = flattenEnv(ev.env);

      for (const [name, val] of vars) {
        if (!BUILTIN_NAMES.has(name) && !varSeen.has(name) && !isFunctionVal(val)) {
          varSeen.add(name);
          newVarNames.push(name);
        }
      }
      lineStates.set(line, vars);

      if (si === cursor && prevVars !== null) {
        for (const name of newVarNames) {
          if (!valEqual(prevVars.get(name), vars.get(name))) changedVars.add(name);
        }
      }
      prevVars = vars;
    }

    // 列の再構築
    const currentNames = this.#varMeta.map(m => m.name);
    if (!arraysEqual(newVarNames, currentNames)) {
      const existingMap = new Map(this.#varMeta.map(m => [m.name, m]));
      const newMeta = newVarNames.map(name =>
        existingMap.get(name) ?? { name, visible: true }
      );
      this.#rebuildColumns(newMeta);
    }

    // ソース行のアクティブクラスを更新
    if (currentLine !== this.#currentActiveLine) {
      if (this.#currentActiveLine > 0) {
        this.#srcRowEls.get(this.#currentActiveLine)?.classList.remove('lt-src-row--active');
      }
      this.#currentActiveLine = currentLine;
      if (currentLine > 0) {
        const srcRow = this.#srcRowEls.get(currentLine);
        srcRow?.classList.add('lt-src-row--active');
        srcRow?.scrollIntoView({ block: 'nearest' });
      }
    }

    // 各行のセルを更新
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

        cellEl.classList.remove('lt-flash');
        if (changed) { void cellEl.offsetWidth; cellEl.classList.add('lt-flash'); }
      }
    }
  }

  reset() {
    if (!this.#tbodyEl) return;
    for (const rowEl of this.#rowEls.values()) rowEl.classList.remove('lt-row--active');
    if (this.#currentActiveLine > 0) {
      this.#srcRowEls.get(this.#currentActiveLine)?.classList.remove('lt-src-row--active');
      this.#currentActiveLine = 0;
    }
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container  = null;
    this.#builder    = null;
    this.#theadRow   = null;
    this.#tbodyEl    = null;
    this.#varArea    = null;
    this.#srcPanel   = null;
    this.#srcLines   = null;
    this.#rowEls.clear();
    this.#cellEls.clear();
    this.#srcRowEls.clear();
    this.#varMeta    = [];
    this.#humanSteps = [];
    this.#trace      = [];
  }

  // ── スクロール同期 ─────────────────────────────────────────────────────────

  #setupScrollSync() {
    const srcScroll = this.#srcPanel?.querySelector('.lt-source-scroll');
    const tableWrap = this.#varArea?.querySelector('.lt-table-wrap');
    if (!srcScroll || !tableWrap) return;

    srcScroll.addEventListener('scroll', () => {
      if (this.#syncing) return;
      this.#syncing = true;
      tableWrap.scrollTop = srcScroll.scrollTop;
      this.#syncing = false;
    });
    tableWrap.addEventListener('scroll', () => {
      if (this.#syncing) return;
      this.#syncing = true;
      srcScroll.scrollTop = tableWrap.scrollTop;
      this.#syncing = false;
    });
  }

  // ── ソースパネル幅リサイザー ───────────────────────────────────────────────

  #setupSrcResizer(divider) {
    if (!divider || !this.#srcPanel) return;
    let startX = 0, startW = 0;

    divider.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startX = e.clientX;
      startW = this.#srcPanel.offsetWidth;
      divider.classList.add('lt-src-divider--active');

      const onMove = (e) => {
        const newW = Math.min(SRC_W_MAX, Math.max(SRC_W_MIN, startW + e.clientX - startX));
        this.#srcPanel.style.width = `${newW}px`;
      };
      const onUp = () => {
        divider.classList.remove('lt-src-divider--active');
        localStorage.setItem(SRC_WIDTH_KEY, String(this.#srcPanel.offsetWidth));
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup',   onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup',   onUp);
    });
  }

  // ── 列操作 ────────────────────────────────────────────────────────────────

  #rebuildColumns(newMeta) {
    this.#theadRow.querySelectorAll('.lt-th-var').forEach(el => el.remove());
    for (const cells of this.#cellEls.values()) {
      cells.forEach(td => td.remove());
      cells.length = 0;
    }

    for (const meta of newMeta) {
      const th = document.createElement('th');
      th.className    = `lt-th lt-th-var${meta.visible ? '' : ' lt-col-hidden'}`;
      th.textContent  = meta.name;
      th.dataset.var  = meta.name;
      th.draggable    = true;
      th.title        = `${meta.name}（ドラッグで列移動）`;

      th.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', meta.name);
        e.dataTransfer.effectAllowed = 'move';
        th.classList.add('lt-col-dragging');
      });
      th.addEventListener('dragend', () => {
        th.classList.remove('lt-col-dragging');
        this.#theadRow.querySelectorAll('.lt-th-var').forEach(
          el => el.classList.remove('lt-col-dragover')
        );
      });
      th.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        th.classList.add('lt-col-dragover');
      });
      th.addEventListener('dragleave', () => th.classList.remove('lt-col-dragover'));
      th.addEventListener('drop', (e) => {
        e.preventDefault();
        th.classList.remove('lt-col-dragover');
        const srcName = e.dataTransfer.getData('text/plain');
        if (srcName === meta.name) return;
        const srcIdx = this.#varMeta.findIndex(m => m.name === srcName);
        const dstIdx = this.#varMeta.findIndex(m => m.name === meta.name);
        if (srcIdx < 0 || dstIdx < 0) return;
        const newOrder = [...this.#varMeta];
        const [moved]  = newOrder.splice(srcIdx, 1);
        newOrder.splice(dstIdx, 0, moved);
        this.#rebuildColumns(newOrder);
      });

      this.#theadRow.appendChild(th);
    }

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

  #rebuildToolbar() {
    const toolbar = this.#container?.querySelector('#lt-toolbar');
    if (!toolbar) return;
    toolbar.innerHTML = '';
    for (const meta of this.#varMeta) {
      const btn = document.createElement('button');
      btn.className = `lt-var-toggle${meta.visible ? '' : ' lt-var-toggle--hidden'}`;
      btn.textContent = meta.name;
      btn.dataset.var = meta.name;
      btn.title = `${meta.name} を${meta.visible ? '非表示' : '表示'}にする`;
      btn.addEventListener('click', () => this.#toggleVar(meta.name));
      toolbar.appendChild(btn);
    }
  }

  #toggleVar(name) {
    const meta = this.#varMeta.find(m => m.name === name);
    if (!meta) return;
    meta.visible = !meta.visible;
    const varIdx = this.#varMeta.indexOf(meta);
    const th = this.#theadRow.querySelectorAll('.lt-th-var')[varIdx];
    th?.classList.toggle('lt-col-hidden', !meta.visible);
    for (const cells of this.#cellEls.values()) {
      cells[varIdx]?.classList.toggle('lt-col-hidden', !meta.visible);
    }
    this.#rebuildToolbar();
  }
}
