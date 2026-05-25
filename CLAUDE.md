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
│   │   ├── step-controller.js    # ステップ粒度の統合管理
│   │   └── trace-builder.js      # 全トレースデータの事前集計
│   ├── views/                    # 各可視化ビュー（共通 I/F: init/update/reset）
│   │   ├── code-view/            # コードハイライト（全ビュー共通左ペイン）
│   │   ├── animated-trace/       # アニメーション付きトレース表
│   │   ├── trace-table/          # 静的トレース表（全ステップ先読み）
│   │   ├── scope-view/           # スコープ・変数ビュー（ネスト枠）
│   │   ├── callstack-view/       # コールスタックビュー
│   │   ├── bar-chart/            # 棒グラフアニメーション（数値変化）
│   │   ├── color-box/            # 色付き箱アニメーション（配列変化）
│   │   ├── timeline/             # 変数の時系列グラフ
│   │   ├── recursion-tree/       # 再帰ツリービュー
│   │   ├── lifetime/             # スコープ・ライフタイムタイムライン
│   │   ├── heatmap/              # 実行頻度ヒートマップ
│   │   ├── control-flow/         # 制御フロービュー
│   │   ├── memory-view/          # メモリモデルビュー（スタック/ヒープ）
│   │   └── object-graph/         # ポインタ/オブジェクトグラフ
│   ├── components/
│   │   ├── code-editor.js        # コードエディタ（実行前）
│   │   ├── step-controls.js      # ステップ操作バー（粒度セレクター付き）
│   │   └── view-switcher.js      # ビュー切り替えタブ
│   └── app.js                    # エントリポイント・全体協調
├── web/
│   ├── index.html
│   └── style.css
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
  init(container)        // DOM への初期描画
  update(state, diff)    // ステップ変化時の更新（diff = 変化した変数のみ）
  reset()                // 状態クリア
  destroy()              // DOM クリーンアップ
}
```

### ステップ粒度

| 粒度名 | 使用 API | 説明 |
|--------|----------|------|
| 式評価 | `stepIn()` | 全 AST ノードの enter/exit |
| 文評価 | `stepOver()` | サブ式をスキップ、文単位 |
| 関数呼び出し | `stepOut()` 相当 | 関数全体をひとまとまりに |
| 人にやさしい単位 | `humanStep()` | 代入・条件・ループ更新など意味ある変化点 |

## コーディング規約

- **言語**: Vanilla JS (ES2022+)、TypeScript は使用しない
- **フレームワーク**: なし（DOM 直接操作）
- **スタイル**: CSS カスタムプロパティでテーマ管理
- **モジュール**: ES modules (`import`/`export`)
- **テスト**: Jest（`node --experimental-vm-modules` 経由）
- **命名**: キャメルケース（変数・関数）、パスカルケース（クラス）、ケバブケース（ファイル名・CSS）
- **コメント**: JSDoc 形式で公開 API にのみ付与

## 重要な設計判断

- **ビルドツール**: esbuild（JSInterpreter と同方式）
- **可視化ライブラリ**: 使用しない（DOM + CSS アニメーションで実装）
- **再帰ツリー/オブジェクトグラフのレイアウト**: SVG + 手動レイアウトアルゴリズム
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
// { phase, nodeType, loc, depth, callDepth, callStack, env, value?, matchIdx }
```
