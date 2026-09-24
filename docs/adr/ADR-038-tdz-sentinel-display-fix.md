# ADR-038: TDZセンチネル値が`Symbol(TDZ)`として表示される不具合の修正

## ステータス

採択済み（2026-09-24）

## コンテキスト

Variable（`line-trace/`）・ExecTrace（`exec-trace/`）タブで、`let`/`const`で宣言される前の変数の値が文字列`Symbol(TDZ)`として表示されていた。

JSInterpreter の `Environment`（`../JSInterpreter/src/interpreter/environment.js`）は、`let`/`const`宣言前のアクセスを検出するため、宣言前の変数値として`TDZ_SENTINEL = Symbol('TDZ')`を事前登録する（ADR未採番、既存のvar/let/constセマンティクス実装。`CLAUDE.md`「var/let/const セマンティクス修正」参照）。`deepClone()`はプリミティブ（Symbolを含む）を素通しするため、トレースイベントの`env`スナップショットにはこの`Symbol('TDZ')`がそのまま値として記録される。

`src/utils/format.js`の`formatValue()`/`formatValueDiff()`はこの値を特別扱いしておらず、最終的なフォールバック（`String(v)`をそのまま表示）に落ち、内部実装の詳細である`Symbol(TDZ)`という文字列がユーザーに見えてしまっていた。

## 決定

`format.js`に`isTDZ(v)`ヘルパー（`typeof v === 'symbol' && v.description === 'TDZ'`）を追加し、`formatValue()`・`formatValueDiff()`の先頭で早期リターンし、既存の「空欄」表現である`<span class="lt-empty">—</span>`（Variable/ExecTraceで「そのステップでは値が存在しない」ことを示す既存の記法）を返すようにする。

`Symbol('TDZ')`の参照そのもの（`TDZ_SENTINEL`）をJSInterpreterからimportして`===`比較する方式ではなく、`description`文字列による判定を採用した。

### 変更ファイル

- **`src/utils/format.js`**: `isTDZ()`追加、`formatValue()`・`formatValueDiff()`の先頭に早期リターンを追加

### 安全性の担保

- `tests/utils/format.test.js`（新規）: `formatValue`/`formatValueDiff`がTDZ値に対して`lt-empty`を返し`Symbol(TDZ)`という文字列を含まないことを確認。TDZから実値への遷移・`description`が異なる無関係なSymbolは対象外になることも確認
- Playwright（headless Chromium）で`[Task 1] Selection Sort`サンプルを実行し、Variable・ExecTrace両タブの表示に`Symbol(TDZ)`が含まれないこと、宣言後は通常通り値が表示されることを確認
- `npm test`（101件、新規5件を含む）が全て合格

## 結果

- Variable・ExecTraceタブで、宣言前の`let`/`const`変数が空欄（`—`）として表示されるようになった
- `formatValue()`/`formatValueDiff()`は他のビュー（State/CallStackView・MemoryView・ObjectGraph等）からも共有利用されているため、TDZ値を表示しうる箇所があれば同じ修正で一括して解消される

## 代替案

- **`TDZ_SENTINEL`をJSInterpreterのバンドルから直接importし`===`比較する**: 不採用。`web/interpreter.bundle.js`のビルド元（`debugger.js`）が現状`TDZ_SENTINEL`をexportしておらず、JSInterpreter側の変更＋バンドル再生成が必要になる。`description`文字列での判定は単一ファイルの変更で完結し、ビルド手順への依存もない
- **`undefined`と同じ表示（`<span class="v-undef">undefined</span>`）にする**: 不採用。「宣言されていない/存在しない」ことを示す既存の空欄表現（`lt-empty`）の方が、TDZという「宣言はされたがまだ初期化されていない」状態の実態（=中身が無い）に近く、`undefined`という値そのものと混同しない
