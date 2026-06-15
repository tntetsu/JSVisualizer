# ADR-002: DebuggerAdapter を単一の真実の源とする

- **決定日**: 2026-05-25
- **作成日**: 2026-06-14
- **ステータス**: 承認済み

## 背景・課題

16 種類のビューがすべて同じ「現在の実行状態」を参照する必要がある。各ビューが `JSDebugger` を直接参照すると以下の問題が生じる。

- API の変更がすべてのビューに波及する
- 差分検出（変化した変数の特定）がビューごとに重複実装される
- callStack の順序規約（後述 ADR-010）など細かい正規化ロジックが散在する

## 決定

`src/core/debugger-adapter.js` が `JSDebugger` インスタンスと `cursor` を一元管理し、正規化済みの `AppState` オブジェクトを生成・配信する。ビューは `adapter.getState()` の結果のみを参照し、`JSDebugger` を直接見ない。

```js
// AppState の構造（正規化済み）
{
  cursor,          // 現在位置
  totalSteps,      // trace.length
  event,           // 現在の TraceEvent
  variables,       // getVariables('all')
  scopes,          // env[] スコープチェーン
  callStack,       // getCallStack()
  frameEnvs,       // 外側フレームの callEnv スナップショット
  changedVars,     // 前ステップから変化した変数名の配列
  consoleOutput,   // console.log の出力
  done,            // isDone()
}
```

イベントバスとして `EventTarget` を継承し、`'ready'` / `'step'` / `'error'` カスタムイベントを dispatch する。

## 根拠

- ビュー間で直接通信が不要になり、依存関係がシンプルになる
- 差分検出（`changedVars`）を 1 か所に集約できる
- `JSDebugger` の API が変わっても `DebuggerAdapter` 内だけ修正すれば済む

## 結果・影響

- `app.js` が唯一の「配線役」となり、ビューは受け身の更新のみを行う
- エラーハンドリング（parse / runtime の判別）も `DebuggerAdapter.load()` に集約された（ADR-017 参照）
- `frameEnvs` のような JSInterpreter 拡張の影響も `DebuggerAdapter` の `#buildState()` 内で吸収できた
