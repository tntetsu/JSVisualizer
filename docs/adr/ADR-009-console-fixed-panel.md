# ADR-009: Console 出力を常時表示の固定パネルに分離

- **決定日**: 2026-05-26
- **作成日**: 2026-06-14
- **ステータス**: 承認済み（commit `360300b`）

## 背景・課題

当初 `console.log` の出力は `StateView`（変数パネル）内の 1 カードとして表示していた。しかしビューを「配列」「ヒートマップ」等に切り替えると console 出力が見えなくなり、デバッグに不便だった。学習者がどのビューを見ていても console 出力を参照できる必要があった。

## 決定

`StateView` から Console カードを取り除き、`debug-pane`（右側パネル）の下部に固定の `#console-panel` を配置する。`app.js` の `updateConsolePanel(state)` が `'ready'` / `'step'` イベントごとに更新する。パネル上端の `#console-resizer` をドラッグして高さを変更できる（40〜400px、`localStorage('jsv-console-h')` に永続化）。

## 根拠

- ビュー切り替えに依存せず常時表示できる
- StateView のスクロール領域が console の長さに引っ張られなくなり、変数パネルの視認性が向上した
- 高さを可変にしたことで、console 出力が多い場合も少ない場合も適切に使えるようになった

## 結果・影響

- `jsv-console-h` が localStorage の永続化キーとして追加された
- StateView のスクロール実装も変更が必要になった（`display:flex` を `display:block` に変更することで `overflow-y: auto` が正常動作するようになった）
