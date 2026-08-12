# ADR-035: エディタの折り返し表示を常時有効にする

## ステータス

採択済み（2026-08-12）

## コンテキスト

BhvVisualizer側でADR-034に続き、課題用コードの問い（`question.prompt`）を`sourceCode`の先頭にコメントとして埋め込む機能が追加された（BhvVisualizer側 `functions/src/question-comment.js`）。問いの文言は42文字程度で折り返してコメント化されるが、それでも1行が画面幅を超えることがあり、CodeMirrorの既定動作（折り返しなし・横スクロール）では問いの文末が見切れてしまう。

問いのコメントに限らず、長い変数名・長い式を含むコード全般でも同様に横スクロールが必要になり、特にBhvVisualizer埋め込み時のように表示幅が限られる場面で読みにくい。

## 決定

CodeMirrorのソースエディタに`EditorView.lineWrapping`拡張を常時有効にする。トグル切り替えは設けず、常時オンとする。

```js
this.#view = new EditorView({
  state: EditorState.create({
    doc: initialCode,
    extensions: [
      basicSetup,
      javascript(),
      keymap.of([indentWithTab]),
      lightTheme,
      EditorView.lineWrapping,
      this.#themeCompartment.of(isDark ? oneDark : []),
    ],
  }),
  parent: this.#container,
});
```

`# BHV:`タグは付けない。BhvVisualizer連携専用の配線ではなく、JSVisualizer単体でも横スクロールなしで長い行を読めるようになる、単体としても価値のある機能改善のため（CLAUDE.md「JSVisualizer単体の機能改善」に該当）。

## 安全性の担保

- `npm test`（84件）が全て合格
- `verify-exercise-query.mjs`（18件）・`verify-bhv-hook.mjs`（13件）がリグレッションなく合格
- Playwrightで長い1行（120文字程度）を入力し、`.cm-content`の`scrollWidth`と`clientWidth`が一致する（横スクロールが発生しない）ことを確認

## 代替案

- **折り返しのオン/オフをトグルできるボタンを追加する**: 不採用。折り返し表示によって失われる情報はなく（改行位置が変わるだけで、ステップ実行・行番号ハイライト等の動作に影響しない）、常時オンにすることでUIの複雑化を避けられる

## 今後の方針

ADR-030の運用ルールの通り、重要な設計判断を伴う変更は都度ADRを追加する。
