# ADR-028: 外部埋め込み利用者向けリアルタイム操作ログ送信フック（`# BHV:` タグ）

## ステータス

採択済み（2026-08-11）

## コンテキスト

JSVisualizer は `<iframe>` 埋め込みによる外部からの利用を想定しており、これまでもURLクエリでのコード読み込みなど埋め込み利用者向けの汎用機能を本体に取り込んできた。

今回、大学の授業で学習ログの収集・分析を行う外部Webアプリ（BhvVisualizer、別リポジトリ）から、JSVisualizerを`<iframe>`埋め込みして使いたいという要望があった。要求内容は「学習者の操作を可視UIなしで常時記録し、埋め込み元アプリへリアルタイムに送信する」というもので、JSVisualizer単体の一般的な使われ方（学習者が自分でコードを試す）とは別の、埋め込み利用者固有の要求である。

既存の `src/core/session-logger.js`／`src/components/study-panel.js`（`# STUDY:` タグ、ADR-024参照）はCELDA 2026評価実験向けに作られており、実験者が可視UIで手動操作する前提（`Start Session`ボタン等でセッションを開始し、終了後にJSON/CSVをダウンロードする）で設計されている。この前提のままでは今回の要求（可視UIなし・常時収集・構文/実行時エラーや操作位置を含む詳細ログ・外部へのリアルタイム送信）を満たせない。

外部埋め込み利用者向けの配線は、JSVisualizer単体の動作に影響を与えてはならない。埋め込まれていない場合や、埋め込み元から明示的なリクエストがない場合は、一切の副作用を持たないことを要件とする（スタンドアロン起動・公開デモ利用者・他の埋め込み利用者に影響しないため）。

## 決定

`# STUDY:` タグと同様に「コード上に目印を付けて隔離する」手法を踏襲しつつ、目的が異なるため別タグ（`# BHV:`）を用いる。`# STUDY:` は実験者向け可視UIの範囲を示すのに対し、`# BHV:` は**埋め込み元からの明示的な要求があった場合のみ動く不可視の配線**を示す。

### ハンドシェイク方式

埋め込み元（親ウィンドウ）から `postMessage` で以下の形式のメッセージを受け取ったときのみ、ログ送信を開始する。

```js
// 親 → JSVisualizer
{ source: 'bhv', type: 'init', sessionId: string }
```

`event.origin` が `app.js` の `BHV_ALLOWED_ORIGINS`（許可オリジンの固定リスト）に一致しない場合は無視する。**この `init` を受け取らない限り、埋め込まれていても記録・送信は一切発生しない。**

### 送信するイベント

`init` 受理後、`sessionLogger` が以下の型のイベントを記録するたびに、`window.parent` へ `postMessage({ source: 'jsvisualizer', sessionId, t, type, ...フィールド }, targetOrigin)` で送信する（`t` はセッション開始からの経過ミリ秒）。

| type | 主なフィールド | 発生タイミング |
|---|---|---|
| `lifecycle` | `phase: 'start' \| 'end'` | init受理直後／ページ離脱時（`pagehide`） |
| `run` | `sampleName`・`code`（実行時点のソース全文）・`success`・`errorType`（`'parse'\|'runtime'\|null`）・`errorMessage`・`errorLoc`・`traceLength` | Run実行時（成功・構文/実行時エラーいずれも送出） |
| `reset` | （なし） | 編集モードに戻ったとき |
| `step` | `action`（ステップ操作の種類）・`cursorBefore`・`cursorAfter`・`loc`（操作後位置の行・列）・`callDepth` | 8方向いずれかのステップ操作 |
| `view` | `viewId` | ビュータブ切り替え時 |
| `visibility` | `state: 'hidden' \| 'visible'` | タブの表示状態変化時（`visibilitychange`） |

これらは元々 `sessionLogger` が内部的に保持していたイベント型（ADR-024）の拡張であり、`run` にソースコード全文とエラー詳細を、`step` に操作後の位置情報（行番号・関数呼び出し深さ）を追加した点が今回の変更点である。埋め込み元がこれらのイベントをどう保存・活用するか（データベース設計や分析ロジック）はJSVisualizerの関知するところではなく、本ADRのスコープ外とする。

### 変更ファイル

- **`session-logger.js`**: `logRun`をsuccess/error統合形に拡張、`logStep`に`loc`/`callDepth`引数を追加、`logVisibility`/`logLifecycle`を新設、`enableRemoteLogging(sessionId, targetOrigin)`を追加（呼ばれるまでは従来通り`postMessage`は発生しない）
- **`app.js`**: `message`イベント購読（initハンドシェイク受理・オリジン検証）、`pagehide`/`visibilitychange`リスナーを追加。`adapter`の`ready`／`error`両リスナーから統合`logRun`を呼ぶよう変更（従来は`ready`のみでエラー時は未記録だった）
- **`step-controller.js`**: 全11箇所のステップ操作で、移動後の`trace`エントリから`loc`/`callDepth`を取得し`logStep`に渡す

### 安全性の担保

以下の3パターンを `verify-bhv-hook.mjs`（Playwright、実ブラウザ）で検証し、いずれも設計通りであることを確認した（13件合格）。

1. スタンドアロン起動時にJSエラーが発生しないこと
2. 埋め込まれていても`init`を受け取らない限り、いかなるメッセージも送信されないこと
3. `init`受理後は、Run・ステップ操作・エラー発生・編集モードへの復帰それぞれで期待通りのイベントが送信されること

## 結果

- 既存Jestテストスイート（71件）はリグレッションなく全て合格
- `verify-bhv-hook.mjs`（新規追加）で上記の安全性・イベント送出を検証、13件合格

## 代替案

- **JSVisualizerが埋め込み元のバックエンドを直接参照する**: 不採用。埋め込み利用者ごとに異なるバックエンド構成（DB・認証方式等）を知る必要が生じ、JSVisualizerの独立性・汎用性が失われる
- **既存のJSON/CSVダウンロード機能のみで運用する**: 不採用。利用者に毎回ダウンロード操作を要求することになり「意識させない常時収集」の要件を満たせない
- **`study-panel.js`（`# STUDY:`）を拡張して流用する**: 不採用。`# STUDY:`は実験者が可視UIで手動操作する前提であり、常時・不可視という今回の要件と混在させると両者の見通しが悪くなる。タグと実装を分離した

## 今後の方針

外部埋め込み利用者からの要求でJSVisualizerに変更を加える場合（`# BHV:`のような隔離配線に限らず、単体機能として本体に取り込むものも含む）は、都度ADRを追加し、決定の背景・代替案を記録する。
