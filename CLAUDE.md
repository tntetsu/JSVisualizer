# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業する際のガイドです。

## プロジェクト概要

**JSVisualizer** は、JavaScript プログラムの実行過程をインタラクティブに可視化する教育用 Web アプリケーションです。  
[JSInterpreter](../JSInterpreter) の `JSDebugger` API をコアエンジンとして使用し、式・文・関数呼び出しの各粒度でのステップ実行と、12 種類の可視化ビューを提供します。  
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
│   │   ├── trace-builder.js      # 全トレースデータの事前集計（8メソッド）
│   │   └── session-logger.js     # 操作ログ記録（評価実験用）JSON/CSV エクスポート
│   ├── i18n.js                   # 日英表示切替（STRINGS/t/getLang/setLang・langchange イベント）
│   ├── utils/
│   │   └── format.js             # formatValueDiff・mergeScopesForDisplay 等の表示整形ヘルパー
│   ├── views/                    # 各可視化ビュー（共通 I/F: init/update/reset/destroy）
│   │   ├── code-view/            # コードハイライト（3層: 行・式・呼び出し元）       ✅
│   │   ├── state-view/           # コールスタックビュー（CallStackView・Global疑似フレーム＋関数フレーム）✅ ← タブ「コールスタック」
│   │   ├── scope-view/           # スコープ・変数ビュー（ネスト枠）  ← タブ登録なし（非アクティブ）
│   │   ├── line-trace/           # Variable（行番号+スニペット列+変数表・列表示切替・D&D）  ✅  ← タブ「変数」
│   │   ├── exec-trace/           # 実行順トレース表（humanStep 順・変数列+条件列）          ✅  ← タブ「実行トレース」
│   │   ├── trace-table/          # 静的トレース表（全ステップ・対象列付き）               ✅  ← タブ登録なし（非アクティブ）
│   │   ├── bar-chart/            # 棒グラフアニメーション（数値・配列変化）         ✅  ← タブ登録なし（非アクティブ）
│   │   ├── color-box/            # Arrays（複数配列同時表示・ポインタ別行）           ✅  ← タブ「配列」
│   │   ├── timeline/             # 変数の時系列グラフ（SVG折れ線・変数選択時Y軸動的更新）✅  ← タブ登録なし（非アクティブ）
│   │   ├── heatmap/              # 実行頻度ヒートマップ（連結線常時表示）            ✅
│   │   ├── recursion-tree/       # 再帰呼び出しツリー（SVG・引数展開表示）                ✅  ← タブ登録なし（非アクティブ、CallTreeに統合。ADR-027）
│   │   ├── call-tree/            # 全関数呼び出しツリー（SVG・再帰に限らない・cost表示）  ✅  ← タブ「呼び出しツリー」
│   │   ├── lifetime/             # 変数ライフタイム Gantt チャート（SVG）                ✅
│   │   ├── control-flow/         # 制御フロービュー（AST DOM フローチャート・未実行ノードグレー）✅
│   │   ├── memory-view/          # メモリモデルビュー（スタック/ヒープ + SVG矢印）  ✅
│   │   ├── object-graph/         # オブジェクト参照グラフ（SVG 階層型レイアウト・連結成分分離）✅
│   │   ├── subst-trace/          # 代入展開ビュー（再帰置換モデル・ハイライト付き）  ✅  ← タブ「代入展開」
│   │   ├── expr-trace/           # 式評価トレースビュー（部分式逐次置換）           ✅  ← タブ「式評価」
│   │   └── animated-trace/       # アニメーション付きトレース表（実装済み・非アクティブ）
│   ├── components/
│   │   ├── code-editor.js        # CodeMirror 6 エディタ（21種サンプル・プログラム名・テーマ連動）
│   │   ├── pane-resizer.js       # ペインリサイザー（ドラッグで editor/viz 幅を変更・localStorage 永続化）
│   │   ├── step-controls.js      # ステップ操作バー（2行×4列ボタン＋キーボード）
│   │   ├── view-switcher.js      # ビュー切り替えタブ（1〜9キー・localStorage復元）
│   │   ├── settings-panel.js     # 設定パネル（テーマ切り替え・localStorage 永続化）
│   │   └── study-panel.js        # 評価実験 UI（Session Log 配線 + ワンクリックマーカー）← STUDY: 削除可
│   └── app.js                    # エントリポイント・全体協調（Console 常時パネル更新を含む）
├── web/
│   ├── index.html                # FOUC防止スクリプト・設定パネル HTML を含む
│   └── style.css                 # ライト/ダークテーマ（CSS カスタムプロパティ）
├── tests/
│   └── core/
│       ├── trace-builder.test.js # TraceBuilder 全7メソッドのユニットテスト
│       ├── step-controller.test.js
│       └── samples.test.js       # 21サンプルコード全エラーなし・trace ≥ 1 確認
├── docs/
│   ├── functional-spec.md        # 機能仕様書
│   ├── functional-spec.en.md     # 機能仕様書（英語版）
│   ├── design.md                 # 詳細設計書
│   ├── development-plan.md       # 開発計画書
│   ├── adr/                      # Architecture Decision Records（ADR-001〜ADR-025）
│   └── study/                    # 評価実験資料（CELDA 2026 向け・.gitignore 対象）← STUDY: 削除可
│       ├── consent-form.md       #   研究参加同意書
│       ├── participant-guide.md  #   参加者向け説明資料（操作説明）
│       ├── questionnaire.md      #   アンケート（SUS + カスタム項目 + タスク別回答欄）
│       ├── experimenter-protocol.md # 実験者用（進行スクリプト・正解・ヒントカード・SUS採点シート）
│       └── paper-research-notes.md  # 論文ネタ整理メモ（内部用）
├── CLAUDE.md                     # このファイル
├── README.md
├── README.en.md                  # README（英語版）
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
  buildRecursionTree()                // → TreeNode[]    再帰呼び出しのみのツリー（cost プロパティ付き・非アクティブ）
  buildCallTree()                     // → TreeNode[]    全関数呼び出しツリー（cost プロパティ付き）
  buildLifetime()                     // → LifetimeEntry[]  変数ライフタイム区間（startHi/endHi は humanStep インデックス）
  buildCFG()                          // → ScopeNode[]   AST ベース制御フロー（スコープ単位・未実行ノード含む）
  buildControlFlow()                  // → { nodes, edges, humanSteps }  旧実装（未使用・後方互換のため残置）

  get trace()                         // → TraceEvent[]  生の trace 配列
  get source()                        // → string        元ソースコード
  get length()                        // → number        trace.length
}
```

`buildRecursionTree()` は `#buildFullCallTree()` の結果から `child.funcName === parent.funcName` の子のみを残し、`cost = 1 + Σ子のcost` を付与。再帰なしなら空配列。RecursionTree ビューは非アクティブ（ADR-027）。  
`buildCallTree()` は `#buildFullCallTree()` の全ノードに `cost` を付与して返す（`#computeCost()` を buildRecursionTree() と共有）。CallTree ビューが使用。  
`buildLifetime()` は humanStep ごとの env を走査し `callDepth:varName` をキーにして区間を記録。  
`buildCFG()` は AST を走査してスコープ（グローバル／関数）ごとの `CfgItem[]` を構築。`CfgItem` は `type: stmt|return|jump|if|while|for|do-while|seq` を持ち、`execCount` で実行回数を記録（未実行は 0）。`buildControlFlow()` は旧実装（エッジ/ノードベース）で現在未使用。  
すべてキャッシュ付きで、2回目以降の呼び出しは O(1)。

### モード別ヘッダーレイアウト

ヘッダーは **Editモード** と **Runモード** でコンテンツが切り替わります。

- **Editモード**（デフォルト）: `header-center` に Edit/Run ボタン ＋ サンプルセレクトボックス
- **Runモード**（Run 実行後）: `header-center` に Edit/Run ボタン ＋ ステップ操作バー

モード切替は `app.js` が `.app-header.run-mode` クラスを付け外しし、CSS で表示/非表示を制御。

### ステップ粒度とボタンレイアウト

Runモード時、ヘッダー内ステップ操作バーは **1列（ワイド時）または2行（ナロー時）** で構成されます。

```
ワイド:  ⏮ ⏭ │ ⏪Func ⏩Func │ ◁Human ▷Human │ ◀◀Stmt ▶▶Stmt │ ◀Expr ▶Expr │──slider──│ counter
ナロー:  ⏮ ⏭ │ ⏪Func ⏩Func │ ◁Human ▷Human │ ◀◀Stmt ▶▶Stmt │ ◀Expr ▶Expr
         ──────────────────────── slider ────────────────────────── │ counter
```

ボタン列（`.ctrl-grid`）と スライダー+カウンター（`.slider-area`）は `.step-controls-area` でまとめられ、
`flex-wrap` により `slider-area` が 180px 未満になると2行目に折り返す。

`body { min-width: 820px }` ＋ `html { overflow-x: auto }` により、820px 未満のウィンドウ幅では横スクロールバーが表示され、ヘッダー要素の重なりを防ぐ。

### ビュー説明バー

右ペインのタブ直下に `.view-desc` 要素を配置し、選択中のビューの説明文を表示します。

- `ViewSwitcher` のコンストラクタが `view-container` の直前に `.view-desc` 要素を自動生成・挿入
- `ViewSwitcher.register(id, label, ViewClass, description)` の第 4 引数に説明文を渡す
- タブ切り替え時（`#activate()`）に `descEl.textContent` を更新
- 説明文が空（Edit モードなど）のときは `display: none`（CSS の `.view-desc:empty`）

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

再帰ツリー・ライフタイム・オブジェクトグラフは SVG で描画します。制御フロービューは DOM ベース（div 要素）で描画します。

| ビュー | レイアウト方式 | update の方針 |
|--------|--------------|--------------|
| RecursionTree | 再帰的サブツリー幅計算（葉=NODE_W、内部=子の和＋gap） | ノードごとの className を cursor で更新 |
| CallTree | 同上（RecursionTree と同じレイアウトアルゴリズム） | ノードごとの className を cursor で更新 |
| Lifetime | 線形（X=humanStep, Y=変数行） | カーソル線の x1/x2 を移動 |
| ControlFlow | AST ベース DOM フローチャート（if → true/false 列、while/for → 条件+body、未実行ノードは `cf-node--dead` でグレー） | activeNode の className を更新 |
| MemoryView | 2カラム（stack \| heap）+ SVG オーバーレイ矢印 | DOM 再描画 → rAF で矢印を再計算 |
| ObjectGraph | 階層型レイアウト（Kahn トポソート + 最長パス法で列割当、左→右）連結成分を BFS で分離し縦スタック | update() ごとに SVG 全体を再描画 |

`isFunctionVal(v)` は Variable（旧LineTrace）・TraceBuilder・MemoryView・ObjectGraph で共通で使用し、
`v.__type__ === 'JSFunction'` / `'JSClass'` またはネイティブ関数を除外します。

### 言語切替（i18n）

`src/i18n.js` が UI テキストの日英切り替えを管理します。

```js
import { t, getLang, setLang } from './i18n.js';

t('btn-edit')      // 現在言語の文字列を返す（ja: '✏ 編集', en: '✏ Edit'）
setLang('en')      // 言語変更 → localStorage 保存 → 'langchange' カスタムイベント発火
```

**ローカライズ方式**:
- 静的 HTML 要素: `data-i18n="key"` 属性を付与。`applyI18n()` が `textContent` を一括更新
- タブラベル・説明文: `ViewSwitcher.register()` の label/description に `{ ja: '...', en: '...' }` オブジェクトを渡す。`setLang()` 呼び出しで `ViewSwitcher.setLang()` がタブと説明バーを再描画
- `resolveStr(v, lang)`: v が文字列ならそのまま返し、`{ja, en}` オブジェクトなら lang キーを参照するヘルパー（view-switcher.js 内）

**言語変更フロー**:
```
ENボタンクリック → setLang('en') → dispatchEvent('langchange')
→ applyI18n()       // [data-i18n] 要素を一括更新 + html[lang] 属性を更新
→ switcher.setLang() // タブラベル・説明バーを再描画
```

**永続化**: `localStorage('jsv-lang')`（`'ja'` または `'en'`、デフォルト `'ja'`）

**ローカライズ対象**: ボタンラベル・タブラベル・説明文・コンソールタイトル・設定パネルテキスト（約 46 項目）
**ローカライズ非対象**: エラーメッセージ（JSInterpreter から）・サンプルプログラム名

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
- **ライトモード専用スタイル**: `:root:not([data-theme="dark"])` セレクタで適用
  - アクティブタブ: `background: var(--bg)`（白）＋ `border-top: 2px solid var(--accent)`（青）＋ `color: var(--accent)`（青）＋ `font-weight: 600`。ダークモードは変更なし
  - コンソール背景: `background: var(--bg)`（白）。ダークモードは変更なし

### localStorage 永続化キー一覧

| キー | 保存内容 | 管理モジュール |
|------|---------|--------------|
| `jsv-theme` | ライト/ダークテーマ選択 | `settings-panel.js` |
| `jsv-active-tab` | アクティブタブ ID | `view-switcher.js` |
| `jsv-editor-pct` | エディタペイン幅（% 文字列、15〜75 の範囲） | `pane-resizer.js` |
| `jsv-console-h` | コンソールパネル高さ（px 整数、40〜400 の範囲） | `app.js`（コンソールリサイザー） |
| `jsv-lang` | 表示言語選択（`'ja'` または `'en'`、デフォルト `'ja'`） | `i18n.js` |

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

`CodeEditor.showError(msg, errorType, loc)` が `<span class="error-badge">` を挿入します。

**エラー位置ジャンプ＆ブリンク**: `loc` が存在する場合、`showError()` は自動的にカーソルをエラー行に移動し、ブリンクアニメーションでハイライトします。エラーバッジをクリックすると再度ジャンプ＆ブリンクします。

- **loc 抽出**: `err.loc` → `err.line/column` → メッセージの `[Parser|Lexer|Runtime] N:M:` 正規表現フォールバックの順で抽出
- **ブリンク実装**: `box-shadow: inset 0 0 0 9999px rgba(220,38,38,0.18)` をアニメーション。CodeMirror テーマが `background: transparent !important` を設定するため `background` アニメーションは無効なので `box-shadow: inset` を使用
- **ダブル RAF パターン**: `requestAnimationFrame(() => requestAnimationFrame(() => { ... }))` で CodeMirror のレンダリングサイクル後に `.cm-activeLine` が確定してからブリンクを開始
- **フォーカス維持**: エラーバッジの `mousedown` で `e.preventDefault()` してエディタのフォーカスを維持（フォーカスを失うと CM が `.cm-activeLine` を削除するため）

### 色覚多様性対応

色だけに頼らず、形・パターン・テキストによる補助手がかりを提供します。

| ビュー | 状態 | 色以外の手がかり |
|--------|------|---------------|
| CallTree | 未呼び出し | 破線ボーダー（`stroke-dasharray: 5 3`）＋「…」アイコン |
| CallTree | 実行中 | 太い実線ボーダー（`stroke-width: 3`）＋「▶」アイコン |
| CallTree | 完了 | 細い実線ボーダー＋「✓」アイコン |
| ControlFlow | 未実行ノード | `cf-node--dead` クラス（グレーアウト）＋ `cf-exec-badge` 非表示 |

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
- **Console 常時表示**: CallStackView（旧StateView）からは Console カードを取り除き、`debug-pane` 下部に固定の `#console-panel` を配置。`app.js` の `updateConsolePanel()` が `'ready'` / `'step'` イベントごとに更新する。上端の `#console-resizer` をドラッグして高さ変更可（40〜400px、`localStorage('jsv-console-h')` に永続化）
- **Call Stack ビューの Global 疑似フレーム**: `CallStackView`（`state-view/index.js`）は `mergeScopesForDisplay()` が返す `label === 'global'` のフレームを、返却順序（関数呼び出し中は末尾）に関わらず常に先頭に「Global」として表示する。これにより callStack が空（グローバルスコープ実行中）でも変数が可視化される。詳細は [ADR-026](docs/adr/ADR-026-callstack-view-simplification.md)
- **可視化ライブラリ**: 使用しない（DOM + CSS アニメーション + SVG 手動描画で実装）。CodeMirror 6 が唯一の外部 UI ライブラリ
- **SVG レイアウト**: 再帰ツリーは再帰的幅計算、ObjectGraph は階層型レイアウト（Kahn トポロジカルソート + 最長パス法で列を決定、左→右配置。エッジは肘型コネクタ）
- **ObjectGraph 連結成分分離**: 無向 BFS で連結成分を検出し、各成分を独立に `hierarchicalLayout()` で配置後 y 軸方向に COMP_GAP=24px で積み上げる。成分が 2 つ以上のとき点線の境界矩形を描画
- **ObjectGraph ポートスプレッド**: 1 ノードから複数のエッジが出るとき、出口 y 座標をノード高さ内で均等分散（`srcPort`/`dstPort` マップ）してエッジ・ラベル重複を回避
- **差分強調（`formatValueDiff`）**: `src/utils/format.js` の `formatValueDiff(val, prevVal)` が前ステップとの差分を `<b class="v-diff">` でラップして橙色（`--v-diff`）で強調。配列・オブジェクトは要素/プロパティ単位で比較し変化した部分のみ強調。Variable（`update()` 時アクティブ行）と ExecTrace（`init()` 時全行）で使用
- **差分検出**: 前後 `env` スナップショットを比較し変化した変数名のセットを生成
- **オブジェクト同一性**: MemoryView・ObjectGraph では `WeakMap` でオブジェクト参照を追跡し重複ヒープ登録を防ぐ。JSInterpreter の `Environment.snapshot()` が `seen` WeakMap をスコープチェーン全体で共有するため、同一元オブジェクトは同一クローンにマッピングされ WeakMap 追跡が正しく機能する
- **Variable vs AnimatedTrace**: `animated-trace/` ディレクトリは実装済みだが、タブには現在 `line-trace/`（クラス名 `Variable`、ソース行×変数マトリクス表）を使用
- **Variable の構成**: 行番号列に `lt-lineno-num`（数字）+ `lt-lineno-snippet`（先頭15文字スニペット）を表示、右側に変数テーブル。列の表示/非表示は `#varMeta[{name, visible}]` で管理し `lt-col-hidden` クラスで制御。列の並び替えは HTML5 drag-and-drop（`<th draggable="true">`）で実装。（以前の2ペイン構成・ソースパネル・リサイザーは削除済み。CSS プレフィックス `lt-` はディレクトリ名 line-trace/ 由来のまま変更していない）
- **TraceTable の「対象」列**: `prevStepIdx` との env diff で変化した変数名を抽出。CallExpression は `callStack[callStack.length-1].name(args)` 形式、ReturnStatement は `'return'` を表示
- **CallTree ビュー**: `buildCallTree()` が返すノード配列（再帰・非再帰を問わず全関数呼び出し、cost付き）を SVG ツリーとして描画。表示形式・レイアウトアルゴリズムとも `RecursionTree` と共通（ADR-027 で統合、RecursionTree は非アクティブ化）。CSS クラスは `.ct-*`（`RecursionTree` の `.rt-*` に対応）
- **スコープ統合表示**: `format.js` の `mergeScopesForDisplay(scopes, callStack)` でフレームごとに表示変数を決定。最内側フレームは scopes[0]〜scopes[M-2] を全マージ（ブロックスコープ含む）。外側フレームは env チェーンに含まれないため callStack[i].args + JSFunction.params から引数値を再構築（`reconstructFrameVars`）。ラベルは `factorial(6)` 形式（`formatFrameLabel(frame)`）。`scope-view`・`state-view`・`memory-view` で共通使用。表示順は innermost-first
- **Heatmap の改善**: 背景色を `update()` ごとに現在ステップまでの実行回数で動的更新（`lineTimeline` + バイナリサーチ）。カウントを「N回 / M回」形式で表示。ドット幅 360px（3倍）。実行済みドット（`.hm-dot--past`）と未実行ドット（デフォルトグレー）を色分け。異なる行に遷移する連続 humanStep のドット間を `.hm-overlay-svg` 上の `<line class="hm-vline">` で常時表示（`init()` 時に `requestAnimationFrame` で描画）。`.hm-lines` は `position: relative`、オーバーレイ SVG は `position: absolute`。トグルボタンは廃止
- **Arrays（配列ビュー、旧クラス名ColorBox）**: タブ名「配列」。複数配列を同時選択して表示（折り返しあり）。各配列ブロックを枠線（`border: 1px solid var(--border)`）＋背景色（`var(--surface2)`）で区切り表示。`#scanTrace()` の 2 パス走査で配列ごとの `maxWidth`（最大グリッド幅）と `maxGridHeight`（最大グリッド高）を事前計算。`#render()` で `.cb-grid` に `min-width`/`min-height` を設定し、配列長やポインタ行数が変化しても各ブロックの占有領域が動かないよう固定。空配列時も `.cb-grid` を描画して占有領域を確保。ポインタ変数は変数ごとに個別の行として表示。文字列値は切り詰めなしで表示。オブジェクト・配列要素は `'?'` ではなく `formatValue()` でキー:値ペアをそのまま表示し、セル幅は `#cellWidth()` が内容の文字数から算出（数値セルの幅比例フォントではなく固定 `OBJ_FONT=10px` を使用）
- **ExecTrace（実行トレース）**: `init()` で humanStep 順の行をすべて一括描画。列 = # | 行 | コード | 変数値（出現順）| 条件式（出現順）。`update()` は現在行ハイライト移動と scrollIntoView のみ（O(n)）。条件式列は `buildConditionExitSet` + `buildCondInfo` で while/for の各イテレーション条件値を正確に表示
- **SubstTrace（代入展開）**: 再帰関数呼び出しを「置換モデル」で逐次展開。最初のユーザー定義関数呼び出しをトラッキングし、ReturnStatement enter ごとに `computeReturnExpr()` で return 式の識別子・サブ呼び出しを評価済みテキストへ置換。CSS クラスは `.stx-*`。ハイライト: 展開された部分（`stx-hl-expanded`）と次に置換される項（`stx-hl-pending`）
- **ExprTrace（式評価）**: 1行の式が部分式の逐次置換で最終値に収束する過程をトレース表形式で表示。対象ステートメント: `ExpressionStatement`・`VariableDeclaration` init・`IfStatement` test・`WhileStatement` test（イテレーションごと）・`ReturnStatement` 引数・`ForStatement` init/test/update（イテレーションごと）。列 = 式テキスト（変化するたびに行追加）+ 変数値列（式テキストに登場する識別子のみ・関数値除外）。ソース座標 → 表示座標変換に `srcPosToDispPos()` / `srcRangeToDispRange()`。展開ハイライト（橙 `xev-hl-expanded`）・評価待ちハイライト（青太字 `xev-hl-pending`）・未評価部分のグレーアウト（`xev-hl-unevaluated`、2026-08-05追加）の3種を表示。未評価部分は各行の累積 `subs`（適用済み置換）に覆われていないソース範囲を `computeUnevaluatedGaps()` で算出し、`buildExprHtml(text, ranges)` が文字単位の優先度配列（低: unevaluated → 中: expanded → 高: pending）で重なりを解決してレンダリングする。CSS クラスは `.xev-*`。`ev.callDepth !== outerCallDepth` で関数内部除外。**変数値の時系列表示**: Row 0 = enterIdx env（評価前）、中間行 = その exit イベント時点の env、最終行（2行以上のセクション）= exitIdx env（束縛・代入完了後）。`update()` でアクティブ行の TD を `trace[cursor].env` からリアルタイム書き換え（`#trace` フィールドに builder.trace を保持）。`VariableDeclaration` の位置取得はソース正規表現ベース（interpreter が VariableDeclarator イベントを emit しないため `trace[i+1]` に直接 init 式が来る）
- **console.log 配列内文字列クォート**: JSInterpreter `formatLogArg(v, depth=0)` に `depth` 引数を追加。`depth > 0`（配列・オブジェクトの要素）の文字列は `'str'` 形式（シングルクォート付き）で表示し、Node.js の挙動と一致させる。トップレベル文字列（depth=0）はクォートなし
- **while/for 条件式の humanStep 追加**: `TraceBuilder.buildHumanIndices()` で WhileStatement/DoWhileStatement の条件式 exit（深さ D+1）をイテレーションごとに humanStep として追加（`matchIdx` で範囲を限定）。ForStatement は条件式 exit と更新式 exit も同様に追加。WhileStatement/ForStatement の enter 自体は humanStep から除外（条件式評価で代替）。Variable・ExecTrace の `buildConditionExitSet` も同ロジックで while/for 条件列を正しく表示
- **Timeline**: 変数チップ選択変更時に選択変数の値のみで Y 軸 min/max を動的再計算（`#renderSVG()` 内で dynMin/dynMax を計算）
- **super() バグ修正**: JSInterpreter の `CallExpression` ハンドラで callee.type === 'Super' を検出し、親クラス constructor を現在の `this` に対して直接実行することで継承コンストラクターを正しく処理
- **CallExpression レシーバー二重評価・ゲスト関数のネイティブコールバック変換（JSInterpreter）**: `obj.method(...)` 形式の呼び出しで `node.callee.object` を一度だけ評価し `callee`/`thisValue` に使い回すよう修正（従来は2箇所で独立評価され、`result.concat(a).concat(b)` のような連鎖呼び出しでレシーバーが二重実行され、マージソートサンプルのトレース表示が壊れていた）。あわせて `Array.prototype.sort` 等のネイティブ関数にゲスト定義の関数値（`JSFunction`）をコールバックとして渡す際、`wrapGuestFunction()` でネイティブ呼び出し可能なラッパーに変換するよう修正（Sort objects系サンプルが `TypeError` を握りつぶして無反応になっていた原因）。詳細は [JSInterpreter#interpreter.js](../JSInterpreter/src/interpreter/interpreter.js) の `wrapGuestFunction`
- **var/let/const セマンティクス修正（JSInterpreter）**: `var` は関数スコープ・巻き上げ（`hoistVars` で `undefined` 事前定義）。`let`/`const` は TDZ（`TDZ_SENTINEL = Symbol('TDZ')` で事前登録、宣言前アクセスは RuntimeError）・同一スコープ再宣言禁止（`checkNoRedecl`）。`const` は再代入禁止（`Environment.immutables` Set + `set()` 内チェック）。`for (let …)` はイテレーション独立バインディング（`iterEnv` + `updateEnv` の分離）。詳細は [JSInterpreter#environment.js](../JSInterpreter/src/interpreter/environment.js)
- **再帰ツリー引数表示改善**: `fmtArgsLines(args)` で最大 2 行に分割表示。配列値は要素展開 `[1,2,3]` 形式で表示。NODE_W=160/NODE_H=80 に拡大。cost プロパティ（subtree サイズ）を左下角に `cost:N` 形式で表示。再帰呼び出しがない場合は「再帰呼び出しがありません」を表示
- **分割代入**: JSInterpreter の `assignTo()` が `ArrayExpression` / `ObjectExpression` を処理するよう拡張（`[a,b]=[b,a]` 等）。詳細は [JSInterpreter#interpreter.js](../JSInterpreter/src/interpreter/interpreter.js)
- **エラー種別判定**: JSInterpreter は `[Parser]` プレフィックスのメッセージでパースエラーを示すため、正規表現で判定する
- **タブ折り返し表示**: `.view-tabs` に `flex-wrap: wrap` を適用。ウィンドウが狭いとき全タブを 2 行以上に折り返して表示（全タブが常に見える状態を維持）
- **Lifetime 動的幅計算**: 固定 `PX_PER_STEP` を廃止し、セグメントごとにラベル幅（`approxChars * CHAR_PX + BAR_PAD`）から必要チャート幅（`neededW = approxLabelPx * MAX_HI / span`）を計算。`MIN_CHART_W`（580px）〜`MIN_CHART_W * 3`（1740px）でクランプ。定数は `CHAR_PX=5`（モノスペース 11px の約 0.7×）、`BAR_PAD=14`
- **BarChart hasContent Map 修正**: `flattenEnv()` が `Map` を返すため `for (const [k, v] of Object.entries(vars))` は空を返す。正しくは `for (const [k, v] of vars)` で Map を直接イテレート
- **英語ドキュメント**: `README.en.md`・`docs/functional-spec.en.md` を新規追加。`README.md` および `docs/functional-spec.md` と相互リンク（`> [English README](README.en.md)` 形式）
- **対象ブラウザ**: モダンブラウザ（Chrome/Firefox/Safari 最新版）
- **デプロイ**: GitHub Pages、`main` ブランチ push で Actions が JSInterpreter をクローン→ビルド→自動デプロイ
- **操作ログ（SessionLogger）**: `src/core/session-logger.js` にモジュールレベルシングルトン `sessionLogger` を実装。`startSession()` 呼び出し後のみエントリを蓄積し、非アクティブ時は全コール no-op。`step-controller.js`・`view-switcher.js`・`app.js` から `logStep` / `logView` / `logRun` / `logReset` を呼び出す。JSON・CSV エクスポート対応（`Blob` + `<a>` タグ）。詳細は ADR-024
- **評価実験 UI の隔離（study-panel.js）**: 評価実験固有の UI（Session Log 配線・ワンクリックマーカーボタン 9 個）を `src/components/study-panel.js` に集約。実験後の削除手順: ①このファイルを削除、② `app.js` の `// STUDY:` import 行を削除、③ `index.html` の `<!-- STUDY MODE -->` ブロックを削除。`session-logger.js` 本体と各モジュールの `logStep`/`logView` 呼び出しは no-op のため残置可
- **Study Tasks サンプル**: `code-editor.js` に `─ Study Tasks ─` グループ（studyWarmup / studyTask1 / studyTask2 / studyTask3）を追加（CELDA 2026 評価実験用）。実験後は SAMPLES の 4 エントリと `#buildSampleOptions()` の 1 行を削除
- **BhvVisualizer 連携（`# BHV:` タグ）**: [BhvVisualizer](../BhvVisualizer) から `<iframe>` 埋め込みされた際、操作ログをリアルタイムに送信する配線を `# BHV:` タグで隔離している（`# STUDY:` タグと同様の隔離方式・別目的）。`session-logger.js` の `enableRemoteLogging()`/`#postToParent()`、`app.js` 末尾の `message`(initハンドシェイク)・`pagehide`・`visibilitychange` リスナーが該当。埋め込まれていない、または `init` ハンドシェイクを受け取らない場合は完全に no-op のため、スタンドアロン動作・公開デモには影響しない。プロトコル仕様は [BhvVisualizer/docs/logging-spec.md](../BhvVisualizer/docs/logging-spec.md) を正とする。動作検証は `verify-bhv-hook.mjs`（`node verify-bhv-hook.mjs`）

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
