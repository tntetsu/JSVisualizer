# ADR-033: `exercise`/`code`指定時は組み込みサンプルをサンプル選択から取り除く

## ステータス

採択済み（2026-08-12）

## コンテキスト

ADR-031〜032の実装後、実際にデプロイした[デモページ](https://tntetsu.github.io/JSVisualizer/?exercise=https%3A%2F%2Ftntetsu.github.io%2FJSVisualizer%2Fsamples%2Fexercise-demo.json)を実機で確認したところ、サンプル選択を開いても「─ Exercise ─」グループが見当たらないという指摘があった。

原因は、`addRemoteGroup()`が演習のコード群を**組み込み8グループ（Search・Sort系×4・Math/Algorithms・Data Structures・Scope/Objects・Study Tasks）の一番後ろに追加**していたため。ドロップダウンを開いてもスクロールしないと見えない位置にあり、外部から演習用に開いているにもかかわらず、無関係な組み込みサンプルの下に埋もれてしまっていた。

当初は「組み込みサンプルより前に挿入する」という並べ替えで対応しようとしたが、レビューの結果、そもそも**外部からURLで開いているセッションに無関係な21種の組み込みサンプルを混在させる必要がない**という指摘を受けた。

## 決定

`exercise`または`code`が指定されている間、サンプル選択から組み込みサンプルを完全に取り除き、指定されたコードだけを選択肢にする。

- `exercise`のみ／`exercise`+`code` → サンプル選択の選択肢は演習の`codes`一覧だけになる
- `code`のみ → サンプル選択の選択肢は指定コード1件だけになる
- クエリなし（スタンドアロン起動） → 影響なし。従来通り21種の組み込みサンプルを選択できる

### `code-editor.js`: `addRemoteGroup()` を `setRemoteCodes(items)` に置き換え

```js
setRemoteCodes(items) {
  this.#remoteCodes.clear();
  this.#sampleSelect.querySelectorAll('optgroup').forEach((el) => el.remove());
  items.forEach((item, index) => {
    const key = `remote:${index}`;
    this.#remoteCodes.set(key, { title: item.title, code: item.code });
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = item.title;
    this.#sampleSelect.appendChild(opt);
  });
}
```

組み込みサンプルは全て`<optgroup>`の中に入っている（`#buildSampleOptions()`参照）ため、全`<optgroup>`を削除するだけで組み込みサンプルだけを取り除ける。プレースホルダの`<option value="">`は`<optgroup>`の外にあるため影響を受けない。

### `exercise-source.js`の変更

- `exercise`取得時: `editor.addRemoteGroup('─ Exercise ─', exercise.codes)` → `editor.setRemoteCodes(exercise.codes)`（optgroupのラベル引数は不要になった。選択肢が演習のコードだけになったため、グループ分けする意味がなくなったため）
- `code`取得時: `exercise`が同時に指定されていない場合のみ `editor.setRemoteCodes([{ title: code.title, code: code.code }])` を呼び、コード1件だけの選択肢にする。`exercise`+`code`の場合は、`exercise`側で既に演習全体の一覧をセットしているため、`code`側では上書きしない

### 安全性の担保

`verify-exercise-query.mjs`を更新し、以下を確認した（16件、既存14件から純増2件）。

- `exercise`のみ・`exercise`+`code`: `<optgroup>`が0件になり、選択肢が演習のコード一覧そのもの（配列の順序も含めて）になること
- `code`のみ: `<optgroup>`が0件になり、選択肢が指定コード1件だけになること
- クエリなし: 組み込みサンプル（Factorial等）を引き続き選択・実行できること（回帰確認）

デプロイ済みのデモ（`web/samples/exercise-demo.json`・`code-demo.json`）でも、ローカルサーバー上で同様の確認を行った。

## 結果

- Jestユニットテスト（84件）・`verify-exercise-query.mjs`（16件）・`verify-bhv-hook.mjs`（13件）がリグレッションなく全て合格

## 代替案

- **「─ Exercise ─」グループを組み込みサンプルより前に挿入するだけ（並べ替え）**: 当初この案を実装したが、レビューで「そもそも無関係な組み込みサンプルを混在させる必要があるのか」という指摘を受け不採用に変更した。外部URLで開く用途では、選択肢に無関係なサンプルが並んでいること自体が学習者にとってノイズになる
- **組み込みサンプルを非表示にせず`disabled`にする**: 不採用。選択肢として残り続けることに変わりはなく、視覚的なノイズを減らす目的を達成できない

## 今後の方針

ADR-030の運用ルールの通り、重要な設計判断を伴う変更は都度ADRを追加する。
