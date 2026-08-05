/**
 * line-trace/index.js — ソース行×変数トレース表
 *
 * 行   = ソースコードの各行（全行固定表示）
 * 列   = 行番号+スニペット | 変数（動的追加） | 条件式（init時に固定）
 * セル = その行を最後に実行した時点での変数値 / 条件評価結果
 *
 * 条件列は init() で全 humanStep を走査して一意な条件式テキストを収集し、
 * 変数列の右に固定列として配置する。
 * #rebuildColumns() は変数列を条件列の直前に insertBefore で挿入する。
 */

import { BaseView }                           from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES, formatValue, formatValueDiff, esc } from '../../utils/format.js';
import { t, getLang }                         from '../../i18n.js';

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

// ── 条件式ヘルパー ────────────────────────────────────────────────────────

const CONDITION_NODES = new Set([
  'IfStatement', 'WhileStatement', 'DoWhileStatement',
  'ForStatement', 'ForInStatement', 'ForOfStatement',
  'ConditionalExpression',
]);

/**
 * loc/end からソーステキストを切り出す。
 * loc.column / end.column は 1始まり・end は inclusive。
 */
function extractCondText(lines, loc, end) {
  if (!loc || !end) return null;
  const lineText = lines[loc.line - 1] ?? '';
  if (loc.line === end.line) {
    const text = lineText.slice(loc.column - 1, end.column).trim();
    return text || null;
  }
  return (lineText.slice(loc.column - 1).trim() + '…') || null;
}

/**
 * while/do-while/for の条件式 exit であるトレースインデックスの Set を返す。
 * TraceBuilder.buildHumanIndices と同じロジックで条件式 exit を特定する。
 */
function buildConditionExitSet(trace) {
  const set = new Set();
  for (let i = 0; i < trace.length; i++) {
    const ev = trace[i];
    if (ev.phase === 'enter' &&
        (ev.nodeType === 'WhileStatement' || ev.nodeType === 'DoWhileStatement')) {
      const D      = ev.depth;
      const endIdx = ev.matchIdx ?? trace.length;
      for (let j = i + 1; j < endIdx; j++) {
        const t = trace[j];
        if (t.phase === 'exit' && t.depth === D + 1 &&
            t.nodeType !== 'BlockStatement' && typeof t.value === 'boolean') {
          set.add(j);
        }
      }
    }
    if (ev.phase === 'enter' && ev.nodeType === 'ForStatement') {
      const D      = ev.depth;
      const endIdx = ev.matchIdx ?? trace.length;
      for (let j = i + 1; j < endIdx; j++) {
        const t = trace[j];
        if (t.phase === 'exit' && t.depth === D + 1 &&
            t.nodeType !== 'VariableDeclaration' &&
            t.nodeType !== 'BlockStatement' &&
            typeof t.value === 'boolean') {
          set.add(j);
        }
      }
    }
  }
  return set;
}

/**
 * si が条件評価の humanStep かどうかを判定し、{text, value} を返す。
 *
 * Case 1: while/for 条件式 exit（conditionExitSet に含まれる）
 *         → イベント自身の loc/end から条件テキストを抽出
 * Case 2: IfStatement / ConditionalExpression の enter
 *         → matchIdx 範囲内で最初のブール exit を探す
 */
function buildCondInfo(trace, si, lines, conditionExitSet) {
  const ev = trace[si];
  if (!ev) return null;

  // Case 1: while/for 条件式 exit
  if (conditionExitSet.has(si)) {
    const text = extractCondText(lines, ev.loc, ev.end);
    return text ? { text, value: ev.value } : null;
  }

  // Case 2: 条件文 enter（IfStatement / ConditionalExpression）
  if (ev.phase === 'enter' && CONDITION_NODES.has(ev.nodeType)) {
    const D        = ev.depth;
    const endBound = ev.matchIdx != null ? ev.matchIdx + 1 : trace.length;
    for (let i = si + 1; i < endBound; i++) {
      const t = trace[i];
      if (!t || t.depth < D) break;
      if (t.phase === 'exit' && t.depth === D + 1 && typeof t.value === 'boolean') {
        const text = extractCondText(lines, t.loc, t.end);
        if (text) return { text, value: t.value };
        return null;
      }
    }
  }

  return null;
}

// ── Variable ──────────────────────────────────────────────────────────────

export class Variable extends BaseView {
  #container   = null;
  #builder     = null;
  #theadRow    = null;
  #tbodyEl     = null;
  #humanSteps  = [];
  #trace       = [];
  #rowEls      = new Map();   // lineNo → <tr>
  #cellEls     = new Map();   // lineNo → TD[]（変数列）
  #varMeta     = [];          // {name, visible}[]

  // 条件列（init で固定、変数列の右に配置）
  #condMeta    = [];          // string[]（条件式テキスト、出現順）
  #hiCondMap   = new Map();   // hi → {text, value}
  #condCellEls = new Map();   // lineNo → TD[]（条件列）

  // ── BaseView ──────────────────────────────────────────────────────────────

  init(container, builder) {
    this.#container  = container;
    this.#builder    = builder;
    this.#humanSteps = builder ? builder.getHumanStepList() : [];
    this.#trace      = builder ? builder.trace : [];
    this.#varMeta    = [];
    this.#condMeta   = [];
    this.#hiCondMap  = new Map();
    this.#rowEls.clear();
    this.#cellEls.clear();
    this.#condCellEls.clear();

    const source = builder?.source ?? '';
    if (!source) {
      container.innerHTML = '<div class="lt-outer"><p class="placeholder">Source code unavailable</p></div>';
      return;
    }

    const lines = source.split('\n');

    container.innerHTML = `
      <div class="lt-outer">
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
      </div>`;

    this.#theadRow = container.querySelector('.lt-thead-row');
    this.#tbodyEl  = container.querySelector('.lt-tbody');

    // ソース行の <tr> を生成
    const tbodyFrag = document.createDocumentFragment();
    for (let i = 0; i < lines.length; i++) {
      const lineNo  = i + 1;
      const snippet = lines[i].trim().slice(0, 15);
      const tr      = document.createElement('tr');
      tr.className  = 'lt-row';
      const numTd   = document.createElement('td');
      numTd.className = 'lt-td lt-td-lineno';
      numTd.innerHTML = `<span class="lt-lineno-num">${lineNo}</span><span class="lt-lineno-snippet">${esc(snippet)}</span>`;
      tr.append(numTd);
      tbodyFrag.appendChild(tr);
      this.#rowEls.set(lineNo, tr);
      this.#cellEls.set(lineNo, []);
      this.#condCellEls.set(lineNo, []);
    }
    this.#tbodyEl.appendChild(tbodyFrag);

    // 条件列を init で事前計算（全 humanStep を走査）
    const conditionExitSet = buildConditionExitSet(this.#trace);
    const condSet  = new Set();
    const condMeta = [];
    const hiCondMap = new Map();
    for (let hi = 0; hi < this.#humanSteps.length; hi++) {
      const si   = this.#humanSteps[hi];
      const info = buildCondInfo(this.#trace, si, lines, conditionExitSet);
      if (info) {
        hiCondMap.set(hi, info);
        if (!condSet.has(info.text)) {
          condSet.add(info.text);
          condMeta.push(info.text);
        }
      }
    }
    this.#hiCondMap = hiCondMap;
    this.#condMeta  = condMeta;

    // 条件列の TH を thead に追加
    for (const condText of condMeta) {
      const th = document.createElement('th');
      th.className   = 'lt-th lt-th-cond';
      th.textContent = condText;
      this.#theadRow.appendChild(th);
    }

    // 条件列の TD を各行に追加
    for (const [lineNo, rowEl] of this.#rowEls) {
      const condCells = this.#condCellEls.get(lineNo);
      for (let ci = 0; ci < condMeta.length; ci++) {
        const td = document.createElement('td');
        td.className = 'lt-td lt-td-cond';
        rowEl.appendChild(td);
        condCells.push(td);
      }
    }
  }

  update(state) {
    if (!this.#theadRow) return;

    const { cursor, event } = state;
    const currentLine = event?.loc?.line ?? -1;

    // humanStep[0..cursor] をスキャン（変数・条件を同時収集）
    const lineStates     = new Map();
    const lineCondStates = new Map();  // lineNo → Map<condText, boolean>
    const newVarNames    = [];
    const varSeen        = new Set();
    let   prevVars          = null;
    let   prevVarsAtCursor  = null;
    const changedVars    = new Set();
    let   hi             = 0;

    for (const si of this.#humanSteps) {
      if (si > cursor) break;
      const ev = this.#trace[si];
      if (ev?.env && ev.loc) {
        const line = ev.loc.line;
        const vars = flattenEnv(ev.env);

        for (const [name, val] of vars) {
          if (!BUILTIN_NAMES.has(name) && !varSeen.has(name) && !isFunctionVal(val)) {
            varSeen.add(name);
            newVarNames.push(name);
          }
        }
        lineStates.set(line, vars);

        // 条件値を収集
        const condInfo = this.#hiCondMap.get(hi);
        if (condInfo) {
          if (!lineCondStates.has(line)) lineCondStates.set(line, new Map());
          lineCondStates.get(line).set(condInfo.text, condInfo.value);
        }

        if (si === cursor && prevVars !== null) {
          prevVarsAtCursor = prevVars;
          for (const name of newVarNames) {
            if (!valEqual(prevVars.get(name), vars.get(name))) changedVars.add(name);
          }
        }
        prevVars = vars;
      }
      hi++;
    }

    // 変数列の再構築
    const currentNames = this.#varMeta.map(m => m.name);
    if (!arraysEqual(newVarNames, currentNames)) {
      const existingMap = new Map(this.#varMeta.map(m => [m.name, m]));
      const newMeta = newVarNames.map(name =>
        existingMap.get(name) ?? { name, visible: true }
      );
      this.#rebuildColumns(newMeta);
    }

    // 各行のセルを更新
    for (const [lineNo, rowEl] of this.#rowEls) {
      const isActive = lineNo === currentLine;
      rowEl.classList.toggle('lt-row--active', isActive);

      // 変数セル
      const vars  = lineStates.get(lineNo);
      const cells = this.#cellEls.get(lineNo);
      for (let i = 0; i < this.#varMeta.length; i++) {
        const cellEl = cells[i];
        if (!cellEl) continue;
        const name    = this.#varMeta[i].name;
        const val     = vars?.get(name);
        const changed = isActive && changedVars.has(name);
        const prevVal = changed ? prevVarsAtCursor?.get(name) : undefined;
        cellEl.innerHTML = val !== undefined
          ? (changed ? formatValueDiff(val, prevVal) : formatValue(val))
          : '<span class="lt-empty">—</span>';
        cellEl.classList.remove('lt-flash');
        if (changed) { void cellEl.offsetWidth; cellEl.classList.add('lt-flash'); }
      }

      // 条件セル
      const condState  = lineCondStates.get(lineNo);
      const condCells  = this.#condCellEls.get(lineNo);
      for (let ci = 0; ci < this.#condMeta.length; ci++) {
        const condCellEl = condCells?.[ci];
        if (!condCellEl) continue;
        const val = condState?.get(this.#condMeta[ci]);
        condCellEl.innerHTML = val === undefined
          ? ''
          : `<span class="v-bool">${val}</span>`;
      }
    }
  }

  reset() {
    if (!this.#tbodyEl) return;
    for (const rowEl of this.#rowEls.values()) rowEl.classList.remove('lt-row--active');
  }

  destroy() {
    if (this.#container) this.#container.innerHTML = '';
    this.#container   = null;
    this.#builder     = null;
    this.#theadRow    = null;
    this.#tbodyEl     = null;
    this.#rowEls.clear();
    this.#cellEls.clear();
    this.#condCellEls.clear();
    this.#varMeta     = [];
    this.#condMeta    = [];
    this.#hiCondMap   = new Map();
    this.#humanSteps  = [];
    this.#trace       = [];
  }

  // ── 列操作 ────────────────────────────────────────────────────────────────

  /**
   * 変数列を再構築する。条件列（.lt-th-cond / .lt-td-cond）は変えない。
   * insertBefore で変数列を条件列の直前に配置する。
   */
  #rebuildColumns(newMeta) {
    this.#theadRow.querySelectorAll('.lt-th-var').forEach(el => el.remove());
    for (const cells of this.#cellEls.values()) {
      cells.forEach(td => td.remove());
      cells.length = 0;
    }

    // 条件 TH の先頭（挿入基準点）
    const condTh = this.#theadRow.querySelector('.lt-th-cond') ?? null;

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

      // 条件列の前に挿入（なければ末尾に append）
      this.#theadRow.insertBefore(th, condTh);
    }

    for (const [lineNo, rowEl] of this.#rowEls) {
      const cells       = this.#cellEls.get(lineNo);
      // 条件 TD の先頭（挿入基準点）
      const firstCondTd = this.#condCellEls.get(lineNo)?.[0] ?? null;

      for (let i = 0; i < newMeta.length; i++) {
        const td = document.createElement('td');
        td.className = `lt-td lt-td-var${newMeta[i].visible ? '' : ' lt-col-hidden'}`;
        rowEl.insertBefore(td, firstCondTd);
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
      btn.className   = `lt-var-toggle${meta.visible ? '' : ' lt-var-toggle--hidden'}`;
      btn.textContent = meta.name;
      btn.dataset.var = meta.name;
      const action = meta.visible ? t('action-hide') : t('action-show');
      btn.title       = getLang() === 'ja' ? `${meta.name} を${action}にする` : `${action} ${meta.name}`;
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
