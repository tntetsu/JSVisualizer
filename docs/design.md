# 詳細設計書

**プロジェクト名**: JSVisualizer  
**バージョン**: 1.0  
**作成日**: 2026-05-25  
**最終更新**: 2026-06-04  
**作成者**: Tetsuo Tanaka

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 0.1 | 2026-05-25 | 初版 |
| 0.2 | 2026-05-25 | 実装済みモジュール（step-controller, trace-builder, code-view, state-view, animated-trace, trace-table, scope-view, callstack-view, settings-panel）の設計を実態に合わせて更新。CSS テーマシステム、ファイル構成を更新 |
| 0.3 | 2026-05-26 | Phase 3 実装反映: LineTrace（行×変数トレース表）, BarChart（棒グラフ）, ColorBox（色付き箱）, Timeline（時系列 SVG）, Heatmap（実行頻度マップ）。TraceBuilder に buildHeatmap() 追加 |
| 0.4 | 2026-05-26 | Phase 4 実装反映: RecursionTree（再帰ツリー SVG）, Lifetime（変数ライフタイム SVG Gantt）, ControlFlow（制御フロー SVG）。TraceBuilder に buildRecursionTree / buildLifetime / buildControlFlow を追加 |
| 0.5 | 2026-05-26 | Phase 5 実装反映: MemoryView（スタック/ヒープ + SVG 矢印）, ObjectGraph（力学レイアウト SVG グラフ）。SVG 設計パターンの統合、全ディレクトリ ✅ |
| 0.6 | 2026-05-26 | Phase 6 仕上げ反映: ViewSwitcher のキーボードタブ切り替え（1〜9）・localStorage 永続化。DebuggerAdapter のエラー種別判定（parse/runtime）。code-editor.js の showError(msg, errorType) とエラーバッジ。RecursionTree 色覚多様性対応（状態アイコン）。サンプルコード 17 種。Jest テスト 37 件。GitHub Actions CI/CD ワークフロー |
| 0.7 | 2026-05-26 | 修正 1〜8 反映: JSInterpreter assignTo 拡張（分割代入）。PaneResizer 追加。CodeMirror 6 エディタ化（Compartment・MutationObserver）。プログラム名表示。Console 常時パネル（state-view から分離）。LineTrace 改修（ソース列廃止・行高さ統一・スクロール同期・#varMeta 表示管理・D&D 列並び替え）。TraceTable に対象列追加（env diff・CallExpression・ReturnStatement）。テスト 42 件 |
| 0.8 | 2026-06-02 | callStack 順序バグ修正（[0]=最外側・[last]=最内側に訂正）。CallTree ビュー新規追加（src/views/call-tree/）・TraceBuilder に buildCallTree() 追加。LineTrace 2ペイン化（ソースパネル+リサイズ+スクロール同期刷新）。ScopeView/StateView スコープ統合（mergeScopesForDisplay・formatFrameLabel）。Heatmap 時系列ドット+割合表示。RecursionTree 引数展開・NODE_W/H 拡大。Console パネル高さドラッグ変更（jsv-console-h）。localStorage jsv-lt-src-w 追加 |
| 0.9 | 2026-06-03 | mergeScopesForDisplay を lexical scope 対応に刷新（旧: 2スコープ/関数仮定 → 新: 最内側関数が全 env チェーンをマージ）。StateView CALL STACK: formatFrameLabel 未インポートバグ修正＋スコープフレーム表示に変更。buildRecursionTree: 再帰呼び出しのみフィルタリング＋cost プロパティ付与。buildCallTree: #buildFullCallTree() を内部共有メソッドとして独立化。RecursionTree: cost 表示追加（左下角 cost:N）＋「再帰呼び出しがありません」メッセージ。Heatmap: 動的背景色（ステップ別更新）・ドット幅 3 倍（360px）・実行済み/未実行色分け・N回/M回 表示。MemoryView: mergeScopesForDisplay で正しいフレームラベル表示。テスト 49 件（buildCallTree テスト追加、buildRecursionTree テスト刷新）|
| 1.0 | 2026-06-04 | JSInterpreter に `Environment.snapshotOwn()` メソッドと `Recorder.frameEnvStack`（アクティブフレームの live Environment 参照スタック）を追加。各 TraceEvent に `frameEnvs: Object[]`（外→内の callEnv スナップショット配列）を記録。`mergeScopesForDisplay(scopes, callStack, frameEnvs)` の第 3 引数を追加し、外側フレームの表示を `reconstructFrameVars`（args ベース）から `frameEnvs[i]`（callEnv スナップショット）に変更。params・デフォルト引数・function-body 変数を正確に表示。V-01/V-04/V-13 が `state.frameEnvs` を参照するよう更新。AppState に `frameEnvs` フィールド追加。sv-scroll を flex→block 化（`overflow-y: auto` のスクロールバー修正）|
| 1.1 | 2026-06-04 | ScopeView・CallStackView をタブ非登録（非アクティブ）に変更。LineTrace を 2 ペイン構成から単一ペイン＋行番号スニペット（`lt-lineno-num` + `lt-lineno-snippet`、先頭 15 文字）構成に刷新（`#srcPanel`・`#srcLines`・`#setupScrollSync`・`#setupSrcResizer` および jsv-lt-src-w を削除）。ColorBox: タブ名「配列」・複数配列同時選択（`#selectedArrays: Set<string>`）・ポインタ変数を変数ごと個別行表示・文字列切り詰めなし。Timeline: `#renderSVG()` 内で選択変数のみの `dynMin`/`dynMax` を計算して Y 軸を動的スケール化。Heatmap: `#buildDots()` で SVG polyline を含む `.hm-connect-svg` を生成し「連結線」ボタン（`.hm-btn-lines`）で `.hm-show-lines` クラスをトグル。JSInterpreter `super()` 呼び出しバグ修正（`CallExpression` ハンドラに `node.callee.type === 'Super'` の早期リターンを追加）。`tests/core/samples.test.js` 新規追加（17 サンプル全エラーなし・trace ≥ 1 を確認）。テスト総数 49 → 66 件。view-switcher 登録ビュー数 15 → 13（ScopeView・CallStackView 非登録）|
| 1.2 | 2026-06-04 | `buildHumanIndices()` に while/do-while/for 条件式・更新式 exit をイテレーションごと追加（`matchIdx` 範囲内の深さ D+1 exit を走査）。WhileStatement/ForStatement enter は humanStep から除外。LineTrace・ExecTrace に `buildConditionExitSet()` + 改訂 `buildCondInfo()` を追加し条件列を正確表示。ExecTrace（実行トレースタブ）を設計文書化。タブ登録順: 実行トレース → 全ステップ（app.js で入れ替え）。Heatmap: `.hm-btn-lines` トグルボタン廃止。`#drawConnectLines()` を `init()` 内で rAF 経由で呼び出し常時表示へ変更。`.hm-overlay-svg`（position:absolute）＋ `<line class="hm-vline">` で異なる行間を縦線表示。ColorBox: `#scanTrace()` を 2 パス化し配列ごとの `maxWidth`/`maxGridHeight` を事前計算。`#render()` で `.cb-grid` に `min-width`/`min-height` を設定（空配列時も同様）。`.cb-box-area` を `flex-wrap:wrap` 化・`.cb-array-block` に枠線＋背景色・`.cb-grid` の `min-width:100%` 削除。JSInterpreter `formatLogArg(v, depth=0)`: `depth > 0` の文字列を `'str'` 形式で表示（Node.js 互換）|

---

## 1. システム全体構成

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ブラウザ                                                                 │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────────┐│
│  │  app.js  （全体協調・イベントバス）                                     ││
│  └─────┬───────────┬─────────────────────────┬────────────────────────┘ │
│        │           │                          │                          │
│  ┌─────▼───────┐ ┌─▼──────────────────┐ ┌────▼──────────────────────┐   │
│  │ components/ │ │ core/              │ │ views/                    │   │
│  │ ─────────── │ │ ─────────────────  │ │ ─────────────────────     │   │
│  │ code-editor │ │ debugger-adapter   │ │ code-view        ✅       │   │
│  │ pane-       │ │ step-controller    │ │ state-view       ✅       │   │
│  │ resizer     │ │ trace-builder      │ │ scope-view       ✅       │   │
│  │ step-       │ └────────┬───────────┘ │ callstack-view   ✅       │   │
│  │ controls    │          │             │ line-trace       ✅       │   │
│  │ view-       │          │             │ trace-table      ✅       │   │
│  │ switcher    │          │             │ bar-chart        ✅       │   │
│  │ settings-   │          │             │ color-box        ✅       │   │
│  │ panel       │          │             │ ...              ✅       │   │
│  └─────────────┘          │             │                           │   │
│                            │             │ timeline         ✅       │   │
│                            │             │ heatmap          ✅       │   │
│                            │             │ recursion-tree   ✅       │   │
│                            │             │ lifetime         ✅       │   │
│                            │             │ control-flow     ✅       │   │
│                            │             │ memory-view      ✅       │   │
│                            │             │ object-graph     ✅       │   │
│                            │             └───────────────────────────┘   │
│  ┌─────────────────────────▼──────────────────────────────────────────┐  │
│  │  interpreter.bundle.js                                              │  │
│  │  （JSInterpreter を esbuild でバンドル）                              │  │
│  │  JSDebugger / trace[] / TraceEvent                                  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.1 データフロー

```
ユーザーがコードを入力して ▶ Run
        │
        ▼
debugger-adapter.js
  new JSDebugger(source)     → trace[]（全ステップ記録）
  adapter.moveTo(0)          → 'ready' イベント dispatch
        │
        ▼
app.js の 'ready' ハンドラ
  new TraceBuilder(trace, source)  → 事前集計データを生成
  switcher.onReady(state, builder) → アクティブビューを再マウント
  codeView.setSource(source)       → コード行を描画
  codeView.setTrace(trace)         → callSiteEndMap を構築
        │
ステップ操作（ボタン / キーボード / スライダー）
        │
        ▼
step-controller.js
  adapter.moveTo(nextCursor) → 'step' イベント dispatch
        │
        ├──▶ codeView.update(state)     → 3層ハイライト更新
        ├──▶ stepControls.update(state) → ボタン有効化・カウンタ更新
        └──▶ switcher.update(state)     → アクティブビューの update() を呼ぶ
```

### 1.2 JSInterpreter 内部設計（`frameEnvs` 生成機構）

外側フレームの変数を正確にキャプチャするため、以下の拡張を加えた。

**`Environment.snapshotOwn()`** (`environment.js`):
```js
snapshotOwn() {
  const frame = {};
  for (const [k, v] of this.bindings) {
    frame[k] = deepClone(v);  // 自スコープのバインディングのみ（親チェーン不含）
  }
  return frame;
}
```

**`Recorder.frameEnvStack`** (`interpreter.js`):
```js
// Recorder コンストラクタ
this.frameEnvStack = [];   // アクティブフレームの live Environment 参照スタック

// callFunction / newInstance で関数呼び出し時
recorder.frameEnvStack.push(callEnv);   // push: フレーム開始
// 関数終了時
recorder.frameEnvStack.pop();           // pop: フレーム終了

// record() でイベント生成時
const frameEnvs = this.frameEnvStack.map(e => e.snapshotOwn());
// → TraceEvent.frameEnvs に格納
```

`frameEnvStack` には `callEnv`（`bindParams` でパラメータを束縛した後の live な `Environment`）が積まれるため、
関数実行中に変化する変数（デフォルト引数、function-body `let/const/var`）もステップごとに正確に取得できる。

---

## 2. 基本データ型

### 2.1 TraceEvent

JSInterpreter が各実行ステップで生成するオブジェクト。`trace[]` 配列の各要素。

```js
/**
 * @typedef {Object} TraceEvent
 * @property {'enter'|'exit'} phase
 *   'enter': AST ノードへの処理を開始した時点（子ノード未評価・値未確定）
 *   'exit':  AST ノードの処理が完了した時点（値が ev.value に確定）
 * @property {string}  nodeType   AST ノード種別（例: 'AssignmentExpression', 'IfStatement'）
 * @property {{line:number, column:number}} loc   ノード開始位置（1始まり）
 * @property {{line:number, column:number}} [end] ノード終了位置（式ノードのみ存在、inclusive）
 * @property {number}  depth      AST ノードの深さ
 * @property {number}  callDepth  関数呼び出しの深さ（グローバルスコープ = 0）
 * @property {Array}   callStack  現在のコールスタック。push 順: [0]=最外側フレーム、[length-1]=最内側フレーム
 *                                  frame: { name, loc, args }
 *                                  loc = その関数を呼び出した CallExpression の start 位置
 *                                  最内側フレームの取得: callStack[callStack.length - 1]
 * @property {Array}   env        スコープチェーン（env[0] が最内側スコープ）
 * @property {Object[]} frameEnvs  各アクティブフレームの callEnv スナップショット（外→内順、callStack と同一インデックス）
 *                                  Recorder.frameEnvStack の live Environment を snapshotOwn() で取得したもの。
 *                                  params・デフォルト引数・function-body 変数を含む（ブロックスコープは含まない）
 * @property {any}     [value]    exit 時に確定した値（enter 時は undefined）
 * @property {number}  [matchIdx] stepOver() 用の対応 exit ステップのインデックス
 */
```

**phase の詳細**:

インタープリタは AST を深さ優先で走査するため、各ノードに「入るとき」（enter）と「出るとき」（exit）の 2 回イベントを発火する。`a = 1 + 2` の実行順序:

```
enter AssignmentExpression      ← 代入式に入る（値未確定）
  enter BinaryExpression        ←   1+2 の計算を開始
    enter Literal(1)
    exit  Literal(1)  value=1
    enter Literal(2)
    exit  Literal(2)  value=2
  exit  BinaryExpression        value=3
exit  AssignmentExpression      value=3  ← a=3 が確定
```

- `ev.value` が存在するのは exit イベントのみ
- enter では子ノードがまだ評価されていないため、値は常に `undefined`

**全ステップ表 / AnimatedTrace での表示変換**:

```js
const symbol = ev.phase === 'enter' ? '▶' : '◀';
// 例: '▶ Assign'（代入式を開始）, '◀ Assign'（代入式が完了し値確定）
```

**humanStep の判定基準** (`buildHumanIndices()` 内):

人間が紙でトレースする際に「記録する」タイミングを、enter/exit の組み合わせで定義する。

| 条件 | 対象ノード種別 |
|------|---|
| 文ノードの **enter** | `ExpressionStatement`, `IfStatement`, `ForOfStatement`, `ForInStatement`, `BreakStatement`, `ContinueStatement` |
| 副作用ノードの **exit** | `VariableDeclaration`, `AssignmentExpression`, `UpdateExpression`, `ReturnStatement`, `ThrowStatement`, `CallExpression` |
| while/do-while 条件式の **exit**（イテレーションごと） | `WhileStatement`/`DoWhileStatement` enter の `matchIdx` 範囲内で、深さ D+1・`BlockStatement` 以外の exit |
| for 条件式・更新式の **exit**（イテレーションごと） | `ForStatement` enter の `matchIdx` 範囲内で、深さ D+1・`VariableDeclaration`・`BlockStatement` 以外の exit |

> `WhileStatement`/`ForStatement` の enter 自体は humanStep に含まない（各イテレーションの条件式 exit で代替）。  
> `matchIdx` でループ範囲を限定することで、ネストしたループに誤検出しない。

exit を採用する副作用ノードでは、値確定後（exit）に記録することで、変数の新しい値を表に反映できる。

---

## 3. モジュール詳細設計

### 3.1 `src/core/debugger-adapter.js`

**責務**: JSDebugger のライフサイクル管理・状態の正規化・差分検出

```js
class DebuggerAdapter extends EventTarget {
  #debugger = null         // JSDebugger インスタンス
  #prevEnv  = null         // 前ステップの env スナップショット

  /** コードをコンパイルして全ステップを記録 → 'ready' イベント */
  load(source) { ... }

  /** cursor を移動して状態を更新 → 'step' イベント（payload = AppState） */
  moveTo(nextCursor) { ... }

  /** 正規化された現在状態を返す */
  getState()  { ... }  // → AppState

  /** trace-builder / code-view 用の全トレースデータを返す */
  getTrace()  { ... }  // → TraceEvent[]
}


/**
 * @typedef {Object} AppState
 * @property {number}           cursor       現在の cursor 値
 * @property {number}           totalSteps   trace.length
 * @property {TraceEvent|null}  event        現在の TraceEvent
 * @property {Object}           variables    getVariables('all') の結果
 * @property {Object[]}         scopes       env[] スコープチェーン（env[0] = 最内）
 * @property {Object[]}         callStack    getCallStack() の結果
 * @property {Object[]}         frameEnvs    各アクティブフレームの callEnv スナップショット（外→内順、callStack と対応）
 * @property {string[]}         changedVars  前ステップから変化した変数名
 * @property {Object[]}         consoleOutput getConsoleOutput() の結果
 * @property {boolean}          done         isDone()
 */
```

**エラー種別判定** (`load()` の catch ブロック):

JSInterpreter のパーサーエラーは標準の `SyntaxError` クラスではなく、`[Parser] 1:20: ',' を期待` 形式のメッセージを持つ独自エラーオブジェクトとして投げられる。判定は以下の優先順で行う:

```js
const isParseError = err instanceof SyntaxError
  || err?.name === 'SyntaxError'
  || /^\[Parser\]/i.test(msg)          // JSInterpreter パーサー形式
  || /^(Unexpected token|Unexpected end of|SyntaxError|Invalid or unexpected)/i.test(msg);

// 'error' イベントの detail に errorType を追加
this.dispatchEvent(new CustomEvent('error', {
  detail: {
    message:   err.message ?? String(err),
    errorType: isParseError ? 'parse' : 'runtime',
  },
}));
```

`app.js` では `e.detail.errorType` を `editor.showError(message, errorType)` に渡す。

**`frameEnvs` の取得** (`#buildState()` 内):

```js
frameEnvs: ev?.frameEnvs ?? [],
```

`TraceEvent.frameEnvs` は JSInterpreter の `Recorder` が各イベント生成時に
`frameEnvStack.map(e => e.snapshotOwn())` で作成したスナップショット配列。
`debugger-adapter.js` はそのまま `AppState.frameEnvs` として公開する。

---

### 3.2 `src/core/step-controller.js`

**責務**: 粒度別ステップ操作を統一インターフェースで提供

実装済みの公開メソッド一覧:

```js
class StepController {
  #adapter   // DebuggerAdapter

  goToStart()           { this.#adapter.moveTo(0); }
  goToEnd()             { this.#adapter.moveTo(this.#adapter.getTrace().length); }
  jumpTo(cursor)        { this.#adapter.moveTo(cursor); }

  // 式粒度（cursor ±1）
  stepExprForward()     { this.#adapter.moveTo(dbg.cursor + 1); }
  stepExprBackward()    { this.#adapter.moveTo(dbg.cursor - 1); }

  // 文粒度（stepOver → matchIdx）
  stepStmtForward()     { dbg.stepOver(); this.#adapter.moveTo(dbg.cursor); }
  stepStmtBackward()    { dbg.stepBack(); this.#adapter.moveTo(dbg.cursor); }

  // 人にやさしい粒度
  stepHumanForward()    { dbg.humanStep();     this.#adapter.moveTo(dbg.cursor); }
  stepHumanBackward()   { dbg.humanStepBack(); this.#adapter.moveTo(dbg.cursor); }

  // 関数呼び出し粒度（callDepth 変化点まで cursor を移動）
  stepCallForward() {
    const trace      = dbg.trace;
    const startDepth = trace[dbg.cursor]?.callDepth ?? 0;
    let next = dbg.cursor + 1;
    while (next < trace.length && trace[next].callDepth === startDepth) next++;
    this.#adapter.moveTo(Math.min(next, trace.length));
  }
  stepCallBackward() {
    const trace      = dbg.trace;
    const startDepth = trace[dbg.cursor]?.callDepth ?? 0;
    let prev = dbg.cursor - 1;
    while (prev > 0 && trace[prev].callDepth === startDepth) prev--;
    this.#adapter.moveTo(prev);
  }
}
```

---

### 3.3 `src/core/trace-builder.js`

**責務**: trace 配列を一度だけ走査して各ビューが必要な集計データを生成。すべての結果はキャッシュ済み（2回目以降は O(1)）。

```js
class TraceBuilder {
  #trace               // TraceEvent[]
  #source              // 元ソースコード（string）
  #humanIndicesCache   // Set<number> | null
  #heatmapCache        // Map<number, number> | null
  #recursionTreeCache  // Object[] | null
  #callTreeCache       // Object[] | null
  #lifetimeCache       // Object[] | null
  #controlFlowCache    // Object | null

  constructor(trace, source = '') { ... }

  // ── Phase 1 ─────────────────────────────────────────────────────────────

  /**
   * humanStep で停止するトレースインデックスの Set を返す。
   * 停止条件: 文ノードの enter（ExpressionStatement 等）+
   *           副作用ノードの exit（AssignmentExpression 等）
   * @returns {Set<number>}
   */
  buildHumanIndices()

  /**
   * humanStep インデックスの配列をソート済みで返す。
   * @returns {number[]}
   */
  getHumanStepList()

  // ── Phase 3 ─────────────────────────────────────────────────────────────

  /**
   * 行ごとの実行回数を返す（enter フェーズのみカウント）。
   * @returns {Map<number, number>}  Map<行番号(1始まり), 実行回数>
   */
  buildHeatmap()

  // ── Phase 4 ─────────────────────────────────────────────────────────────

  /**
   * 再帰呼び出しのみを含むツリーのルートノード配列を返す。
   * #buildFullCallTree() で全呼び出しツリーを構築後、
   * child.funcName === parent.funcName の子のみ保持（再帰フィルタリング）。
   * 再帰的な子を持たないルートは除外（非再帰プログラムでは空配列）。
   * cost プロパティ: node.cost = 1 + Σ(子のcost)（サブツリーサイズ）。
   * ノード: { id, funcName, args, returnVal,
   *           callStepIdx, returnStepIdx, treeDepth, children[], cost }
   * @returns {Object[]} ルートノード配列
   */
  buildRecursionTree()

  /**
   * 全関数呼び出しツリーのルートノード配列を返す（CallTree ビュー用）。
   * 内部の #buildFullCallTree() を利用（buildRecursionTree() とは完全に独立）。
   * cost プロパティは付与しない。
   * @returns {Object[]} ルートノード配列
   */
  buildCallTree()

  /**
   * 変数ライフタイム情報を返す（humanStep 単位）。
   * エントリ: { varName, callDepth, startHi, endHi }
   * 同名変数が異なる callDepth で現れる場合は別エントリ。
   * @returns {Array<{varName:string, callDepth:number, startHi:number, endHi:number}>}
   */
  buildLifetime()

  /**
   * 制御フローグラフデータを返す。
   * humanStep を順に辿り、行番号の遷移からノード・エッジを構築。
   * ノード: { lineNo, text, count, firstSeen }
   * エッジ: { from, to, count }
   * @returns {{ nodes: Object[], edges: Object[], humanSteps: number[] }}
   */
  buildControlFlow()

  // ── ゲッター ─────────────────────────────────────────────────────────────

  get trace()   // TraceEvent[]（ビュー側での参照用）
  get source()  // string（元ソースコード）
  get length()  // number（trace.length）
}
```

**`isFunctionVal(v)` ヘルパー**（TraceBuilder 内部・LineTrace・ObjectGraph で共通使用）:

```js
function isFunctionVal(v) {
  if (typeof v === 'function') return true;
  if (v && typeof v === 'object') {
    return v.__type__ === 'JSFunction' || v.__type__ === 'JSClass';
  }
  return false;
}
```

---

### 3.4 ビューの共通インターフェース

全ビューが実装するメソッド:

```js
class BaseView {
  /**
   * @param {HTMLElement}  container マウント先 DOM 要素
   * @param {TraceBuilder} builder   事前集計データ（null の場合もあるが init 時は常に渡される）
   */
  init(container, builder) { throw new Error('not implemented'); }

  /**
   * ステップ変化時に呼ばれる
   * @param {AppState} state
   */
  update(state) { throw new Error('not implemented'); }

  /** 状態を初期化（コード再実行時） */
  reset() { throw new Error('not implemented'); }

  /** DOM をアンマウント（ビュー切り替え時） */
  destroy() { throw new Error('not implemented'); }
}
```

---

### 3.5 SVG ビューの設計パターン

Phase 4 / Phase 5 の SVG ビューは共通パターンに従って実装されている。

| パターン | 説明 | 使用ビュー |
|---------|------|----------|
| **静的 SVG** | `init()` で全要素を生成し `update()` で属性変更のみ | RecursionTree, Lifetime, ControlFlow |
| **動的 SVG** | `init()` でレイアウト計算＆生成、`update()` で位置・色を更新 | Timeline, ObjectGraph |
| **SVG オーバーレイ矢印** | DOM 要素上に `position: absolute` の SVG を重ねてベジェ曲線を描画 | MemoryView |
| **rAF 遅延描画** | DOM レイアウト確定後に `requestAnimationFrame` で矢印座標を計算 | MemoryView |
| **Fruchterman-Reingold** | 反発力・引力・温度クーリングによる力学的レイアウト（80 反復, 冷却率 0.92） | ObjectGraph |

**SVG 座標系の共通規則**:
- `PAD_X` / `PAD_Y` で描画領域にパディングを確保
- `viewBox` ではなく `width` / `height` を動的に設定
- マーカー要素（矢印頭）は `<defs>` 内に定義し `marker-end` 属性で参照

---

### 3.6 各ビューの実装詳細

#### `code-view/` — コードハイライト（3層）✅

**構造**:
```
CodeView
├── #linesEl (.cv-lines)
│   ├── .cv-line[data-line="1"]
│   │   ├── .cv-line-num
│   │   └── .cv-line-code  (position: relative; isolation: isolate)
│   │       ├── [syntax spans]
│   │       ├── .cv-expr-highlight     (position: absolute)
│   │       └── .cv-callsite-highlight (position: absolute)
│   └── ...
├── #exprHighlightEls[]
├── #callSiteHighlightEls[]
└── #callSiteEndMap  Map<"line:col", {line, column}>
```

**公開 API**: `init(container)`, `setSource(source)`, `setTrace(trace)`, `update(state)`, `reset()`

**ハイライト配置の仕組み**:
```
.cv-line-code { position: relative; isolation: isolate; }
.cv-expr-highlight, .cv-callsite-highlight {
  position: absolute;
  left:  calc(startCh * 1ch);   /* JS で style.left に設定 */
  width: calc(lengthCh * 1ch);  /* JS で style.width に設定 */
  z-index: -1;
}
```

**呼び出し元 end 位置の取得フロー**:
```
setTrace(trace) で CallExpression.enter イベントを走査
  → key = "loc.line:loc.column"
  → value = ev.end
  → callSiteEndMap に格納

update(state) で callStack.length > 0 の場合:
  → topFrame = callStack[callStack.length - 1]  ← 最内側フレーム（[0]=最外側、[last]=最内側）
  → key = "topFrame.loc.line:topFrame.loc.column"
  → end = callSiteEndMap.get(key)
  → setHighlight(topFrame.loc, end, 'cv-callsite-highlight', ...)
```

---

#### `state-view/` — 変数・スタック統合パネル ✅

**構成カード**（スクロール可能な縦並び）:
1. **Current Step** — phase, nodeType, 行番号, 評価値
2. **変数** — 全スコープをグループ表示。変化した変数に `var-flash` アニメーション
3. **コールスタック** — フレームとその行番号

> Console 出力は `#console-panel`（`debug-pane` 下部固定）に分離済み。`app.js` の `updateConsolePanel(state)` が `'ready'`/`'step'` イベントごとに更新する。

**スクロール実装** (`.sv-scroll` の CSS):

`display:flex; flex-direction:column` 内で `overflow-y:auto` は機能しないため、`.sv-scroll` を block 表示に変更。カード間の余白は隣接兄弟セレクタ (`.debug-card + .debug-card { margin-top: 8px }`) で設定する。

```css
.sv-scroll {
  flex: 1 1 0;
  overflow-y: auto;
  padding: 8px;
  min-height: 0;
  /* display:flex を除去することで overflow-y: auto が正常動作 */
}
```

---

#### `scope-view/` — スコープ・変数ビュー ✅（タブ非登録・非アクティブ）

**スコープ統合表示** (`mergeScopesForDisplay(scopes, callStack, frameEnvs)` in `format.js`):

JavaScript は lexical scoping を採用しており、JSInterpreter の `callFunction` は
`new Environment(callee.closure)` でスコープを作成する（呼び出し元スコープではなく定義元スコープが親）。
このため同一スコープレベルで定義された関数間（例: quickSort と partition）や
再帰呼び出し（factorial(3)→factorial(2)）では、外側フレームのスコープが
env チェーンに含まれない。

外側フレームの変数を正確に表示するため、JSInterpreter の `Recorder` は各フレームの
`callEnv`（`Environment` オブジェクト）への参照を `frameEnvStack` で管理し、
TraceEvent 生成時に `snapshotOwn()`（自スコープのみのスナップショット）を呼んで
`frameEnvs` として記録する。これにより params・デフォルト引数・function-body 変数が
正確にキャプチャされる。

```
callStack の順序: [0]=最外側, [N-1]=最内側（現在実行中）
scopes の順序:    [0]=最内側スコープ, [M-1]=グローバル
frameEnvs の順序: [0]=最外側フレーム, [N-1]=最内側フレーム（callStack と同一インデックス）

アルゴリズム（v1.0 以降）:
  最内側関数: scopes[0]〜scopes[M-2] を外→内の順でマージ（内側が外側を上書き）
              ブロックスコープ・クロージャチェーンを含む完全な変数リスト
  外側関数:   frameEnvs[i] を使用（callEnv スナップショット）
              params・デフォルト引数・function-body let/const/var を含む
  グローバル: scopes[M-1]
  表示順: innermost-first（最内側が先頭）
```

```html
<div class="scv-frame scv-frame--active">
  <div class="scv-frame-header">
    <span class="scv-frame-name">factorial(6)</span>
  </div>
  <div class="scv-vars">
    <div class="var-row"> n = <span class="v-num">6</span> </div>
  </div>
</div>
```

---

#### `callstack-view/` — コールスタックビュー ✅（タブ非登録・非アクティブ）

```html
<div class="csv-stack">
  <div class="csv-card csv-card--top csv-card--enter">
    <div class="csv-name">fib</div>
    <div class="csv-loc">呼び出し元: 5行目</div>
  </div>
  <div class="csv-card csv-card--global">
    <div class="csv-name">(global)</div>
  </div>
</div>
```

- `callStack.length > prevDepth` のとき最上位カードに `.csv-card--enter` → CSS slide-in

---

#### `line-trace/` — 行×変数トレース表（単一ペイン構成）✅

**DOM 構造**:
```
.lt-outer (flex column)
└── .lt-wrap (flex column)
    ├── .lt-toolbar (列表示切替ボタン群)
    └── .lt-table-wrap (縦スクロール領域)
        └── .lt-table
            ├── thead .lt-thead-row
            │   ├── th[0]: 行番号列（.lt-lineno-num + .lt-lineno-snippet）
            │   └── th[n]: 変数列
            └── tbody .lt-tbody
                └── tr[data-line] × ソース行数
                    ├── td.lt-lineno: <span class="lt-lineno-num">N</span>
                    │               <span class="lt-lineno-snippet">先頭15文字</span>
                    └── td[n]: 変数値セル
```

**動作**:
- `init()` でソース行をパースして行番号・スニペット（先頭 15 文字）付きの `<tr>` を静的生成（ソースパネルなし）
- `update()` で `humanSteps[0..cursor]` を走査:
  - 各 humanStep の `flattenEnv(ev.env)` から変数スナップショットを取得
  - 新規変数が出現したら列を追加（`#rebuildColumns` で `<th>` + 全行に `<td>` を挿入）
  - 変化したセルに `.lt-flash` → CSS flash アニメーション
  - 現在実行行の `<tr>` に `.lt-row--active` を付与してスクロール追従

**関数・クラス値は列から除外**: `isFunctionVal(val)` で判定

**列メタデータ管理**:
```js
/** @type {Array<{name: string, visible: boolean}>} */
#varMeta = [];
```
`visible: false` の列ヘッダー・セルには `.lt-col-hidden`（`display: none`）を付与。

**ツールバー（列表示切替）**: `#rebuildToolbar()` でヘッダー上部に `.lt-var-toggle` ボタンを生成。クリックで `#toggleVar(name)` → `#varMeta[i].visible` を切り替え

**ドラッグ&ドロップ列並び替え**:
- `<th draggable="true">` に `dragstart`/`dragover`/`drop` を設定
- `drop` 時: `#varMeta` の src/dst インデックスを入れ替え → `#rebuildColumns` を再呼び出し

---

#### `exec-trace/` — 実行順トレース表 ✅

タブ名: **実行トレース**

- `init()` で全 humanStep を実行順（humanStep インデックス順）に一括描画
- `update()` は `et-row--active` クラスの付け替えと scrollIntoView のみ（O(n)）

**列構成**: # | 行 | コード（先頭 30 文字）| 変数値列（出現順）| 条件式列（出現順）

**条件式列の実装**（LineTrace と共通ロジック）:

```js
// 事前計算: while/do-while/for の条件式 exit インデックスを Set に収集
function buildConditionExitSet(trace) { ... }

// 各 humanStep で条件式情報を取得
function buildCondInfo(trace, si, lines, conditionExitSet) {
  // Case 1: while/for 条件式 exit → イベント自体の value を使用
  if (conditionExitSet.has(si)) { return { text: extractCondText(...), value: ev.value }; }
  // Case 2: IfStatement/ConditionalExpression enter → 直後 boolean exit を探索
  if (ev.phase === 'enter' && CONDITION_NODES.has(ev.nodeType)) { ... }
}
```

`extractCondText(lines, loc, end)` は loc・end の 1-based column を使って `lineText.slice(col-1, end.column)` でソーステキストを抽出する。

---

#### `trace-table/` — 全ステップ表 ✅

- `init()` で `builder.getHumanStepList()` の全行を一括描画
- `update()` は `tt-row--active` クラスの付け替えとスクロールのみ

**「対象」列の実装**（`#buildRow(humanNum, stepIdx, trace, prevStepIdx)`）:

```js
switch (ev.nodeType) {
  case 'VariableDeclaration':
  case 'AssignmentExpression':
  case 'UpdateExpression': {
    // env diff で変化した最初の変数名を取得（関数・クラス値は除外）
    const prev = flattenEnv(prevEv?.env ?? []);
    const curr = flattenEnv(ev.env ?? []);
    target = firstChangedVar(prev, curr);  // BUILTIN_NAMES・isFunctionVal でフィルタ
    break;
  }
  case 'ReturnStatement':
    target = 'return';
    break;
  case 'CallExpression': {
    const cs    = ev.callStack;
    const frame = cs?.[cs.length - 1];  // 最内側フレーム（[0]=最外側、[last]=最内側）
    if (ev.phase === 'enter') target = `${frame?.name}(${args.join(', ')})`;
    else                      target = frame?.name ?? '?';
    break;
  }
}
```

列の CSS: `.tt-col-target { width: 140px; color: var(--accent); font-family: monospace; }`

---

#### `animated-trace/` — アニメーション付きトレース表 ✅（非アクティブ）

- `init()` で空テーブルを生成
- `update()` で新ステップ時に行を先頭挿入（`.at-row--new` slide-in）、ステップバック時に削除
- ※ `line-trace` が同機能をより見やすく代替しているため、現在はタブ非登録

---

#### `bar-chart/` — 棒グラフ ✅

**表示対象**: 数値変数・数値配列（`init()` 時に trace を走査して自動検出）

**チップ**: 変数ごとの選択トグル。複数選択可。選択状態は `#selectedVars: Set<string>` で管理

**棒の色**: `valueToHsl(val, maxVal)` — HSL 220（青）→ 0（赤）の線形補間

**DOM 構造**:
```html
<div class="bc-wrap">
  <div class="bc-chips">                <!-- 変数選択チップ -->
    <button class="bc-chip bc-chip--active">arr</button>
  </div>
  <div class="bc-chart">               <!-- グラフ本体 -->
    <div class="bc-group" data-var="arr">
      <div class="bc-bars">
        <div class="bc-bar-wrap">
          <div class="bc-bar" style="height: 40%; background: hsl(...)"></div>
          <span class="bc-label">3</span>
        </div>
      </div>
    </div>
  </div>
</div>
```

**アニメーション**: `height` に `transition: height 0.2s ease` を適用（CSS）

---

#### `color-box/` — 配列ビュー ✅

**表示対象**: 配列変数（`init()` 時に trace を走査して自動検出）

**チップ**: 配列変数の複数選択可能トグル（`#selectedArrays: Set<string>`）。最後の 1 つは選択解除不可

**ポインタ検出**: スコープ内の整数変数をポインタ候補として自動検出し、対応する配列インデックスの箱をハイライト。ポインタ変数はポインタ変数ごとに個別の `.cb-ptr-row` として表示

**文字列値**: 切り詰めなしで全文表示

**最大サイズ事前計算** (`#scanTrace()` 第 2 パス):
```js
// 各 humanStep で len × CELL・IDX_H・PTR_H を計算して最大値を記録
m.maxWidth      = Math.max(m.maxWidth,      len * CELL);
m.maxGridHeight = Math.max(m.maxGridHeight, IDX_H + CELL + ptrCount * PTR_H);
```
`#render()` で `.cb-grid` に `min-width: ${maxWidth}px; min-height: ${maxGridHeight}px` を inline style で設定する。空配列時（`arr.length === 0`）も同じ min-width/min-height を設定し、「配列が空です」メッセージを内包する。

**折り返しレイアウト**: `.cb-box-area` が `display: flex; flex-wrap: wrap; align-content: flex-start; align-items: flex-start` で、幅不足時に次の行へ折り返す。

**枠線・背景色**: `.cb-array-block` に `border: 1px solid var(--border); border-radius: 6px; background: var(--surface2); margin: 4px` を設定し、配列ブロックの境界を視覚化する。

**DOM 構造**:
```html
<div class="cb-wrap">
  <div class="cb-chips">...</div>
  <div class="cb-box-area">  <!-- flex-wrap: wrap -->
    <!-- 選択配列ごとに1ブロック（枠線・背景付き） -->
    <div class="cb-array-block">
      <div class="cb-array-name">arr</div>
      <div class="cb-grid" style="min-width:Npx;min-height:Npx">
        <div class="cb-row cb-idx-row">...</div>
        <div class="cb-row cb-val-row">...</div>
        <!-- ポインタ変数ごとに個別行 -->
        <div class="cb-row cb-ptr-row">...</div>
      </div>
    </div>
  </div>
</div>
```

---

#### `timeline/` — 時系列 SVG グラフ ✅

**事前計算** (`init()` 内): `builder.getHumanStepList()` を走査し、humanStep ごとの数値変数スナップショット `#history` を構築

```js
#history = [
  { stepIdx: 42, vars: Map<name, number> },
  ...
]
```

**SVG 構造**: チップで選択した変数ごとに折れ線グラフ（`<polyline>`）を描画。カーソル縦線（`<line class="tl-cursor">`）が `update()` 時に X 座標のみ更新

**Y 軸動的スケール**: `#renderSVG()` 内で、描画前に選択変数のみの値から `dynMin`/`dynMax` を計算する。未選択変数はスケールに影響しない。
```js
let dynMin = Infinity, dynMax = -Infinity;
for (const snap of this.#history) {
  for (const name of this.#selectedVars) {
    const v = snap.vars.get(name);
    if (v !== undefined) { if (v < dynMin) dynMin = v; if (v > dynMax) dynMax = v; }
  }
}
if (!isFinite(dynMin)) dynMin = this.#minVal;
if (!isFinite(dynMax)) dynMax = this.#maxVal;
if (dynMin === dynMax) { dynMin -= 1; dynMax += 1; }
```

**座標変換**:
```js
const PAD = { top: 12, bottom: 28, left: 44, right: 12 };
const xOf = (i)   => PAD.left + (i / (history.length - 1)) * (svgW - PAD.left - PAD.right);
const yOf = (val) => PAD.top  + (1 - (val - dynMin) / (dynMax - dynMin)) * (svgH - PAD.top - PAD.bottom);
```

---

#### `heatmap/` — 実行頻度ヒートマップ ✅

**初期化**: ドット配置のみ静的に生成。背景色は `update()` で動的更新。
`lineTimeline`: `Map<lineNo, number[]>` — 各行が実行された humanStep インデックスの配列を事前計算。

**動的背景色** (`update()` で毎ステップ更新):
```js
// バイナリサーチで現在ステップまでの実行回数を算出
const alpha = currentCount === 0 ? 0 : 0.08 + (currentCount / maxTotal) * 0.47;
el.style.background = `rgba(255,140,0,${alpha.toFixed(3)})`;
```

**実行回数表示**: 各行の右端に `${currentCount}回 / ${totalCount}回` を表示（currentCount = 現在ステップまでの回数、totalCount = 全体での総回数）。ステップごとに更新。

**時系列ドット**: 各行を実行した humanStep インデックスごとに `<span class="hm-dot">` を生成
- `style="left: ${(hi / total) * 100}%"` で水平位置を決定（幅 360px の相対配置コンテナ内）
- 表示上限 DOT_MAX=200 個（超過時は先頭を省略）
- クラス分類 (`update()` 毎に全ドットを更新):
  - `hi < cursor_hi` → `.hm-dot--past`（アクセントカラー、実行済み）
  - `hi === cursor_hi` → `.hm-dot--current`（強調表示）
  - それ以外 → デフォルト（薄いグレー、未実行）

**連結線（常時表示）**: `init()` 完了後に `requestAnimationFrame(() => this.#drawConnectLines())` で描画を開始。`.hm-lines`（`position: relative`）内に単一のオーバーレイ SVG（`.hm-overlay-svg`、`position: absolute; top:0; left:0; pointer-events:none`）を配置し、異なる行に遷移する連続 humanStep ペア（`#crossLinePairs`）のドット間を `<line class="hm-vline">` で結ぶ。座標は `getBoundingClientRect()` と `scrollTop` で `.hm-lines` コンテンツ座標に変換する。トグルボタン（`.hm-btn-lines`）は廃止。

```js
// #drawConnectLines() 座標計算
const x1 = rA.right  - linesRect.left;
const y1 = rA.top + rA.height / 2 - linesRect.top + scrollTop;
const x2 = rB.left   - linesRect.left;
const y2 = rB.top + rB.height / 2 - linesRect.top + scrollTop;
```

CSS: `.hm-vline { stroke: var(--accent); stroke-width: 1; stroke-opacity: 0.4; fill: none; }`

**update()**: 全行の背景色・カウントテキスト・ドットクラスを更新し、アクティブ行に `.hm-line--active` を付与

---

#### `recursion-tree/` — 再帰ツリー ✅

**データ取得**: `builder.buildRecursionTree()` → ルートノード配列

**レイアウト定数**:
```js
const NODE_W=160, NODE_H=80, COL_GAP=20, ROW_GAP=52, PAD_X=24, PAD_Y=24;
// NODE_W/H を拡大して引数の 2 行表示に対応
```

**サブツリー幅の計算**（再帰）:
```js
function calcSubtreeWidth(node) {
  if (node.children.length === 0) return NODE_W;
  const childrenW = node.children.reduce((s, c) => s + calcSubtreeWidth(c), 0);
  return childrenW + (node.children.length - 1) * COL_GAP;
}
```

**ノード状態クラス**:
| 状態 | 条件 | CSS クラス |
|------|------|-----------|
| 未呼び出し | `callStepIdx > cursor` | `rt-node--future` |
| 実行中 | `returnStepIdx === null または > cursor` | `rt-node--active` |
| 完了 | `returnStepIdx <= cursor` | `rt-node--done` |

**引数表示**: `fmtArgsLines(args)` で引数リストを最大 2 行に分割して表示。配列値は要素を展開して `[1,2,3]` 形式で表示。

**SVG 要素**: ノードごとに `<g class="rt-node rt-node--*">` 内に以下の要素を配置:
- `<rect class="rt-rect">` — ノード枠
- `<text class="rt-name" y=18>` — 関数名（行 1）
- `<text class="rt-args" y=35>` — 引数行 1（行 2）
- `<text class="rt-args" y=50>` — 引数行 2（行 3、長い場合のみ）
- `<text class="rt-retval" y=65 or 52>` — 戻り値（引数が 1 行なら y=52）
- `<text class="rt-state-icon" y=14>` — 状態アイコン（右上角）

エッジは `<line class="rt-edge">`

**色覚多様性対応** (Phase 6 追加):

各ノードの右上角（`x=NODE_W-8, y=14`）に状態アイコンテキストを配置し、色に依存しない状態識別を実現する。

```js
// update() でのアイコン設定
stateT.textContent = stCls === 'rt-node--future' ? '…'
                   : stCls === 'rt-node--active' ? '▶'
                   : '✓';
```

CSS スタイル（`style.css`):

```css
/* 未実行: 破線ボーダー + 薄い表示 */
.rt-node--future .rt-rect { stroke-dasharray: 5 3; opacity: 0.60; }

/* 実行中: 太線ボーダー + 太字テキスト */
.rt-node--active .rt-rect { stroke-width: 3; stroke-dasharray: none; }
.rt-node--active .rt-name { font-weight: 700; }

/* 完了: 通常ボーダー */
.rt-node--done .rt-rect { stroke-dasharray: none; }

/* 状態アイコン */
.rt-state-icon { font-size: 10px; fill: var(--text-muted); }
.rt-node--active .rt-state-icon { fill: var(--accent); }
.rt-node--done   .rt-state-icon { fill: #4ce884; }
```

---

#### `call-tree/` — 全関数呼び出しツリー ✅

**データ取得**: `builder.buildCallTree()` → ルートノード配列（`buildRecursionTree()` と同一構造）

**レイアウト定数**:
```js
const NODE_W=180, NODE_H=56, COL_GAP=16, ROW_GAP=44, PAD_X=20, PAD_Y=20;
// CallTree はラベルを 1行（funcName(args)）で表示するため NODE_H を小さく設定
```

**ノードラベル**: `fmtNodeLabel(node)` が `funcName(arg1, arg2, ...)` 形式で生成。26 文字を超える場合は省略

**SVG 要素**: ノードごとに `<g class="ct-node ct-node--*">` 内に:
- `<rect class="ct-rect">` — ノード枠
- `<text class="ct-label" y=22>` — `funcName(args)` ラベル（行 1）
- `<text class="ct-retval" y=40>` — 戻り値（行 2、確定後のみ表示）
- `<text class="ct-state-icon" y=14>` — 状態アイコン（右上角: …/▶/✓）

エッジは `<line class="ct-edge">`

**状態クラス**: `ct-node--future` / `ct-node--active` / `ct-node--done`（RecursionTree の `rt-node--*` と同じ論理）

---

#### `lifetime/` — 変数ライフタイム SVG Gantt ✅

**データ取得**: `builder.buildLifetime()` → `{ varName, callDepth, startHi, endHi }[]`

**レイアウト定数**:
```js
const ROW_H=26, LABEL_W=90, CHART_W=560, PAD_T=36;
```

**深さごとの色パレット** (6色):
```js
const DEPTH_COLORS = [
  'rgba(76,155,232,0.65)', 'rgba(232,107,76,0.65)', 'rgba(76,232,132,0.65)',
  'rgba(232,200,76,0.65)', 'rgba(200,76,232,0.65)', 'rgba(76,232,232,0.65)',
];
```

**X 座標変換**:
```js
const hiToX = (hi) => LABEL_W + (hi / maxHi) * CHART_W;
```

**カーソル線**: `<line class="lf-cursor">` の `x1`/`x2` のみ `update()` で更新

---

#### `control-flow/` — 制御フロー SVG ✅

**データ取得**: `builder.buildControlFlow()` → `{ nodes, edges, humanSteps }`

**レイアウト定数**:
```js
const NODE_H=36, NODE_W=320, STEP_H=NODE_H+26, LEFT_PAD=70, RIGHT_PAD=60;
```

**ノード配置**: `firstSeen` 順に上から等間隔に配置

**エッジ種別**:
| 種別 | 判定 | CSS クラス | 色 |
|------|------|----------|----|
| 順方向 | `toIdx > fromIdx` | `cf-edge` | 青（`var(--accent)`） |
| 戻りエッジ | `toIdx <= fromIdx` | `cf-edge cf-edge--back` | オレンジ（`var(--hl-orange)`） |

**ノード背景色**: 実行回数に応じて HSL 220（薄青）→ HSL 20（オレンジ）でグラデーション

**update()**: `state.event.loc.line` に対応するノードに `.cf-node--active` を付与

---

#### `memory-view/` — メモリモデル ✅

**パネル構成**: 左列 = スタック（スコープフレーム）、右列 = ヒープ（オブジェクト・配列）

**ヒープ登録ロジック** (`buildHeap(scopes)`):
```js
function buildHeap(scopes) {
  const heap   = [];
  const refMap = new WeakMap(); // object reference → heapId

  function register(v, depth = 0) {
    if (!isHeapVal(v)) return null;
    if (refMap.has(v)) return refMap.get(v);    // 循環参照・共有参照を検出
    const id = heap.length;
    refMap.set(v, id);
    // エントリ先行登録（循環参照対策）
    const entry = { id, ref: v, label: heapLabel(v), entries: [] };
    heap.push(entry);
    // 子を再帰登録（depth < 5 まで）
    ...
    return id;
  }

  for (const scope of scopes) {
    for (const [name, val] of Object.entries(scope ?? {})) register(val);
  }
  return { heap, refMap };
}
```

**スタックレンダリング**: `#renderStack(scopes, callStack, changed, refMap, heap, frameEnvs)` が `mergeScopesForDisplay(scopes, callStack, frameEnvs)` を呼びフレームごとの変数を取得する。外側フレームは `frameEnvs[i]`（callEnv スナップショット）から params・デフォルト引数・function-body 変数を表示。

**参照セルの HTML**: スタック・ヒープともに参照値のセルに `data-ref-heap="N"` 属性を付与

**SVG 矢印描画** (`#drawArrows()`):
```
requestAnimationFrame → getBoundingClientRect() → layoutEl 基準の座標計算
→ ベジェ曲線パス M x1,y1 C mx,y1 mx,y2 x2,y2
→ SVG に <path class="mv-arrow" marker-end="url(#mv-arr)"> を追加
```

---

#### `object-graph/` — オブジェクトグラフ ✅

**グラフ構築** (`buildGraph(scopes)`):
- `WeakMap<ref, id>` でオブジェクト同一性を追跡（循環参照・共有参照対応）
- 再帰深さ上限 6
- プリミティブ変数は `og-prim-label` としてコーナーに表示
- ルート変数名は対応ノードの上に `og-root-label` として表示

**力学的レイアウト** (`forceDirectedLayout(nodes, edges)`, 80 反復):
```js
function forceDirectedLayout(nodes, edges) {
  const K    = Math.sqrt((NODE_W + H_SPACING) * (NODE_H_MIN + V_SPACING) * nodes.length);
  let   temp = INITIAL_SPREAD;  // 200

  // 初期配置: グリッド状
  nodes.forEach((n, i) => {
    n.x = (i % cols) * (NODE_W + H_SPACING) - totalW / 2;
    n.y = Math.floor(i / cols) * (NODE_H_MIN + V_SPACING);
  });

  for (let iter = 0; iter < 80; iter++) {
    const disp = nodes.map(() => ({ x: 0, y: 0 }));
    // 反発力: K² / dist （全ペア）
    // 引力:   dist² / K （エッジで繋がったペア）
    // temp でクランプして適用
    temp = Math.max(1, temp * 0.92);
  }
}
```

**ノード表示内容**: オブジェクトは `{key: val}` 形式、配列は `[v0, v1, ...]` 形式でセル表示。参照フィールドは `→#id` インジケーター

---

## 4. コンポーネント設計

### 4.1 `components/step-controls.js` ✅

**ボタン構成（2行×4列グリッド）**:

```
⏮(高) │ [btn-stmt-back] [btn-expr-back] [btn-expr-forward] [btn-stmt-forward] │ ⏭(高)
       │ [btn-call-back] [btn-human-back][btn-human-forward][btn-call-forward]  │
```

**キーボードバインド**:
```js
switch (e.key) {
  case 'ArrowLeft':
  case 'b': ctrl.stepExprBackward();  break;
  case 'ArrowRight':
  case 'n': ctrl.stepExprForward();   break;
  case 'h': ctrl.stepHumanForward();  break;
  case 'H': ctrl.stepHumanBackward(); break;
  case 'v': ctrl.stepStmtForward();   break;
  case 'V': ctrl.stepStmtBackward();  break;
  case 'f': ctrl.stepCallForward();   break;
  case 'F': ctrl.stepCallBackward();  break;
  case 'Home': ctrl.goToStart();      break;
  case 'End':  ctrl.goToEnd();        break;
}
```

`<textarea>` / `<input>` フォーカス中は無効化。

---

### 4.2 `components/view-switcher.js` ✅

**状態**:
- `#registry: Map<id, { label, ViewClass, instance }>` — 登録されたビュー
- `#activeId: string | null`
- `#builder: TraceBuilder | null`
- `#lastState: AppState | null`
- `#keyHandler: Function | null` — キーボードイベントハンドラ（解除用に保持）

**localStorage 永続化**:

```js
const STORAGE_KEY_TAB = 'jsv-active-tab';
```

**重要メソッド**:

```js
register(id, label, ViewClass)
// タブボタンを生成して registry に登録

onReady(state, builder)
// アクティブビューを destroy → 再 init する
// → ビューは常に最新の builder を持つことが保証される
// → キーボードショートカットを登録（#registerKeyboard）
// → 初回は localStorage から前回タブを復元、なければ先頭タブを選択

update(state)
// アクティブビューの update(state) を呼ぶ

reset()
// 全 instance を destroy して null にする
// → キーボードショートカットを解除（#unregisterKeyboard）
```

**キーボードショートカット設計** (`#registerKeyboard` / `#unregisterKeyboard`):

```js
#registerKeyboard() {
  if (this.#keyHandler) return;        // 二重登録防止
  const ids = [...this.#registry.keys()];  // 登録順の ID 配列
  this.#keyHandler = (e) => {
    const tag = document.activeElement?.tagName;
    if (tag === 'TEXTAREA' || tag === 'INPUT') return;  // エディタ無効化
    const digit = parseInt(e.key, 10);
    if (digit >= 1 && digit <= 9) {
      const id = ids[digit - 1];      // 1→ids[0], 2→ids[1], ...
      if (id) { e.preventDefault(); this.#activate(id); }
    }
  };
  document.addEventListener('keydown', this.#keyHandler);
}

#unregisterKeyboard() {
  if (this.#keyHandler) {
    document.removeEventListener('keydown', this.#keyHandler);
    this.#keyHandler = null;
  }
}
```

**タブ永続化** (`#activate` 内):

```js
#activate(id) {
  if (id === this.#activeId) return;
  // ... destroy/init 処理 ...
  this.#activeId = id;
  try { localStorage.setItem(STORAGE_KEY_TAB, id); } catch { /* quota over 等は無視 */ }
  // ...
}
```

---

### 4.3 `components/code-editor.js` ✅

**CodeMirror 6 エディタ**:

```js
import { EditorView, basicSetup } from 'codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { oneDark }    from '@codemirror/theme-one-dark';
import { Compartment } from '@codemirror/state';

// themeCompartment で動的テーマ切り替え
const themeCompartment = new Compartment();

// MutationObserver で html[data-theme] 変化を監視 → テーマ再設定
const obs = new MutationObserver(() => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  view.dispatch({ effects: themeCompartment.reconfigure(isDark ? oneDark : lightTheme) });
});
obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
```

**主要 API**:
- `getCode()` → `view.state.doc.toString()`
- `setRunningMode(running)` → `container.hidden = running`（実行中は CM エディタを非表示）
- `#programNameEl.textContent` → サンプル選択時にプログラム名を更新（直接入力時はクリア）

**サンプルコード（17 種類）**:

```js
// グループ構成
{ label: '─ 探索 ─',                  keys: ['linearSearch', 'binarySearch'] },
{ label: '─ ソート（基本）─',          keys: ['bubbleSort', 'selectionSort'] },
{ label: '─ ソート（高度）─',          keys: ['quickSort', 'mergeSort'] },
{ label: '─ ソート（オブジェクト）─',   keys: ['sortByNumKey', 'sortByStrKey'] },
{ label: '─ 数学・アルゴリズム ─',     keys: ['euclidLoop', 'euclidRecursive', 'factorial', 'fibonacci', 'fibonacciDP'] },
{ label: '─ データ構造 ─',             keys: ['binaryTree', 'linkedList'] },
{ label: '─ スコープ・オブジェクト ─', keys: ['closure', 'classExample'] },
```

**エラー表示 API** (`showError(msg, errorType)`):

```js
showError(msg, errorType = null) {
  if (msg) {
    const typeLabel = errorType === 'parse'   ? '構文エラー'
                    : errorType === 'runtime' ? '実行エラー'
                    : null;
    this.#errorEl.innerHTML = typeLabel
      ? `<span class="error-badge">${typeLabel}</span> ${_esc(msg)}`
      : _esc(msg);
    this.#errorEl.dataset.errorType = errorType ?? '';
    this.#errorEl.hidden = false;
  } else {
    this.#errorEl.innerHTML = '';
    this.#errorEl.hidden = true;
  }
}
```

- `_esc(str)` — HTML エスケープヘルパー（`&`, `<`, `>`, `"` を実体参照に変換）
- `data-error-type` 属性で CSS スタイルを切り替え（`"parse"` 時は赤、`"runtime"` 時は橙背景）

---

### 4.4 `components/pane-resizer.js` ✅

**責務**: エディタペインと可視化ペインの境界をドラッグでリサイズする

```js
class PaneResizer {
  constructor(divider, mainEl, storageKey = 'jsv-editor-pct')
  // mousedown → mousemove: 幅を % で計算して CSS 変数更新
  // clamp: 15% 〜 75%
  // mouseup: localStorage に保存
}
```

**CSS 変数**: `.app-main { --editor-pct: 30; }`  
`.editor-pane { width: calc(var(--editor-pct) * 1%); }`  
`JS: mainEl.style.setProperty('--editor-pct', String(clamped));`

---

### 4.5 `components/settings-panel.js` ✅

**テーマ適用の仕組み**:
```
ライトテーマ（デフォルト）: <html> に data-theme 属性なし
ダークテーマ:              <html data-theme="dark">
```

**FOUC 防止スクリプト** (`web/index.html` `<head>` 内):
```html
<script>
  (function () {
    if (localStorage.getItem('jsv-theme') === 'dark') {
      document.documentElement.dataset.theme = 'dark';
    }
  }());
</script>
```

---

## 5. ディレクトリ構造とファイル一覧

```
JSVisualizer/
├── src/
│   ├── app.js                         ← エントリポイント・全体協調
│   ├── core/
│   │   ├── debugger-adapter.js        ← JSDebugger ラッパー・差分検出
│   │   ├── step-controller.js         ← 粒度別ステップ操作（10メソッド）
│   │   └── trace-builder.js           ← humanStepList・buildHeatmap・buildRecursionTree・buildLifetime・buildControlFlow
│   ├── utils/
│   │   └── format.js                  ← formatValue / flattenEnv / BUILTIN_NAMES / esc / formatFrameLabel / mergeScopesForDisplay
│   ├── views/
│   │   ├── base-view.js               ← BaseView 基底クラス
│   │   ├── code-view/
│   │   │   └── index.js              ✅ 3層ハイライト・setTrace()
│   │   ├── state-view/
│   │   │   └── index.js              ✅ 変数・スタック・コンソール統合
│   │   ├── scope-view/
│   │   │   └── index.js              ✅ スコープチェーン枠表示
│   │   ├── callstack-view/
│   │   │   └── index.js              ✅ コールスタックカード（slide-in）
│   │   ├── line-trace/
│   │   │   └── index.js              ✅ 行×変数マトリクス表（動的列追加）
│   │   ├── exec-trace/
│   │   │   └── index.js              ✅ 実行順トレース表（humanStep 順・変数列+条件列）
│   │   ├── trace-table/
│   │   │   └── index.js              ✅ 全ステップ静的テーブル
│   │   ├── animated-trace/
│   │   │   └── index.js              ✅ 動的行追記トレース（非アクティブ）
│   │   ├── bar-chart/
│   │   │   └── index.js              ✅ 棒グラフ CSS アニメーション
│   │   ├── color-box/
│   │   │   └── index.js              ✅ 色付き箱・ポインタ自動検出
│   │   ├── timeline/
│   │   │   └── index.js              ✅ 時系列 SVG 折れ線グラフ
│   │   ├── heatmap/
│   │   │   └── index.js              ✅ 実行頻度ヒートマップ
│   │   ├── recursion-tree/
│   │   │   └── index.js              ✅ 再帰ツリー SVG（引数展開表示・NODE_W=160/H=80）
│   │   ├── call-tree/
│   │   │   └── index.js              ✅ 全関数呼び出しツリー SVG（NODE_W=180/H=56）
│   │   ├── lifetime/
│   │   │   └── index.js              ✅ 変数ライフタイム SVG Gantt
│   │   ├── control-flow/
│   │   │   └── index.js              ✅ 制御フロー SVG フローチャート
│   │   ├── memory-view/
│   │   │   └── index.js              ✅ スタック/ヒープ + SVG 矢印
│   │   └── object-graph/
│   │       └── index.js              ✅ 力学的レイアウト SVG グラフ
│   └── components/
│       ├── code-editor.js             ← コードエディタ
│       ├── step-controls.js           ← ステップ操作バー（10ボタン）
│       ├── view-switcher.js           ← ビュー切り替えタブ（14ビュー登録 + keyboard/localStorage）
│       ├── pane-resizer.js             ← ペインリサイザー（editor/viz 幅変更・localStorage 永続化）
│       └── settings-panel.js          ← テーマ切り替え設定パネル
├── web/
│   ├── index.html                     ← FOUC防止スクリプト含む
│   ├── style.css                      ← ライト/ダークテーマ CSS（全ビュー含む）
│   ├── app.bundle.js                  ← esbuild 生成（git 管理外）
│   └── interpreter.bundle.js          ← esbuild 生成（git 管理外）
├── tests/
│   └── core/
│       ├── step-controller.test.js
│       ├── trace-builder.test.js
│       └── samples.test.js            ← 17サンプル全エラーなし・trace ≥ 1 を確認（66テスト中17件）
├── .github/
│   └── workflows/
│       └── deploy.yml                 ← GitHub Pages 自動デプロイ（CI/CD）
├── docs/
│   ├── functional-spec.md
│   ├── design.md
│   └── development-plan.md
├── CLAUDE.md
├── README.md
└── package.json
```

---

## 6. CSS 設計方針

### 6.1 テーマシステム

CSS カスタムプロパティで 2 テーマを管理する。

```css
/* ライトテーマ（デフォルト）: Catppuccin Latte ベース */
:root {
  --bg:           #eff1f5;
  --surface:      #e6e9ef;
  --surface2:     #ccd0da;
  --border:       #acb0be;
  --text:         #4c4f69;
  --text-muted:   #9ca0b0;
  --text-dim:     #6c6f85;
  --accent:       #1e66f5;
  --accent-bg:    #dde5fd;
  --changed:      #d20f39;
  --changed-bg:   #fce8ee;
  --access:       #fe640b;
  --compare:      #04a5e5;
  --sorted:       #40a02b;

  /* シンタックスハイライト */
  --tok-keyword:  #8839ef;
  --tok-string:   #40a02b;
  --tok-number:   #fe640b;
  --tok-comment:  #8c8fa1;

  /* 値の型色 */
  --v-num: #fe640b;  --v-str: #40a02b;  --v-bool: #04a5e5;
  --v-null: #9ca0b0; --v-undef: #9ca0b0; --v-fn: #8839ef; --v-obj: #df8e1d;

  /* ハイライト変数 */
  --hl-expr:     rgba(254, 100,  11, 0.18);
  --hl-expr-act: rgba(254, 100,  11, 0.32);
  --hl-call:     rgba(136,  57, 239, 0.12);
  --hl-call-act: rgba(136,  57, 239, 0.22);
  --hl-call-bdr: rgba(136,  57, 239, 0.55);
  --hl-orange:   #e86b4c;
}

/* ダークテーマ: Catppuccin Mocha ベース */
[data-theme="dark"] {
  --bg:           #1e1e2e;
  --surface:      #2a2a3e;
  --surface2:     #313244;
  /* ... */
  --hl-expr:     rgba(250, 179, 135, 0.30);
  --hl-expr-act: rgba(250, 179, 135, 0.45);
  --hl-call:     rgba(203, 166, 247, 0.20);
  --hl-call-act: rgba(203, 166, 247, 0.35);
  --hl-call-bdr: rgba(203, 166, 247, 0.70);
}
```

### 6.2 ビュー別 CSS クラス命名

各ビューは独立した BEM 風の接頭辞でクラスをスコープする。

| ビュー | 接頭辞 | 例 |
|--------|--------|---|
| code-view | `cv-` | `.cv-line`, `.cv-expr-highlight` |
| state-view | `sv-` | `.sv-card`, `.sv-var-group` |
| scope-view | `scv-` | `.scv-frame`, `.scv-frame--active` |
| callstack-view | `csv-` | `.csv-card`, `.csv-card--enter` |
| line-trace | `lt-` | `.lt-table`, `.lt-cell--changed` |
| trace-table | `tt-` | `.tt-row`, `.tt-row--active` |
| bar-chart | `bc-` | `.bc-bar`, `.bc-chip--active` |
| color-box | `cb-` | `.cb-box`, `.cb-box--ptr` |
| timeline | `tl-` | `.tl-svg`, `.tl-cursor` |
| heatmap | `hm-` | `.hm-line`, `.hm-line--active` |
| recursion-tree | `rt-` | `.rt-node--active`, `.rt-rect` |
| call-tree | `ct-` | `.ct-node--active`, `.ct-rect`, `.ct-label` |
| lifetime | `lf-` | `.lf-bar`, `.lf-cursor` |
| control-flow | `cf-` | `.cf-node--active`, `.cf-edge--back` |
| memory-view | `mv-` | `.mv-frame`, `.mv-arrows` |
| object-graph | `og-` | `.og-node`, `.og-edge` |

### 6.3 ハイライトオーバーレイ

```css
.cv-line-code {
  position: relative;
  isolation: isolate;
}

.cv-expr-highlight,
.cv-callsite-highlight {
  position: absolute;
  top: 0.1em;
  height: 1.35em;
  z-index: -1;
  pointer-events: none;
}

.cv-expr-highlight     { background: var(--hl-expr); }
.cv-callsite-highlight { background: var(--hl-call); border-bottom: 2px dashed var(--hl-call-bdr); }
```

### 6.4 フラッシュアニメーション

```css
@keyframes var-flash {
  0%   { background: var(--changed-bg); }
  100% { background: transparent; }
}
.var-row--changed { animation: var-flash var(--anim-flash) ease-out; }
```

### 6.5 エラーバッジ（Phase 6 追加）

```css
.error-msg {
  display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
}
.error-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 700;
  background: var(--changed);
  color: #fff;
}
.error-msg[data-error-type="runtime"] {
  background: color-mix(in srgb, var(--changed-bg), var(--surface) 30%);
}
```

- `data-error-type="parse"` → 赤バッジ（`--changed` カラー）
- `data-error-type="runtime"` → 橙背景（`--changed-bg` ベース）

### 6.6 RecursionTree 色覚多様性（Phase 6 追加）

```css
/* 未実行: 破線ボーダー + 薄い表示 */
.rt-node--future .rt-rect { stroke-dasharray: 5 3; opacity: 0.60; }

/* 実行中: 太線ボーダー + 太字テキスト */
.rt-node--active .rt-rect { stroke-width: 3; stroke-dasharray: none; }
.rt-node--active .rt-name { font-weight: 700; }

/* 完了: 通常ボーダー */
.rt-node--done .rt-rect { stroke-dasharray: none; }

/* 状態アイコン（右上角: …/▶/✓） */
.rt-state-icon { font-size: 10px; fill: var(--text-muted); }
.rt-node--active .rt-state-icon { fill: var(--accent); }
.rt-node--done   .rt-state-icon { fill: #4ce884; }
```

### 6.7 ControlFlow 戻りエッジ（Phase 6 確認）

```css
/* 戻りエッジ（ループバック）: 橙色の破線 */
.cf-edge--back {
  stroke: var(--hl-orange, #e86b4c);
  stroke-width: 2;
  stroke-dasharray: 6 3;
}
```

---

## 7. ビルド設定

```json
{
  "type": "module",
  "scripts": {
    "build:interp": "esbuild ../JSInterpreter/src/interpreter/debugger.js --bundle --format=esm --outfile=web/interpreter.bundle.js",
    "build:app":    "esbuild src/app.js --bundle --format=esm --outfile=web/app.bundle.js",
    "build":        "npm run build:interp && npm run build:app",
    "dev":          "npm run build:interp && esbuild src/app.js --bundle --format=esm --outfile=web/app.bundle.js --servedir=web --watch"
  }
}
```

> `interpreter.bundle.js` と `app.bundle.js` は `.gitignore` で管理外とする。

---

## 8. CI/CD パイプライン

### 8.1 GitHub Actions ワークフロー (`.github/workflows/deploy.yml`)

| ステップ | 内容 |
|---------|------|
| ① Checkout | `actions/checkout@v4` で JSVisualizer をチェックアウト |
| ② Clone JSInterpreter | `git clone https://github.com/tntetsu/JSInterpreter.git ../JSInterpreter`（`package.json` の `file:../JSInterpreter` 参照に合わせた配置） |
| ③ Node.js setup | `actions/setup-node@v4`（Node 20 + npm キャッシュ） |
| ④ Install deps | `npm ci` |
| ⑤ Test | `npm test`（Jest 66 テスト） |
| ⑥ Build | `npm run build`（esbuild で `web/` に成果物生成） |
| ⑦ Upload artifact | `actions/upload-pages-artifact@v3`（`web/` ディレクトリ） |
| ⑧ Deploy | `actions/deploy-pages@v4` |

**トリガー**: `main` ブランチへの push または `workflow_dispatch`（手動実行）

**同時実行制御**: `concurrency: { group: pages, cancel-in-progress: true }`

**権限**: `contents: read`, `pages: write`, `id-token: write`

**デプロイ URL**: `https://tntetsu.github.io/JSVisualizer/`

---

## 9. テスト方針

### 9.1 ユニットテスト（Jest / 66 件）

| 対象 | テストファイル | テスト数 | テスト内容 |
|------|-------------|---------|-----------|
| `trace-builder.js` | `tests/core/trace-builder.test.js` | 28 件 | `buildHeatmap`（4件）, `buildHumanIndices`（5件）, `getHumanStepList`（1件）, `buildRecursionTree`（4件）, `buildCallTree`（3件）, `buildLifetime`（5件）, `buildControlFlow`（7件）, その他 |
| `step-controller.js` | `tests/core/step-controller.test.js` | 21 件 | 粒度別ステップ（expr/stmt/human/call）の cursor 移動 |
| 17 サンプル | `tests/core/samples.test.js` | 17 件 | 全サンプルコードがエラーなく実行でき trace ≥ 1 を確認 |

**合計: 66 テスト**（`npm test` で全実行）

### 9.2 テスト実行コマンド

```bash
npm test               # 全テスト実行（66 件）
npm run test:watch     # ウォッチモード
```

> テストは必ず `npm test` 経由で実行すること（`"type": "module"` のため `--experimental-vm-modules` フラグが必要）

### 9.3 `buildRecursionTree` テスト設計

`callDepth` の変化でシミュレートするヘルパー `makeCallTrace(calls)` を使用:
- 1 回の呼び出し → 1 ルートノード
- 2 回の連続呼び出し → 2 ルートノード
- ネストした呼び出し → 子ノードとして追加

### 9.4 `buildLifetime` テスト設計

`humanStep` となる `ExpressionStatement.enter` + `env` を持つヘルパーイベント `humanEv(line, envChain, callDepth)` を使用:
- `BUILTIN_NAMES`（`console` 等）は含まない
- 異なる `callDepth` の同名変数は別エントリ

### 9.5 `buildControlFlow` テスト設計

- 通過した行のノード存在確認
- エッジの from/to ペア確認
- ループバック（同じ行への繰り返し遷移）でカウント増加確認
- `firstSeen` 順のソート確認
