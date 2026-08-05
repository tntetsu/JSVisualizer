# ADR-027: CallTree / RecursionTree の統合、RecursionTree の非アクティブ化

**日付**: 2026-08-05
**ステータス**: 採用済み
**決定者**: Tetsuo Tanaka

---

## 背景

CELDA 2026 論文の可視化対象・方式の整理を進める過程で、CallTree と RecursionTree のコードを比較したところ、以下がほぼ同一の実装だった。

| | CallTree | RecursionTree |
|---|---|---|
| データソース | `buildCallTree()`（全関数呼び出し） | `buildRecursionTree()`（同名関数の再帰のみ） |
| レイアウトアルゴリズム | 再帰的サブツリー幅計算（`calcSubtreeWidth`/`assignPositions`） | 同一 |
| ノード状態（future/active/done） | 同一ロジック | 同一ロジック |
| ノード表示形式 | 1行 `funcName(args)`、引数を3要素まで短縮 | 関数名・引数（最大2行）・cost を分離表示 |
| cost（部分木サイズ）表示 | なし | あり |

両者の唯一の実質的な違いは (1) 対象範囲（全呼び出し vs 再帰のみ）と (2) cost 表示の有無だった。CallTree は buildCallTree() が全呼び出しを返すため、非再帰プログラムでも意味を持つ（RecursionTree は非再帰プログラムでは「再帰呼び出しがありません」と表示され空になる）上位互換の関係にある。

さらに CallTree の戻り値テキスト（`.ct-retval`）が `fill: #4ce884` 固定色で、`.ct-node--done .ct-rect` の背景（`rgba(76,232,132,0.12)`）と同系色のため、ライトテーマでコントラストが弱く視認しづらいという不具合も見つかった。

## 決定

1. `TraceBuilder`: `buildRecursionTree()` 内にあった `computeCost(node)` ローカル関数を共有プライベートメソッド `#computeCost(node)` として括り出し、`buildCallTree()` でも全ノードに適用してキャッシュする。
2. `CallTree`（`src/views/call-tree/index.js`）のノード表示形式を RecursionTree と統一する: `NODE_H` を56→80に拡大、関数名・引数（最大2行）・cost（左下）を個別のテキスト要素として描画する。
3. `RecursionTree` のタブ登録を `app.js` でコメントアウトし非アクティブ化する（`table`/`bar`/`timeline` と同じパターン。import・コードは残置し、`static hasContent()` 等の参照実装として保持）。
4. `.ct-retval`・`.ct-node--done .ct-state-icon`・`.ct-node--done .ct-rect` の固定色 `#4ce884` を、既存の未使用カスタムプロパティ `--sorted`（「確定済み（緑）」の意味で `:root` に定義済みだったが参照箇所がなかった）に置き換えてコントラストを改善する。

## 代替案

### 代替案 A: RecursionTree のコードごと削除する

**却下理由**: 他の非アクティブビュー（`table`/`bar`/`timeline`/`scope-view`）と同じ「参照実装として残す」方針に統一する。将来 CallTree の表示が煩雑になりすぎた場合に再度分離する可能性もゼロではない。

### 代替案 B: 新規カスタムプロパティ `--success-fg` を追加してコントラストを直す

**却下理由**: `--sorted` が全く同じ意味（「確定済み（緑）」）で `:root`/`[data-theme="dark"]` 両方に定義済みかつ未使用だったため、新規追加は重複になる。既存プロパティを使うほうがCSSカスタムプロパティの一貫性を保てる。

## 影響

- `src/core/trace-builder.js`: `#computeCost()` 共有化。`buildCallTree()` の各ノードに `cost` プロパティが付与される
- `src/views/call-tree/index.js`: ノード表示を RecursionTree 相当の形式に統一
- `web/style.css`: `.ct-*` を `.rt-*` に準じた形式に整理、`--sorted` を色に採用
- `src/app.js`: `switcher.register('recursion', ...)` をコメントアウト。タブ登録数が13→12になった
- `tests/core/trace-builder.test.js`: `buildCallTree()` の cost 検証テストを追加（非再帰の子も含めて全呼び出しをカウントすることを確認）
- 動作確認: Fibonacci (recursive) サンプルで呼び出しツリータブに cost・戻り値（コントラスト改善済み）が正しく表示されることを Playwright で確認済み

## 関連 ADR

- [ADR-015](ADR-015-scope-callstack-tabs-removed.md) — 非アクティブビューをコードごと残す既存パターンの前例
- [ADR-026](ADR-026-callstack-view-simplification.md) — 同時期に行った Call Stack ビュー簡略化
