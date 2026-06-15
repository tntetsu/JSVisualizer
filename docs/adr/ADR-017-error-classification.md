# ADR-017: エラーハンドリングの三分類（構文エラー・実行エラー・ステップ上限）

- **決定日**: 2026-05-25（二分類）、2026-06-15（ステップ上限を追加）
- **作成日**: 2026-06-15
- **ステータス**: 承認済み

## 背景・課題

`JSDebugger` のコンストラクタはパースエラー・実行時エラーの両方を例外としてスローする。学習者に対してエラーの種類を適切に伝えるため、単一の「エラー」ではなく原因に応じたメッセージを表示したかった。

また JSInterpreter はパースエラーを示す統一的なマーカーとして `[Parser]` プレフィックスをエラーメッセージに付与するが、`SyntaxError` クラス自体は実行時エラーにも使われうるため、クラス名だけでは区別できない場合があった。

2026-06-15 に無限ループ対策として `maxSteps` 上限の実施を追加した。`Recorder.record()` が `maxSteps` を超えたとき `[MaxSteps]` プレフィックスの `RangeError` を throw し、`JSDebugger` コンストラクタがこれを `MaxStepsError` に変換して throw する。

## 決定

`DebuggerAdapter.load()` でエラーを以下の 3 種類に分類し、`'error'` カスタムイベントの `detail.errorType` として dispatch する。

| 種別 | 判定条件 | 表示バッジ |
|------|---------|-----------|
| 構文エラー | `err instanceof SyntaxError` **または** `/^\[Parser\]/` にマッチ | 「構文エラー」（赤） |
| 実行エラー | それ以外 | 「実行エラー」（オレンジ） |
| ステップ上限 | `err instanceof MaxStepsError` | 「ステップ上限」（黄） |

**ステップ上限・実行エラーの特殊フロー（構文エラーと異なる）:**

`MaxStepsError` / `ExecutionError` はエラー発生時点の部分トレースを `partialTrace` 等に保持する。`DebuggerAdapter` はこのデータから `JSDebugger.fromTrace()` で部分的なデバッガを構築し、先に `'ready'` を dispatch してユーザーがエラー前の実行状態を閲覧できるようにする。その後 `'error'` を dispatch してバッジを表示する。

部分トレースが空（エラーが一番最初のステップで発生）の場合は `'ready'` を dispatch せず、`'error'` のみを dispatch する。

```js
// debugger-adapter.js
if (err instanceof MaxStepsError || err instanceof ExecutionError) {
  if (err.partialTrace?.length > 0) {
    this.#dbg = JSDebugger.fromTrace(
      err.partialSource, err.partialTrace, err.partialAst, err.partialConsoleLogs
    );
    this.dispatchEvent(new CustomEvent('ready', { detail: this.#buildState([]) }));
  }
  const errorType = err instanceof MaxStepsError ? 'maxsteps' : 'runtime';
  this.dispatchEvent(new CustomEvent('error', {
    detail: { message: err.message, errorType }
  }));
  return;
}
```

`CodeEditor.showError(msg, errorType)` が `<span class="error-badge">` を挿入し、`errorType` に応じた CSS クラスで色を変える。

## 根拠

- 学習者にとって「どこに書き方の間違いがあるか（構文）」と「実行中に何が起きたか（実行時）」は性質が異なり、対処法も違う
- `[Parser]` プレフィックスは JSInterpreter の命名規則として確立しているため、正規表現で安定して判定できる
- `maxSteps` 超過時も打ち切り前のトレースを閲覧可能にした。「無限ループで何も見えない」より「どこまで実行されたか見える」方が学習者に有益なため
- `MaxStepsError` を別クラスにした理由: `instanceof` で確実に判定でき、partialTrace 等のデータを型安全に運べる

## 結果・影響

- エラーハンドリングが `DebuggerAdapter.load()` に一元集約された（ADR-002 参照）
- `CodeEditor` の `showError()` API が `errorType` 引数を受け取るよう設計された
- `JSDebugger.fromTrace()` 静的ファクトリが追加された（コンストラクタをバイパスして部分トレースから debugger を構築）
- `Recorder` が `maxSteps` を受け取るよう拡張された（`interpreter.js`）
- `ExecutionError` クラスが追加された。`evaluate()` 中に発生したすべての実行時エラーを部分トレースとともに包む
- 構文エラーはパース段階（`evaluate()` 呼び出し前）で throw されるため部分トレースを持たず、従来通り `'error'` のみを dispatch する
- JSInterpreter のパーサーが `[Parser]` プレフィックス規則を変更した場合は判定ロジックの更新が必要
