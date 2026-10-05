/**
 * line-exec.js — humanStep を「行の実行 1 回」の単位にまとめる（Heatmap・ExecTrace で共有）
 */

/** 条件式・更新式の評価をイテレーションごとに数えるループ文（中の文と合算しない） */
const LOOP_TYPES = new Set(['WhileStatement', 'DoWhileStatement', 'ForStatement']);

/**
 * 各 humanStep を「行の実行 1 回」に対応づける。
 *
 * `sum += count;` は ExpressionStatement enter と AssignmentExpression exit の
 * 2 つの humanStep を持つため、humanStep 数をそのまま数えると実行回数が 2 倍になる。
 * humanStep を囲む文のうち、同じ行・同じ callDepth にあるループ以外の最も外側の文を
 * 「行の実行」の単位とし、同じ文の実行に属する humanStep は最初の 1 つに寄せる。
 * ループ文の条件式・更新式はイテレーションごとに 1 回と数える。
 * Program enter（先頭の humanStep）はどの行の実行にも数えない。
 *
 * @param {Object[]} trace       TraceEvent[]
 * @param {number[]} humanSteps  ソート済み humanStep の trace インデックス
 * @returns {number[]}  hi → 代表 hi（自身が行の実行なら hi 自身、数えない場合は -1）
 */
export function buildLineExecOwners(trace, humanSteps) {
  const owners    = new Array(humanSteps.length);
  const ownerOf   = new Map();  // 文 enter の trace インデックス → 代表 hi
  const open      = [];         // 未終了の enter イベントの trace インデックス
  let   hi        = 0;

  for (let i = 0; i < trace.length && hi < humanSteps.length; i++) {
    const ev = trace[i];
    while (open.length > 0 && (trace[open[open.length - 1]].matchIdx ?? Infinity) < i) open.pop();
    if (ev.phase === 'enter' && ev.matchIdx != null) open.push(i);
    if (i !== humanSteps[hi]) continue;

    if (ev.nodeType === 'Program') { owners[hi++] = -1; continue; }

    const line      = ev.loc?.line ?? 0;
    const callDepth = ev.callDepth ?? 0;
    let   stmtIdx   = null;
    for (let k = open.length - 1; k >= 0; k--) {
      const o = trace[open[k]];
      if ((o.loc?.line ?? 0) !== line || (o.callDepth ?? 0) !== callDepth) break;
      if (o.nodeType === 'Program' || LOOP_TYPES.has(o.nodeType)) break;
      if (/(Statement|Declaration)$/.test(o.nodeType)) stmtIdx = open[k];
    }

    if (stmtIdx === null) {
      owners[hi] = hi;
    } else {
      if (!ownerOf.has(stmtIdx)) ownerOf.set(stmtIdx, hi);
      owners[hi] = ownerOf.get(stmtIdx);
    }
    hi++;
  }
  for (; hi < humanSteps.length; hi++) owners[hi] = hi;
  return owners;
}

/**
 * ExecTrace の表の行を作る。同じ文の実行に属する連続した humanStep（`console.log(x);` の
 * ExpressionStatement enter と CallExpression exit など）を 1 行にまとめる。
 * 途中で関数呼び出しの中に入った場合は連続しないため、呼び出し前と戻った後の 2 行に分かれる。
 * Program enter はどの行にも含めない。
 *
 * @param {Object[]} trace       TraceEvent[]
 * @param {number[]} humanSteps  ソート済み humanStep の trace インデックス
 * @returns {{ rows: number[][], hiToRow: number[] }}
 *   rows: 行 → その行にまとめた hi の配列（昇順）
 *   hiToRow: hi → 行番号（どの行にも含めない場合は -1）
 */
export function buildExecRows(trace, humanSteps) {
  const owners  = buildLineExecOwners(trace, humanSteps);
  const rows    = [];
  const hiToRow = new Array(humanSteps.length).fill(-1);

  for (let hi = 0; hi < humanSteps.length; hi++) {
    if (owners[hi] === -1) continue;
    const prev = hi > 0 ? owners[hi - 1] : -1;
    if (rows.length === 0 || owners[hi] !== prev) rows.push([]);
    rows[rows.length - 1].push(hi);
    hiToRow[hi] = rows.length - 1;
  }
  return { rows, hiToRow };
}
