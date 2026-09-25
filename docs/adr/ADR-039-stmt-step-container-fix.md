# ADR-039: 文単位ステップの不具合修正（初期位置での暴走・1文2クリック問題）

## ステータス

採択済み（2026-09-24）

## コンテキスト

ユーザーから「文」単位ステップ（`stepStmtForward`/`stepStmtBackward`）について2つの不具合報告があった。

1. 実行直後（`cursor=0`）にいきなり「文」を押すと、コードの最後まで一気に実行されてしまう
2. 1つの文を実行するのに2回クリックが必要（実行前と実行後の2段階）

調査の結果、両方とも根本原因は共通していた。「文」単位ステップは JSInterpreter の `dbg.stepOver()`（現在が`enter`ならその`matchIdx`＝対応する`exit`へジャンプ、`exit`なら`cursor++`）をそのまま呼び出していたが、この実装は`enter`イベントが「複数の文の入れ物」ノード（`Program`・`BlockStatement`）である場合を特別扱いしていなかった。

- `cursor=0`時点の「現在のイベント」は`enter Program`で、その`matchIdx`はトレース全体の末尾（`exit Program`）を指す。そのため実行直後に「文」を押すと、プログラム全体を1つの文として最後まで飛んでしまう
- 同様に、関数呼び出しの中に入った直後（関数本体`BlockStatement`の`enter`）に「文」を押すと、関数本体の全文をまとめて1回でスキップしてしまう
- 「1文=1クリック」でない問題は、`stepOver()`の`enter→exit`という実装上、1回目のクリックで文の中身を評価してexitへ、2回目のクリックで次の文のenterへ、という2段階に分かれていたために生じていた

Node上でJSInterpreterの`JSDebugger`を直接操作してトレース構造を確認し、修正アルゴリズムを試作・検証した（トップレベル6文・関数呼び出し込み・if文・空ブロック・forループ・whileループ・関数内部から開始、の7パターンで前進・後退の対称性を確認）。

## 決定

修正は JSVisualizer 側（`src/core/step-controller.js`）のみで完結させ、JSInterpreter（別リポジトリ）の`stepOver()`自体は変更しない。`stepOver()`の生の意味（`enter`→対応する`exit`へジャンプ）自体は正しく、問題は「文」ボタンがこれを`Program`/`BlockStatement`という「複数の文の入れ物」ノードにも無条件に適用していた点にある。「文単位とは何を指すか」はJSVisualizerのUI側の定義であり、JSInterpreter側の汎用APIの意味を変える必要はない。

### `#stmtForwardOnce(dbg)`（新規）

```js
const STMT_CONTAINER_TYPES = new Set(['Program', 'BlockStatement']);

#stmtForwardOnce(dbg) {
  if (dbg.isDone()) return;
  // 実際の文の enter に到達するまで、入れ物ノードの enter・前の文の exit を
  // stepIn() で1歩ずつ透過的に読み飛ばす
  while (!dbg.isDone()) {
    const ev = dbg.getCurrentEvent();
    if (ev.phase === 'enter' && !STMT_CONTAINER_TYPES.has(ev.nodeType)) break;
    dbg.stepIn();
  }
  if (!dbg.isDone()) dbg.stepOver(); // 実際の文の enter → exit へ一気に飛ぶ（1文の着地点）
}
```

### `#stmtBackwardOnce(dbg)`（新規、旧`#stepOverBack`を置き換え）

`matchIdx`を逆算する素朴な実装（`cursor--`して`exit`なら`matchIdx`へ、を繰り返す）では、ネストしたブロック（if文の本体など）で「入れ物ノードの中に再帰的に入るべきか、まるごと読み飛ばすべきか」を、親子関係を辿らずに正しく判定できないことが試作の過程で判明した（if文の本体`BlockStatement`は「複数の文の入れ物」として中に入るべきではないが、関数本体の`BlockStatement`は中に入るべき——という違いを`matchIdx`だけからは区別できない）。

そこで、`#stmtForwardOnce()`を`cursor=0`から再生し、目的の`cursor`の直前の着地点を採用する方式にした。前進アルゴリズムと構造的に厳密な対称性が保証されるため、この方式を採用した。

```js
#stmtBackwardOnce(dbg) {
  if (dbg.cursor === 0) return;
  const target = dbg.cursor;
  dbg.cursor = 0;
  let last = 0;
  while (dbg.cursor < target && !dbg.isDone()) {
    this.#stmtForwardOnce(dbg);
    if (dbg.cursor >= target) break;
    last = dbg.cursor;
  }
  dbg.cursor = last;
}
```

典型的なトレース長（教育用サンプル、数百〜数千イベント程度）では、このO(n)の再生コストはボタンクリック1回あたりとして無視できる。

### スコープ外にした挙動

関数呼び出しの内部に人/式単位で入ってから「文」に切り替え、関数内の最後の文を実行し終えた場合、呼び出し文自体の`exit`（＝関数から呼び出し元へ戻る境界）は独立した着地点にしない。次の「文」クリックで、呼び出し元の次の文の完了地点まで一気に進む（既存の「文単位は粗い粒度」という方針を維持）。これは今回報告された不具合ではなく、独立した設計判断（呼び出し境界を毎回明示するかどうか）のため、今回は変更しなかった。

### 変更ファイル

- **`src/core/step-controller.js`**: `STMT_CONTAINER_TYPES`定数追加、`#stmtForwardOnce`/`#stmtBackwardOnce`追加（旧`#stepOverBack`を置き換え）、`stepStmtForward`/`stepStmtBackward`の呼び出し先変更
- **`tests/core/step-controller.test.js`**: 実際のJSInterpreterトレースに近い構造（`Program`が複数の文を持ち、うち1つが`BlockStatement`＝関数本体を子に持つ）のモックトレース`makeStmtTrace()`を追加し、上記の不具合の回帰テストと前進・後退の対称性テストを追加

### 安全性の担保

- `tests/core/step-controller.test.js`に新規テストを追加（`cursor=0`からのProgram丸ごとスキップの回帰確認、1クリック=1文の確認、BlockStatement内からの開始確認、前進・後退の対称性、末尾からの後退）
- `npm test`（107件、既存101件+新規6件）が全て合格
- Playwright（headless Chromium）で、`let a = 2; let b; let x = a; b=3; let y = x + b; x = a + 1;`を実行直後に「文」を6回押し、カーソルが`0→4→6→10→16→24→34`と1文ずつ進むこと（末尾へ飛ばないこと）、逆方向ボタンで`34→24→16`と正確に戻ることを確認

## 結果

- 実行直後に「文」を押しても最後まで実行されなくなった
- 「文」ボタン1回のクリックで1文が実行されるようになった（従来は2回必要だった）
- 既存Jestテストスイート（107件、全て合格）

## 代替案

- **`dbg.stepOver()`自体（JSInterpreter側）にコンテナ判定を組み込む**: 不採用。`stepOver()`の汎用的な意味（enter→対応するexitへジャンプ）自体は正しく、他の用途に影響を与えるリスクがある。「文単位とは何を指すか」はJSVisualizer固有のUI定義であるため、JSVisualizer側で吸収する方が影響範囲を局所化できる
- **後退を`matchIdx`の逆算（素朴な実装）で組む**: 不採用。if文の本体などネストしたブロックで、入れ物ノードを「中に入るべきか」「まるごと読み飛ばすべきか」を親子関係の情報なしに正しく判定できないことが試作で判明した。「前進の再生」方式は前進アルゴリズムをそのまま再利用するため、対称性が構造的に保証される
- **関数呼び出しの`exit`（呼び出し境界）を常に独立した着地点にする**: 不採用（スコープ外）。今回報告された不具合の対象外であり、既存の「文単位は粗い粒度」という方針とのバランスを検討する必要がある独立した設計判断のため、別途要望があれば改めて検討する
