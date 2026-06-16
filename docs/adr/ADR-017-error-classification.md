# ADR-017: エラーハンドリング（分類・位置表示・ブリンク）

- **決定日**: 2026-05-25
- **更新日**: 2026-06-16（エラー位置ジャンプ＆ブリンク機能を追記）
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

---

## 追記（2026-06-16）: エラー位置の特定とエディタ上のフィードバック

### 背景

エラーが「どの行で起きたか」を伝えるだけでなく、コードエディタ上でその行に自動的にカーソルを移動してブリンク強調する機能を追加した。実装にあたって非自明なトレードオフが複数あったため記録する。

### 決定 1: `loc` の抽出優先順位

JSInterpreter が throw する各エラー型は、位置情報の持ち方がばらばらである。

| エラー型 | 位置情報 |
|---------|---------|
| ParseError / LexError | `err.line`, `err.column` プロパティ |
| RuntimeError | `err.loc` オブジェクト（`{ line, column }`） |
| SyntaxError（JS ネイティブ） | なし |
| 文字列メッセージのみ | `[Parser] 5:10: ...` 形式 |

これらを統一的に `errLoc: { line, column }` に正規化するため、以下の優先順で抽出する：

```js
let errLoc = null;
if (err?.loc && typeof err.loc.line === 'number' && err.loc.line > 0) {
  errLoc = err.loc;                                         // RuntimeError
} else if (typeof err?.line === 'number' && err.line > 0) {
  errLoc = { line: err.line, column: err.column ?? 0 };    // ParseError / LexError
} else {
  const m = msg.match(/^\[(?:Parser|Lexer|Runtime)\]\s+(\d+):(\d+):/);
  if (m) errLoc = { line: +m[1], column: +m[2] };          // メッセージフォールバック
}
```

最後の正規表現フォールバックは、JSInterpreter が将来的に新しいエラー型を追加した場合でもメッセージ形式が統一されていれば位置情報を拾えるようにするための安全網である。

`errLoc` は `detail.loc` として `'error'` イベントに乗せて dispatch し、`app.js` が `editor.showError(msg, errorType, loc)` へ転送する。

### 決定 2: エラー行ブリンクに `background` ではなく `box-shadow: inset` を使う

直感的には `background-color` のキーフレームアニメーションでブリンクを実装したくなるが、**CodeMirror 6 の One Dark テーマが `.cm-activeLine` に `background: transparent !important` を設定するため、keyframe の `background` 指定はすべて無効化される**。

代わりに `box-shadow: inset 0 0 0 9999px <color>` を使う。`inset` の spread 値を 9999px にすることで要素全体を塗りつぶす効果を得られ、CM テーマは `box-shadow` を上書きしないため正常に動作する。

```css
@keyframes cm-error-line-blink {
  0%, 100% { box-shadow: none; }
  30%, 70%  { box-shadow: inset 0 0 0 9999px rgba(220, 38, 38, 0.18); }
}
.cm-error-blink .cm-activeLine {
  animation: cm-error-line-blink 0.55s ease 3 !important;
}
```

ライトテーマと One Dark テーマの両方で `.cm-activeLine` に `background: transparent !important` が設定されていることを確認済み。CM テーマ変更時はこの制約が変わる可能性がある。

### 決定 3: ダブル RAF パターンでブリンク開始を遅延する

`this.#view.dispatch({ selection: ... })` でカーソルを移動しても、CodeMirror が `.cm-activeLine` クラスを DOM に付与するのはその後の独自レンダリングサイクル（RAF）である。単一 RAF では CM のレンダリングが完了する前にブリンク用クラスを付与してしまい、`.cm-activeLine` が存在しないため何も点滅しない。

ダブル RAF（`requestAnimationFrame(() => requestAnimationFrame(() => { ... }))`）を挟むことで、2 サイクル待って `.cm-activeLine` の確定後にブリンクを開始する。

```js
editorEl.classList.remove('cm-error-blink');
requestAnimationFrame(() => requestAnimationFrame(() => {
  editorEl.classList.add('cm-error-blink');
  setTimeout(() => editorEl.classList.remove('cm-error-blink'), 1800);
}));
```

`classList.remove` → RAF × 2 → `classList.add` の順で行うことで、同一行に再度ジャンプしたとき（バッジクリック時）にアニメーションをリセットして再生できる。

### 決定 4: バッジクリック時に `mousedown` で `preventDefault`

エラーバッジを `click` でハンドルするだけでは機能しない。`mousedown` がエディタからフォーカスを奪い、フォーカスを失った CodeMirror は `.cm-activeLine` クラスを削除する。その後 RAF を待っても `.cm-activeLine` が存在しないためブリンクが起きない。

`mousedown` で `e.preventDefault()` することでフォーカス遷移を抑制し、エディタのフォーカスを維持したまま `click` ハンドラが実行される。

```js
this.#errorEl.addEventListener('mousedown', (e) => {
  if (this.#errorLoc) e.preventDefault(); // loc がないときはデフォルト動作を維持
});
this.#errorEl.addEventListener('click', () => {
  if (this.#errorLoc) this.#moveCursorToError(this.#errorLoc);
});
```

## 根拠

- 「どこに書き方の間違いがあるか（構文）」と「実行中に何が起きたか（実行時）」は性質が異なり対処法も違う → 二分類は妥当
- `maxSteps` 超過はスタックオーバーフロー・TypeError・ReferenceError と同じ「実行中に起きた問題」であり、別カテゴリにする必然性がない（JS ではゼロ除算は例外ではなく `Infinity` を返す）
- 構文エラーはパース段階（`evaluate()` 呼び出し前）で throw されるため部分トレースを持たない。実行エラーは `evaluate()` 中に起きるため常に部分トレースを持てる。この差が分類の本質的な意味

## 結果・影響

- エラーハンドリングが `DebuggerAdapter.load()` に一元集約された（ADR-002 参照）
- `CodeEditor.showError(msg, errorType, loc)` API が `errorType` と `loc` 引数を受け取るよう設計された
- `JSDebugger.fromTrace()` 静的ファクトリが追加された（コンストラクタをバイパスして部分トレースから debugger を構築）
- `Recorder` が `maxSteps` を受け取るよう拡張された（`interpreter.js`）
- `ExecutionError` クラスが追加された。`evaluate()` 中に発生したすべての実行時エラーを部分トレースとともに包む
- JSInterpreter のパーサーが `[Parser]` プレフィックス規則を変更した場合は判定ロジックの更新が必要
- CM テーマが `box-shadow` を `!important` で上書きするようになった場合はブリンク実装の再検討が必要
