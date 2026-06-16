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

### トレース整合性の保持（`_trimFailedTryBlock`）

ホスト例外が発生すると、`recorder.record()` が exit イベントを積む前に制御が移るため、
try ブロック内の一部イベントが `matchIdx === -1` のまま残る（**dangling enter**）。

ここで「try ブロックのイベントを全削除」すると、例外発生前に成功した文の実行過程が
見えなくなり教育的価値が失われる。一方「dangling enter を放置」すると `stepOver` が
誤った位置へジャンプする（matchIdx が catch ブロック内を指すため catch 全体をスキップ）。

そこで `debugger.js` の `ExecutionError` 後処理と同じ **2 ステップ方式**を try ブロック
範囲（`blockTraceStart` 以降）に限定して適用する：

1. **末尾から走査し、完了した子ノードを一切持たない dangling enter を除去する。**  
   完了した子を持つ enter（例: `null.foo` の `null` リテラルが評価済みの
   `MemberExpression` enter）はそのまま残す。  
   → 失敗した文の部分評価過程（式ステップで確認可能）がトレースに残る。

2. **残存する `matchIdx === -1` を `tr.length`（= catch ブロック先頭）に更新する。**  
   → `stepOver` が catch ブロック先頭へ正しくジャンプする。

```js
// interpreter.js（evaluate() 定義の直前）
function _trimFailedTryBlock(tr, blockTraceStart) {
  if (tr.length <= blockTraceStart) return;

  // ① 末尾の dangling enter を除去
  let tail = tr.length - 1;
  while (tail >= blockTraceStart && tr[tail].matchIdx === -1) tail--;
  tr.length = tail + 1;

  // ② 残った matchIdx === -1 を catch ブロック先頭に更新
  for (let j = blockTraceStart; j < tr.length; j++) {
    if (tr[j].matchIdx === -1) tr[j].matchIdx = tr.length;
  }
}

// _eval() の TryStatement case
case 'TryStatement': {
  const blockTraceStart = recorder ? recorder.trace.length : 0;
  let result;
  try {
    result = evaluate(node.block, env, recorder, d, callDepth);
  } catch (hostErr) {
    if (/^\[MaxSteps\]/.test(hostErr?.message)) throw hostErr;
    if (recorder) _trimFailedTryBlock(recorder.trace, blockTraceStart);
    result = new ThrowSignal(hostErr);
  }
  if (result instanceof ThrowSignal && node.handler) {
    const catchEnv = new Environment(env);
    if (node.handler.param) bindPattern(node.handler.param, result.value, catchEnv, recorder, d, callDepth);
    result = evaluate(node.handler.body, catchEnv, recorder, d, callDepth);
  }
  if (node.finalizer) {
    const finResult = evaluate(node.finalizer, env, recorder, d, callDepth);
    if (finResult instanceof ReturnSignal || finResult instanceof ThrowSignal) return finResult;
  }
  return result;
}
```

### humanStep の追加ルール（`debugger.js`）

ホスト例外対応に伴い、`buildHumanIndices()` に 2 つのルールを追加した。

#### rule ⑥ — ネイティブ関数呼び出し（`ExpressionStatement` exit）

`console.log(x)` のような純粋なネイティブ関数呼び出し文は、呼び出しが `callDepth` を
増加させないため rule②（ユーザー定義関数）にも rule①（代入）にも該当せず、
humanStep の停止点が生成されなかった。

→ 対応する enter〜exit 区間に既存の humanSet メンバーがない `ExpressionStatement` の
exit を humanSet に追加する（二重停止を防ぐため、内部に停止点がある場合は追加しない）。

#### rule ⑥b — 失敗した `ExpressionStatement`（enter のみ、exit なし）

try ブロック内でホスト例外が発生した文は、_trimFailedTryBlock 後も enter は残るが
対応する exit が存在しない。rule⑥ は exit を起点とするため適用されない。

→ 正常な exit（`trace[matchIdx].phase === 'exit'` かつ `trace[matchIdx].matchIdx === i`）
を持たない `ExpressionStatement` enter を humanSet に追加する。

これにより「式ステップで部分評価を確認 → 人/文ステップで失敗した文に停止」が可能になる。

```js
// debugger.js の buildHumanIndices() 末尾（rule⑥ の直後）

// ⑥ ExpressionStatement exit（ネイティブ呼び出し等）
for (let i = 0; i < trace.length; i++) {
  const ev = trace[i];
  if (ev.phase === 'exit' && ev.nodeType === 'ExpressionStatement') {
    const enterIdx = ev.matchIdx;
    if (enterIdx < 0 || enterIdx >= trace.length) continue;
    let hasInner = false;
    for (let j = enterIdx + 1; j < i; j++) {
      if (set.has(j)) { hasInner = true; break; }
    }
    if (!hasInner) set.add(i);
  }
}

// ⑥b 失敗した ExpressionStatement enter（exit が存在しない）
for (let i = 0; i < trace.length; i++) {
  const ev = trace[i];
  if (ev.phase === 'enter' && ev.nodeType === 'ExpressionStatement') {
    const m = ev.matchIdx;
    const hasProperExit = m >= 0
      && m < trace.length
      && trace[m].phase === 'exit'
      && trace[m].nodeType === 'ExpressionStatement'
      && trace[m].matchIdx === i;
    if (!hasProperExit) set.add(i);
  }
}
```

## 根拠

- ユーザーコードで `try { null.foo; } catch(e) { ... }` が動かないのは教育ツールとして致命的
- ホスト Error オブジェクトをそのまま `ThrowSignal.value` にすることで、
  ユーザーコードは `.message`・`.name` 等を通常どおりアクセスできる
- `[MaxSteps]` 超過はユーザーが catch できないシステム停止であり、例外として再スローが正しい
- トレースクリーンアップの 2 ステップ方式は `debugger.js` の `ExecutionError` 後処理と
  同一アルゴリズムであり、一貫性がある
- try ブロックを全削除（`tr.length = blockTraceStart`）すると、例外発生前の成功した文や
  失敗した文の部分評価が不可視になり教育的価値が失われるため採用しない

## 既知の制限

- `BlockStatement` の enter 位置で `stepOver` を呼ぶと、その BS の内容が全スキップされる。
  これは try ブロック・catch ブロックを含むすべての `BlockStatement` で共通の動作であり、
  try-catch 固有の問題ではない。`humanStep` を使えば各文を順に辿れる。

## 結果・影響

- `try-catch` が意図どおり機能するようになった（`null.foo`・未定義変数参照・`throw new Error()` 等）
- catch ブロック内の文を `stepOver`・`humanStep` で 1 文ずつ進められる
- `console.log` のみの catch ブロックも `humanStep` が各文で停止する
- try ブロック内の失敗した文が式/人/文ステップの停止点として現れる（部分評価も確認可能）
- `finally` ブロックは既存実装で正しく処理されるため変更なし
- ホスト例外メッセージは日本語（`RuntimeError`: `"null/undefined のプロパティアクセス"` 等）になる場合がある
- `[MaxSteps]` は引き続きユーザーコードで catch 不可（ADR-017 参照）
