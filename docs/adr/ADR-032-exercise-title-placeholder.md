# ADR-032: `exercise`レスポンスの`title`をサンプル選択のプレースホルダに表示する

## ステータス

採択済み（2026-08-12）

## コンテキスト

ADR-031で`exercise`クエリのレスポンス形式を`{ codes: [{ title, code }] }`に簡素化し、実際に使っていなかった演習自体の`title`を削除した。

しかし、`exercise`が指定された状態でJSVisualizerを開いたとき、サンプル選択（`<select id="sample-select">`）の表示が既定の「─ サンプル ─」のままだと、学習者は今どの演習を開いているのか分からない。特に`exercise`+`code`の組み合わせ（BhvVisualizerの課題用演習の主要な利用形態）では、IDでの突き合わせを廃止した結果（ADR-031）、`code`で読み込んだコードがサンプル選択のどのオプションにも対応しない状態になり、セレクタは常に既定のプレースホルダを表示したままになっていた。

## 決定

`exercise`レスポンスに任意の`title`フィールドを追加できるようにし、指定されていればサンプル選択のプレースホルダ（値`""`のoption）をその演習タイトルに置き換える。

```
GET <exercise の値>
  200 OK → { title?: string, codes: [{ title, code }] }
```

### `code-editor.js`: `setPlaceholderLabel(title)`

```js
setPlaceholderLabel(title) {
  const placeholder = this.#sampleSelect.querySelector('option[value=""]');
  if (!placeholder) return;
  placeholder.removeAttribute('data-i18n');
  placeholder.textContent = title;
}
```

プレースホルダのoptionは元々`data-i18n="sample-ph"`属性を持ち、言語切替（`applyI18n()`）のたびに既定の翻訳文字列で上書きされる。演習タイトルを設定した後にこの属性を残すと、学習者が後から言語を切り替えた瞬間にタイトルが消えてしまうため、`data-i18n`属性を明示的に外す。

### `exercise-source.js`の変更

- `exercise`のレスポンスに`title`があれば`editor.setPlaceholderLabel(title)`を呼ぶ
- `exercise`のみ指定時の先頭コード自動読み込みで、これまで`setCode(first.code, first.title, 'remote:0')`とセレクタの値も変更していたが、**セレクタの値は変更しないよう修正**した（`setCode(first.code, first.title)`）。セレクタの値まで`remote:0`にしてしまうと、先頭コードのタイトルが表示され、演習タイトルの表示が隠れてしまうため。エディタに何が読み込まれているかは`#program-name`欄（既存の仕組み）で分かるため、サンプル選択は「今どの演習を見ているか」を示す役割に一本化した

### 安全性の担保

`verify-exercise-query.mjs`に、`exercise`のみ・`exercise`+`code`の両パターンでプレースホルダのテキストが演習タイトルになることの確認を追加した（2件、既存12件に追加し計14件）。

## 結果

- Jestユニットテスト（84件、新規1件を含む）が全て合格
- `verify-exercise-query.mjs`（14件）・`verify-bhv-hook.mjs`（13件）がリグレッションなく合格

## 代替案

- **`title`を必須項目にする**: 不採用。既存のBhvVisualizer以外のAPI実装（自前ホスト等）が`title`を返さないケースを許容し、その場合は既定のプレースホルダのままにする方が後方互換的で親切
- **プレースホルダではなく`#program-name`欄に演習タイトルも併記する**: 不採用。`#program-name`は「現在エディタに表示されているコードの名前」という既存の役割が明確なため、そこに演習タイトルまで詰め込むと役割が曖昧になる。サンプル選択のプレースホルダ位置は元々使われていない空き領域であり、「今ブラウズしている演習」を示す場所として自然

## 今後の方針

ADR-030の運用ルールの通り、重要な設計判断を伴う変更は都度ADRを追加する。
