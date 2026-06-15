# ADR-016: テーマシステム（Catppuccin Latte/Mocha + FOUC 防止 + localStorage）

- **決定日**: 2026-05-25
- **作成日**: 2026-06-15
- **ステータス**: 承認済み（commit `c30b3dc`）

## 背景・課題

長時間使用する学習ツールとして、ライト/ダークの 2 テーマを提供したかった。また:

- ページ読み込み時にブラウザのデフォルト（白）が一瞬表示されてからダークテーマに切り替わる **FOUC（Flash of Unstyled Content）** を防ぐ必要があった
- CodeMirror 6 エディタのテーマも連動して切り替える必要があった（ADR-007 参照）
- テーマ選択を `localStorage` に永続化し、リロード後も維持する必要があった

## 決定

### テーマカラー

[Catppuccin](https://github.com/catppuccin/catppuccin) パレットを採用する。

| テーマ | CSS セレクタ | ベース |
|--------|-------------|--------|
| ライト（デフォルト） | `:root` | Catppuccin Latte |
| ダーク | `[data-theme="dark"]` | Catppuccin Mocha |

CSS カスタムプロパティ（`--bg`, `--surface`, `--text`, `--accent`, `--hl-*` 等）でビュー全体の色を管理する。

### FOUC 防止

`<head>` の最初に同期スクリプトを置き、`localStorage('jsv-theme')` が `'dark'` のとき **HTML パース完了前** に `<html data-theme="dark">` を適用する。

```html
<head>
  <script>
    if (localStorage.getItem('jsv-theme') === 'dark')
      document.documentElement.dataset.theme = 'dark';
  </script>
  <link rel="stylesheet" href="style.css">
  ...
</head>
```

### CodeMirror 連動

`MutationObserver` で `<html data-theme>` 属性の変化を監視し、`Compartment.reconfigure()` でエディタテーマを動的切り替えする（ADR-007 参照）。

### 永続化

`settings-panel.js` が `<html>` の `data-theme` 属性を管理し、変更時に `localStorage.setItem('jsv-theme', value)` を呼ぶ。

## 根拠

- **Catppuccin 採用の理由**: コントラスト比が十分で読みやすく、ライト/ダーク両方の美しいパレットが提供されている。色覚多様性対応も考慮した色設計
- **FOUC 防止の理由**: ダークテーマユーザーが画面の白いフラッシュを受けない体験を優先。`defer` や `DOMContentLoaded` では遅すぎるため、`<head>` 内の同期スクリプトが唯一の解
- **CSS カスタムプロパティ**: セレクタ切り替えだけで全コンポーネントの色が変わるため、ビューコードにテーマ分岐を書かなくて済む

## 結果・影響

- `localStorage` キー `jsv-theme` が確立された
- 各ビューは CSS カスタムプロパティを参照するだけでよく、テーマ切り替えのロジックを持たない
- FOUC 防止スクリプトはバンドルに含めず `index.html` の `<head>` に直書きする必要がある（ビルドツールのバンドルでは間に合わない）
