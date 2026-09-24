# ADR-037: ExecTraceへのArraysポインタ・オーバーレイ統合

## ステータス

採択済み（2026-09-24）

## コンテキスト

`docs/study/paper-research-notes.md`（2026-09-24）の評価実験ログ深掘りで、選択ソートのoff-by-one
バグ（`minIdx = i + 1`、正しくは`minIdx = i`）を見つけられなかった参加者Dが、Arrays（配列ビュー、
`src/views/color-box/index.js`）に333秒・324回のステップ操作を費やしたにもかかわらず不正解だった
ことが分かった。

Arraysは整数変数（`i`・`minIdx`等）をポインタとして検出し、配列セルの真下にラベル表示する機能を
既に持つ（`#subscriptVars`によるホワイトリスト検出）。しかしArraysは**アニメーション型**（現在の
1ステップの状態のみを描画し、ステップを進めると上書きされる）であるため、「`i`と`minIdx`が毎回
1つズレている」というイテレーション横断のパターンは、そのステップの瞬間には見えていても、次の
イテレーションに進むと消えてしまい、ユーザー自身が前のイテレーションの配置を記憶し比較する必要が
ある。Dの大量の往復ステップ操作は、この比較を試みて成功しなかった形跡と解釈できる。

一方ExecTrace（実行トレース、`src/views/exec-trace/index.js`）は既に「行＝humanStepのタイムライン」
を持ち、全ステップを一括描画する時間軸型のビューである。

## 決定

ExecTraceの各行に、Arraysと同じ「配列セル＋ポインタラベル」のミニ図を追加する。新しいビューは
増やさず、既存のExecTraceの時間軸にArraysの空間的なポインタ表現を統合する。

- Arraysの描画ロジック（ポインタ検出・配列グリッドHTML生成・値の色分け）を`src/utils/array-grid.js`
  に純関数として抽出し、Arrays・ExecTrace両方から利用する
  - `computeSubscriptVars(source)`: ソース中の配列添字として使われる識別子のホワイトリスト抽出
  - `detectPointerVars(vars, arr, subscriptVars, arrayVarNames)`: 1スナップショットからポインタ変数を検出
  - `valueToBoxColor(val, maxVal)`: 値の大きさに応じた背景色
  - `renderArrayGrid({...})`: インデックス行・値行・ポインタ行を持つグリッドHTML生成
- ExecTraceの`init()`で、配列変数が1つでも登場する場合のみ新しい列（`et-col-diagram`）を追加する
  （配列が登場しないプログラムでは列自体を出さず、既存の簡潔さを崩さない）
- 各行では、**そのステップでポインタが1つ以上検出された配列のみ**ミニ図を描画する
  （数値自体は既存の変数列で見えているため、ミニ図は「ポインタ位置の比較」という狙いに絞る）
- ミニ図のセル幅は、その回のトレースで登場するポインタ変数名の最長文字数から動的に決める
  （`minIdx`のような長い変数名がセル内で見切れないように。固定幅で実装した最初のバージョンでは
  `minIdx`が`inIc`のように中央部分だけ表示され読めなかったため、実装中に修正した）
- CSSクラス（`.cb-array-block`/`.cb-grid`/`.cb-row`/`.cb-cell`/`.cb-cell--idx`/`.cb-cell--ptr`等）は
  Arraysのものをそのまま再利用する。ExecTrace側は列の最大幅と横スクロール
  （`.et-col-diagram`/`.et-diag-scroll`）のみ追加する

### 変更ファイル

- **`src/utils/array-grid.js`**（新規）: 上記4関数をエクスポート
- **`src/views/color-box/index.js`**: 該当ロジックを`import`に置き換え（挙動は変更なし、純粋な抽出）
- **`src/views/exec-trace/index.js`**: `arrayVarNames`収集・新列追加・行ごとのミニ図描画・セル幅の動的計算
- **`web/style.css`**: `.et-col-diagram`/`.et-diag-scroll`を追加
- **`src/i18n.js`**: `exectrace-col-array`（ja: 配列、en: Array）を追加

### 安全性の担保

- `tests/utils/array-grid.test.js`（新規）: `computeSubscriptVars`・`detectPointerVars`・
  `renderArrayGrid`の3純関数のユニットテスト
- 既存Jestテストスイート（`tests/core/*`）は変更なしで全て合格（color-box抽出のリグレッション確認）
- Playwright（headless Chromium）による実ブラウザ確認:
  - `[Task 1] Selection Sort`サンプルでExecTraceを開き、`i`・`minIdx`・`j`のラベルが正しいステップ・
    正しいセル位置に、省略されず表示されることを確認
  - Arraysタブに切り替え、数ステップ進めてポインタ（`i`）が従来通り表示されることを確認（回帰なし）
  - 配列を含まないサンプル（Fibonacci再帰）でExecTraceを開き、`et-col-diagram`列が出現しないことを確認
  - いずれもコンソールエラーなし

## 結果

- 既存Jestテストスイート（96件、全て合格）＋新規`array-grid.test.js`
- ExecTraceの各行を縦にスクロールするだけで、`i`と`minIdx`のポインタ位置が毎回1セル分ズレている
  というパターンが視覚的に比較できるようになった

## 代替案

- **Arraysに「タイムライン表示」（過去のイテレーションを横に並べる新機能）を追加する**: 不採用。
  実質的にExecTrace（行＝humanStepのタイムライン）と情報量として重複するため、新しいビューを
  増やさずに既存のExecTraceへ統合する方針にした
- **ミニ図のセル幅を固定にする**: 不採用（実装中に発見）。固定幅では変数名の長さによって
  ラベルが見切れ、機能の目的（ポインタ位置の比較）を損なうため、ポインタ候補の最長変数名から
  動的に算出する方式にした

## 追記（2026-09-24、リリース直後のフィードバックによる改善）

採択直後のユーザーフィードバックを受けて、同日中に3点の改善を行った。新規ADR番号は起こさず、
本ADRに追記する（同一機能への直後の改善のため）。

1. **余白の削減（高さを約1/3に）**: `renderArrayGrid()`（`src/utils/array-grid.js`）に
   `idxHeightPx`/`valHeightPx`/`ptrHeightPx`という行高の上書きオプションを追加した。従来は
   `cellPx`（セル幅、変数名の長さから動的算出）に比例して行高も決まっていたため、ラベル用に
   セル幅を広げると行の高さまで比例して大きくなってしまっていた。ExecTrace側では幅と高さを
   分離し、高さは固定の小さい値（`DIAGRAM_IDX_H_PX`/`DIAGRAM_VAL_H_PX`/`DIAGRAM_PTR_H_PX`）を
   渡すようにした。あわせて`.et-diag-scroll`配下の`.cb-array-block`のpadding・margin・
   `.cb-grid`/`.cb-row`のgapをExecTrace専用に縮小した（Arraysビュー本体のCSSは変更なし）。
2. **横スクロール時の背景色の欠け**: `.cb-array-block`はArraysビューでは`flex`アイテムとして
   内容幅にフィットするが、ExecTraceの`.et-diag-scroll`（`overflow-x:auto`の通常ブロック文脈）
   ではブロック要素の既定幅（親の幅いっぱい）になり、横スクロールで現れる部分の背景（グレー）が
   欠けて白く見える不具合があった。`.et-diag-scroll .cb-array-block { width: max-content; }`を
   指定し、常に内容の実際の幅に一致させることで解消した。
3. **表示枠の幅をドラッグで変更可能に**: 「配列」列ヘッダーに`.et-diag-resize-handle`を追加し、
   `pane-resizer.js`と同じ「`mousedown`で開始 → `document`の`mousemove`で追従 → `mouseup`で終了」
   パターンで、CSS変数`--et-diag-w`（`.et-col-diagram`/`.et-diag-scroll`の`max-width`）をドラッグで
   変更できるようにした。100〜500pxでクランプし、`localStorage('jsv-exectrace-diagram-w')`に
   永続化する。`ViewSwitcher.onReady()`がタブ切替のたびにビューを`destroy`→再マウントするため、
   `document`に追加した`mousemove`/`mouseup`リスナーは`destroy()`で確実に解除している。

いずれもPlaywright（headless Chromium）で実ブラウザ確認済み（高さの縮小・横スクロール時の
背景色・ドラッグでの幅変更とlocalStorageへの永続化・リロード後の復元）。
