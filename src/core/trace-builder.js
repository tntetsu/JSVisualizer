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

  /** @type {Object[]|null} キャッシュ（全関数呼び出し） */
  #fullCallTreeCache = null;

  /** @type {Object[]|null} キャッシュ（再帰呼び出しのみ） */
  #recursionTreeCache = null;

  /** @type {Object[]|null} キャッシュ（全関数呼び出しツリー公開用） */
  #callTreeCache = null;

  /** @type {Object[]|null} キャッシュ */
  #lifetimeCache = null;

  /** @type {Object|null} キャッシュ（旧 buildControlFlow 用） */
  #controlFlowCache = null;

  /** @type {Object|null} AST（buildCFG 用） */
  #ast = null;

  /** @type {Object[]|null} キャッシュ（buildCFG 用） */
  #cfgCache = null;

  /**
   * @param {Object[]} trace   JSDebugger.trace
   * @param {string}  [source] 元ソースコード
   * @param {Object}  [ast]    JSDebugger.ast（制御フロービュー用）
   */
  constructor(trace, source = '', ast = null) {
    this.#trace  = trace;
    this.#source = source;
    this.#ast    = ast;
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

    // WhileStatement / ForStatement は条件式評価ごとに個別追加するため除外
    const HUMAN_ENTER_TYPES = new Set([
      'ExpressionStatement',
      'IfStatement',
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

      // WhileStatement / DoWhileStatement: 条件式 exit を全イテレーション分追加
      if (ev.phase === 'enter' &&
          (ev.nodeType === 'WhileStatement' || ev.nodeType === 'DoWhileStatement')) {
        const loopDepth = ev.depth;
        const endIdx    = ev.matchIdx ?? this.#trace.length;
        for (let j = i + 1; j < endIdx; j++) {
          const inner = this.#trace[j];
          if (inner.phase === 'exit' &&
              inner.depth === loopDepth + 1 &&
              inner.nodeType !== 'BlockStatement') {
            set.add(j);
          }
        }
      }

      // ForStatement: テスト式 exit と更新式 exit を全イテレーション分追加
      // init（VariableDeclaration）は HUMAN_EXIT_TYPES で既にカバー
      if (ev.phase === 'enter' && ev.nodeType === 'ForStatement') {
        const forDepth = ev.depth;
        const endIdx   = ev.matchIdx ?? this.#trace.length;
        for (let j = i + 1; j < endIdx; j++) {
          const inner = this.#trace[j];
          if (inner.phase === 'exit' &&
              inner.depth === forDepth + 1 &&
              inner.nodeType !== 'VariableDeclaration' &&
              inner.nodeType !== 'BlockStatement') {
            set.add(j);
          }
        }
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
   * 全関数呼び出しツリーを構築する（内部メソッド）。
   *
   * ノード構造:
   *   { id, funcName, args, returnVal,
   *     callStepIdx, returnStepIdx, treeDepth, children[] }
   *
   * callDepth の増減を監視して関数の進入／復帰を検出する。
   *
   * @returns {Object[]} ルートノードの配列
   */
  #buildFullCallTree() {
    if (this.#fullCallTreeCache !== null) return this.#fullCallTreeCache;

    const roots     = [];
    const nodeStack = [];
    let   nodeId    = 0;
    let   prevDepth = this.#trace[0]?.callDepth ?? 0;

    for (let i = 1; i < this.#trace.length; i++) {
      const ev    = this.#trace[i];
      const depth = ev.callDepth ?? 0;

      if (depth > prevDepth) {
        // 関数進入: callStack[last] が最内側（新しい）フレーム
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

    this.#fullCallTreeCache = roots;
    return roots;
  }

  /**
   * 再帰呼び出しのみを含むツリーを返す。
   *
   * 全呼び出しツリーから「子の funcName === 親の funcName」となる
   * 再帰的な呼び出しのみを再帰的にフィルタリングする。
   * 再帰ノードが存在する場合は cost プロパティも付与する（葉=1、親=1+子の合計）。
   *
   * @returns {Object[]} ルートノードの配列（再帰呼び出しがない場合は空配列）
   */
  buildRecursionTree() {
    if (this.#recursionTreeCache !== null) return this.#recursionTreeCache;

    const fullRoots = this.#buildFullCallTree();

    // 再帰的フィルタリング: 同名関数の子のみ保持
    function filterRecursive(node) {
      const recursiveChildren = node.children
        .filter(c => c.funcName === node.funcName)
        .map(c => filterRecursive(c));
      return { ...node, children: recursiveChildren };
    }

    // コスト計算: subtree サイズ（葉=1、内部ノード=1+子の合計）
    function computeCost(node) {
      node.cost = 1 + node.children.reduce((s, c) => s + computeCost(c), 0);
      return node.cost;
    }

    // 再帰的な子を持つルートのみ保持
    const filtered = fullRoots
      .map(r => filterRecursive(r))
      .filter(r => r.children.length > 0);

    filtered.forEach(r => computeCost(r));

    this.#recursionTreeCache = filtered;
    return filtered;
  }

  /**
   * 全関数呼び出しツリーのルートノード配列を返す。
   *
   * 再帰に限らず全関数呼び出しを含む。CallTree ビューが利用する。
   *
   * @returns {Object[]} ルートノードの配列
   */
  buildCallTree() {
    if (this.#callTreeCache !== null) return this.#callTreeCache;
    this.#callTreeCache = this.#buildFullCallTree();
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

  /**
   * AST から構造的 CFG スコープ配列を生成する（制御フロービュー用）。
   * 返り値: Array<{ name:string, params:string[], items:CfgItem[] }>
   * CfgItem の type: 'stmt'|'return'|'jump'|'if'|'while'|'for'|'do-while'|'seq'
   * @returns {Object[]}
   */
  buildCFG() {
    if (this.#cfgCache !== null) return this.#cfgCache;
    if (!this.#ast) { this.#cfgCache = []; return []; }
    const b = new CfgBuilder(this.#trace, this.#source);
    this.#cfgCache = b.build(this.#ast);
    return this.#cfgCache;
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

// ── CfgBuilder ────────────────────────────────────────────────────────────

class CfgBuilder {
  #lines;      // string[]  ソース行（1-indexed: lines[0] = 行1）
  #execOf;     // Map<lineNo, count>
  #seq = 0;

  constructor(trace, source) {
    this.#lines  = source.split('\n');
    this.#execOf = new Map();
    // 前回カウントした行と異なる行への enter 時だけカウントする。
    // 同一行に複数の AST ノード enter が来ても 1 実行として扱う。
    let prevLine = -1;
    for (const ev of trace) {
      if (ev.phase === 'enter' && ev.loc?.line) {
        const l = ev.loc.line;
        if (l !== prevLine) {
          this.#execOf.set(l, (this.#execOf.get(l) ?? 0) + 1);
          prevLine = l;
        }
      }
    }
  }

  build(ast) {
    const scopes = [];
    // グローバルスコープ
    scopes.push({ name: 'global', params: [], items: this.#region(ast.body ?? []) });
    // 各関数定義をスコープとして追加
    this.#collectFuncs(ast.body ?? [], scopes);
    return scopes;
  }

  // ── ID 生成 ───────────────────────────────────────────────────────────────

  #id() { return `cf${this.#seq++}`; }

  // ── ソース取得 ────────────────────────────────────────────────────────────

  #text(lineNo) {
    if (lineNo < 1 || lineNo > this.#lines.length) return '';
    return this.#lines[lineNo - 1].trim();
  }

  #exec(lineNo) { return this.#execOf.get(lineNo) ?? 0; }

  // ── 文列を CfgItem 配列に変換 ─────────────────────────────────────────────

  #region(stmts) {
    const items = [];
    for (const s of stmts ?? []) {
      const item = this.#stmt(s);
      if (item !== null) items.push(item);
    }
    return items;
  }

  #body(node) {
    if (!node) return [];
    if (node.type === 'BlockStatement') return this.#region(node.body ?? []);
    const item = this.#stmt(node);
    return item ? [item] : [];
  }

  #stmt(node) {
    if (!node) return null;
    const line = node.loc?.line ?? 0;

    switch (node.type) {
      case 'IfStatement':
        return {
          type: 'if', id: this.#id(),
          condLine:  line,
          condLabel: this.#text(line),
          execCount: this.#exec(line),
          then_: this.#body(node.consequent),
          else_: node.alternate ? this.#body(node.alternate) : null,
        };

      case 'WhileStatement':
        return {
          type: 'while', id: this.#id(),
          condLine:  line,
          condLabel: this.#text(line),
          execCount: this.#exec(line),
          body: this.#body(node.body),
        };

      case 'DoWhileStatement':
        return {
          type: 'do-while', id: this.#id(),
          condLine:  node.test?.loc?.line ?? line,
          condLabel: this.#text(line),
          execCount: this.#exec(line),
          body: this.#body(node.body),
        };

      case 'ForStatement':
      case 'ForOfStatement':
      case 'ForInStatement':
        return {
          type: 'for', id: this.#id(),
          condLine:  line,
          condLabel: this.#text(line),
          execCount: this.#exec(line),
          body: this.#body(node.body),
        };

      case 'ReturnStatement':
        return {
          type: 'return', id: this.#id(),
          lineStart: line, lineEnd: line,
          label: this.#text(line),
          execCount: this.#exec(line),
        };

      case 'BreakStatement':
      case 'ContinueStatement':
        return {
          type: 'jump', id: this.#id(),
          lineStart: line, lineEnd: line,
          label: this.#text(line),
          execCount: this.#exec(line),
        };

      case 'FunctionDeclaration':
      case 'ClassDeclaration':
      case 'EmptyStatement':
        return null;

      case 'BlockStatement': {
        const items = this.#region(node.body ?? []);
        if (items.length === 0) return null;
        if (items.length === 1) return items[0];
        return { type: 'seq', id: this.#id(), children: items };
      }

      default: {
        const label = this.#text(line);
        if (!label) return null;
        return {
          type: 'stmt', id: this.#id(),
          lineStart: line, lineEnd: line,
          label,
          execCount: this.#exec(line),
        };
      }
    }
  }

  // ── 関数定義を再帰的に収集 ────────────────────────────────────────────────

  #collectFuncs(stmts, scopes) {
    for (const s of stmts ?? []) this.#extractFunc(s, scopes);
  }

  #extractFunc(node, scopes) {
    if (!node) return;
    switch (node.type) {
      case 'FunctionDeclaration': {
        const name   = node.id?.name ?? '(anonymous)';
        const params = (node.params ?? []).map(p => this.#pname(p));
        scopes.push({ name, params, items: this.#region(node.body?.body ?? []) });
        this.#collectFuncs(node.body?.body ?? [], scopes);
        break;
      }
      case 'VariableDeclaration':
        for (const d of node.declarations ?? []) this.#extractFunc(d.init, scopes);
        break;
      case 'ExpressionStatement':
        this.#extractFunc(node.expression, scopes);
        break;
      case 'AssignmentExpression':
        this.#extractFunc(node.right, scopes);
        break;
      case 'FunctionExpression':
      case 'ArrowFunctionExpression': {
        const name   = node.id?.name ?? '(anonymous)';
        const params = (node.params ?? []).map(p => this.#pname(p));
        const stmts  = node.body?.type === 'BlockStatement'
          ? node.body.body ?? []
          : [{ type: 'ReturnStatement', argument: node.body, loc: node.body?.loc }];
        scopes.push({ name, params, items: this.#region(stmts) });
        this.#collectFuncs(stmts, scopes);
        break;
      }
      case 'IfStatement':
        this.#extractFunc(node.consequent, scopes);
        this.#extractFunc(node.alternate, scopes);
        break;
      case 'WhileStatement':
      case 'DoWhileStatement':
      case 'ForStatement':
      case 'ForOfStatement':
      case 'ForInStatement':
        this.#extractFunc(node.body, scopes);
        break;
      case 'BlockStatement':
        this.#collectFuncs(node.body ?? [], scopes);
        break;
    }
  }

  #pname(p) {
    if (!p) return '?';
    if (p.type === 'Identifier')        return p.name;
    if (p.type === 'AssignmentPattern') return this.#pname(p.left) + '=…';
    if (p.type === 'RestElement')       return '…' + this.#pname(p.argument);
    return '?';
  }
}
