# ADR-034: `code`単体指定時もプレースホルダをコードタイトルにし、サンプル選択を選択不可にする

## ステータス

採択済み（2026-08-12）

## コンテキスト

ADR-032で`exercise`が指定されたときにサンプル選択のプレースホルダを演習タイトルに置き換える`setPlaceholderLabel()`を実装したが、`exercise`を伴わず`code`単体だけが指定されたケース（BhvVisualizerの「授業内コード解説の追体験」モード。`viewer-host.js`が`codeId`のみ設定し`exerciseSetId`を設定しない場合）には適用しておらず、プレースホルダは既定の「— サンプル —」のまま残っていた。

さらに、`code`単体指定時はセレクタの選択肢が指定コード1件だけになる（ADR-033）ため、そもそも選ぶ先が存在せず選択操作自体に意味がない。プレースホルダを開いて同じコードを選び直せてしまう状態は、学習者に「他にも選べるコードがあるのか」という誤った印象を与える。

## 決定

`exercise`を伴わない`code`単体指定時に限り、以下の2つを行う。

- サンプル選択のプレースホルダを、指定コードの`title`に置き換える（`exercise`単体・`exercise`+`code`のときと同じ扱い）
- サンプル選択自体を選択不可（`disabled`）にする

`exercise`が指定されている場合（`exercise`単体・`exercise`+`code`）は対象外とし、従来通りプレースホルダは演習タイトルのまま、セレクタは演習内の複数コードを切り替えられる状態を維持する。

### `code-editor.js`: `disableSampleSelect()`

```js
disableSampleSelect() {
  this.#sampleSelectLocked = true;
  this.#sampleSelect.disabled = true;
}
```

`setRunningMode(running)`は既にEdit/Run切り替えのたびに`this.#sampleSelect.disabled`を上書きしている（ADR-033以前からの既存挙動）。`disableSampleSelect()`呼び出し後もRunからEditへ戻る操作で再度選択可能に戻ってしまわないよう、`#sampleSelectLocked`フラグを追加し、以後は次の式で判定する。

```js
this.#sampleSelect.disabled = running || this.#sampleSelectLocked;
```

### `exercise-source.js`の変更

`code`取得時、`exercise`が同時指定されていない場合に限り、`setRemoteCodes`（ADR-033）に加えて`setPlaceholderLabel(code.title)`と`disableSampleSelect()`を呼ぶ。

```js
if (codeUrl) {
  const code = await fetchJson(codeUrl);
  if (!code) return editor.showError('コードが見つからないか非公開です');
  if (!exerciseUrl) {
    editor.setRemoteCodes([{ title: code.title, code: code.code }]);
    editor.setPlaceholderLabel(code.title);
    editor.disableSampleSelect();
  }
  editor.setCode(code.code, code.title);
}
```

### 安全性の担保

- Jestユニットテスト（`tests/core/exercise-source.test.js`）: `code`単体時に`setPlaceholderLabel(code.title)`・`disableSampleSelect()`が呼ばれること、`exercise`+`code`時には`disableSampleSelect()`が呼ばれないことを追加
- `verify-exercise-query.mjs`のテストD（`code`単体）に、プレースホルダがコードタイトルになること・セレクタが`disabled`になることの確認を追加（18件、既存16件から純増2件）

## 結果

- Jestユニットテスト（84件）・`verify-exercise-query.mjs`（18件）が全て合格

## 代替案

- **`code`単体時もセレクタに選択肢を残したまま`disabled`にしない**: 不採用。選べても切り替え先が同じコード1件しかなく、選択操作自体が無意味なノイズになる
- **プレースホルダの置き換えと選択不可化を別々のオプションにする**: 不採用。`code`単体指定という同一条件から常にセットで導かれる挙動であり、呼び出し側で分岐させる理由がない

## 今後の方針

ADR-030の運用ルールの通り、重要な設計判断を伴う変更は都度ADRを追加する。
