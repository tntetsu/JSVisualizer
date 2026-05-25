# 詳細設計書

**プロジェクト名**: JSVisualizer  
**バージョン**: 0.1 (ドラフト)  
**作成日**: 2026-05-25  
**作成者**: Tetsuo Tanaka

---

## 1. システム全体構成

```
┌─────────────────────────────────────────────────────────────┐
│  ブラウザ                                                    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  app.js  （全体協調・イベントバス）                    │  │
│  └──────┬──────────┬──────────────────┬─────────────────┘  │
│         │          │                  │                     │
│  ┌──────▼──────┐ ┌─▼─────────────┐ ┌─▼────────────────┐   │
│  │  components/ │ │  core/         │ │  views/           │   │
│  │  ─────────── │ │  ───────────── │ │  ───────────────  │   │
│  │  code-editor │ │  debugger-     │ │  各ビュー         │   │
│  │  step-       │ │  adapter       │ │  （共通 I/F）     │   │
│  │  controls    │ │  step-         │ │                   │   │
│  │  view-       │ │  controller    │ │                   │   │
│  │  switcher    │ │  trace-builder │ │                   │   │
│  └─────────────┘ └────────┬───────┘ └──────────────────┘   │
│                            │                                 │
│  ┌─────────────────────────▼───────────────────────────┐   │
│  │  interpreter.bundle.js                               │   │
│  │  （JSInterpreter を esbuild でバンドル）              │   │
│  │  JSDebugger / trace[] / TraceEvent                   │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 データフロー

```
ユーザーがコード入力
        │
        ▼
debugger-adapter.js
  new JSDebugger(source)
  ────────────────────
  → trace[]（全ステップ記録）
  → consoleLogs[]
        │
        ▼
trace-builder.js
  trace[] を事前解析
  ────────────────────
  → heatmapData（行ごと実行回数）
  → lifetimeData（変数ライフタイム）
  → recursionData（再帰ツリー構造）
  → controlFlowData（CFG ノード）
        │
        ▼
step-controller.js
  cursor の管理・粒度別ステップ
        │
ステップ変化イベント（カスタムイベント）
        │
        ├──▶ code-view → 行ハイライト更新
        ├──▶ animated-trace → 行追記
        ├──▶ scope-view → 枠再描画
        ├──▶ callstack-view → カード更新
        ├──▶ bar-chart → 棒高さ更新
        ├──▶ color-box → 色更新
        ├──▶ timeline → 現在ステップ線移動
        ├──▶ heatmap → （静的：変化なし）
        ├──▶ recursion-tree → ノードハイライト
        ├──▶ lifetime → 現在ステップ線移動
        ├──▶ control-flow → ブロックハイライト
        ├──▶ memory-view → セル生成・解放
        └──▶ object-graph → ノード更新
```

---

## 2. モジュール詳細設計

### 2.1 `src/core/debugger-adapter.js`

**責務**: JSDebugger のライフサイクル管理・状態の正規化・差分検出

```js
class DebuggerAdapter extends EventTarget {
  // ── フィールド ──────────────────────────────────────────────
  #debugger = null         // JSDebugger インスタンス
  #prevEnv  = null         // 前ステップの env スナップショット

  // ── 公開 API ──────────────────────────────────────────────
  /**
   * コードをコンパイルして全ステップを記録する
   * 成功時に 'ready' イベントを dispatch
   * @param {string} source
   */
  load(source) { ... }

  /**
   * cursor を移動して状態を更新する
   * 'step' イベントを dispatch（payload = AppState）
   * @param {number} nextCursor
   */
  moveTo(nextCursor) { ... }

  /**
   * 正規化された現在状態を返す
   * @returns {AppState}
   */
  getState() { ... }

  /**
   * trace-builder 用の全トレースデータを返す
   * @returns {TraceEvent[]}
   */
  getTrace() { ... }
}

/**
 * @typedef {Object} AppState
 * @property {number}      cursor        現在の cursor 値
 * @property {number}      totalSteps    trace.length
 * @property {TraceEvent|null} event     現在の TraceEvent
 * @property {Object}      variables     getVariables('all') の結果
 * @property {Object[]}    scopes        env[] スコープチェーン
 * @property {Object[]}    callStack     getCallStack() の結果
 * @property {string[]}    changedVars   前ステップから変化した変数名の配列
 * @property {Object[]}    consoleOutput getConsoleOutput() の結果
 * @property {boolean}     done          isDone()
 */
```

**差分検出の実装**:
```js
function detectChanges(prevEnv, currEnv) {
  const changed = new Set();
  // スコープチェーンをフラット化して比較
  for (const [name, val] of Object.entries(flattenEnv(currEnv))) {
    if (!deepEqual(val, flattenEnv(prevEnv)[name])) {
      changed.add(name);
    }
  }
  return [...changed];
}
```

---

### 2.2 `src/core/step-controller.js`

**責務**: 粒度別ステップ操作を統一インターフェースで提供

```js
class StepController {
  #adapter    // DebuggerAdapter
  #granularity = 'human'  // 'expr' | 'stmt' | 'func' | 'human'

  setGranularity(g) { this.#granularity = g; }

  stepForward() {
    switch (this.#granularity) {
      case 'expr':  this.#stepExpr();  break;
      case 'stmt':  this.#stepStmt();  break;
      case 'func':  this.#stepFunc();  break;
      case 'human': this.#stepHuman(); break;
    }
  }
  stepBackward() { ... }  // 各粒度の逆方向
  goToStart()    { this.#adapter.moveTo(0); }
  goToEnd()      { this.#adapter.moveTo(this.#adapter.getTrace().length); }
  jumpTo(cursor) { this.#adapter.moveTo(cursor); }
}
```

**粒度と JSDebugger API の対応**:

| 粒度 | forward | backward |
|------|---------|----------|
| `expr` | `debugger.stepIn()` → `moveTo(cursor+1)` | `moveTo(cursor-1)` |
| `stmt` | `debugger.stepOver()` → `moveTo(matchIdx)` | matchIdx の逆引きで `moveTo` |
| `func` | `debugger.stepOut()` → `moveTo(outIdx)` | 逆方向 callDepth 追跡 |
| `human` | `debugger.humanStep()` → `moveTo(humanIdx)` | `debugger.humanStepBack()` |

---

### 2.3 `src/core/trace-builder.js`

**責務**: trace 配列を一度だけ走査して各ビューが必要な集計データを生成

```js
class TraceBuilder {
  /**
   * @param {TraceEvent[]} trace
   */
  constructor(trace) { ... }

  /** 行ごとの実行回数 Map<lineNo, count> */
  buildHeatmap() { ... }

  /**
   * 変数ライフタイム情報
   * @returns {LifetimeEntry[]}
   * @typedef {{ name, scopeId, birthCursor, deathCursor }} LifetimeEntry
   */
  buildLifetime() { ... }

  /**
   * 再帰ツリーノード配列
   * @returns {RecursionNode[]}
   * @typedef {{ id, funcName, args, parentId, enterCursor, exitCursor, returnValue }} RecursionNode
   */
  buildRecursionTree() { ... }

  /**
   * 制御フローグラフ（AST 解析から生成）
   * @returns {CFGNode[]}
   */
  buildControlFlow(ast) { ... }

  /**
   * humanStep インデックスの Set
   * @returns {Set<number>}
   */
  buildHumanIndices() { ... }
}
```

---

### 2.4 ビューの共通インターフェース

全ビューが実装する抽象クラス:

```js
class BaseView {
  /**
   * @param {HTMLElement} container マウント先 DOM 要素
   * @param {TraceBuilder} builder  事前集計データへのアクセス
   */
  init(container, builder) { throw new Error('not implemented'); }

  /**
   * ステップ変化時に呼ばれる
   * @param {AppState} state  現在の状態
   */
  update(state) { throw new Error('not implemented'); }

  /** 状態を初期化（コード再実行時） */
  reset() { throw new Error('not implemented'); }

  /** DOM をアンマウント（ビュー非表示時） */
  destroy() { throw new Error('not implemented'); }
}
```

---

### 2.5 各ビューの実装方針

#### V-01: `animated-trace/`

```
データ構造:
  rows: Array<{ cursor, label, varSnapshot }>
  ─ cursor 進行ごとに push
  ─ 変化したセルに .flash クラスを付与 → CSS で 0.4s フラッシュ

DOM 構造:
  <table class="animated-trace">
    <thead>  変数名ヘッダ行（列選択チェックボックス付き） </thead>
    <tbody>  ステップ行（動的追記） </tbody>
  </table>
```

#### V-02: `trace-table/`

```
データ構造:
  全 humanStep インデックスのみ行化
  builder.buildHumanIndices() を使用

DOM 構造:
  V-01 と同様だが全行が初期描画済み・現在行を CSS でハイライト
```

#### V-03: `scope-view/`

```
DOM 構造:
  <div class="scope-chain">
    <div class="scope-frame" data-name="global">
      <div class="var-row"> x = <span class="v-num">5</span> </div>
      <div class="scope-frame" data-name="foo">
        ...
      </div>
    </div>
  </div>

更新ロジック:
  state.scopes を env[] から生成
  前回の DOM と diffing（変数ノードのみ更新）
  changedVars に含まれる変数名に .changed クラス → CSS フラッシュ
```

#### V-04: `callstack-view/`

```
DOM 構造:
  <div class="call-stack">
    <div class="frame frame-top"> fib(n=3) ▸ line 2 </div>
    <div class="frame"> fib(n=4) ▸ line 4 </div>
    ...
    <div class="frame frame-global"> (global) </div>
  </div>

アニメーション:
  push → translateY(100%) から 0 へ（slide-in-up）
  pop  → translateY(-100%) かつ opacity:0 へ（fade-up）
```

#### V-05: `bar-chart/`

```
DOM 構造:
  <div class="bar-chart">
    <div class="bar-wrap" data-name="arr[0]">
      <div class="bar" style="height: calc(var(--val) * 1%)"></div>
      <span class="bar-label">0</span>
    </div>
    ...
  </div>

CSS:
  .bar { transition: height 0.3s ease; }
  高さ = (値 / maxValue) * 100%（maxValue は全ステップで集計）
```

#### V-06: `color-box/`

```
DOM 構造:
  <div class="color-boxes">
    <div class="index-row"> 0  1  2  3  4  5  6 </div>
    <div class="box-row">
      <div class="box" data-idx="0">6</div>
      ...
    </div>
    <div class="pointer-row"> ↑i        ↑j </div>
  </div>

色クラス:
  .box-access     オレンジ（現在アクセス中）
  .box-compare    青（比較対象）
  .box-sorted     緑（確定済み）
  .box-default    デフォルト

インデックス検出:
  nodeType=MemberExpression かつ property が変数 → 対応 idx をハイライト
```

#### V-07: `timeline/`（変数の時系列グラフ）

```
実装: SVG

描画ロジック:
  1. builder の全 humanStep で対象変数の値を収集
  2. SVG polyline を生成（点 = (step_idx, value)）
  3. update() で現在ステップに対応する x 位置に縦線を移動

SVG 構造:
  <svg>
    <g class="axes"> 軸線・目盛り </g>
    <g class="lines">
      <polyline class="var-line" data-name="n" points="..."/>
      ...
    </g>
    <line class="current-step-line" x1="..." .../>
  </svg>
```

#### V-08: `heatmap/`

```
実装: コードビューのオーバーレイ

描画ロジック:
  1. builder.buildHeatmap() で Map<line, count> 取得
  2. count の最大値に対して [0..1] に正規化
  3. 各行要素に background: rgba(255, 80, 0, opacity) を設定
  4. ホバーで <tooltip> に実行回数表示
```

#### V-09: `recursion-tree/`

```
実装: SVG + 再帰的レイアウト（Reingold-Tilford アルゴリズムの簡易版）

データ:
  builder.buildRecursionTree() → RecursionNode[]

描画ロジック:
  1. 初回: 全ノードを先読みして木構造を構築・座標計算
  2. update(): enterCursor <= cursor <= exitCursor のノードを "active" クラス
               exitCursor <= cursor のノードに retVal ラベルを表示

SVG 構造:
  <svg>
    <g class="edges"> <line> ... </g>
    <g class="nodes">
      <g class="node" data-id="...">
        <circle/>
        <text class="label">fib(3)</text>
        <text class="retval">→ 2</text>
      </g>
      ...
    </g>
  </svg>
```

#### V-10: `lifetime/`（スコープ・ライフタイムタイムライン）

```
実装: SVG ガントチャート

データ:
  builder.buildLifetime() → LifetimeEntry[]

描画ロジック:
  1. 縦軸: 変数名（スコープ別グループ）
  2. 横軸: humanStep ステップ数
  3. 各変数の [birthCursor, deathCursor] を横バーで描画
  4. update(): 現在ステップに縦線を描画
```

#### V-11: `control-flow/`

```
実装: SVG

データ:
  builder.buildControlFlow(ast) → CFGNode[]

CFGNode の種類:
  - start / end
  - statement（一般文）
  - condition（if / while / for 条件式）
  - block（then / else / loop body）
  - merge（分岐合流点）

描画ロジック:
  1. CFGNode を上→下にレイアウト
  2. 条件ノードはダイヤモンド形、分岐はY→N の2本の辺
  3. update(): loc がノードに含まれるものを .active クラスに
               通過済みの辺に .visited クラス（青色）
```

#### V-12: `memory-view/`

```
DOM 構造:
  <div class="memory-view">
    <div class="stack-area">
      <div class="stack-frame" data-depth="2">
        <div class="frame-label">fib(n=3)</div>
        <div class="cell" data-name="n">n = 3</div>
        <div class="cell ref" data-name="arr" data-heap-id="h1">arr ●</div>
      </div>
      ...
    </div>
    <div class="heap-area">
      <div class="heap-object" data-id="h1">
        [6, 5, 4, 1, 0, 2, 3]
      </div>
    </div>
  </div>
  <svg class="ref-arrows"> ... </svg>

アニメーション:
  セル生成: scale(0) → scale(1)（0.2s）
  セル消滅: opacity:1 → opacity:0（0.2s）
  参照矢印: SVG path、beginElement() で再描画
```

#### V-13: `object-graph/`

```
実装: SVG + Force-directed レイアウト（簡易実装）

ノード種別:
  - 変数（プリミティブ）: 矩形テキスト
  - オブジェクト: 角丸矩形 + プロパティリスト
  - 配列: 横並び矩形

エッジ:
  - 参照: 実線矢印
  - 配列インデックス: インデックスラベル付き矢印

更新:
  env の変化に応じてノード/エッジの追加・削除
  変化したノードを 0.3s ハイライト
```

---

## 3. コンポーネント設計

### 3.1 `components/step-controls.js`

```
DOM 構造:
  <div class="step-controls">
    <button id="btn-start">⏮</button>
    <button id="btn-back">◀</button>
    <select id="granularity-select">
      <option value="expr">式評価</option>
      <option value="stmt">文評価</option>
      <option value="func">関数呼び出し</option>
      <option value="human" selected>人にやさしい単位</option>
    </select>
    <button id="btn-forward">▶</button>
    <button id="btn-end">⏭</button>
    <input type="range" id="step-slider" min="0" max="...">
    <span id="step-counter">42 / 891</span>
  </div>

キーボードバインド:
  Home → goToStart()
  End  → goToEnd()
  ← / b → stepBackward()
  → / n → stepForward()
```

### 3.2 `components/view-switcher.js`

```
DOM 構造:
  <div class="view-tabs">
    <button class="tab" data-view="animated-trace">トレース表</button>
    <button class="tab" data-view="trace-table">静的テーブル</button>
    ...
  </div>
  <div id="view-container">
    <!-- アクティブなビューの DOM が入る -->
  </div>

状態:
  activeViews: Map<viewId, BaseView>
  ビュー切り替え時に前ビューの destroy() → 新ビューの init() を呼ぶ
```

---

## 4. ディレクトリ構造とファイル一覧

```
JSVisualizer/
├── src/
│   ├── app.js
│   ├── core/
│   │   ├── debugger-adapter.js
│   │   ├── step-controller.js
│   │   └── trace-builder.js
│   ├── views/
│   │   ├── base-view.js              ← 抽象基底クラス
│   │   ├── code-view/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── animated-trace/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── trace-table/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── scope-view/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── callstack-view/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── bar-chart/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── color-box/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── timeline/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── heatmap/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── recursion-tree/
│   │   │   ├── index.js
│   │   │   ├── layout.js             ← ツリーレイアウトアルゴリズム
│   │   │   └── style.css
│   │   ├── lifetime/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   ├── control-flow/
│   │   │   ├── index.js
│   │   │   ├── cfg-builder.js        ← AST → CFGNode 変換
│   │   │   └── style.css
│   │   ├── memory-view/
│   │   │   ├── index.js
│   │   │   └── style.css
│   │   └── object-graph/
│   │       ├── index.js
│   │       ├── layout.js             ← Force-directed レイアウト
│   │       └── style.css
│   └── components/
│       ├── code-editor.js
│       ├── step-controls.js
│       └── view-switcher.js
├── web/
│   ├── index.html
│   ├── style.css                     ← グローバルスタイル・CSS カスタムプロパティ
│   └── interpreter.bundle.js         ← esbuild 生成（git 管理外）
├── tests/
│   ├── core/
│   │   ├── debugger-adapter.test.js
│   │   ├── step-controller.test.js
│   │   └── trace-builder.test.js
│   └── views/
│       └── (各ビューの単体テスト)
├── docs/
│   ├── functional-spec.md
│   ├── design.md
│   └── development-plan.md
├── CLAUDE.md
├── README.md
└── package.json
```

---

## 5. CSS 設計方針

```css
/* CSS カスタムプロパティによるテーマ管理 */
:root {
  --color-bg:           #1e1e2e;
  --color-surface:      #2a2a3e;
  --color-border:       #44475a;
  --color-text:         #cdd6f4;
  --color-accent:       #89b4fa;  /* 現在行ハイライト */
  --color-changed:      #f38ba8;  /* 変化した変数 */
  --color-access:       #fab387;  /* 配列アクセス（オレンジ） */
  --color-compare:      #89dceb;  /* 比較対象（青） */
  --color-sorted:       #a6e3a1;  /* 確定済み（緑） */

  --anim-flash:         0.4s;
  --anim-slide:         0.2s;
}

/* フラッシュアニメーション */
@keyframes cell-flash {
  0%   { background-color: var(--color-changed); }
  100% { background-color: transparent; }
}
.flash { animation: cell-flash var(--anim-flash) ease-out; }
```

---

## 6. ビルド設定

```json
// package.json（抜粋）
{
  "type": "module",
  "scripts": {
    "build:interp": "esbuild ../JSInterpreter/src/interpreter/debugger.js --bundle --format=esm --outfile=web/interpreter.bundle.js",
    "build:app":    "esbuild src/app.js --bundle --format=esm --outfile=web/app.bundle.js --external:./interpreter.bundle.js",
    "build":        "npm run build:interp && npm run build:app",
    "dev":          "npm run build:interp && esbuild src/app.js --bundle --format=esm --outfile=web/app.bundle.js --servedir=web --watch"
  },
  "devDependencies": {
    "esbuild": "^0.21.0",
    "jest":    "^29.0.0"
  }
}
```

---

## 7. テスト方針

| 対象 | 方針 |
|------|------|
| `debugger-adapter.js` | load/moveTo の副作用、diff 検出のユニットテスト |
| `step-controller.js` | 粒度別ステップの cursor 移動のユニットテスト |
| `trace-builder.js` | heatmap/lifetime/recursionTree の集計結果のユニットテスト |
| 各ビュー | jsdom + Jest による DOM 更新のスナップショットテスト（主要ビューのみ） |
| E2E | 手動テスト（自動化は Phase 5 以降） |
