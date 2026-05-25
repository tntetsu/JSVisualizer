/**
 * trace-builder.js — trace 配列の事前集計
 *
 * JSDebugger が記録した trace[] を一度だけ走査して、
 * 各ビューが必要とする集計データを生成する。
 *
 * Phase 1 では buildHumanIndices() のみ実装する。
 * 残りのメソッドは Phase 3〜5 で順次実装する。
 */

export class TraceBuilder {
  /** @type {Object[]} TraceEvent の配列 */
  #trace;

  /** @type {Set<number>|null} キャッシュ */
  #humanIndicesCache = null;

  /** @type {Map<number, number>|null} キャッシュ */
  #heatmapCache = null;

  /**
   * @param {Object[]} trace  JSDebugger.trace
   */
  constructor(trace) {
    this.#trace = trace;
  }

  // ── Phase 1 ───────────────────────────────────────────────────────────────

  /**
   * humanStep で停止するインデックスの Set を返す。
   *
   * JSDebugger は内部で同様の計算を行うが、外部から Set として
   * 参照できないため、同じロジックをここで再実装する。
   *
   * 停止条件（JSDebugger._getHumanIndices と同定義）:
   *   - ExpressionStatement の enter
   *   - VariableDeclaration の enter
   *   - AssignmentExpression の exit（= 代入が確定した瞬間）
   *   - UpdateExpression の exit（i++ など）
   *   - IfStatement の enter（条件評価前）
   *   - 各ループの test ノードに対応する exit（条件が決まった瞬間）
   *   - CallExpression の enter（関数を呼ぼうとしている）
   *   - CallExpression の exit（関数から戻った）
   *   - ReturnStatement の enter
   *
   * @returns {Set<number>}
   */
  buildHumanIndices() {
    if (this.#humanIndicesCache) return this.#humanIndicesCache;

    const set = new Set();

    // JSDebugger と同様のロジックで humanStep インデックスを構築する。
    // 簡易版: JSDebugger インスタンスが humanStep を実行した結果の cursor を
    // 0 から末尾まで収集する。
    // ※ TraceBuilder はインスタンスなしで動作する必要があるため、
    //    trace データだけから判定する。

    const HUMAN_ENTER_TYPES = new Set([
      'ExpressionStatement',
      'VariableDeclaration',
      'IfStatement',
      'WhileStatement',
      'ForStatement',
      'ForOfStatement',
      'ForInStatement',
      'ReturnStatement',
      'ThrowStatement',
      'BreakStatement',
      'ContinueStatement',
    ]);

    const HUMAN_EXIT_TYPES = new Set([
      'AssignmentExpression',
      'UpdateExpression',
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

    // index 0 は必ず含める（初期状態として表示するため）
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
   * 変数ライフタイム情報を返す（Phase 4 で実装）。
   * @returns {Array}
   */
  buildLifetime() {
    // TODO: Phase 4 で実装
    return [];
  }

  /**
   * 再帰ツリーのノード配列を返す（Phase 4 で実装）。
   * @returns {Array}
   */
  buildRecursionTree() {
    // TODO: Phase 4 で実装
    return [];
  }

  // ── ユーティリティ ────────────────────────────────────────────────────────

  /**
   * humanStep インデックスの配列をソート済みで返す。
   * @returns {number[]}
   */
  getHumanStepList() {
    return [...this.buildHumanIndices()].sort((a, b) => a - b);
  }

  /**
   * trace 全体の長さを返す。
   * @returns {number}
   */
  get length() {
    return this.#trace.length;
  }

  /**
   * 生の trace 配列への参照を返す（ビュー側での参照用）。
   * @returns {Object[]}
   */
  get trace() {
    return this.#trace;
  }
}
