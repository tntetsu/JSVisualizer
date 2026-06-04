# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業する際のガイドです。

## プロジェクト概要

**JSVisualizer** は、JavaScript プログラムの実行過程をインタラクティブに可視化する教育用 Web アプリケーションです。  
[JSInterpreter](../JSInterpreter) の `JSDebugger` API をコアエンジンとして使用し、式・文・関数呼び出しの各粒度でのステップ実行と、13 種類の可視化ビューを提供します。  
GitHub Pages でホストされ、main ブランチへの push で自動デプロイされます。

対象ユーザーはプログラミング入門〜中級の学習者および教員です。

## リポジトリ構成

```
JSVisualizer/
├── .github/
│   └── workflows/
│       └── deploy.yml            # main push → GitHub Pages 自動デプロイ
├── src/
│   ├── core/
│   │   ├── debugger-adapter.js   # JSDebugger ラッパー・差分検出・エラー種別判定
│   │   ├── step-controller.js    # ステップ粒度の統合管理（4粒度×前後 + start/end）
│   │   └── trace-builder.js      # 全トレースデータの事前集計（6メソッド）
│   ├── views/                    # 各可視化ビュー（共通 I/F: init/update/reset/destroy）
│   │   ├── code-view/            # コードハイライト（3層: 行・式・呼び出し元）       ✅
│   │   ├── state-view/           # 変数・コールスタック統合パネル（Console は常時パネルへ移動）✅
│   │   ├── scope-view/           # スコープ・変数ビュー（ネスト枠）  ← タブ登録なし（非アクティブ）
│   │   ├── callstack-view/       # コールスタックビュー              ← タブ登録なし（非アクティブ）
│   │   ├── line-trace/           # トレース表（行番号+スニペット列+変数表・列表示切替・D&D）  ✅  ← タブ「トレース表」
│   │   ├── exec-trace/           # 実行順トレース表（humanStep 順・変数列+条件列）          ✅  ← タブ「実行トレース」
│   │   ├── trace-table/          # 静的トレース表（全ステップ・対象列付き）               ✅  ← タブ「全ステップ」
│   │   ├── bar-chart/            # 棒グラフアニメーション（数値・配列変化）         ✅
│   │   ├── color-box/            # 配列アニメーション（複数配列同時表示・ポインタ別行）✅  ← タブ「配列」
│   │   ├── timeline/             # 変数の時系列グラフ（SVG折れ線・変数選択時Y軸動的更新）✅
│   │   ├── heatmap/              # 実行頻度ヒートマップ（連結線常時表示）            ✅
│   │   ├── recursion-tree/       # 再帰呼び出しツリー（SVG・引数展開表示）                ✅
│   │   ├── call-tree/            # 全関数呼び出しツリー（SVG・再帰に限らない）            ✅  ← タブ「呼び出しツリー」
│   │   ├── lifetime/             # 変数ライフタイム Gantt チャート（SVG）                ✅
│   │   ├── control-flow/         # 制御フロービュー（SVG フローチャート）           ✅
│   │   ├── memory-view/          # メモリモデルビュー（スタック/ヒープ + SVG矢印）  ✅
│   │   ├── object-graph/         # オブジェクト参照グラフ（SVG 力学的レイアウト）   ✅
│   │   └── animated-trace/       # アニメーション付きトレース表（実装済み・非アクティブ）
│   ├── components/
│   │   ├── code-editor.js        # CodeMirror 6 エディタ（17種サンプル・プログラム名・テーマ連動）
│   │   ├── pane-resizer.js       # ペインリサイザー（ドラッグで editor/viz 幅を変更・localStorage 永続化）
│   │   ├── step-controls.js      # ステップ操作バー（2行×4列ボタン＋キーボード）
│   │   ├── view-switcher.js      # ビュー切り替えタブ（1〜9キー・localStorage復元）
│   │   └── settings-panel.js     # 設定パネル（テーマ切り替え・localStorage 永続化）
│   └── app.js                    # エントリポイント・全体協調（Console 常時パネル更新を含む）
├── web/
│   ├── index.html                # FOUC防止スクリプト・設定パネル HTML を含む
│   └── style.css                 # ライト/ダークテーマ（CSS カスタムプロパティ）
├── tests/
│   └── core/
│       ├── trace-builder.test.js # TraceBuilder 全7メソッドのユニットテスト
│       ├── step-controller.test.js
│       └── samples.test.js       # 17サンプルコード全エラーなし・trace ≥ 1 確認
├── docs/
│   ├── functional-spec.md        # 機能仕様書
│   ├── design.md                 # 詳細設計書
│   └── development-plan.md       # 開発計画書
├── CLAUDE.md                     # このファイル
├── README.md
└── package.json
```

## コマンド

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動（ファイル変更を監視・自動ビルド）
npm run dev

# 本番用ビルド
npm run build

# テストの実行
npm test

# テストをウォッチモードで実行
npm run test:watch
```

> **注意**: プロジェクトは ES modules (`"type": "module"`) を使用します。  
> テストは必ず `npm test` 経由で実行してください。

## アーキテクチャの要点

### JSInterpreter との結合

`../JSInterpreter` を `package.json` の `dependencies` に `file:../JSInterpreter` で参照し、
esbuild でブラウザ向けにバンドルします。  
`JSDebugger` のコンストラクタ呼び出し時に全ステップが事前記録され（オムニシェントデバッグ）、
以降のステップ操作は `trace[]` 配列の `cursor` 移動のみで O(1) です。

### 単一の真実の源

`debugger-adapter.js` が `JSDebugger` インスタンスと現在の `cursor` を保持します。  
各ビューは `adapter.getState()` から正規化済みの状態オブジェクトを受け取り、自身を更新します。  
ビュー間で直接通信は行いません。

### ビューの共通インターフェース

```js
// 全ビューが実装すべきメソッド
class BaseView {
  init(container, builder)  // DOM への初期描画（builder = TraceBuilder インスタンス）
  update(state)             // ステップ変化時の更新
  reset()                   // 状態クリア
  destroy()                 // DOM クリーンアップ
}
```

> `builder` はタブ切り替え時ではなく `onReady(state, builder)` 時に必ず渡される。  
> `ViewSwitcher.onReady()` はアクティブビューを `destroy` → 再マウントするため、
> ビューは常に最新の builder を受け取ることが保証される。

### TraceBuilder の集計メソッド

```js
class TraceBuilder {
  constructor(trace, source)          // trace: TraceEvent[], source: ソース文字列

  // Phase 1
  buildHumanIndices()                 // → Set<number>   humanStep インデックスの集合
  getHumanStepList()                  // → number[]      ソート済み humanStep 配列

  // Phase 3
  buildHeatmap()                      // → Map<lineNo, count>  行ごとの実行回数

  // Phase 4
  buildRecursionTree()                // → TreeNode[]    再帰呼び出しのみのツリー（cost プロパティ付き）
  buildCallTree()                     // → TreeNode[]    全関数呼び出しツリー（#buildFullCallTree と独立キャッシュ）
  buildLifetime()                     // → LifetimeEntry[]  変数ライフタイム区間（startHi/endHi は humanStep インデックス）
  buildControlFlow()                  // → { nodes, edges, humanSteps }  実行フローグラフ

  get trace()                         // → TraceEvent[]  生の trace 配列
  get source()                        // → string        元ソースコード
  get length()                        // → number        trace.length
}
```

`buildRecursionTree()` は `#buildFullCallTree()` の結果から `child.funcName === parent.funcName` の子のみを残し、`cost = 1 + Σ子のcost` を付与。再帰なしなら空配列。  
`buildCallTree()` は `#buildFullCallTree()` を使用（`buildRecursionTree()` とは完全に独立）。CallTree ビューが使用。  
`buildLifetime()` は humanStep ごとの env を走査し `callDepth:varName` をキーにして区間を記録。  
`buildControlFlow()` は humanStep の行番号遷移からノード（ユニーク行）とエッジ（行→行）を構築。  
すべてキャッシュ付きで、2回目以降の呼び出しは O(1)。

### ステップ粒度とボタンレイアウト

フッターのステップ操作バーは **2行×4列グリッド**（＋両端の先頭/末尾ボタン）で構成されます。

```
⏮(高)│  ◀◀文   ◀式   ▶式   ▶▶文  │⏭(高) ── slider ── counter
      │  ⏪関   ◁人   ▷人   ⏩関  │
```

| 粒度名 | キー | API | 説明 |
|--------|------|-----|------|
| 式評価 | `b`/`←`、`n`/`→` | `cursor ± 1` | 全 AST ノードの enter/exit |
| 文評価 | `V`/`v` | `stepOver()` → matchIdx | サブ式をスキップ、文単位 |
| 人にやさしい単位 | `H`/`h` | `humanStepBack()`/`humanStep()` | 代入・条件判定・while/for 条件式評価（イテレーションごと）・ループ更新・関数呼び出し等の意味ある変化点 |
| 関数呼び出し単位 | `F`/`f` | callDepth 変化まで cursor 移動 | 関数呼び出し・リターンをひとまとまりに |

ボタン色: 細粒度（式・人）= アクセントブルー、粗粒度（文・関数）= グレー

### コードハイライトの 3 層構造

`code-view/index.js` は以下の 3 層をオーバーレイとして管理します。

| 層 | CSS クラス | 色 | 説明 |
|----|-----------|-----|------|
| 1. 行ハイライト | `.cv-line--active` | 青（左ボーダー＋背景） | TraceEvent の `loc.line` 全体 |
| 2. 式ハイライト | `.cv-expr-highlight` | オレンジ（半透明） | `loc` ～ `end` の文字範囲 |
| 3. 呼び出し元ハイライト | `.cv-callsite-highlight` | パープル＋破線 | 関数内部実行中に `callStack[last].loc` の CallExpression |

式ハイライトは `position: absolute; calc(N * 1ch)` によるモノスペース文字単位配置。  
呼び出し元の end 位置は `setTrace()` 時に `CallExpression.enter` イベントからマップを事前構築
（`#callSiteEndMap: Map<"line:col", {line, column}>`）。

### SVG ビューの設計パターン

再帰ツリー・ライフタイム・制御フロー・オブジェクトグラフは SVG で描画します。

| ビュー | レイアウト方式 | update の方針 |
|--------|--------------|--------------|
| RecursionTree | 再帰的サブツリー幅計算（葉=NODE_W、内部=子の和＋gap） | ノードごとの className を cursor で更新 |
| CallTree | 同上（RecursionTree と同じレイアウトアルゴリズム） | ノードごとの className を cursor で更新 |
| Lifetime | 線形（X=humanStep, Y=変数行） | カーソル線の x1/x2 を移動 |
| ControlFlow | first-seen 順の縦並び（前向きエッジ右・後向きエッジ左） | activeNode の className を更新 |
| MemoryView | 2カラム（stack \| heap）+ SVG オーバーレイ矢印 | DOM 再描画 → rAF で矢印を再計算 |
| ObjectGraph | Fruchterman-Reingold 力学的レイアウト（80iter, cool=0.92） | update() ごとに SVG 全体を再描画 |

`isFunctionVal(v)` は LineTrace・TraceBuilder・MemoryView・ObjectGraph で共通で使用し、
`v.__type__ === 'JSFunction'` / `'JSClass'` またはネイティブ関数を除外します。

### テーマシステム

`web/style.css` では CSS カスタムプロパティによる 2 テーマを実装しています。

| テーマ | CSS セレクタ | ベース |
|--------|-------------|--------|
| ライト（デフォルト） | `:root` | Catppuccin Latte |
| ダーク | `[data-theme="dark"]` | Catppuccin Mocha |

- 設定は `localStorage('jsv-theme')` に永続化
- `<head>` のインラインスクリプトで FOUC（Flash of Unstyled Content）を防止
  （ダーク保存時のみ `<html data-theme="dark">` を即時適用）
- `settings-panel.js` が `<html>` の `data-theme` 属性を管理

### localStorage 永続化キー一覧

| キー | 保存内容 | 管理モジュール |
|------|---------|--------------|
| `jsv-theme` | ライト/ダークテーマ選択 | `settings-panel.js` |
| `jsv-active-tab` | アクティブタブ ID | `view-switcher.js` |
| `jsv-editor-pct` | エディタペイン幅（% 文字列、15〜75 の範囲） | `pane-resizer.js` |
| `jsv-console-h` | コンソールパネル高さ（px 整数、40〜400 の範囲） | `app.js`（コンソールリサイザー） |

### キーボードショートカット一覧

**ステップ操作**（実行中・テキスト入力欄以外にフォーカスがある場合）:

| キー | 操作 |
|------|------|
| `←` / `b` | 式単位で戻る |
| `→` / `n` | 式単位で進む |
| `H` | 人間単位で戻る |
| `h` | 人間単位で進む |
| `V` | 文単位で戻る |
| `v` | 文単位で進む |
| `F` | 関数単位で戻る |
| `f` | 関数単位で進む |
| `Home` | 先頭へ |
| `End` | 末尾へ |

**タブ切り替え**（実行中のみ有効）:

| キー | 操作 |
|------|------|
| `1`〜`9` | 登録順 N 番目のタブへ切り替え |

### エラーハンドリング

`debugger-adapter.js` の `load()` はエラーを 2 種類に分類して dispatch します。

| 種別 | 判定条件 | 表示バッジ |
|------|---------|----------|
| 構文エラー | `SyntaxError` クラス / `[Parser]` プレフィックス | 「構文エラー」（赤バッジ） |
| 実行エラー | それ以外 | 「実行エラー」（オレンジバッジ） |

`CodeEditor.showError(msg, errorType)` が `<span class="error-badge">` を挿入します。

### 色覚多様性対応

色だけに頼らず、形・パターン・テキストによる補助手がかりを提供します。

| ビュー | 状態 | 色以外の手がかり |
|--------|------|---------------|
| RecursionTree | 未呼び出し | 破線ボーダー（`stroke-dasharray: 5 3`）＋「…」アイコン |
| RecursionTree | 実行中 | 太い実線ボーダー（`stroke-width: 3`）＋「▶」アイコン |
| RecursionTree | 完了 | 細い実線ボーダー＋「✓」アイコン |
| ControlFlow | 戻りエッジ | 破線（`stroke-dasharray: 6 3`）＋オレンジ色 |

## コーディング規約

- **言語**: Vanilla JS (ES2022+)、TypeScript は使用しない
- **フレームワーク**: なし（DOM 直接操作）
- **スタイル**: CSS カスタムプロパティでテーマ管理（`--bg`, `--surface`, `--accent`, `--hl-*` 等）
- **モジュール**: ES modules (`import`/`export`)
- **テスト**: Jest（`node --experimental-vm-modules` 経由）
- **命名**: キャメルケース（変数・関数）、パスカルケース（クラス）、ケバブケース（ファイル名・CSS）
- **コメント**: JSDoc 形式で公開 API にのみ付与

## 重要な設計判断

- **ビルドツール**: esbuild（JSInterpreter と同方式）
- **コードエディタ**: CodeMirror 6（`codemirror` + `@codemirror/lang-javascript` + `@codemirror/theme-one-dark`）を採用。`Compartment` で動的テーマ切り替え。`MutationObserver` で `html[data-theme]` の変化を検知してダークテーマを自動適用
- **ペインリサイザー**: `.app-main` の CSS 変数 `--editor-pct` をマウスドラッグで更新。`localStorage('jsv-editor-pct')` に永続化し、15% 〜 75% でクランプ
- **Console 常時表示**: StateView からは Console カードを取り除き、`debug-pane` 下部に固定の `#console-panel` を配置。`app.js` の `updateConsolePanel()` が `'ready'` / `'step'` イベントごとに更新する。上端の `#console-resizer` をドラッグして高さ変更可（40〜400px、`localStorage('jsv-console-h')` に永続化）
- **可視化ライブラリ**: 使用しない（DOM + CSS アニメーション + SVG 手動描画で実装）。CodeMirror 6 が唯一の外部 UI ライブラリ
- **SVG レイアウト**: 再帰ツリーは再帰的幅計算、ObjectGraph は Fruchterman-Reingold 力学的レイアウト
- **差分検出**: 前後 `env` スナップショットを比較し変化した変数名のセットを生成
- **オブジェクト同一性**: MemoryView・ObjectGraph では `WeakMap` でオブジェクト参照を追跡し重複ヒープ登録を防ぐ
- **LineTrace vs AnimatedTrace**: `animated-trace/` ディレクトリは実装済みだが、タブには現在 `line-trace/`（ソース行×変数マトリクス表）を使用
- **LineTrace の構成**: 行番号列に `lt-lineno-num`（数字）+ `lt-lineno-snippet`（先頭15文字スニペット）を表示、右側に変数テーブル。列の表示/非表示は `#varMeta[{name, visible}]` で管理し `lt-col-hidden` クラスで制御。列の並び替えは HTML5 drag-and-drop（`<th draggable="true">`）で実装。（以前の2ペイン構成・ソースパネル・リサイザーは削除済み）
- **TraceTable の「対象」列**: `prevStepIdx` との env diff で変化した変数名を抽出。CallExpression は `callStack[callStack.length-1].name(args)` 形式、ReturnStatement は `'return'` を表示
- **CallTree ビュー**: `buildCallTree()` が返すノード配列（再帰・非再帰を問わず全関数呼び出し）を SVG ツリーとして描画。`RecursionTree` と同じレイアウトアルゴリズムを使用。CSS クラスは `.ct-*`（`RecursionTree` の `.rt-*` に対応）
- **スコープ統合表示**: `format.js` の `mergeScopesForDisplay(scopes, callStack)` でフレームごとに表示変数を決定。最内側フレームは scopes[0]〜scopes[M-2] を全マージ（ブロックスコープ含む）。外側フレームは env チェーンに含まれないため callStack[i].args + JSFunction.params から引数値を再構築（`reconstructFrameVars`）。ラベルは `factorial(6)` 形式（`formatFrameLabel(frame)`）。`scope-view`・`state-view`・`memory-view` で共通使用。表示順は innermost-first
- **Heatmap の改善**: 背景色を `update()` ごとに現在ステップまでの実行回数で動的更新（`lineTimeline` + バイナリサーチ）。カウントを「N回 / M回」形式で表示。ドット幅 360px（3倍）。実行済みドット（`.hm-dot--past`）と未実行ドット（デフォルトグレー）を色分け。異なる行に遷移する連続 humanStep のドット間を `.hm-overlay-svg` 上の `<line class="hm-vline">` で常時表示（`init()` 時に `requestAnimationFrame` で描画）。`.hm-lines` は `position: relative`、オーバーレイ SVG は `position: absolute`。トグルボタンは廃止
- **ColorBox（配列ビュー）**: タブ名「配列」。複数配列を同時選択して表示（折り返しあり）。各配列ブロックを枠線（`border: 1px solid var(--border)`）＋背景色（`var(--surface2)`）で区切り表示。`#scanTrace()` の 2 パス走査で配列ごとの `maxWidth`（最大グリッド幅）と `maxGridHeight`（最大グリッド高）を事前計算。`#render()` で `.cb-grid` に `min-width`/`min-height` を設定し、配列長やポインタ行数が変化しても各ブロックの占有領域が動かないよう固定。空配列時も `.cb-grid` を描画して占有領域を確保。ポインタ変数は変数ごとに個別の行として表示。文字列値は切り詰めなしで表示
- **ExecTrace（実行トレース）**: `init()` で humanStep 順の行をすべて一括描画。列 = # | 行 | コード | 変数値（出現順）| 条件式（出現順）。`update()` は現在行ハイライト移動と scrollIntoView のみ（O(n)）。条件式列は `buildConditionExitSet` + `buildCondInfo` で while/for の各イテレーション条件値を正確に表示
- **console.log 配列内文字列クォート**: JSInterpreter `formatLogArg(v, depth=0)` に `depth` 引数を追加。`depth > 0`（配列・オブジェクトの要素）の文字列は `'str'` 形式（シングルクォート付き）で表示し、Node.js の挙動と一致させる。トップレベル文字列（depth=0）はクォートなし
- **while/for 条件式の humanStep 追加**: `TraceBuilder.buildHumanIndices()` で WhileStatement/DoWhileStatement の条件式 exit（深さ D+1）をイテレーションごとに humanStep として追加（`matchIdx` で範囲を限定）。ForStatement は条件式 exit と更新式 exit も同様に追加。WhileStatement/ForStatement の enter 自体は humanStep から除外（条件式評価で代替）。LineTrace・ExecTrace の `buildConditionExitSet` も同ロジックで while/for 条件列を正しく表示
- **Timeline**: 変数チップ選択変更時に選択変数の値のみで Y 軸 min/max を動的再計算（`#renderSVG()` 内で dynMin/dynMax を計算）
- **super() バグ修正**: JSInterpreter の `CallExpression` ハンドラで callee.type === 'Super' を検出し、親クラス constructor を現在の `this` に対して直接実行することで継承コンストラクターを正しく処理
- **再帰ツリー引数表示改善**: `fmtArgsLines(args)` で最大 2 行に分割表示。配列値は要素展開 `[1,2,3]` 形式で表示。NODE_W=160/NODE_H=80 に拡大。cost プロパティ（subtree サイズ）を左下角に `cost:N` 形式で表示。再帰呼び出しがない場合は「再帰呼び出しがありません」を表示
- **分割代入**: JSInterpreter の `assignTo()` が `ArrayExpression` / `ObjectExpression` を処理するよう拡張（`[a,b]=[b,a]` 等）。詳細は [JSInterpreter#interpreter.js](../JSInterpreter/src/interpreter/interpreter.js)
- **エラー種別判定**: JSInterpreter は `[Parser]` プレフィックスのメッセージでパースエラーを示すため、正規表現で判定する
- **対象ブラウザ**: モダンブラウザ（Chrome/Firefox/Safari 最新版）
- **デプロイ**: GitHub Pages、`main` ブランチ push で Actions が JSInterpreter をクローン→ビルド→自動デプロイ

## 依存 JSInterpreter の主要 API

```js
// コンストラクタ（全ステップを事前記録）
const dbg = new JSDebugger(sourceCode, { maxSteps: 100_000 });

// ステップ操作（返り値: { done: boolean, event: TraceEvent | null }）
dbg.stepIn()
dbg.stepOver()
dbg.stepOut()
dbg.stepBack()
dbg.humanStep()
dbg.humanStepBack()

// 状態参照
dbg.getCurrentEvent()   // TraceEvent | null
dbg.getVariables('local' | 'all')  // { [name]: value }
dbg.getCallStack()      // Frame[]
dbg.getConsoleOutput()  // { atIndex, level, text }[]
dbg.isDone()            // boolean
dbg.trace               // TraceEvent[] 全ステップ（読み取り専用）
dbg.cursor              // 現在位置（number）

// TraceEvent の構造
// { phase, nodeType, loc, end, depth, callDepth, callStack, env, value?, matchIdx }
// loc  = { line: number, column: number }  ← 1始まり
// end  = { line: number, column: number }  ← 式ノードのみ存在、1始まり・inclusive
// callStack[0]   = 最外側フレーム { name, loc, args }  ← push 順
// callStack[last] = 最内側フレーム { name, loc, args }  ← 最も深い呼び出し
//   ※ frame.loc = その関数を呼び出した CallExpression の start 位置
//   ※ frame に end プロパティはない（callSiteEndMap で補完）
//   ※ 最内側フレームの取得: callStack[callStack.length - 1]
```
