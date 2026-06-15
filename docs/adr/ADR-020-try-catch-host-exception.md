# ADR-020: try-catch におけるホスト例外の ThrowSignal 変換

- **決定日**: 2026-06-15
- **ステータス**: 承認済み

## 背景・課題

インタープリターは制御フローに「シグナルオブジェクト」パターンを採用している。
`throw` 文は `ThrowSignal` を戻り値として返し、呼び出し元が逐次検査する。
`TryStatement` ハンドラは `evaluate(node.block, ...)` の戻り値が `ThrowSignal` か否かを確認し、
`catch` ブロックへ分岐する（ADR-001 参照）。

しかし、インタープリター内部では評価中に**ホスト例外**（実際の JS 例外）も発生する。

| 発生元 | 例 |
|--------|-----|
| `RuntimeError`（インタープリター独自） | `null.foo`（null/undefined プロパティアクセス）、未定義変数参照 |
| V8 の `RangeError` | コールスタック超過（`Maximum call stack size exceeded`）|
| `Recorder.record()` の `RangeError` | `[MaxSteps]` 最大ステップ超過 |

これらのホスト例外は `ThrowSignal` を返す経路を通らないため、`TryStatement` ハンドラの
`result instanceof ThrowSignal` チェックに引っかからず、ユーザーコードの `catch` ブロックが
実行されないバグがあった。ホスト例外は `JSDebugger` まで素通りして `ExecutionError` に変換されていた。

## 決定

`TryStatement` の `evaluate(node.block, ...)` 呼び出しを `try-catch` で包み、
ホスト例外を `ThrowSignal` に変換してユーザーの `catch` ブロックに渡す。

**ただし `[MaxSteps]` RangeError は再スローする**（ユーザーコードで catch 不可な設計を維持）。

### トレース整合性の保持

ホスト例外が発生すると、`recorder.record()` が exit イベントを積む前に制御が移るため、
try ブロック内の enter イベントが `matchIdx === -1` のまま残る。
`ThrowSignal` 変換と同時に以下のクリーンアップを行う:

1. try ブロック評価開始前のインデックス（`blockTraceStart`）を記録
2. 末尾から走査し、`matchIdx === -1` の enter イベントを除去
3. 残存する未対応 enter の `matchIdx` を `tr.length`（範囲外）に設定

```js
case 'TryStatement': {
  const blockTraceStart = recorder ? recorder.trace.length : 0;
  let result;
  try {
    result = evaluate(node.block, env, recorder, d, callDepth);
  } catch (hostErr) {
    if (/^\[MaxSteps\]/.test(hostErr?.message)) throw hostErr;
    if (recorder) {
      const tr = recorder.trace;
      let tail = tr.length - 1;
      while (tail >= blockTraceStart && tr[tail].matchIdx === -1) tail--;
      tr.length = tail + 1;
      for (let i = blockTraceStart; i < tr.length; i++) {
        if (tr[i].matchIdx === -1) tr[i].matchIdx = tr.length;
      }
    }
    result = new ThrowSignal(hostErr);
  }
  // 以降は既存の catch / finally 処理
```

## 根拠

- ユーザーコードで `try { null.foo; } catch(e) { ... }` が動かないのは教育ツールとして致命的
- ホスト Error オブジェクトをそのまま `ThrowSignal.value` にすることで、
  ユーザーコードは `.message`・`.name` 等を通常どおりアクセスできる
- `[MaxSteps]` 超過はユーザーが catch できないシステム停止であり、例外として再スローが正しい
- トレースクリーンアップのロジックは `debugger.js` の `ExecutionError` 後処理と同一アルゴリズム
  であり、一貫性がある

## 結果・影響

- `try-catch` が意図どおり機能するようになった（`null.foo`・`undefinedVar`・`throw new Error()` 等）
- `finally` ブロックは既存実装で正しく処理されるため変更なし
- ホスト例外メッセージは日本語（`RuntimeError`: `"null/undefined のプロパティアクセス"` 等）になる場合がある
- `[MaxSteps]` は引き続きユーザーコードで catch 不可（ADR-017 参照）
