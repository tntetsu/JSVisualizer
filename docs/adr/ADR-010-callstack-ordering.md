# ADR-010: callStack の順序規約（[0]=最外側・[last]=最内側）

- **決定日**: 2026-06-02（バグ修正として規約を明確化）
- **作成日**: 2026-06-14
- **ステータス**: 承認済み（commit `a08922f`）

## 背景・課題

`JSDebugger.getCallStack()` が返す配列の順序が、コードベース内で混在して解釈されていた。`callStack[0]` を「最内側（現在実行中のフレーム）」と解釈しているコードと、「最外側（最初に呼ばれたフレーム）」と解釈しているコードが共存し、ビューによって表示が正しかったり誤っていたりした。

commit `a08922f` (2026-06-02) で全コードを調査し、規約を明確化して統一した。

## 決定

```
callStack[0]             = 最外側フレーム（push 順で最初に積まれたもの）
callStack[length - 1]    = 最内側フレーム（現在実行中、最も深い呼び出し）
```

最内側フレーム（「今どこにいるか」）を取得するには `callStack[callStack.length - 1]` を使う。これはスタックを「底が古い」通常の表現（Java の `Thread.getStackTrace()` と同じ）。

同じ規約を `frameEnvs` にも適用した:
```
frameEnvs[0]             = 最外側フレームの callEnv スナップショット
frameEnvs[callStack.length - 1] = 最内側フレームの callEnv スナップショット
```

## 根拠

- JSInterpreter の `callFunction` が push する順序（外側から内側へ）に合わせた
- `callStack.length - 1` で最内側フレームを取得するイディオムを統一することで、すべてのビューが同じパターンを使える

## 結果・影響

- `code-view/` の呼び出し元ハイライト、`trace-table/` の CallExpression 対象列表示、`state-view/` のフレームラベル表示がすべて正しく動くようになった
- CLAUDE.md にコメントとして明記した（`※ 最内側フレームの取得: callStack[callStack.length - 1]`）
- この規約を間違えると全ビューで関数表示が崩れるため、ドキュメント化の優先度が高い
