# ADR-015: ScopeView・CallStackView のタブ非登録化

- **決定日**: 2026-06-04
- **作成日**: 2026-06-14
- **ステータス**: 承認済み（commit `bf9d8c5`）

## 背景・課題

初期設計では `scope-view`（スコープ・変数ビュー）と `callstack-view`（コールスタックビュー）が独立したタブとして存在していた。しかし `state-view`（変数・コールスタック統合パネル）が常時右側に表示されており、その中にすでに「変数」と「コールスタック」のカードが含まれていた。

独立タブとして残すことで:
- タブ一覧が増え、他のビューへのアクセスが埋もれる
- `state-view` との内容重複が生じる
- `scope-view` が提供していた「スコープ別のネスト表示」は `mergeScopesForDisplay()` の改善で `state-view` に統合された

## 決定

`src/views/scope-view/` および `src/views/callstack-view/` のコードは残すが、`app.js` のタブ登録から除外する（非アクティブ化）。`state-view` の統合表示で代替する。

```js
// app.js — これらの register() 呼び出しを削除
// switcher.register('scope',     'スコープ',    ScopeView);
// switcher.register('callstack', 'コールスタック', CallStackView);
```

## 根拠

- `state-view` が `mergeScopesForDisplay()` でフレームごとのスコープを表示するよう改善されたことで、独立タブの必要性がなくなった
- タブ数を減らすことで、実際に有用なビューへのアクセスが改善された
- コードを削除せず残したのは、将来的に異なる形で再利用する可能性を残すため

## 結果・影響

- タブ登録数が 15 → 13 になった
- `state-view` の `mergeScopesForDisplay()` が「公式の」スコープ表示として確立された
- ScopeView / CallStackView のコードは参照実装として残る

## 追記（2026-08-05）

`src/views/callstack-view/` は非登録のまま2ヶ月以上再利用されなかったため、[ADR-026](ADR-026-callstack-view-simplification.md) で `state-view` を `StateView`→`CallStackView` にリネームする際に名前が衝突した。再利用実績がなかったことから、`callstack-view/` ディレクトリ自体を削除し、`CallStackView` という名前は `state-view/index.js` の新クラスに一本化した。`scope-view/` は今回の対象外のため残置する。
