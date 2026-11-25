# ADR-055: 言語プロファイルを入れ、フロントエンドを他の言語（Python）と共有できるようにする

## ステータス

採択済み（2026-11-25）。作業ブランチ `feature/multilang` で実装。main へのマージは、授業の学期後（2027年2月以降）とする。

## コンテキスト

JSVisualizer の Python 版 [PyVisualizer](https://github.com/tntetsu/PyVisualizer) は、このフロントエンド（ビュー・ステップ操作・コンソールなど）を共有する（PyVisualizer の ADR-001）。しかしフロントエンドは、次の 4 点で JS に固定されていた。

- 実行エンジン：`debugger-adapter.js` が `JSDebugger` を直接 import している
- エディタ：CodeMirror の JS モード
- サンプル：JS の組み込みサンプル
- 値の見せ方：ビューが `typeof`・`Array.isArray`・`Object.entries` で値の形を判定し、`null`・`true`・`JSON.stringify` で書いていた。約 15 ファイル・100 か所ほど

Python の値（小数・辞書・タプル・`None`）は、そのままでは `{ v: 79 }`・`false`・`null` のように表示された（PyVisualizer の docs/phase0-report.md）。

## 決定

言語ごとの違いを**言語プロファイル**（`src/lang/`）に集め、フロントエンドの各部品は使うときに `getLanguage()` から取り出す。既定は JS（`src/lang/javascript.js`）。他の言語のアプリは、`app.js` より先に評価されるモジュールで `setLanguage()` を呼ぶ（ESM は import の順に評価されるため）。

| プロファイルの項目 | 使う部品 | JS の値 |
|---|---|---|
| `Debugger`・`ExecutionError` | `debugger-adapter.js` | `JSDebugger`・`ExecutionError`（`web/interpreter.bundle.js`） |
| `editorExtension`・`samples`・`sampleGroups`・`defaultSample` | `code-editor.js` | CodeMirror の JS モード、組み込みサンプル（`src/lang/javascript-samples.js` に移した。`code-editor.js` からも再 export） |
| `syntaxTokens` | `code-view`（コード表示の色分け） | これまでの規則 |
| `traceRowTypes` | `TraceBuilder.buildHumanIndices()`（実行トレースなどの行） | これまでの nodeType の集合 |
| `valueModel` | 値を表示するすべてのビュー（`utils/value-model.js` の `vm()` 経由） | これまでの判定・書き方 |

`valueModel` は、値を JS の形に**変換せずに**、見せ方だけを答える。ビューは整形の規則（切り詰め方・`undef` の略記など）をこれまでどおり持ち、言語で変わる部分だけを尋ねる。

- `kind(v)`：値の種類（none・bool・number・string・function・sequence・mapping・object など）
- `literal(v)`：スカラーの書き方
- `entries(v)`・`length(v)`：要素
- `label(v)`・`shortLabel(v)`・`brackets(v)`：見出しとかっこ
- `numberValue(v)`：色分け用の数値

変換しないのは、メモリ・オブジェクトのビューが、値そのものの同一性で「同じオブジェクトを指しているか」を判定しているため。sequence は、どの言語でも JS の配列で表す約束にした（配列のビューが添字でアクセスするため）。

**入力欄（2026-11-25 追記）**：言語プロファイルが `supportsInput: true` のとき（Python の `input()`）、ソースペインのエラー表示の上に入力欄（`components/input-panel.js`）を出し、実行時にその内容を `adapter.load(source, { stdin })` で Debugger に渡す。JS 版のプロファイルは `supportsInput` を持たないので、入力欄は作らず、`load(source)` も従来どおり（JS 版の画面で入力欄が 0 個、ソースペインの HTML が変わらないこと、7 本のサンプル・題材 × 全タブ × 5 位置の画面が main と一致することを確かめた）。

コンソールは、出力の断片（行の途中で終わる出力。JSInterpreter の共通コアの `Recorder.write()`）を行にまとめてから表示する（`utils/console-lines.js`）。JS の出力は断片を含まないので変わらない。

ビューのノード型名の参照は、言語プロファイルに移していない。Python の AST は、意味が同じ構文に ESTree と同じノード型名を使う（PyVisualizer の計画書 2.1 節）。そのため、言語で違うのは実行トレースの行の集合（`traceRowTypes`）だけだった。

タブに登録されていないビュー（棒グラフ・タイムライン・トレース表・スコープ・アニメーション）は書き換えていない。

## 結果

- **JS 版の表示は変わらない**：組み込みサンプル 21 本と記事の題材 29 本で、5 つのステップ位置 × 全タブの `#view-container` の HTML・コンソール・ステップ数・エラー表示（3,050 件）を、main のビルドと比べて一致を確かめた（PyVisualizer の `scripts/capture-js-dom.mjs`）。既存のテストもすべて通る
  - 上限まで回る無限ループの題材 `12-list-bug` は、全タブの描画に非常に時間がかかるため比較から外した（main でも同じ）
  - 実行トレースの図は見える範囲に入ってから描く（遅延描画）。タブを切り替えて 60 ms 後の記録では、`bubbleSort` の 1 件で、作業ブランチだけ図がまだ描かれていなかった。待ちを 600 ms にすると一致する。描く内容は同じで、値を表示するたびに言語プロファイルを参照する分だけ描画がわずかに遅い
- PyVisualizer は、このブランチのフロントエンドに Python のプロファイルを登録して動く。Python 版で見える変化（`79.0`・`None`・`True`・`'abc'`・辞書・タプル・`for` の各回の行・`print(end=" ")` の 1 行へのまとめ）は、PyVisualizer の ADR-004 に例とテストがある
- 新しいビューを足すときは、値の判定・書き方に `vm()` を使う。`typeof`・`Array.isArray`・`JSON.stringify` を直接使うと、他の言語で JS の書き方が出る
