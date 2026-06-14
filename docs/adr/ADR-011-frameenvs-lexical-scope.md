# ADR-011: lexical scope 問題と frameEnvs による解決

- **決定日**: 2026-06-04（v1.0 対応）
- **作成日**: 2026-06-14
- **ステータス**: 承認済み（commit `c69a50e`、docs v1.0 改訂）

## 背景・課題

JavaScript は lexical scoping（静的スコープ）を採用しており、JSInterpreter も `callFunction` 内で `new Environment(callee.closure)` としてスコープを生成する（呼び出し元スコープではなく定義元スコープが親になる）。

この結果、以下の状況で外側フレームの変数が `env` チェーンに含まれない問題が発生した。

- **相互再帰・同一スコープの関数間** (例: `quickSort` と `partition` が同じスコープで定義されている場合、`partition` 実行中に `quickSort` のローカル変数は env チェーンに存在しない)
- **純粋再帰** (例: `factorial(3)` が `factorial(2)` を呼ぶとき、`factorial(3)` の `n=3` は env チェーンに存在しない)

commit `a10b4cf` (2026-06-03) では `callStack[i].args` から変数を再構築する暫定対応をしたが、引数以外のローカル変数（`let result = ...` 等）が取得できなかった。

## 決定

JSInterpreter の `Recorder` クラスを拡張し、アクティブなコールフレームの `callEnv`（`Environment` オブジェクト）への参照を `frameEnvStack` で管理する。TraceEvent 生成時に `snapshotOwn()`（自スコープのバインディングのみのディープクローン）を呼んで `frameEnvs` フィールドとして記録する。

```js
// Environment に追加
snapshotOwn() {
  const frame = {};
  for (const [k, v] of this.bindings) frame[k] = deepClone(v);
  return frame;
}

// Recorder での管理
this.frameEnvStack = [];           // push order: outer to inner
callFunction → frameEnvStack.push(callEnv);
// 関数終了 → frameEnvStack.pop();
// record() → frameEnvs = frameEnvStack.map(e => e.snapshotOwn())
```

`mergeScopesForDisplay(scopes, callStack, frameEnvs)` で:
- 最内側フレーム: `scopes[0]〜scopes[M-2]` を全マージ（ブロックスコープ含む）
- 外側フレーム: `frameEnvs[i]` を使用（params・デフォルト引数・function-body 変数を正確に表示）

## 根拠

- `callStack.args` による再構築（旧実装）は引数しか復元できず、関数本体の `let/const/var` が欠落した
- live な `Environment` への参照を `snapshotOwn()` で複製することで、任意のステップでの外側フレーム状態を正確に取得できる
- `StateView`・`MemoryView`・`ScopeView`（非アクティブ）で共通の `mergeScopesForDisplay()` を呼ぶことで実装が統一された

## 結果・影響

- `TraceEvent` に `frameEnvs: Object[]` フィールドが追加された（JSInterpreter の API 変更）
- `AppState` に `frameEnvs` フィールドが追加され、ビューがアクセス可能になった
- `format.js` の `mergeScopesForDisplay()` が第 3 引数 `frameEnvs` を受け取るよう更新された
- この変更は JSInterpreter 側の修正も含むため、JSVisualizer とのバージョン整合性が重要
