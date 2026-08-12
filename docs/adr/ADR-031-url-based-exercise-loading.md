# ADR-031: URLクエリを「ID + ベースURL」方式から「完全なURL」方式へ再設計

## ステータス

採択済み（2026-08-12）

## コンテキスト

ADR-029（2026-08-12、同日）で実装したURLクエリ機能は `?exerciseId=<id>&codeId=<id>&bhvApiBase=<base>` という「ID + 取得元ベースURL」方式だった。この方式では、JSVisualizerが `{bhvApiBase}/exercises/:id` ・ `{bhvApiBase}/codes/:id` というBhvVisualizer固有のAPIパス規約を知っている前提になっており、以下の課題があった。

- コードをBhvVisualizer以外の場所（自前でホストした静的JSON等）に置きたい場合、そのホスティング先もBhvVisualizerと同じ`/exercises/:id`・`/codes/:id`というパス規約に合わせる必要があり、実質的にBhvVisualizerのAPI形状に縛られる
- ローカル開発時、JSVisualizerに正しいAPIの場所を伝えるために`bhvApiBase`という専用パラメータが必要だった
- レスポンスに含まれる`id`・`exerciseId`フィールドは、`codeId`を`exercise.codes[]`の中から探すための突き合わせにのみ使われており、実際に画面へ表示するために必要な情報ではなかった

## 決定

`exerciseId`/`codeId`/`bhvApiBase`を廃止し、`exercise`/`code`という2つのクエリパラメータに置き換える。値は**呼び出し元がfetch可能な完全なURL**とする（IDやベースURLの組み立てはJSVisualizerの外で完結させる）。

```
?code=<コードを取得する完全なURL>
?exercise=<演習を取得する完全なURL>
```

これにより、JSVisualizerはコードがどこに・どんなパス規約でホストされているかを一切知らなくてよくなる。`fetch()`が届く場所であれば、BhvVisualizer以外の任意のホスティング先（自前サーバー、静的JSON配信など）からも読み込める。

### レスポンス形式の最小化

`id`・`exerciseId`は実際には使っていなかったため削除し、`title`/`code`のみとした。

```
GET <exercise の値> → { codes: [{ title, code }] }
GET <code の値>     → { title, code }
```

### `exerciseId`+`codeId`の探索ロジックを廃止し、代わりに「先頭コード自動読み込み」を追加

旧方式では、`exerciseId`+`codeId`を両方指定すると、`exercise.codes[]`を`codeId`で線形探索して該当コードをエディタに読み込んでいた。IDでの突き合わせ自体が不要になったため、この探索ロジックは廃止した。

その代わり、`exercise`と`code`を**完全に独立した2つのfetch**として扱う設計に変更した（同時に指定してよい。突き合わせは行わない）。

- `exercise`のみ → 演習のコード群をサンプル選択に追加し、**先頭（`codes[0]`）を自動でエディタに読み込む**（新規追加の挙動。当初の相談では「演習内の特定コードを開く機能を削除」という案だったが、実装前の確認で「セレクタへの追加」と「エディタへの読み込み」は独立処理にできることが分かり、`exercise`+`code`の併用によって旧機能を完全に維持できると判明した）
- `code`のみ → 指定コードを直接読み込む
- `exercise`+`code` → 両方の処理を独立に実行する（`code`側の読み込みが最後に評価されるため、結果的に`code`が優先される）
- 指定なし → 何もしない（既定のFibonacciサンプル・21種の組み込みサンプルは不変）

### 変更ファイル

- **`src/core/exercise-source.js`**: `parseQuery()`が`code`/`exercise`を読むよう変更。`loadExerciseFromQuery()`から`apiBase`・ID探索ロジックを削除し、`exercise`/`code`を独立してfetchする形に変更
- **`src/components/code-editor.js`**: `addRemoteGroup()`のキーを`item.id`から配列インデックス（`remote:${index}`）に変更（IDが不要になったため）

### 後方互換性

後方互換シムは作らない。まだ実運用（本番授業投入）前であり、旧パラメータに依存する利用者が存在しないため、`exerciseId`/`codeId`/`bhvApiBase`は完全に廃止した。

### 安全性の担保

`verify-exercise-query.mjs`（Playwright、実ブラウザ）を新方式に合わせて書き換え、以下を検証した（12件合格）。

1. クエリなし時は既定のFibonacciサンプルのまま（回帰確認、組み込みサンプルの動作も含む）
2. `exercise`のみ: セレクタに演習用optgroupが追加され、かつ先頭のコードが自動表示される
3. `exercise`+`code`: セレクタに追加されつつ、エディタは`code`側の内容になる（先頭コードではない）
4. `code`のみ: 指定コードが直接読み込まれ、セレクタへの追加は起きない
5. 存在しないURL（404）: エラーメッセージが表示される

## 結果

- 既存Jestテストスイート（83件、`exercise-source.test.js`書き換え分を含む）が全て合格
- `verify-exercise-query.mjs`（書き換え）で上記5項目・12チェックに合格
- `verify-bhv-hook.mjs`（既存、ADR-028）もリグレッションなく13件合格

## 代替案

- **ID+ベースURL方式を維持し`bhvApiBase`を必須パラメータにする**: 不採用。呼び出し元のパス規約知識（`/exercises/:id`・`/codes/:id`という形）がJSVisualizer側に残ってしまい、コードを他システムでホストする際の障壁になる
- **`exerciseId`+`codeId`の組み合わせ機能をそのまま廃止する**: 当初提案されたが、`exercise`と`code`を独立したfetchとして併用できる設計にすることで、機能を落とさずにID探索ロジックだけを削除できることが分かったため採用しなかった
- **`exercise`のみ指定時にエディタを空欄のままにする（当初のADR-029の挙動を維持）**: 不採用。ADR-029からさらに一歩進め、演習を開いたら何かしらのコードがすぐ見える方がUXとして自然という判断で、先頭コードの自動読み込みを追加した

## 今後の方針

ADR-030（2026-08-12）で改定した運用ルールの通り、JSVisualizer単体の改良・外部埋め込み利用者からの要求のいずれであっても、重要な設計判断を伴う変更は都度ADRを追加する。
