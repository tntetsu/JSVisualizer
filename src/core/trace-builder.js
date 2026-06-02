/**
 * trace-builder.js — trace 配列の事前集計
 *
 * JSDebugger が記録した trace[] を一度だけ走査して、
 * 各ビューが必要とする集計データを生成する。
 */

import { flattenEnv, BUILTIN_NAMES } from '../utils/format.js';

/** 関数・クラス値か判定（列/変数に載せない対象） */
function isFunctionVal(v) {
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') {
    return v.__type__ === 'JSFunction' || v.__type__ === 'JSClass';
  }
  return false;
}

export class TraceBuilder {
  /** @type {Object[]} TraceEvent の配列 */
  #trace;

  /** @type {string} 元ソースコード */
  #source;

  /** @type {Set<number>|null} キャッシュ */
  #humanIndicesCache = null;

  /** @type {Map<number, number>|null} キャッシュ */
  #heatmapCache = null;

  /** @type {Object[]|null} キャッシュ */
  #recursionTreeCache = null;

  /** @type {Object[]|null} キャッシュ */
  #callTreeCache = null;

  /** @type {Object[]|null} キャッシュ */
  #lifetimeCache = null;

  /** @type {Object|null} キャッシュ */
  #controlFlowCache = null;

  /**
   * @param {Object[]} trace   JSDebugger.trace
   * @param {string}  [source] 元ソースコード
   */
  constructor(trace, source = '') {
    this.#trace  = trace;
    this.#source = source;
  }

  // ── Phase 1 ───────────────────────────────────────────────────────────────

  /**
   * humanStep で停止するインデックスの Set を返す。
   *
   * 停止条件（JSDebugger._getHumanIndices と同定義）:
   *   enter: ExpressionStatement / IfStatement / LoopStatement / BreakStatement / ContinueStatement
   *   exit:  VariableDeclaration / AssignmentExpression / UpdateExpression
   *          / ReturnStatement / ThrowStatement / CallExpression
   *
   * VariableDeclaration / ReturnStatement / ThrowStatement は exit を使う。
   * exit 時点で初めて値が env に確定するため（enter 時点では未確定）。
   *
   * @returns {Set<number>}
   */
  buildHumanIndices() {
    if (this.#humanIndicesCache) return this.#humanIndicesCache;

    const set = new Set();

    const HUMAN_ENTER_TYPES = new Set([
      'ExpressionStatement',
      'IfStatement',
      'WhileStatement',
      'ForStatement',
      'ForOfStatement',
      'ForInStatement',
      'BreakStatement',
      'ContinueStatement',
    ]);

    const HUMAN_EXIT_TYPES = new Set([
      'VariableDeclaration',
      'AssignmentExpression',
      'UpdateExpression',
      'ReturnStatement',
      'ThrowStatement',
      'CallExpression',
    ]);

    for (let i = 0; i < this.#trace.length; i++) {
      const ev = this.#trace[i];
      if (ev.phase === 'enter' && HUMAN_ENTER_TYPES.has(ev.nodeType)) {
        set.add(i);
      } else if (ev.phase === 'exit' && HUMAN_EXIT_TYPES.has(ev.nodeType)) {
        set.add(i);
      }
    }

    if (this.#trace.length > 0) set.add(0);

    this.#humanIndicesCache = set;
    return set;
  }

  // ── Phase 3 ───────────────────────────────────────────────────────────────

  /**
   * 行ごとの実行回数を返す。
   * @returns {Map<number, number>}  Map<行番号(1始まり), 実行回数>
   */
  buildHeatmap() {
    if (this.#heatmapCache) return this.#heatmapCache;

    const map = new Map();
    for (const ev of this.#trace) {
      if (ev.phase === 'enter' && ev.loc) {
        const line = ev.loc.line;
        map.set(line, (map.get(line) ?? 0) + 1);
      }
    }

    this.#heatmapCache = map;
    return map;
  }

  // ── Phase 4 ───────────────────────────────────────────────────────────────

  /**
   * 再帰呼び出しツリーのルートノード配列を返す。
   *
   * ノード構造:
   *   { id, funcName, args, returnVal,
   *     callStepIdx, returnStepIdx, treeDepth, children[] }
   *
   * callDepth の増減を監視して関数の進入／復帰を検出する。
   *
   * @returns {Object[]} ルートノードの配列
   */
  buildRecursionTree() {
    if (this.#recursionTreeCache !== null) return this.#recursionTreeCache;

    const roots     = [];
    const nodeStack = []; // 現在開いているノードのスタック
    let   nodeId    = 0;
    let   prevDepth = this.#trace[0]?.callDepth ?? 0;

    for (let i = 1; i < this.#trace.length; i++) {
      const ev    = this.#trace[i];
      const depth = ev.callDepth ?? 0;

      if (depth > prevDepth) {
        // 関数進入: callStack[last] が最内側（新しい）フレーム
        // callStack[0]=最外側, callStack[length-1]=最内側 (push 順)
        const cs    = ev.callStack;
        const frame = cs?.[cs.length - 1];
        const parent = nodeStack.length > 0 ? nodeStack[nodeStack.length - 1] : null;

        const node = {
          id:             nodeId++,
          funcName:       frame?.name ?? '(anonymous)',
          args:           Array.isArray(frame?.args) ? frame.args.slice() : [],
          returnVal:      undefined,
          callStepIdx:    i,
          returnStepIdx:  null,
          treeDepth:      nodeStack.length,
          children:       [],
        };

        if (parent) {
          parent.children.push(node);
        } else {
          roots.push(node);
        }
        nodeStack.push(node);

      } else if (depth < prevDepth) {
        // 関数復帰（複数レベルを一度に抜ける場合も考慮）
        const levelsReturned = prevDepth - depth;
        for (let j = 0; j < levelsReturned && nodeStack.length > 0; j++) {
          const node = nodeStack.pop();
          node.returnStepIdx = i;
          // 最初の復帰レベルだけ return value を取得
          if (j === 0 && ev.value !== undefined) {
            node.returnVal = ev.value;
          }
        }
      }

      prevDepth = depth;
    }

    // 未クローズのノードを閉じる（例: 実行途中で停止）
    const lastIdx = this.#trace.length - 1;
    while (nodeStack.length > 0) {
      const node = nodeStack.pop();
      if (node.returnStepIdx === null) node.returnStepIdx = lastIdx;
    }

    this.#recursionTreeCache = roots;
    return roots;
  }

  /**
   * 関数呼び出しツリーのルートノード配列を返す。
   *
   * buildRecursionTree() と同じデータ構造を返す。
   * 再帰に限らず全関数呼び出しを含む（buildRecursionTree も同様だが
   * こちらは独立したキャッシュを持ち、CallTree ビューが利用する）。
   *
   * @returns {Object[]} ルートノードの配列
   */
  buildCallTree() {
    if (this.#callTreeCache !== null) return this.#callTreeCache;
    this.#callTreeCache = this.buildRecursionTree();
    return this.#callTreeCache;
  }

  /**
   * 変数ライフタイム情報を返す。
   *
   * 各エントリ: { varName, callDepth, startHi, endHi }
   *   startHi / endHi は getHumanStepList() 配列のインデックス（0始まり）。
   *
   * 同名変数が異なる callDepth で現れる場合は別エントリとして記録する。
   *
   * @returns {Array<{varName:string, callDepth:number, startHi:number, endHi:number}>}
   */
  buildLifetime() {
    if (this.#lifetimeCache !== null) return this.#lifetimeCache;

    const humanSteps = this.getHumanStepList();

    // key = `${callDepth}:${varName}` → { varName, callDepth, startHi, endHi }
    const varMap = new Map();

    for (let hi = 0; hi < humanSteps.length; hi++) {
      const si = humanSteps[hi];
      const ev = this.#trace[si];
      if (!ev?.env) continue;

      const callDepth = ev.callDepth ?? 0;
      const vars      = flattenEnv(ev.env);

      for (const [name, val] of vars) {
        if (BUILTIN_NAMES.has(name)) continue;
        if (isFunctionVal(val))      continue;

        const key = `${callDepth}:${name}`;
        if (!varMap.has(key)) {
          varMap.set(key, { varName: name, callDepth, startHi: hi, endHi: hi });
        } else {
          varMap.get(key).endHi = hi;
        }
      }
    }

    this.#lifetimeCache = [...varMap.values()]
      .sort((a, b) => a.startHi - b.startHi || a.varName.localeCompare(b.varName));
    return this.#lifetimeCache;
  }

  /**
   * 制御フローグラフデータを返す。
   *
   * 返り値:
   *   nodes: CFGNode[]  { lineNo, text, count, firstSeen }
   *   edges: CFGEdge[]  { from, to, count }
   *   humanSteps: number[]
   *
   * humanStep を順に辿り、行番号の遷移からグラフを構築する。
   *
   * @returns {{ nodes: Object[], edges: Object[], humanSteps: number[] }}
   */
  buildControlFlow() {
    if (this.#controlFlowCache !== null) return this.#controlFlowCache;

    const humanSteps  = this.getHumanStepList();
    const sourceLines = this.#source.split('\n');

    // Map<lineNo, { lineNo, text, count, firstSeen }>
    const nodeMap = new Map();
    // Map<`${from}->${to}`, { from, to, count }>
    const edgeMap = new Map();

    let firstSeenCounter = 0;
    let prevLine = -1;

    for (const si of humanSteps) {
      const ev = this.#trace[si];
      if (!ev?.loc) continue;

      const lineNo = ev.loc.line;
      const text   = (sourceLines[lineNo - 1] ?? '').trimStart();

      if (!nodeMap.has(lineNo)) {
        nodeMap.set(lineNo, { lineNo, text, count: 0, firstSeen: firstSeenCounter++ });
      }
      nodeMap.get(lineNo).count++;

      if (prevLine !== -1 && prevLine !== lineNo) {
        const key = `${prevLine}->${lineNo}`;
        if (!edgeMap.has(key)) {
          edgeMap.set(key, { from: prevLine, to: lineNo, count: 0 });
        }
        edgeMap.get(key).count++;
      }

      prevLine = lineNo;
    }

    this.#controlFlowCache = {
      nodes: [...nodeMap.values()].sort((a, b) => a.firstSeen - b.firstSeen),
      edges: [...edgeMap.values()],
      humanSteps,
    };
    return this.#controlFlowCache;
  }

  // ── ユーティリティ ────────────────────────────────────────────────────────

  /**
   * humanStep インデックスの配列をソート済みで返す。
   * @returns {number[]}
   */
  getHumanStepList() {
    return [...this.buildHumanIndices()].sort((a, b) => a - b);
  }

  /** trace 全体の長さ */
  get length() {
    return this.#trace.length;
  }

  /** 生の trace 配列（ビュー側での参照用） */
  get trace() {
    return this.#trace;
  }

  /** 元ソースコード */
  get source() {
    return this.#source;
  }
}
