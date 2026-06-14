# ADR-007: CodeMirror 6 の採用（シンタックスハイライト付きエディタ）

- **決定日**: 2026-05-26
- **作成日**: 2026-06-14
- **ステータス**: 承認済み（commit `a0b3a16`）

## 背景・課題

初期実装では `<textarea>` を使ったシンプルなエディタを使用していた。しかしシンタックスハイライトのないエディタでは、学習者がコードを読み書きする体験が損なわれる。また、ダーク/ライトテーマ切り替え（ADR: テーマシステム参照）に連動してエディタの色も切り替える必要があった。

## 決定

CodeMirror 6（`codemirror` + `@codemirror/lang-javascript` + `@codemirror/theme-one-dark`）を採用する。テーマ動的切り替えには `Compartment` を使用し、`MutationObserver` で `html[data-theme]` 属性の変化を監視してテーマを自動適用する。

```js
const themeCompartment = new Compartment();

const obs = new MutationObserver(() => {
  const isDark = document.documentElement.dataset.theme === 'dark';
  view.dispatch({ effects: themeCompartment.reconfigure(isDark ? oneDark : lightTheme) });
});
obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
```

## 根拠

- CodeMirror 6 は ES Module 対応で esbuild とのバンドルが容易
- `Compartment` による動的設定変更が公式 API として提供されており、テーマ切り替えに追加のハックが不要
- 実行中はエディタを非表示（`container.hidden = true`）にしてコードビューに切り替えるため、実行前だけ CM が必要。オーバースペックにはならない

## 結果・影響

- `components/code-editor.js` が CM のラッパーとなり、`getCode()` / `setCode()` / `showError()` の簡潔な API を提供
- `<textarea>` の `placeholder` テキストが数値として解釈されるバグ（commit `7d4cade`）は CM 導入後に解消された
- バンドルサイズが増加したが GitHub Pages での配信では問題にならなかった
