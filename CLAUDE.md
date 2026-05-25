# CLAUDE.md

このファイルは、Claude Code がこのリポジトリで作業する際のガイドです。

## プロジェクト概要

**JSVisualizer** は、JavaScript プログラムの実行過程をインタラクティブに可視化する教育用 Web アプリケーションです。  
[JSInterpreter](../JSInterpreter) の `JSDebugger` API をコアエンジンとして使用し、式・文・関数呼び出しの各粒度でのステップ実行と、複数の可視化ビューを提供します。

対象ユーザーはプログラミング入門〜中級の学習者および教員です。

## リポジトリ構成

```
JSVisualizer/
├── src/
│   ├── core/
│   │   ├── debugger-adapter.js   # JSDebugger ラッパー・差分検出
│   │   ├── step-controller.js    # ステップ粒度の統合管理（4粒度×前後 + start/end）
│   │   └── trace-builder.js      # 全トレースデータの事前集計
│   ├── views/                    # 各可視化ビュー（共通 I/F: init/update/reset/destroy）
│   │   ├── code-view/            # コードハイライト（3層: 行・式・呼び出し元）✅
│   │   ├── state-view/           # 変数・コールスタック・コンソール統合パネル  ✅
│   │   ├── animated-trace/       # アニメーション付きトレース表                ✅
│   │   ├── trace-table/          # 静的トレース表（全ステップ先読み）           ✅
│   │   ├── scope-view/           # スコープ・変数ビュー（ネスト枠）            ✅
│   │   ├── callstack-view/       # コールスタックビュー                        ✅
│   │   ├── bar-chart/            # 棒グラフアニメーション（数値変化）        [未実装]
│   │   ├── color-box/            # 色付き箱アニメーション（配列変化）        [未実装]
│   │   ├── timeline/             # 変数の時系列グラフ                        [未実装]
│   │   ├── recursion-tree/       # 再帰ツリービュー                          [未実装]
│   │   ├── lifetime/             # スコープ・ライフタイムタイムライン         [未実装]
│   │   ├── heatmap/              # 実行頻度ヒートマップ                      [未実装]
│   │   ├── control-flow/         # 制御フロービュー                          [未実装]
│   │   ├── memory-view/          # メモリモデルビュー（スタック/ヒープ）     [未実装]
│   │   └── object-graph/         # ポインタ/オブジェクトグラフ              [未実装]
│   ├── components/
│   │   ├── code-editor.js        # コードエディタ（実行前）
│   │   ├── step-controls.js      # ステップ操作バー（2行×4列ボタン＋キーボード）
│   │   ├── view-switcher.js      # ビュー切り替えタブ
│   │   └── settings-panel.js     # 設定パネル（テーマ切り替え・localStorage 永続化）
│   └── app.js                    # エントリポイント・全体協調
├── web/
│   ├── index.html                # FOUC防止スクリプト・設定パネル HTML を含む
│   └── style.css                 # ライト/ダークテーマ（CSS カスタムプロパティ）
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
| 人にやさしい単位 | `H`/`h` | `humanStepBack()`/`humanStep()` | 代入・条件・ループ更新など意味ある変化点 |
| 関数呼び出し単位 | `F`/`f` | callDepth 変化まで cursor 移動 | 関数呼び出し・リターンをひとまとまりに |

ボタン色: 細粒度（式・人）= アクセントブルー、粗粒度（文・関数）= グレー

### コードハイライトの 3 層構造

`code-view/index.js` は以下の 3 層をオーバーレイとして管理します。

| 層 | CSS クラス | 色 | 説明 |
|----|-----------|-----|------|
| 1. 行ハイライト | `.cv-line--active` | 青（左ボーダー＋背景） | TraceEvent の `loc.line` 全体 |
| 2. 式ハイライト | `.cv-expr-highlight` | オレンジ（半透明） | `loc` ～ `end` の文字範囲 |
| 3. 呼び出し元ハイライト | `.cv-callsite-highlight` | パープル＋破線 | 関数内部実行中に `callStack[0].loc` の CallExpression |

式ハイライトは `position: absolute; calc(N * 1ch)` によるモノスペース文字単位配置。  
呼び出し元の end 位置は `setTrace()` 時に `CallExpression.enter` イベントからマップを事前構築
（`#callSiteEndMap: Map<"line:col", {line, column}>`）。

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
- **可視化ライブラリ**: 使用しない（DOM + CSS アニメーションで実装）
- **再帰ツリー/オブジェクトグラフのレイアウト**: SVG + 手動レイアウトアルゴリズム（未実装）
- **差分検出**: 前後 `env` スナップショットを比較し変化した変数名のセットを生成
- **対象ブラウザ**: モダンブラウザ（Chrome/Firefox/Safari 最新版）

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
// callStack[0] = 最内側フレーム { name, loc, args }
//   ※ callStack[0].loc = その関数を呼び出した CallExpression の start 位置
//   ※ frame に end プロパティはない（callSiteEndMap で補完）
```
