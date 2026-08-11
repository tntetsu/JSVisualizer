# ADR-030: `error-msg` の `hidden` 属性がCSSカスケードで無効化される不具合の修正

## ステータス

採択済み（2026-08-12）

## コンテキスト

Phase 2向けの検証スクリプト（BhvVisualizer側、`verify-exercise-query.mjs`）を作成中、`#error-msg` のエラー表示/非表示がPlaywrightの `isVisible()` で不安定に判定される現象を発見した。

調査の結果、`web/style.css` の `.error-msg { display: flex; ... }`（作者定義スタイル、通常優先度）が、`hidden` 属性に対するブラウザ既定のUAスタイルシートルール `[hidden] { display: none }` を上書きしていたことが原因と判明した。CSSのカスケードは詳細度を比較する前に「スタイルの出処（origin）」で優先順位が決まり、author normal スタイルは user-agent normal スタイルに常に勝つ。`.error-msg` 側に `[hidden]` 状態を打ち消すルールが存在しなかったため、`hidden` 属性を `true` にしても要素は `display: flex` のまま実際にはレイアウト上のスペースを占有し続けていた（`el.hidden` プロパティ自体は正しく切り替わっており、`showError()` の呼び出しロジックにバグはない。あくまで視覚的な表示のみが影響を受けていた）。

`code-editor.js` の `showError()` は `this.#errorEl.hidden = true/false` というネイティブの `hidden` プロパティを直接操作している。他の要素（`#settings-panel`・`#code-display`）は独自の `.hidden { display: none !important; }` クラスで表示切り替えを行っており `!important` のため影響を受けないが、`#error-msg` だけはこの安全網の外にあったため、このバグの影響を受けていた。

この不具合はBhvVisualizerとの連携とは無関係で、スタンドアロン利用時にも同様に発生する一般的な不具合であり、`# BHV:` タグの範囲外・JSVisualizer単体の改良として扱う。

## 決定

`.error-msg[hidden] { display: none; }` を追加し、`hidden` 属性が真の場合に明示的に `display: none` を適用する。属性セレクタを加えることで詳細度が `.error-msg` 単体（クラスセレクタ1つ）より高くなり（クラス+属性セレクタ2つ）、同じ作者スタイル同士の比較では詳細度の高い方が勝つため、意図通り非表示になる。

### 変更ファイル

- **`web/style.css`**: `.error-msg` ルールの直後に `.error-msg[hidden] { display: none; }` を追加

### 安全性の担保

実ブラウザ（Playwright）で、エラー表示前後の `isVisible()` が `hidden` プロパティの実際の値と一致することを確認した。既存のJestユニットテスト（81件）・`verify-bhv-hook.mjs`（13件）・`verify-exercise-query.mjs`（9件）がいずれもリグレッションなく合格することを確認した（`verify-exercise-query.mjs`は当初この不具合を回避するため `el.hidden` を直接参照していたが、本修正後は素直な `isVisible()` ベースの検証に戻した）。

## 結果

- 既存Jestテストスイート（81件）・`verify-bhv-hook.mjs`（13件）・`verify-exercise-query.mjs`（9件）がリグレッションなく全て合格
- `#error-msg` の表示/非表示が `hidden` プロパティ・実際の見た目・Playwrightの `isVisible()` の三者で一致するようになった

## 代替案

- **`showError()` を `.hidden` クラスのトグル方式に統一する**: 不採用。`#settings-panel`・`#code-display` と同じ方式に揃えられる利点はあるが、`code-editor.js` 側の変更範囲が広がる。CSS側の1行追加で解決できるため、より小さい変更を選んだ
- **`!important` を使う**: 不採用。属性セレクタによる詳細度の引き上げだけで十分に解決でき、`!important` は今後の保守で優先度の把握を難しくするため避けた

## 今後の方針

JSVisualizer単体の改良のための変更、および外部埋め込み利用者（BhvVisualizer）からの要求による変更のいずれについても、重要な設計判断を伴う場合は都度ADRを追加する（本ADRでの運用ルール改定、`docs/adr/README.md`・`CLAUDE.md`参照）。
