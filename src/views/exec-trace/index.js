/**
 * exec-trace/index.js — 実行順トレース表
 *
 * 行   = humanStep ごとの実行ステップ（実行順）
 * 列   = # | 行 | コード | 変数値（出現順）| 条件式（出現順）
 *
 * LineTrace と同じ列構成を実行順で表示する。
 * init() で全行・全列を一括生成し、update() は現在行の
 * ハイライト移動と scrollIntoView のみ（O(n)）。
 *
 * 変数列: 各 humanStep 時点の変数値（flattenEnv で Map を取得）
 * 条件列: 条件文 enter の humanStep でのみ値を表示、それ以外は空
 */

import { BaseView } from '../base-view.js';
import { flattenEnv, BUILTIN_NAMES, formatValue, esc } from '../../utils/format.js';

// ── 条件式ヘルパー（LineTrace と共通ロジック） ──────────────────────────────

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

function extractCondText(lines, loc, end) {
  if (!loc || !end) return null;
  const lineText = lines[loc.line - 1] ?? '';
  if (loc.line === end.line) {
    const text = lineText.slice(loc.column - 1, end.column).trim();
    return text || null;
  }
  return (lineText.slice(loc.column - 1).trim() + '…') || null;
}

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

// ── ExecTrace ─────────────────────────────────────────────────────────────

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

    // ── 変数名を出現順に収集 ──────────────────────────────────────────────
    const varNames = [];
    const varSet   = new Set();
    for (const si of humanSteps) {
      const ev = trace[si];
      if (!ev) continue;
      for (const [k, v] of flattenEnv(ev.env)) {   // flattenEnv は Map を返す
        if (!varSet.has(k) && !BUILTIN_NAMES.has(k) && !isFunctionVal(v)) {
          varSet.add(k);
          varNames.push(k);
        }
      }
    }

    // ── 条件式を出現順に収集 ──────────────────────────────────────────────
    const condSet   = new Set();
    const condNames = [];
    const hiCondMap = new Map();  // hi → {text, value}

    const conditionExitSet = buildConditionExitSet(trace);
    for (let hi = 0; hi < humanSteps.length; hi++) {
      const si   = humanSteps[hi];
      const info = buildCondInfo(trace, si, lines, conditionExitSet);
      if (info) {
        hiCondMap.set(hi, info);
        if (!condSet.has(info.text)) {
          condSet.add(info.text);
          condNames.push(info.text);
        }
      }
    }

    // ── テーブル HTML 構築 ────────────────────────────────────────────────
    let html = '<div class="et-wrap"><table class="et-table"><thead>';
    html += '<tr class="et-thead-row">';
    html += '<th class="et-th et-col-num">#</th>';
    html += '<th class="et-th et-col-line">行</th>';
    html += '<th class="et-th et-col-code">コード</th>';
    for (const name of varNames) {
      html += `<th class="et-th et-col-var">${esc(name)}</th>`;
    }
    for (const cond of condNames) {
      html += `<th class="et-th et-col-cond">${esc(cond)}</th>`;
    }
    html += '</tr></thead><tbody class="et-tbody">';

    for (let hi = 0; hi < humanSteps.length; hi++) {
      const si    = humanSteps[hi];
      const ev    = trace[si];
      if (!ev) continue;

      const lineNo  = ev.loc?.line ?? 0;
      const rawLine = lineNo > 0 ? (lines[lineNo - 1] ?? '') : '';
      const snippet = rawLine.trim().slice(0, 30);
      const envMap  = flattenEnv(ev.env);           // Map<string, any>
      const condInfo = hiCondMap.get(hi);

      html += `<tr class="et-row" data-hi="${hi}">`;
      html += `<td class="et-td et-col-num">${hi + 1}</td>`;
      html += `<td class="et-td et-col-line">${lineNo}</td>`;
      html += `<td class="et-td et-col-code">${esc(snippet)}</td>`;

      // 変数列
      for (const name of varNames) {
        const v   = envMap.get(name);                // Map.get() で取得
        const fmt = v === undefined ? '' : formatValue(v);
        html += `<td class="et-td et-col-var">${v === undefined ? '<span class="lt-empty">—</span>' : fmt}</td>`;
      }

      // 条件列（この step が該当条件を評価したときだけ値を表示）
      for (const cond of condNames) {
        if (condInfo && condInfo.text === cond) {
          html += `<td class="et-td et-col-cond"><span class="v-bool">${condInfo.value}</span></td>`;
        } else {
          html += '<td class="et-td et-col-cond"></td>';
        }
      }

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
