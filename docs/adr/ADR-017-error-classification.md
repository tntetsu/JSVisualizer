# ADR-017: エラーハンドリングの二分類（構文エラー vs 実行エラー）

- **決定日**: 2026-05-25
- **作成日**: 2026-06-15
- **ステータス**: 承認済み

## 背景・課題

`JSDebugger` のコンストラクタはパースエラー・実行時エラーの両方を例外としてスローする。学習者に対してエラーの種類を適切に伝えるため、単一の「エラー」ではなく原因に応じたメッセージを表示したかった。

JSInterpreter はパースエラーを示す統一的なマーカーとして `[Parser]` プレフィックスをエラーメッセージに付与するが、`SyntaxError` クラス自体は実行時エラーにも使われうるため、クラス名だけでは区別できない場合があった。

`maxSteps` 超過エラーは「一種の実行時エラー（上限に達して停止）」であり、ゼロ除算やスタックオーバーフローと本質的に同じ扱いが自然である。これらを別カテゴリに分けると分類が恣意的になるため、実行エラーに統一した。

## 決定

`DebuggerAdapter.load()` でエラーを以下の **2 種類**に分類し、`'error'` カスタムイベントの `detail.errorType` として dispatch する。

| 種別 | 判定条件 | 表示バッジ |
|------|---------|-----------|
| 構文エラー | `err instanceof SyntaxError` **または** `/^\[Parser\]/` にマッチ | 「構文エラー」（赤） |
| 実行エラー | `err instanceof ExecutionError`（maxSteps 超過・スタックオーバーフロー・TypeError 等すべて） | 「実行エラー」（オレンジ） |

**実行エラーの特殊フロー（構文エラーと異なる）:**

`ExecutionError` はエラー発生時点の部分トレースを `partialTrace` 等に保持する。`DebuggerAdapter` はこのデータから `JSDebugger.fromTrace()` で部分的なデバッガを構築し、先に `'ready'` を dispatch してユーザーがエラー前の実行状態を閲覧できるようにする。その後 `'error'` を dispatch してバッジを表示する。

部分トレースが空（エラーが一番最初のステップで発生）の場合は `'ready'` を dispatch せず、`'error'` のみを dispatch する。

```js
// debugger-adapter.js
if (err instanceof ExecutionError) {
  if (err.partialTrace?.length > 0) {
    this.#dbg = JSDebugger.fromTrace(
      err.partialSource, err.partialTrace, err.partialAst, err.partialConsoleLogs
    );
    this.dispatchEvent(new CustomEvent('ready', { detail: this.#buildState([]) }));
  }
  this.dispatchEvent(new CustomEvent('error', {
    detail: { message: err.message, errorType: 'runtime' }
  }));
  return;
}
```

`maxSteps` 超過時のメッセージは `Recorder` が `[MaxSteps]` プレフィックス付きで throw し、`ExecutionError` コンストラクタがプレフィックスを除去してユーザー向けメッセージに整形する。

`CodeEditor.showError(msg, errorType)` が `<span class="error-badge">` を挿入し、`errorType` に応じた CSS クラスで色を変える。

## 根拠

- 「どこに書き方の間違いがあるか（構文）」と「実行中に何が起きたか（実行時）」は性質が異なり対処法も違う → 二分類は妥当
- `maxSteps` 超過はスタックオーバーフロー・TypeError・ReferenceError と同じ「実行中に起きた問題」であり、別カテゴリにする必然性がない（JS ではゼロ除算は例外ではなく `Infinity` を返す）
- 構文エラーはパース段階（`evaluate()` 呼び出し前）で throw されるため部分トレースを持たない。実行エラーは `evaluate()` 中に起きるため常に部分トレースを持てる。この差が分類の本質的な意味

## 結果・影響

- エラーハンドリングが `DebuggerAdapter.load()` に一元集約された（ADR-002 参照）
- `CodeEditor.showError()` API が `errorType` 引数を受け取るよう設計された
- `JSDebugger.fromTrace()` 静的ファクトリが追加された（コンストラクタをバイパスして部分トレースから debugger を構築）
- `Recorder` が `maxSteps` を受け取るよう拡張された（`interpreter.js`）
- `ExecutionError` クラスが追加された。`evaluate()` 中に発生したすべての実行時エラーを部分トレースとともに包む
- JSInterpreter のパーサーが `[Parser]` プレフィックス規則を変更した場合は判定ロジックの更新が必要
