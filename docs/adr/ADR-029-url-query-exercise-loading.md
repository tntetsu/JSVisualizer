# ADR-029: URLクエリ（exerciseId/codeId）によるコード読み込み

## ステータス

採択済み（2026-08-12）

## コンテキスト

BhvVisualizer（別リポジトリ）は Phase 2（コース・演習・コード管理）で、教員が作成した演習・コードを学習者が選んで JSVisualizer を開けるようにする必要がある。ログ送信（ADR-028、`# BHV:` タグ）とは別に、**表示するコード本文をどう渡すか**という新たな要求が生じた。

BhvVisualizer/docs/design.md 2.1節・2.4節の方針により、この機能は ADR-028 とは性質が異なるものとして扱う。ログ送信は「BhvVisualizerと連携して初めて意味を持つ配線」だが、URLクエリでのコード読み込みは「JSVisualizer単体でも“特定のコードへの直リンク”として機能する汎用機能」であり、`# BHV:` タグでの隔離は不要（BhvVisualizerの存在を前提としない）。

要件（BhvVisualizer/docs/design.md 2.4.1節）:

| パラメータ | 挙動 |
|---|---|
| `exerciseId` のみ | 演習に属するコード群を取得し、サンプルセレクタに追加する。エディタは選択されるまで変更しない |
| `codeId` のみ | そのコード1件を取得し、エディタに直接読み込む |
| `exerciseId` + `codeId` | 演習のコード群でセレクタを拡張しつつ、エディタは指定コードで開始する |
| 指定なし | 何もしない（既存の起動時Fibonacci表示・21種の組み込みサンプルはそのまま） |

## 決定

`exerciseId`/`codeId`/`bhvApiBase`（APIベースURL上書き用、省略時は本番BhvVisualizer）の3つのURLクエリパラメータを新設し、指定があれば BhvVisualizer の公開読み取り専用API（`GET /api/exercises/:id`・`GET /api/codes/:id`、認証不要）から `fetch` でコードを取得してエディタに反映する。

**既定の起動時表示（Fibonacciサンプル）は変更しない。** 当初案ではクエリなし時にエディタを空欄にする方針も検討したが、初期画面が空になるのはUXとして望ましくないため撤回し、「クエリがある場合にのみ上書きする」加算的な設計に変更した。あわせて、コードが編集可能であることが一見して分かるよう、ソースペインのヘッダーに常時表示のヒントテキスト（`editor-hint`、i18n対応）を追加した。

### 変更ファイル

- **`src/core/exercise-source.js`**（新規）: `parseQuery()` でクエリを解析、`loadExerciseFromQuery(editor, opts)` がAPIを`fetch`しエディタへ反映する。クエリなし・404・ネットワークエラーをそれぞれハンドリングする
- **`src/components/code-editor.js`**: エディタ内容の適用処理を `#applyCode()` に共通化（既存の `change` リスナーと共用）。公開API `setCode(code, label, selectValue)`・`addRemoteGroup(label, items)` を追加。コンストラクタの初期化処理自体は変更なし（Fibonacciのまま起動）
- **`src/app.js`**: `CodeEditor` 構築後に `loadExerciseFromQuery(editor)` を呼ぶ（`# BHV:` タグは付けない）
- **`src/i18n.js`・`web/index.html`・`web/style.css`**: 編集可能ヒント（`editor-hint`）の追加

### 安全性の担保

`verify-exercise-query.mjs`（Playwright、実ブラウザ）で以下を検証した（9件合格）。

1. クエリなし時は既定のFibonacciサンプルのまま（上書きされない）で、ヒントテキストが表示される
2. クエリなし時、組み込みサンプルの選択・実行が引き続き正常に動作する（回帰確認）
3. `exerciseId` のみ: セレクタに演習用optgroupが追加され、エディタは変更されない
4. `exerciseId`+`codeId`: セレクタ追加に加え、エディタが指定コードで上書きされる
5. `codeId` のみ: `/api/codes/:id` を直接取得しエディタに反映する
6. 存在しない `codeId`（404）: エラーメッセージが表示される

## 結果

- 既存Jestテストスイート（81件、新規`exercise-source.test.js`の10件を含む）が全て合格
- `verify-exercise-query.mjs`（新規）で上記6項目・9チェックに合格
- `verify-bhv-hook.mjs`（既存、ADR-028）もリグレッションなく13件合格

## 代替案

- **クエリなし時にエディタを空欄にする**: 不採用（当初案から変更）。スタンドアロン起動・公開デモ利用者にとって初期画面が空欄なのはUXとして望ましくない。既定のFibonacci表示を維持し、クエリがある場合のみ上書きする加算的な設計にした
- **postMessageでコード本文を渡す**: 不採用。ADR-028のログ送信チャネルとコード読み込みチャネルを混在させると見通しが悪くなる。BhvVisualizer/docs/design.md 2.4節の方針通り、コード読み込みは既存のURLクエリ機構に、ログ送信は`postMessage`に、明確に分離した
- **JSVisualizerがBhvVisualizerのFirestoreスキーマを直接参照する**: 不採用。JSVisualizerがBhvVisualizer固有のバックエンド構成を知る必要が生じ、独立性・汎用性が失われる（ADR-028の代替案と同じ理由）

## 今後の方針

ADR-028と同様、外部埋め込み利用者（BhvVisualizer）からの要求でJSVisualizerに変更を加える場合は、`# BHV:`タグの有無を問わず都度ADRを追加する。

> **2026-08-12改定（ADR-030）**: この運用ルールはさらに、外部埋め込み利用者からの要求によらないJSVisualizer単体の改良のための変更にも適用範囲を広げた。重要な設計判断を伴う変更であれば、駆動要因を問わず都度ADRを追加する。
