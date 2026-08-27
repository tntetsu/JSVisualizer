# ADR-036: URLクエリ（`view`）による初期表示ビューの指定

## ステータス

採択済み（2026-08-27）

## コンテキスト

BhvVisualizer（別リポジトリ）は、演習内で「ツールに触れる前に予想 → 操作して確認 → 再回答」という
セッション内pre/post設問を評価手法として採用している
（BhvVisualizer/its/course-redesign-plan.md 4.2節、BhvVisualizer/docs/evaluation-plan.md 3.4節）。

「操作して確認」の体験が学生ごとにバラバラだと、pre/post測定の「介入」自体が学生間で統制されず
内的妥当性が下がる。特に`ViewSwitcher`は前回アクティブだったタブを`localStorage`
（`jsv-active-tab`）に保存し、次回起動時に復元する設計になっている
（`onReady()`、`src/components/view-switcher.js`）。これは通常の利用（同じ学生が継続して
同じツールを使う）では望ましい挙動だが、pre/post設問の文脈では、学生ごとに全く無関係な
過去のセッションで最後に使ったタブが復元されてしまい、「操作して確認」した内容が学生間で
揃わないという問題になる。

## 決定

ADR-029/031と同じ「JSVisualizer単体でも汎用的に使える機能」として、URLクエリに`view`
パラメータを追加する。BhvVisualizerとの連携を前提としないため`# BHV:`タグは付けない。

```
?view=<登録済みビューID>
```

- 値は`ViewSwitcher.register()`で登録されているビューID（`state`/`trace`/`exectrace`/`subst`/
  `exprtrace`/`colorbox`/`heatmap`/`calltree`/`lifetime`/`controlflow`/`memory`/`objgraph`、
  `src/app.js`参照）と一致させる
- **`code`/`exercise`のコード読み込みとは独立**に処理する（コードの取得元とは無関係な指定のため）
- 効いてよいのは**そのページの最初の実行（Run）1回だけ**。以後の再実行では通常通り
  「前回アクティブだったタブ」の挙動に戻る。`localStorage`の保存値自体は書き換えない
  （pre/post設問という一時的な用途のために、その学生の以後の通常利用の体験を変えたくないため）
- 未登録のID・指定なしの場合は何もせず、従来通りの優先順位（前回保存したタブ → 最初のビュー）
  で決まる（回帰なし）

### 変更ファイル

- **`src/core/exercise-source.js`**: `parseQuery()`が`view`も読むよう変更（`viewId`を返り値に追加）。
  コード読み込みとは独立な指定のため、`loadExerciseFromQuery()`自体は変更しない
- **`src/components/view-switcher.js`**: `#presetId`フィールドと公開メソッド`setInitialView(id)`を追加。
  `onReady()`の「アクティブビュー未確定時」の分岐で、優先順位を「`setInitialView`指定 → 前回保存した
  タブ → 最初のビュー」に変更し、使用後は`#presetId`を消費（null化）する
- **`src/app.js`**: `parseQuery()`から取り出した`viewId`があれば`switcher.setInitialView(viewId)`を呼ぶ
  （`loadExerciseFromQuery(editor)`とは別に、独立した呼び出しとして追加）

### 安全性の担保

- `tests/core/exercise-source.test.js`: `parseQuery()`の`view`解析を追加（Jest、86件中の一部）
- `verify-exercise-query.mjs`（Playwright、実ブラウザ）にテストF・Gを追加（計20件合格）
  - F: `?code=...&view=memory`で実行後、Memoryタブが最初からアクティブになる
  - G: `view`未指定なら従来通り最初のビュー（コールスタック）が開く（回帰確認）

## 結果

- 既存Jestテストスイート（86件、全て合格）
- `verify-exercise-query.mjs`（20件、全て合格）
- `verify-bhv-hook.mjs`（既存、ADR-028）に影響なし（`ViewSwitcher`の変更は`onReady()`の
  ビュー選択ロジックのみで、ログ送信経路には触れていない）

## 代替案

- **`localStorage`の保存値自体を`view`クエリの値で上書きする**: 不採用。pre/post設問という
  一時的な用途のために、その学生が次にJSVisualizerを開いたとき（この設問とは無関係な場面）の
  体験まで変えてしまうため
- **毎回の実行（Run）で`view`を効かせ続ける**: 不採用。ページの最初の実行だけを揃えれば
  pre/post設問の目的（「操作して確認」の内容を学生間で揃える）には十分で、2回目以降まで
  固定するとタブ切り替えという通常の操作性を損なう

## 今後の方針

BhvVisualizer側では`codes.initialView`（コード単位、教員が任意指定）から、iframe埋め込み時の
URLに`view`を付与する（BhvVisualizer/docs/design.md 2.4.6節）。
