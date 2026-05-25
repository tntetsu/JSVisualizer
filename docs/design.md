# 詳細設計書

**プロジェクト名**: JSVisualizer  
**バージョン**: 0.2  
**作成日**: 2026-05-25  
**最終更新**: 2026-05-25  
**作成者**: Tetsuo Tanaka

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 0.1 | 2026-05-25 | 初版 |
| 0.2 | 2026-05-25 | 実装済みモジュール（step-controller, trace-builder, code-view, state-view, animated-trace, trace-table, scope-view, callstack-view, settings-panel）の設計を実態に合わせて更新。CSS テーマシステム、ファイル構成を更新 |

---

## 1. システム全体構成

```
┌─────────────────────────────────────────────────────────────────┐
│  ブラウザ                                                        │
│                                                                 │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │  app.js  （全体協調・イベントバス）                          │ │
│  └──────┬──────────┬──────────────────┬───────────────────────┘ │
│         │          │                  │                         │
│  ┌──────▼──────┐ ┌─▼─────────────┐ ┌─▼────────────────┐        │
│  │  components/ │ │  core/         │ │  views/           │        │
│  │  ─────────── │ │  ───────────── │ │  ───────────────  │        │
│  │  code-editor │ │  debugger-     │ │  code-view  ✅    │        │
│  │  step-       │ │  adapter       │ │  state-view ✅    │        │
│  │  controls    │ │  step-         │ │  animated-  ✅    │        │
│  │  view-       │ │  controller    │ │  trace             │        │
│  │  switcher    │ │  trace-builder │ │  trace-     ✅    │        │
│  │  settings-   │ └────────┬───────┘ │  table             │        │
│  │  panel       │          │         │  scope-view ✅    │        │
│  └─────────────┘          │         │  callstack- ✅    │        │
│                            │         │  view              │        │
│                            │         │  (開発予定...) 🔧 │        │
│                            │         └──────────────────┘        │
│  ┌─────────────────────────▼─────────────────────────────────┐  │
│  │  interpreter.bundle.js                                      │  │
│  │  （JSInterpreter を esbuild でバンドル）                     │  │
│  │  JSDebugger / trace[] / TraceEvent                          │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
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
  new TraceBuilder(trace)    → 事前集計データを生成
  switcher.onReady(state, builder)  → アクティブビューを再マウント
  codeView.setSource(source) → コード行を描画
  codeView.setTrace(trace)   → callSiteEndMap を構築
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

---

## 2. モジュール詳細設計

### 2.1 `src/core/debugger-adapter.js`

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
 * @property {Object[]}         scopes       env[] スコープチェーン
 * @property {Object[]}         callStack    getCallStack() の結果
 * @property {string[]}         changedVars  前ステップから変化した変数名
 * @property {Object[]}         consoleOutput getConsoleOutput() の結果
 * @property {boolean}          done         isDone()
 */
```

---

### 2.2 `src/core/step-controller.js`

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

### 2.3 `src/core/trace-builder.js`

**責務**: trace 配列を一度だけ走査して各ビューが必要な集計データを生成

実装済み API:

```js
class TraceBuilder {
  #trace          // TraceEvent[]（コンストラクタで受け取り）
  #humanStepList  // number[]（humanStep に対応する cursor 値）

  constructor(trace) { /* humanStepList を構築 */ }

  /** humanStep に対応する cursor 値の昇順配列を返す */
  getHumanStepList()  { return this.#humanStepList; }

  /** 生の trace 配列への参照を返す（read-only） */
  get trace()         { return this.#trace; }
}
```

> 今後のビューで必要になる `buildHeatmap()`, `buildLifetime()`, `buildRecursionTree()` 等は
> 各ビューの実装時に追加する。

---

### 2.4 ビューの共通インターフェース

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

### 2.5 各ビューの実装詳細

#### `code-view/` — コードハイライト（3層）✅

**構造**:
```
CodeView
├── #linesEl (.cv-lines)     ← 行要素コンテナ
│   ├── .cv-line[data-line="1"]
│   │   ├── .cv-line-num     ← 行番号
│   │   └── .cv-line-code    ← ハイライト済みコード（position: relative）
│   │       ├── [syntax spans]
│   │       ├── .cv-expr-highlight     ← 式ハイライト（position: absolute）
│   │       └── .cv-callsite-highlight ← 呼び出し元ハイライト（同上）
│   └── ...
├── #exprHighlightEls[]      ← 現在の式ハイライト要素を追跡
├── #callSiteHighlightEls[]  ← 現在の呼び出し元ハイライト要素を追跡
└── #callSiteEndMap          ← Map<"line:col", {line, column}>
```

**公開 API**:
- `init(container)` — `.cv-lines` 要素を生成してマウント
- `setSource(source)` — シンタックスハイライト付きで行を描画
- `setTrace(trace)` — `CallExpression.enter` イベントから `callSiteEndMap` を構築
- `update(state)` — 3層ハイライトを更新
- `reset()` — 全ハイライトをクリア

**ハイライト配置の仕組み**:
```
.cv-line-code { position: relative; isolation: isolate; }
.cv-expr-highlight, .cv-callsite-highlight {
  position: absolute;
  left:  calc(startCh * 1ch);   /* JS で style.left に設定 */
  width: calc(lengthCh * 1ch);  /* JS で style.width に設定 */
  z-index: -1;                  /* isolation: isolate の中で文字の背後に */
}
```

**呼び出し元 end 位置の取得フロー**:
```
setTrace(trace) で CallExpression.enter イベントを走査
  → key = "loc.line:loc.column"
  → value = ev.end
  → callSiteEndMap に格納

update(state) で callStack.length > 0 の場合:
  → topFrame = callStack[0]
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
4. **コンソール出力** — `console.log` の出力行

---

#### `animated-trace/` — アニメーション付きトレース表 ✅

**動作**:
- `init()` で空テーブルを生成
- `update(state)` で `humanStepList` から `targetCount`（cursor 以下の humanStep 数）を計算
  - `targetCount > rows.length` → 新行を `<tbody>` の先頭に挿入（`.at-row--new` クラス → CSS slide-in）
  - `targetCount < rows.length` → 末尾行を削除（ステップバック対応）

**テーブル列**: # | 行 | イベント | 値

---

#### `trace-table/` — 全ステップ表 ✅

**動作**:
- `init()` で `builder.getHumanStepList()` の全行を一括描画
- `update()` は `tt-row--active` クラスの付け替えとスクロールのみ

---

#### `scope-view/` — スコープ・変数ビュー ✅

**DOM 構造**:
```html
<div class="scv-frame scv-frame--active">
  <div class="scv-frame-header">
    <span class="scv-frame-name">fib</span>
    <span class="scv-frame-badge">内側</span>
  </div>
  <div class="scv-vars">
    <div class="var-row"> n = <span class="v-num">3</span> </div>
  </div>
</div>
```

最内側フレームに `.scv-frame--active`（アクセントボーダー＋背景色）を付与。

---

#### `callstack-view/` — コールスタックビュー ✅

**DOM 構造**:
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
- グローバルカードは常に末尾に配置

---

## 3. コンポーネント設計

### 3.1 `components/step-controls.js` ✅

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

### 3.2 `components/view-switcher.js` ✅

**状態**:
- `#registry: Map<id, { label, ViewClass, instance }>` — 登録されたビュー
- `#activeId: string | null` — 現在アクティブなビューの ID
- `#builder: TraceBuilder | null` — 最新の TraceBuilder
- `#lastState: AppState | null` — 最新の AppState

**重要メソッド**:

```js
register(id, label, ViewClass)
// タブボタンを生成して registry に登録

onReady(state, builder)
// 毎回アクティブビューを destroy → 再 init する
// → ビューは常に最新の builder を持つことが保証される
// コード:
//   entry.instance.destroy(); entry.instance = null;
//   mountView(activeId);

update(state)
// アクティブビューの update(state) を呼ぶ

reset()
// 全 instance を destroy して null にする
```

---

### 3.3 `components/settings-panel.js` ✅

**責務**: テーマ切り替え UI を提供し、設定を localStorage に永続化する

**テーマ適用の仕組み**:
```
ライトテーマ（デフォルト）: <html> に data-theme 属性なし
ダークテーマ:              <html data-theme="dark">
```

**公開関数**:
```js
applyTheme(theme)   // 'light' | 'dark' → <html> data-theme を更新
loadTheme()         // localStorage から読み込み（未設定なら 'light'）
```

**クラス**:
```js
class SettingsPanel {
  constructor(btnEl, panelEl)  // 初期化・イベント登録・保存済みテーマ適用
  // 内部: #open(), #close(), #syncRadios(theme), #bindEvents()
}
```

**イベント処理**:
- 設定ボタンクリック → パネルのトグル（開閉）
- パネル外クリック / `Escape` キー → パネルを閉じる
- ラジオボタン変更 → `localStorage` 保存 + `applyTheme()` 呼び出し

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

## 4. ディレクトリ構造とファイル一覧

```
JSVisualizer/
├── src/
│   ├── app.js                      ← エントリポイント・全体協調
│   ├── core/
│   │   ├── debugger-adapter.js     ← JSDebugger ラッパー・差分検出
│   │   ├── step-controller.js      ← 粒度別ステップ操作（10メソッド）
│   │   └── trace-builder.js        ← humanStepList・trace getter
│   ├── views/
│   │   ├── code-view/
│   │   │   └── index.js            ← 3層ハイライト・setTrace()
│   │   ├── state-view/
│   │   │   └── index.js            ← 変数・スタック・コンソール統合
│   │   ├── animated-trace/
│   │   │   └── index.js            ← 動的行追記トレース表
│   │   ├── trace-table/
│   │   │   └── index.js            ← 全ステップ静的テーブル
│   │   ├── scope-view/
│   │   │   └── index.js            ← スコープチェーン枠表示
│   │   ├── callstack-view/
│   │   │   └── index.js            ← コールスタックカード表示
│   │   ├── bar-chart/              ← [未実装]
│   │   ├── color-box/              ← [未実装]
│   │   ├── timeline/               ← [未実装]
│   │   ├── heatmap/                ← [未実装]
│   │   ├── recursion-tree/         ← [未実装]
│   │   ├── lifetime/               ← [未実装]
│   │   ├── control-flow/           ← [未実装]
│   │   ├── memory-view/            ← [未実装]
│   │   └── object-graph/           ← [未実装]
│   └── components/
│       ├── code-editor.js          ← コードエディタ
│       ├── step-controls.js        ← ステップ操作バー（10ボタン）
│       ├── view-switcher.js        ← ビュー切り替えタブ
│       └── settings-panel.js       ← テーマ切り替え設定パネル
├── web/
│   ├── index.html                  ← FOUC防止スクリプト含む
│   ├── style.css                   ← ライト/ダークテーマ CSS
│   ├── app.bundle.js               ← esbuild 生成（git 管理外）
│   └── interpreter.bundle.js       ← esbuild 生成（git 管理外）
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

### 5.1 テーマシステム

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

  /* ハイライト変数（テーマ依存） */
  --hl-expr:     rgba(254, 100,  11, 0.18);  /* 式ハイライト */
  --hl-expr-act: rgba(254, 100,  11, 0.32);  /* アクティブ行の式ハイライト */
  --hl-call:     rgba(136,  57, 239, 0.12);  /* 呼び出し元ハイライト */
  --hl-call-act: rgba(136,  57, 239, 0.22);  /* アクティブ行の呼び出し元ハイライト */
  --hl-call-bdr: rgba(136,  57, 239, 0.55);  /* 呼び出し元ハイライトの破線色 */
}

/* ダークテーマ: Catppuccin Mocha ベース */
[data-theme="dark"] {
  --bg:           #1e1e2e;
  --surface:      #2a2a3e;
  --surface2:     #313244;
  --border:       #44475a;
  --text:         #cdd6f4;
  --text-muted:   #6c7086;
  --text-dim:     #a6adc8;
  --accent:       #89b4fa;
  --accent-bg:    #1a2a45;
  /* ...（全変数をオーバーライド）... */

  --hl-expr:     rgba(250, 179, 135, 0.30);
  --hl-expr-act: rgba(250, 179, 135, 0.45);
  --hl-call:     rgba(203, 166, 247, 0.20);
  --hl-call-act: rgba(203, 166, 247, 0.35);
  --hl-call-bdr: rgba(203, 166, 247, 0.70);
}
```

### 5.2 ハイライトオーバーレイ

式ハイライトと呼び出し元ハイライトは `position: absolute` + モノスペースフォントの `1ch` 単位で配置する。

```css
.cv-line-code {
  position: relative;
  isolation: isolate;   /* z-index スタッキングコンテキストを作成 */
}

.cv-expr-highlight,
.cv-callsite-highlight {
  position: absolute;
  top: 0.1em;
  height: 1.35em;
  z-index: -1;           /* isolation により文字の背後に配置 */
  pointer-events: none;
  /* left / width は JS 側で calc(N * 1ch) を設定 */
}

.cv-expr-highlight     { background: var(--hl-expr); }
.cv-callsite-highlight { background: var(--hl-call); border-bottom: 2px dashed var(--hl-call-bdr); }
```

### 5.3 フラッシュアニメーション

```css
@keyframes var-flash {
  0%   { background: var(--changed-bg); }
  100% { background: transparent; }
}
.var-row--changed { animation: var-flash var(--anim-flash) ease-out; }
```

---

## 6. ビルド設定

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

## 7. テスト方針

| 対象 | 方針 |
|------|------|
| `debugger-adapter.js` | load/moveTo の副作用、diff 検出のユニットテスト |
| `step-controller.js` | 粒度別ステップ（expr/stmt/human/call）の cursor 移動のユニットテスト |
| `trace-builder.js` | `getHumanStepList()` の集計結果のユニットテスト |
| 各ビュー | jsdom + Jest による DOM 更新のスナップショットテスト（主要ビューのみ） |
| E2E | 手動テスト（自動化は Phase 5 以降） |
