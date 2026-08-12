# 機能仕様書

**プロジェクト名**: JSVisualizer  
**バージョン**: 1.9  
**作成日**: 2026-05-25  
**最終更新**: 2026-08-12  
**作成者**: Tetsuo Tanaka

> [English version](functional-spec.en.md)

---

## 改訂履歴

| バージョン | 日付 | 変更内容 |
|-----------|------|---------|
| 0.1 | 2026-05-25 | 初版 |
| 0.2 | 2026-05-25 | ステップコントロール UI（2行×4列ボタン）、コードハイライト 3層構造、テーマ切り替え機能を追記 |
| 0.3 | 2026-05-26 | Phase 3 実装反映: V-06 BarChart / V-07 ColorBox / V-08 Timeline / V-09 Heatmap を ✅ に更新 |
| 0.4 | 2026-05-26 | Phase 3.5 実装反映: V-02b LineTrace（トレース表）を追加。AnimatedTrace は非アクティブに変更 |
| 0.5 | 2026-05-26 | Phase 4/5 実装反映: V-10 RecursionTree / V-11 Lifetime / V-12 ControlFlow / V-13 MemoryView / V-14 ObjectGraph を ✅ に更新。TraceBuilder 新メソッドを追記 |
| 0.6 | 2026-05-26 | Phase 6 仕上げ反映: キーボードタブ切り替え（1〜9）・アクティブタブ永続化・エラーバッジ表示（パース/実行エラー区別）・サンプルコード 17 種に拡充・色覚多様性対応（RecursionTree/ControlFlow）・GitHub Pages デプロイを追記 |
| 0.7 | 2026-05-26 | 修正 1〜8 反映: 分割代入サポート・ドラッグ可能なペインリサイザー・CodeMirror 6 エディタ・プログラム名表示・Console 常時パネル・LineTrace 改善（ソース列削除・行位置一致・スクロール同期・列表示切替・D&D 並び替え）・TraceTable「対象」列追加 |
| 0.8 | 2026-06-02 | 修正反映: V-15 CallTree（全関数呼び出しツリー）新規追加・LineTrace 2ペイン化（ソースコードパネル内包・ドラッグリサイズ）・ScopeView/StateView スコープ統合（factorial(6) 形式ラベル）・Heatmap 時系列ドット＋割合表示・RecursionTree 引数展開表示改善・Console パネル高さドラッグ変更・callStack 順序バグ修正（呼び出し元ハイライト・再帰ツリー引数）|
| 0.9 | 2026-06-03 | 修正 1〜7 反映: スコープ表示アルゴリズム刷新（lexical scope 対応 mergeScopesForDisplay）・StateView CALL STACK 表示修正（formatFrameLabel 未インポートバグ修正 + スコープフレーム表示）・buildRecursionTree を再帰呼び出しのみにフィルタリング＋cost 付与・buildCallTree を完全独立化・RecursionTree に cost 表示追加・Heatmap 動的背景色（ステップ別更新）＋ドット 3 倍幅＋実行済み/未実行色分け＋N回/M回 形式・MemoryView スコープ名修正 |
| 1.0 | 2026-06-04 | スタックフレーム変数の正確化: JSInterpreter に `Environment.snapshotOwn()` + `Recorder.frameEnvStack` を追加し、各 TraceEvent に `frameEnvs`（各フレームの callEnv スナップショット、外→内順）を記録。外側フレームにローカル変数・デフォルト引数を正確表示（`mergeScopesForDisplay` の第 3 引数 `frameEnvs` を利用）。V-01/V-04/V-13 が `frameEnvs` を使用。sv-scroll の flex→block 化によるスクロールバー修正 |
| 1.1 | 2026-06-04 | ScopeView（V-04）・CallStackView（V-05）をタブ非登録（非アクティブ）に変更。LineTrace（V-02）を 2 ペイン構成から単一ペイン＋行番号スニペット構成に刷新（jsv-lt-src-w 削除）。ColorBox（V-07）をタブ名「配列」に変更・複数配列同時選択・ポインタ変数を変数ごと個別行表示・文字列の切り詰めなし表示に変更。Timeline（V-08）でチップ選択変数のみの Y 軸動的スケール計算を追加。Heatmap（V-09）に「連結線」トグルボタン（ドット間 SVG polyline）を追加。JSInterpreter の `super()` 呼び出しバグを修正（CallExpression ハンドラで Super を直接処理）。サンプルコード全 17 種を網羅する回帰テスト（samples.test.js）を追加。テスト総数 49 → 66 件 |
| 1.2 | 2026-06-04 | while/for 条件式の評価を humanStep に追加（TraceBuilder.buildHumanIndices）。LineTrace・ExecTrace の条件式列で while/for 各イテレーションの条件値を正確に表示。ExecTrace（V-02b）をタブ「実行トレース」として文書化。タブ登録順を「実行トレース」→「全ステップ」に変更。Heatmap の連結線をトグルボタン廃止・常時表示に変更（オーバーレイ SVG + rAF）。ColorBox に最大サイズ事前計算（`maxWidth`/`maxGridHeight`）・空配列時も占有領域確保・幅超過時の折り返し（flex-wrap）・配列ブロックの枠線＋背景色を追加。JSInterpreter `formatLogArg` に `depth` 引数を追加し配列・オブジェクト内の文字列をシングルクォート付きで表示（Node.js 互換）|
| 1.4 | 2026-06-08 | ExprTrace（V-02d）改善: (1) VariableDeclaration 位置取得をソース正規表現ベースに変更（VariableDeclarator イベントが trace に存在しないため）。(2) セクション検出対象に IfStatement test・WhileStatement test（イテレーションごと）・ReturnStatement 引数・ForStatement init/test/update（イテレーションごと）を追加。(3) extractVarNames を式テキスト内識別子のみに絞り込み（env 全変数追加の "B" を削除）。(4) 変数値の時系列表示: Row 0 = enterIdx env・中間行 = exit 時点 env・最終行（≥2行）= exitIdx env。(5) update() でアクティブ行の TD を trace[cursor].env からリアルタイム書き換え（#trace フィールドを追加）。単一行セクション（let x = 851 等）でも束縛の瞬間に値が 851 に変わることを確認可能 |
| 1.5 | 2026-06-16 | (1) **差分強調表示**: `format.js` に `formatValueDiff(val, prevVal)` を追加。前ステップと異なる値を `<b class="v-diff">` で橙色強調。配列・オブジェクトは要素/プロパティ単位で比較し変化箇所のみ強調。LineTrace（アクティブ行の各変数セル）・ExecTrace（全行の変数セル、`init()` 時一括）に適用。CSS: `--v-diff` カスタムプロパティ + `.v-diff` クラス（ライト `#c05000`・ダーク `#ff9f5e`）。(2) **ObjectGraph 階層型レイアウト**: 力学的レイアウト（Fruchterman-Reingold）を廃止し、Kahn トポロジカルソート + 最長パス法による左→右の階層型レイアウトに置換。エッジは肘型コネクタ（`M x1,y1 H mx V y2 H x2`）。ノードは NODE_W=110/NODE_H_MIN=32/ROW_H=13。列間 COLUMN_GAP=80px でエッジラベルが可視。ノード背景を 6 色パレット（`--og-bg-0` ～ `--og-bg-5`）で色分け。(3) **ObjectGraph 連結成分分離**: 無向 BFS で連結成分を検出し縦方向に COMP_GAP=24px で積み上げ。成分 ≥2 のとき点線境界矩形（`.og-comp-bg`）を描画。(4) **ObjectGraph ポートスプレッド**: 同一ノードからの複数エッジを出口 y 座標で均等分散し重複を解消。エッジラベルを縦セグメント左側に配置。(5) **オブジェクト同一性バグ修正**: JSInterpreter `Environment.snapshot()` が変数ごとに独立した `seen` WeakMap で `deepClone()` を呼ぶため、同一元オブジェクトが複数の変数から参照されるとき別クローンとなり ObjectGraph・MemoryView に重複ノードが出ていた。`snapshot()` と `snapshotOwn()` を `seen` WeakMap を全バインディングで共有するよう修正し、スコープチェーン全体で同一元オブジェクトが同一クローンにマッピングされることを保証 |
| 1.3 | 2026-06-05 | V-02c SubstTrace（代入展開）・V-02d ExprTrace（式評価）を新規追加・文書化。タブ登録数 14 → 16。SubstTrace: 再帰関数の置換モデル逐次展開（`computeReturnExpr` + `buildSubstitutionLines`）。ExprTrace: 1行の式の部分式逐次置換トレース表（`buildSectionRows` + `srcPosToDispPos`・`addSubstitution`・`applySubstitutions` ヘルパー群）。両ビューに展開ハイライト（橙）・評価待ちハイライト（青太字）を実装 |
| 1.6 | 2026-07-17 | (1) **タブ整理**: V-03 TraceTable（全ステップ）・V-06 BarChart（棒グラフ）・V-08 Timeline（時系列）をタブ非登録（非アクティブ）に変更。タブ登録数 16 → 13。(2) **ControlFlow 刷新**: `buildControlFlow()` を廃止し `buildCFG()` を導入。AST ベースの DOM フローチャートで if/else を true/false 列横並び・ループを条件＋本体の入れ子構造で描画。未実行ノードを `cf-node--dead` でグレーアウト表示（通らなかった分岐が一目でわかる）。実行回数バッジ（`×N`）を各ノードに表示。(3) **execCount 修正**: `CfgBuilder` の行実行回数カウントをすべての AST enter ではなく「行遷移時のみ」カウントに修正（前回 enter と異なる行のみ計上）。(4) **SubstTrace・ExprTrace オブジェクト展開**: `fmtPlain()` に `depth` 引数を追加。depth < 3 ではプロパティ値のみ（キーなし）を再帰展開（`{3, null}`, `{2, {3, null}}` 形式）、depth ≥ 3 で `{…}` に省略。関数値プロパティはフィルタ除外。(5) **サンプル拡充**: CELDA 2026 評価実験用 Study Tasks 4種追加（studyWarmup / studyTask1 / studyTask2 / studyTask3）。サンプル総数 17 → 21。テスト総数 66 → 70 件 |
| 1.7 | 2026-07-20 | (1) **ヘッダーレイアウト刷新**: Editモードは Edit/Run ボタン＋サンプルセレクト、Runモードは Edit/Run ボタン＋ステップコントロールをヘッダー中央に表示（フッター廃止）。`.app-header.run-mode` クラスで CSS 表示切替。ヘッダー高さを auto（最小高さ 44px）に変更し `app-main` は `flex: 1` で残高を充填。(2) **スライダー最大化・2行レイアウト**: `.slider-area { min-width: 180px }` の折り返しによりウィンドウ幅が狭い場合はスライダーが2行目に折り返す。`body { min-width: 820px }` + `html { overflow-x: auto }` で最小幅以下では横スクロールバーを表示。(3) **ビュー説明バー**: タブ直下に `.view-desc` 要素を自動挿入。`ViewSwitcher.register()` の第4引数 `description` でビューの説明文を登録し、タブ切り替え時に表示。13ビュー全てに説明文を追加。(4) **ライトモード UI 改善**: アクティブタブを白背景＋青トップボーダー＋青テキスト＋太字（`:root:not([data-theme="dark"])`）でコントラスト強化。コンソール背景を白（`var(--bg)`）に変更（ライトモードのみ）。|
| 1.8 | 2026-07-20 | **言語切替（i18n）**: `src/i18n.js` 新規追加（`STRINGS` オブジェクト・`t(key)` / `getLang()` / `setLang()` 関数・`langchange` カスタムイベント）。`localStorage('jsv-lang')` に `'ja'`/`'en'` を永続化し、デフォルト `'ja'`。ヘッダー右端に `btn-lang`（EN/日）ボタンを追加。静的 HTML 要素は `data-i18n="key"` 属性で管理し `applyI18n()` が一括更新。タブラベル・説明文は `ViewSwitcher.register()` に `{ ja: '...', en: '...' }` オブジェクトを渡す形式に拡張し、`ViewSwitcher.setLang(lang)` で再描画。`resolveStr(v, lang)` ヘルパーで文字列と `{ja,en}` オブジェクトの両方を解決。 |
| 1.9 | 2026-08-12 | **F-04 URLクエリによるコード読み込みを追加**: `exerciseId`/`codeId`/`bhvApiBase` クエリパラメータで外部（BhvVisualizer等）からコードを読み込む機能を新規実装・文書化（`src/core/exercise-source.js`、[ADR-029](adr/ADR-029-url-query-exercise-loading.md)）。既定のFibonacciサンプル表示・21種の組み込みサンプルは変更しない加算的な機能。README にも利用方法を追記 |

---

## 1. 目的・背景

### 1.1 問題

プログラミング教育において、学生はしばしば「プログラムが何をしているか理解できない」という状態に陥り、バグの修正に困難を来す。その根本原因は、**時間（CPU クロック）の経過とともに空間（メインメモリ）の内容がどのように変化するか**、すなわちプログラムの動的な振る舞いを把握できていないことにある。

既存の手段には以下の問題がある。

| 手段 | 問題点 |
|------|--------|
| 紙・静的スライド | 動作を連続的に追うことができない |
| PowerPoint アニメーション | 教材作成コストが高く、コードを変えると再作成が必要 |
| Algorithm Visualizer | 可視化専用コードの埋め込みが必要、汎用性が低い |
| Python Tutor | Python 限定、表示レイアウトが固定、JavaScript 非対応 |

### 1.2 目的

任意の JavaScript コードを貼り付けるだけで、**プログラムの実行過程を多角的に可視化**できる Web アプリケーションを提供する。

### 1.3 スコープ

- **対象言語**: JavaScript (ES6+)
- **対象ユーザー**: プログラミング入門〜中級の学習者、教員
- **対象環境**: モダン Web ブラウザ（Chrome / Firefox / Safari 最新版）

---

## 2. ユーザーと利用シナリオ

### 2.1 ユーザー種別

| 種別 | 説明 |
|------|------|
| **学習者** | 自分のコードの動作を確認・デバッグしたい学生 |
| **教員** | 授業でプログラムの動作を説明する教材として使いたい |
| **教材制作者** | トレース図・フローチャートのアニメーションを手軽に生成したい |

### 2.2 主要ユースケース

#### UC-01: 自作コードを可視化する
1. ユーザーはコードエディタに JavaScript コードを入力する
2. 実行ボタンを押す
3. アプリケーションは全ステップを解析し、可視化の準備を行う
4. ユーザーはステップ実行ボタンで一歩ずつプログラムの動作を追う
5. ユーザーは任意のビューに切り替えて異なる角度から動作を確認する

#### UC-02: ステップを進める・戻る
1. ユーザーはフッターの 8 種類のステップボタン（または対応キーボードショートカット）で操作する
2. コード上の現在位置（行・式・呼び出し元）がハイライトされ、全可視化ビューが同期して更新される
3. スライダーや先頭/末尾ボタンで任意位置にジャンプできる

#### UC-03: 可視化ビューを切り替える
1. ユーザーは右ペインのタブでビューを選択する
2. 選択したビューが即座にマウントされ、現在のステップ状態で表示される
3. キーボードの `1`〜`9` キーで登録順に対応するタブに切り替えられる（`<textarea>` / `<input>` フォーカス中は無効）
4. 最後に表示していたタブは `localStorage('jsv-active-tab')` に保存され、次回起動時に自動復元される

#### UC-04: サンプルコードを使う
1. ユーザーはヘッダーのサンプルセレクタから学習シナリオを選ぶ（21 種類）
2. コードが自動的にエディタに挿入され、すぐに可視化を開始できる

#### UC-06: 表示言語を切り替える
1. ユーザーはヘッダー右端の **EN** ボタン（または **日** ボタン）をクリックする
2. UI テキスト（ボタンラベル・タブ名・説明文・設定パネルなど）が即座に英語または日本語に切り替わる
3. 選択した言語は `localStorage('jsv-lang')` に保存され、次回起動時も維持される

#### UC-05: テーマを変更する
1. ユーザーはヘッダー右上の ⚙ ボタンをクリックして設定パネルを開く
2. ライト / ダークを選択する
3. 設定は即座に適用され、次回起動時も維持される

---

## 3. 機能要件

### 3.1 コア機能

#### F-01: コードエディタ

| 項目 | 仕様 |
|------|------|
| 入力形式 | JavaScript (ES6+) テキスト |
| シンタックスハイライト | **CodeMirror 6** によるリアルタイムハイライト（キーワード・文字列・数値・コメント）。ライト/ダークテーマに自動追従（`Compartment` + `MutationObserver`） |
| サンプルコード | プリセット選択（21 種類：バブルソート、フィボナッチ、二分木 など）。選択時にヘッダーにプログラム名を表示 |
| エラー表示 | パース・実行エラーをエディタ下部にバッジ付きで表示。「構文エラー」（`[Parser]` メッセージ等）と「実行エラー」（実行時例外）を視覚的に区別する |
| 分割代入 | `[a, b] = [b, a]`・`({ x, y } = obj)` など ES6 分割代入をサポート |

#### F-02: ステップ実行コントロール

**ヘッダー中央**（Runモード時）の **1列（ワイド時）または 2行（ナロー時）** に 8 種類のステップボタンを配置し、両端に先頭/末尾ボタンを置く。左右ペインの境界は**ドラッグでリサイズ**できる（デフォルトはエディタ 30%、ビュー 70%）。

```
ワイド:  ⏮ ⏭ │ ⏪関 ⏩関 │ ◁人 ▷人 │ ◀◀文 ▶▶文 │ ◀式 ▶式 │──slider──│ counter
ナロー:  ⏮ ⏭ │ ⏪関 ⏩関 │ ◁人 ▷人 │ ◀◀文 ▶▶文 │ ◀式 ▶式
         ──────────────────── slider ─────────────────────── │ counter
```

| 操作 | ボタン | キーボード | 説明 |
|------|--------|-----------|------|
| 先頭へ | ⏮ | `Home` | ステップ 0 に移動 |
| 式単位で戻る | ◀式 | `b` / `←` | cursor を 1 減らす |
| 式単位で進む | ▶式 | `n` / `→` | cursor を 1 増やす |
| 文単位で戻る | ◀◀文 | `V` | 前の文の先頭へ |
| 文単位で進む | ▶▶文 | `v` | 次の文の先頭へ |
| 人単位で戻る | ◁人 | `H` | 前の humanStep へ |
| 人単位で進む | ▷人 | `h` | 次の humanStep へ |
| 関数単位で戻る | ⏪関 | `F` | 直前の callDepth 変化点へ |
| 関数単位で進む | ⏩関 | `f` | 次の callDepth 変化点へ |
| 末尾へ | ⏭ | `End` | 最終ステップへジャンプ |
| 任意位置へ | スライダー | — | trace 配列の任意位置にジャンプ |

ボタン色: 細粒度（◀式/▶式/◁人/▷人）= アクセントブルー、粗粒度（◀◀文/▶▶文/⏪関/⏩関）= グレー

#### F-03: ステップ粒度

| 粒度 | 内部 API | 定義 |
|------|----------|------|
| 式評価 | cursor ± 1（`trace[]` を直接移動） | 文・式の実行開始から実行完了までを含む、最も細かい粒度のステップ |
| 文評価 | `stepOver()` → `matchIdx` | 文ノードのみ（サブ式を内部でスキップ） |
| 人にやさしい単位 | `humanStep()` / `humanStepBack()` | 代入・条件判定・while/do-while/for の条件式評価（イテレーションごと）・for の更新式評価・関数呼び出し等の意味ある変化点 |
| 関数呼び出し単位 | trace の `callDepth` 変化点まで cursor を移動 | 関数呼び出し・リターンを境界として進退 |

#### F-04: URLクエリによる外部からのコード読み込み ✅ 実装済み

| 項目 | 仕様 |
|------|------|
| クエリパラメータ | `exerciseId`（演習ID）・`codeId`（コードID）・`bhvApiBase`（取得元の公開APIベースURL、省略時は既定値） |
| 取得方法 | `GET {bhvApiBase}/exercises/:exerciseId`・`GET {bhvApiBase}/codes/:codeId` を`fetch`で呼び出し、レスポンスのコード本文をエディタ・サンプル選択に反映する（`src/core/exercise-source.js`） |
| 動作 | `exerciseId`のみ→サンプル選択に演習のコード群を「─ Exercise ─」グループとして追加（エディタは既定のまま変更しない）。`codeId`のみ→該当コードを直接エディタへ読み込む。両方指定→サンプル選択への追加とエディタへの読み込みを両方行う。指定なし→何もしない（既定のFibonacciサンプル・21種の組み込みサンプルは不変） |
| エラー処理 | 存在しない/非公開のID・ネットワークエラー時は、エディタ下部のエラー表示欄にメッセージを表示する |
| 用途 | JSVisualizer単体でも「特定のコードへの直リンク」として機能する汎用機能。BhvVisualizer（別リポジトリ）との連携では、教員が作成した演習・コードを学習者に配信する経路として利用する。詳細は[README](../README.md)「URLクエリでコードを外部から読み込む」節・[ADR-029](adr/ADR-029-url-query-exercise-loading.md)を参照 |

---

### 3.2 可視化ビュー

#### V-01: コールスタック（CallStackView）✅ 実装済み

タブ名: **コールスタック**

- Call Stack パネル: `mergeScopesForDisplay()` が返すフレームを表示。先頭に常時「Global」フレーム（callStack が空のときも表示）、その下に関数呼び出しフレーム（innermost-first、最内側フレームを強調表示）
- 変化した変数をフラッシュ

> 旧「変数・スタック」タブにあった Current Step カード（phase/nodeType/行番号/評価値）と Variables カード（Call Stack の最内側フレームと重複）は [ADR-026](../docs/adr/ADR-026-callstack-view-simplification.md) で削除された。
> **Console 出力は右ペイン下部の常時表示パネルに移動。** どのタブを選択中でも `console.log` の出力が確認できる（後述 F-14）。

**入力**: `state.event`, `state.scopes`, `state.callStack`, `state.frameEnvs`

---

#### V-02: 変数（Variable、旧クラス名LineTrace）✅ 実装済み

タブ名: **変数**

- **単一ペインレイアウト**: 行番号列＋変数マトリクス表の単一テーブル
  - 行番号列には行番号（`lt-lineno-num`）とソースコード先頭 15 文字のスニペット（`lt-lineno-snippet`）を表示
- 行＝ソースコードの各行（全行固定表示）、列＝変数名のマトリクス表
- 変数が宣言されるたびに列が右に追加される（動的列追加）
- 各セルはその行を「最後に実行した時点」での変数値を表示
- cursor が進むと、変化したセルにフラッシュアニメーション（オレンジ）
- **差分強調**: アクティブ行（`lt-row--active`）の変数セルで、前ステップと値が変わった場合に `formatValueDiff()` で橙太字（`--v-diff`）表示。配列・オブジェクトは要素/プロパティ単位で比較し変化箇所のみ強調
- 関数・クラス値は列に載せない
- 現在実行行をテーブル上でハイライトしてスクロール追従
- **列の表示/非表示**: ヘッダー上部のツールバーボタンで各変数列を個別に表示/非表示切り替え可
- **列の並び替え**: ヘッダー `<th>` をドラッグ＆ドロップで列の順序を変更可

**入力**: `builder.getHumanStepList()`, `builder.trace`, `builder.source`, `state.cursor`, `state.event`

> **Note**: `animated-trace/`（ステップごとに行が追記されるアニメーション付きトレース表）は実装済みだが、現在タブには登録されていない。

---

#### V-02b: 実行順トレース表（ExecTrace）✅ 実装済み

タブ名: **実行トレース**（タブ登録順: 変数の次、全ステップの前）

- 行 = humanStep ごとの実行ステップ（実行順）
- `init()` 時に全 humanStep を一括描画
- `update()` は現在行のハイライト移動と scrollIntoView のみ（O(n)）
- 列構成: # | 行 | コード（先頭 30 文字）| 変数値列（出現順）| 条件式列（出現順）
  - **変数値列**: 各 humanStep 時点の変数値を `flattenEnv` で取得して表示。`formatValueDiff()` で前ステップとの差分を橙太字で強調（`init()` 時に全行一括適用）
  - **条件式列**: `buildConditionExitSet` でループ条件式の exit を事前収集し、`buildCondInfo` で以下の 2 ケースを判定
    - Case 1（while/do-while/for の条件式 exit）: イベント自体が条件式評価結果。値を直接取得
    - Case 2（IfStatement/ConditionalExpression の enter）: 直後の boolean exit を探して値を取得
  - while/for ループはイテレーションごとに条件値が更新され、ループ終了時の `false` も正確に表示

**入力**: `builder.getHumanStepList()`, `builder.trace`, `builder.source`, `state.cursor`

---

#### V-02c: 代入展開ビュー（SubstTrace）✅ 実装済み

タブ名: **代入展開**（タブ登録順: 実行トレースの次、式評価の前）

- 再帰関数呼び出しを「置換モデル（substitution model）」で逐次展開して表示
- 最初のユーザー定義関数呼び出し（`factorial(5)` 等）から開始し、ReturnStatement ごとに関数呼び出し文字列を評価済み return 式で置換して行を追加
- 最終行はトップレベル CallExpression の確定値（`→ 120` 等）を表示
- **ハイライト 2 種**:
  - `.stx-hl-expanded`（橙背景）: 直前の置換で展開された部分
  - `.stx-hl-pending`（青太字）: 次の ReturnStatement で置換される予定の呼び出し
  - pending が expanded 内に収まる場合はネスト span を生成
- `update()` は `traceIdx <= cursor` の最大行に `.stx-line--active` を付与（過去行は `.stx-line--past`）
- 対応ビュー: `ExpressionStatement` から始まるユーザー定義関数呼び出し。ネイティブ関数や非再帰プログラムでは「関数呼び出しが検出されませんでした」を表示

**コアアルゴリズム** (`computeReturnExpr` / `buildSubstitutionLines`):
- `getCallFrame(trace, enterIdx)`: CallExpression enter の直後で callStack が深くなった最初のイベントからフレームを取得
- `computeReturnExpr(trace, returnEnterIdx, sourceLines)`: return 引数テキストを走査し Identifier exit は値で・CallExpression は `formatFrameLabel(frame)` で置換。右から左に適用して位置ずれを防ぐ
- `buildSubstitutionLines()`: `currentExpr` 文字列の中で `callStrToReplace.indexOf()` を使って置換位置を特定

**入力**: `builder.trace`, `builder.source`

---

#### V-02d: 式評価トレースビュー（ExprTrace）✅ 実装済み

タブ名: **式評価**（タブ登録順: 代入展開の次、全ステップの前）

- 1行の式が評価される過程を部分式の逐次置換で表示する。部分式が評価されるたびに新しい行が追加される
- 各セクションは `cursor >= enterIdx && cursor <= exitIdx` の間だけ表示（評価中の式のみ可視）
- 変数値列: 式テキストに登場する識別子のみ（関数値・キーワード・組み込みグローバルを除外）
- **ハイライト 2 種**:
  - `.xev-hl-expanded`（橙背景）: 直前の置換で書き換えられた部分
  - `.xev-hl-pending`（青太字）: 次に評価される部分式
  - pending が expanded 内に収まる場合はネスト span
- `update()` はアクティブ行（`traceIdx <= cursor` の最大行）に `.xev-row--active`、過去行に `.xev-row--past` を付与し、**アクティブ行の変数 TD を `trace[cursor].env` からリアルタイムに書き換える**

**セクション検出** (`buildExpressionSections`):

| ステートメント種別 | 対象 | 採用閾値 |
|---|---|---|
| `ExpressionStatement` | 内包する式（単一行限定） | rows ≥ 2 |
| `VariableDeclaration` | 初期化式（`varName = init` 形式）| rows ≥ 1 |
| `IfStatement` | test 式（単一行限定） | rows ≥ 2 |
| `WhileStatement` | test 式（イテレーションごと、単一行限定） | rows ≥ 2 |
| `ReturnStatement` | 引数式（単一行限定） | rows ≥ 2 |
| `ForStatement` | init 式・test 式（イテレーションごと）・update 式（イテレーションごと） | rows ≥ 1 |

`VariableDeclaration` の位置取得: interpreter が VariableDeclarator イベントを emit しないため `trace[i+1]` に直接 init 式が来る。開始列はソース正規表現（`/^(?:let|const|var)\s+name\s*=\s*/`）から計算し、終端列は trace スキャンで取得する。

**行生成アルゴリズム** (`buildSectionRows`):
1. `enterIdx + 1` 〜 `bound`（`loopEnd ?? exitIdx`）の exit イベントを走査
2. フィルタ: `phase !== 'exit'`、`!end`、`callDepth !== outerCallDepth`（関数内部除外）、複数行、関数値、`undefined`、`Literal`/`TemplateLiteral` を除外
3. `addSubstitution(subs, evSrcStart, evSrcEnd, valueText)`: ソース座標で置換を追加し、完全に内包される既存置換を除去
4. `applySubstitutions(srcText, subs, baseCol)`: 置換リストをソーステキストに適用して表示テキストを生成
5. 表示テキストが前行と同一なら行追加せず（重複排除）
6. `srcRangeToDispRange(subs, baseCol, srcStart, srcEnd)`: `srcPosToDispPos()` を使ってソース座標 → 表示座標へ変換
7. 後填め: 行 N の `pendingDispRange` は行 N の置換リストで行 N+1 のソース範囲を変換して計算

**変数値の時系列表示**:
- Row 0: `trace[enterIdx].env`（評価開始前の状態）
- 中間行: その exit イベント時点の env（部分式評価直後）
- 最終行（rows ≥ 2 のみ）: `trace[exitIdx].env`（束縛・代入完了後の値）
- アクティブ行: `update()` 内で `trace[cursor].env` からリアルタイム書き換え（単一行セクション `let x = 851` でも束縛の瞬間を確認可能）

**変数列の収集** (`extractVarNames`):
- 式テキスト中の非関数・非キーワード・非組み込みグローバル識別子（登場順）
- env の全変数は追加しない（式に含まれる変数のみ表示）
- 関数値（`isFunctionVal(v)`）・JS キーワード・`GLOBAL_BUILTINS` は除外

**CSS プレフィックス**: `.xev-*`（ExecTrace の `.et-*` と衝突回避）

**入力**: `builder.trace`, `builder.source`
---

#### V-03: 全ステップ表（TraceTable）✅ 実装済み（タブ非登録・非アクティブ）

タブ名: **全ステップ**（現在タブ非登録）

- 全 humanStep を `init()` 時に一括描画
- `update()` は現在行のハイライト移動とスクロールのみ（O(1)）
- 列: # | 行 | イベント | **対象** | 値
  - **#**: humanStep の通し番号
  - **行**: ソースコードの行番号
  - **イベント**: `▶ 種別`（実行開始）または `◀ 種別`（実行完了）の形式。種別は Assign・If・Call など文・式の種類を表す短縮名
  - **対象**: イベント種別に応じた対象情報
    - `Var` / `Assign` / `Update` → 前後 env の diff から変化した変数名
    - `Return` → 文字列 `"return"`
    - `Call` の enter → `関数名(引数, ...)` 形式、exit → 関数名
  - **値**: 実行完了（◀）のステップで値が確定している場合に表示される

**入力**: `builder.getHumanStepList()`, `builder.trace`

---

#### V-04: スコープ・変数ビュー（ScopeView）✅ 実装済み（タブ非登録・非アクティブ）

タブ名: **スコープ**（現在タブに登録されていない）

- スコープチェーンをネストした枠で表現
- 最内側フレーム（実行中スコープ）を強調表示（アクセントカラーボーダー）
- 変化した変数をフラッシュ
- **スコープ統合表示**: 各関数呼び出しに対して生成される paramScope（引数）と blockScope（本体ブロック）を 1 枠に統合表示
- **引数付きラベル**: フレームラベルを `factorial(6)` 形式で表示（`formatFrameLabel(frame)`）

**入力**: `state.scopes`, `state.callStack`, `state.changedVars`, `state.frameEnvs`

---

#### V-05: コールスタックビュー（CallStackView）✅ 実装済み（タブ非登録・非アクティブ）

タブ名: **コールスタック**（現在タブに登録されていない）

- スタックフレームをカード積み上げで表示
- 関数呼び出し時にカードがスライドイン
- 最上位フレーム（実行中）をアクセントカラーで強調

**入力**: `state.callStack`

---

#### V-06: 棒グラフアニメーション（BarChart）✅ 実装済み（タブ非登録・非アクティブ）

タブ名: **棒グラフ**（現在タブ非登録）

- 指定した数値変数または数値配列を縦棒グラフで表示
- 値の変化を棒の高さの CSS transition で滑らかにアニメーション
- 変数選択チップ UI（配列はデフォルト選択、複数選択可）
- 棒の色は最大値との比率に応じて青→赤でグラデーション
- 初期ステップ（変数未定義）には「ステップを進めると棒グラフが現れます」ガイドを表示

**入力**: `state.event.env`, `state.cursor`, `builder.trace`

---

#### V-07: 色付き箱アニメーション（Arrays、旧クラス名ColorBox）✅ 実装済み

タブ名: **配列**

- 複数の配列を同時選択して表示（`.cb-box-area` は `flex-wrap: wrap` で幅不足時に次行へ折り返し）
- 各配列は `.cb-array-block`（枠線 `border: 1px solid var(--border)` ＋背景色 `var(--surface2)` ＋`border-radius: 6px`）としてラベル付きで表示
- 箱の色は値の大きさに応じて青→赤でグラデーション
- 変数選択チップ（複数選択可。最後の 1 つは選択解除不可）
- ポインタ検出: `[0, arr.length)` 範囲の整数変数を自動検出し、対応インデックスの箱を強調。ポインタ変数は変数ごとに個別行として表示
- 文字列値は切り詰めなしで全文表示
- **最大サイズ事前計算**: `#scanTrace()` の第 2 パスで全 humanStep を走査し、配列ごとの `maxWidth`（`len * CELL` の最大値）と `maxGridHeight`（インデックス行＋値行＋最大ポインタ行数 × 高さ の最大値）を計算。`#render()` で `.cb-grid` に `min-width`/`min-height` として設定し、ステップ間で各配列ブロックの占有領域が動かないよう固定
- **空配列時の占有確保**: `arr.length === 0` のときも `.cb-grid` に `min-width`/`min-height` を設定し、「配列が空です」メッセージを内包する。占有領域は最大サイズを維持

**入力**: `state.event.env`, `state.cursor`, `builder.trace`

---

#### V-08: 変数の時系列グラフ（Timeline）✅ 実装済み（タブ非登録・非アクティブ）

タブ名: **時系列**（現在タブ非登録）

- `init()` 時に全 humanStep を走査して変数の値履歴を構築
- X 軸＝humanStep インデックス、Y 軸＝変数値
- 複数変数を色分けした SVG 折れ線グラフで表示
- 変数チップ選択変更時に、選択中の変数の値のみで Y 軸 min/max を動的再計算（未選択変数は Y 軸スケールに影響しない）
- `update()` はカーソル縦線の移動のみ（O(log n) の二分探索）

**入力**: `builder.getHumanStepList()`, `builder.trace`

---

#### V-09: 実行頻度ヒートマップ（Heatmap）✅ 実装済み

タブ名: **ヒートマップ**

- `init()` でソース行を描画。ドット列（lineTimeline）を事前計算
- **背景色**: 現在ステップまでの実行回数に応じて橙の透明度を `update()` で動的に更新（静的ではない）
- **実行回数表示**: 各行の右端に「N回 / M回」形式で表示（N=現在ステップまでの回数、M=全ステップでの総回数）。ステップごとに更新
- **時系列ドット**: 各行の実行タイミングを右端の幅固定トラック（360px）内に点で配置。水平位置 = humanStep インデックスの相対位置。実行済みドット（`.hm-dot--past`、アクセントカラー）と未実行ドット（グレー）で色分け。現在位置ドット（`.hm-dot--current`）は強調表示
- **連結線（常時表示）**: 異なる行に遷移する連続 humanStep のドット間を、`.hm-lines` 内のオーバーレイ SVG（`.hm-overlay-svg`、`position: absolute`）上の `<line class="hm-vline">` で常時表示。`init()` 時に `requestAnimationFrame` で `#drawConnectLines()` を呼び出して描画。座標は `getBoundingClientRect()` ＋ `scrollTop` で算出。トグルボタン（`.hm-btn-lines`）は廃止
- `update()` で背景色・カウントテキスト・ドットの状態クラスを全行更新

**入力**: `builder.source`, `builder.buildHeatmap()`, `builder.getHumanStepList()`, `builder.trace`, `state.event`, `state.cursor`

---

#### V-10: 再帰ツリービュー（RecursionTree）✅ 実装済み（非アクティブ）

`buildRecursionTree()`（再帰呼び出しのみのツリー・cost付き）を SVG ツリーとして描画する参照実装。[ADR-027](adr/ADR-027-calltree-recursiontree-merge.md) により、下記 V-10b CallTree がノード表示・cost 表示を統合したため、タブ登録から外されている（コードは `src/views/recursion-tree/` に残置）。

`buildRecursionTree()` の仕様:
- `#buildFullCallTree()` で全呼び出しツリーを構築後、再帰的にフィルタリング
- **フィルタリング**: `child.funcName === parent.funcName` の子のみ保持（再帰呼び出しのみ）
- 再帰的な子を 1 つも持たないルートは除外 → 非再帰プログラムでは空配列
- **cost プロパティ**: `node.cost = 1 + Σ(子のcost)` でサブツリーサイズを計算して付与（`buildCallTree()` と共有の `#computeCost()` を使用）
- ノード: `{ id, funcName, args, returnVal, callStepIdx, returnStepIdx, treeDepth, children[], cost }`

---

#### V-10b: 関数呼び出しツリービュー（CallTree）✅ 実装済み

タブ名: **呼び出しツリー**

- 再帰に限らず、全ての関数呼び出しを SVG ツリーとして表示する
- RecursionTree との違い: 再帰関数でなくても（例: `Math.max`、ヘルパー関数）全呼び出しをノードとして展開
- ノード表示形式は RecursionTree と統一（[ADR-027](adr/ADR-027-calltree-recursiontree-merge.md)）: 関数名（1行目）・引数（`fmtArgsLines()` で最大2行）・戻り値・cost（左下、「cost:N」）
- ノードの色・状態アイコンは未呼び出し（灰・破線・「…」）／実行中（青・太線・「▶」）／完了（緑・「✓」）
- レイアウト: 再帰的サブツリー幅計算（葉=NODE_W=160、内部ノード=子の幅の和＋gap）、NODE_H=80
- `update()` はノード className の付け替えのみ

**入力**: `builder.buildCallTree()`, `state.cursor`

`buildCallTree()` の仕様:
- 内部の `#buildFullCallTree()` を呼び出し、全ノードに `#computeCost()`（`buildRecursionTree()` と共有）で cost を付与
- 返り値構造は `buildRecursionTree()` と同一（`cost` プロパティを含む）
- 全関数呼び出し（再帰・非再帰を問わず）を含む

---

#### V-11: 変数ライフタイム（Lifetime）✅ 実装済み

タブ名: **ライフタイム**

- X 軸＝humanStep インデックス、Y 軸＝変数名の Gantt チャート（SVG）
- 変数バーの色は `callDepth` 別に色分け（深い関数呼び出しほど異なる色）
- `update()` はカーソル縦線（破線）の移動のみ

**入力**: `builder.buildLifetime()`, `builder.getHumanStepList()`, `state.cursor`

`buildLifetime()` の仕様:
- humanStep ごとに `flattenEnv(ev.env)` を走査
- キー = `callDepth:varName` で区間を追跡（同名変数の異なる呼び出し深さを分離）
- 戻り値: `{ varName, callDepth, startHi, endHi }[]`（startHi/endHi は humanStep 配列のインデックス）

---

#### V-12: 制御フロービュー（ControlFlow）✅ 実装済み

タブ名: **制御フロー**

- ノード＝実行済みソース行（初出現順に縦配置）
- 前向きエッジ（右側・青）、後向きエッジ・ループ戻り（左側・橙）
- ノードの背景色＝実行回数に応じた青→橙のグラデーション
- 現在ノードをアクセントボーダーで強調
- **色覚多様性対応**: 戻りエッジ（ループバック）は橙色の破線（`stroke-dasharray: 6 3`）で表示

**入力**: `builder.buildControlFlow()`, `state.event`

`buildControlFlow()` の仕様:
- humanStep の行番号遷移からノード（ユニーク行）とエッジ（行→行）を構築
- 戻り値: `{ nodes: CFGNode[], edges: CFGEdge[], humanSteps: number[] }`
- CFGNode: `{ lineNo, text, count, firstSeen }`
- CFGEdge: `{ from, to, count }`

---

#### V-13: メモリモデルビュー（MemoryView）✅ 実装済み

タブ名: **メモリモデル**

- 左列: スタック（スコープフレームとプリミティブ変数）
- 右列: ヒープ（オブジェクト・配列を `#N` ID 付きボックスで表示）
- SVG オーバーレイ: 参照変数セルからヒープオブジェクトへのベジェ曲線矢印
- `WeakMap` でオブジェクト同一性を追跡し重複ヒープ登録を防止
- 変化した変数の行は黄色でハイライト
- 矢印は `requestAnimationFrame` 後に `getBoundingClientRect()` で位置計算

**入力**: `state.scopes`, `state.callStack`, `state.changedVars`, `state.frameEnvs`

---

#### V-14: オブジェクトグラフ（ObjectGraph）✅ 実装済み

タブ名: **オブジェクト**

- ノード＝オブジェクト・配列（`WeakMap` で循環参照を検出・再帰 6 段まで追跡）
- エッジ＝プロパティが別オブジェクトを指す参照（ラベル = プロパティ名）
- ルートノード上部に変数名ラベルを表示
- プリミティブ変数は左上コーナーに一覧表示
- **レイアウト**: 階層型（Kahn トポロジカルソート + 最長パス法で列番号を決定し、同じプロパティエッジが左→右方向に統一）
- **エッジ**: 肘型コネクタ（`M x1,y1 H mx V y2 H x2`）。同一ノードからの複数エッジは出口ポートを均等分散（ポートスプレッド）してラベル・エッジ重複を回避
- **連結成分分離**: 無向 BFS で連結成分を検出し、各成分を独立に配置後 y 軸方向に積み上げ。成分 ≥2 のとき点線境界矩形（`.og-comp-bg`）を表示
- **ノード色分け**: 6 色パレット（`--og-bg-0` ～ `--og-bg-5`）でノードごとに背景色を割り当て

**入力**: `state.variables`, `state.scopes`

---

### 3.3 UI 共通機能

#### F-10: コードハイライト（全ビュー共通）

コード表示エリアでは以下の **3 層ハイライト**が重なって表示される。

| 層 | 色 | 条件 | 説明 |
|----|-----|------|------|
| 1. 行ハイライト | 🟦 青（左ボーダー＋背景） | 常に | `event.loc.line` の行全体 |
| 2. 式ハイライト | 🟧 オレンジ（半透明） | `event.loc` と `event.end` が両方存在する場合 | 現在評価中の式の文字範囲 |
| 3. 呼び出し元ハイライト | 🟣 パープル（破線アンダーライン） | `callStack.length > 0` の場合 | 現在実行中の関数を呼び出した CallExpression |

式ハイライトと呼び出し元ハイライトは `position: absolute; calc(N * 1ch)` でモノスペースフォントの文字幅に合わせた精密配置。

#### F-11: ビュー切り替えタブ

- 右ペイン上部のタブでビューを切り替え
- タブ切り替え時は前ビューを `destroy()` してから新ビューを `init()` する
- 実行のたびに（`adapter.load()` → `adapter.moveTo(0)` → `'ready'` イベント）ビューを再マウントして最新の `TraceBuilder` を渡す
- キーボードショートカット `1`〜`9` で登録順のタブに直接切り替え（`<textarea>` / `<input>` フォーカス中は無効）
- アクティブタブを `localStorage('jsv-active-tab')` に保存し、次回起動時に復元

#### F-12: テーマ切り替え

| 項目 | 仕様 |
|------|------|
| デフォルト | ライトテーマ（Catppuccin Latte ベース） |
| 切り替え方法 | ヘッダー右上の ⚙ ボタン → 設定パネルのラジオボタン |
| 選択肢 | ☀️ ライト / 🌙 ダーク |
| 永続化 | `localStorage('jsv-theme')` に保存 |
| FOUC 防止 | `<head>` のインラインスクリプトで CSS 読み込み前に適用 |

#### F-14: Console 常時表示パネル

右ペイン（`debug-pane`）の下部に常時表示される固定パネル。どのビュータブを選択していても常に表示される。

| 項目 | 仕様 |
|------|------|
| 位置 | view-container 下部に固定（高さ可変：デフォルト 110px、上端ドラッグで 40〜400px に変更可、`localStorage('jsv-console-h')` に永続化） |
| 内容 | `console.log` / `console.warn` / `console.error` の出力行。ログ件数バッジ付き |
| 更新タイミング | `adapter.ready` および `adapter.step` イベントのたびに更新 |
| スタイル | `warn` → 橙色行、`error` → 赤色行 |

#### F-15: 言語切替（i18n）

| 項目 | 仕様 |
|------|------|
| 対応言語 | 日本語（`ja`）・英語（`en`） |
| 切り替え方法 | ヘッダー右端の **EN** / **日** ボタン（`btn-lang`）をクリック |
| 適用範囲 | ボタンラベル・タブ名・ビュー説明文・コンソールタイトル・設定パネルテキスト（約 46 項目） |
| 非適用範囲 | エラーメッセージ（JSInterpreter 出力）・サンプルプログラム名 |
| 実装方式 | 静的 HTML 要素は `data-i18n="key"` 属性 + `applyI18n()` で一括更新。タブラベル・説明文は `ViewSwitcher.register()` に `{ja,en}` オブジェクトを渡し `ViewSwitcher.setLang()` で再描画 |
| 永続化 | `localStorage('jsv-lang')`（デフォルト `'ja'`） |
| イベント | `setLang()` → `document.dispatchEvent('langchange')` → `applyI18n()` + `switcher.setLang()` |

#### F-13: エラーバッジ表示

構文エラーと実行時エラーをエディタ下部に視覚的に区別して表示する。

| エラー種別 | 判定方法 | バッジラベル |
|-----------|---------|------------|
| 構文エラー | `err instanceof SyntaxError`、`err.name === 'SyntaxError'`、メッセージが `/^\[Parser\]/i` または `Unexpected token` 等にマッチ | 「構文エラー」（赤バッジ） |
| 実行エラー | 上記以外の実行時例外 | 「実行エラー」（橙バッジ） |

バッジは CSS クラス `.error-badge` で表示し、エラー種別に応じて `data-error-type="parse"` / `"runtime"` 属性でスタイルを切り替える。

---

## 4. 非機能要件

### 4.1 パフォーマンス

| 指標 | 目標値 |
|------|--------|
| `new JSDebugger(source)` 完了（100 行以内のコード） | 500ms 以内 |
| ステップ操作のUI更新 | 50ms 以内 |
| 最大 trace 長 | 100,000 ステップ |
| `TraceBuilder` 集計メソッドの初回呼び出し | 各ビューの `init()` 完了まで体感しないこと（バックグラウンド処理） |

### 4.2 互換性

- Chrome / Firefox / Safari 最新版
- モバイルブラウザは対象外（レスポンシブ対応は Phase 6 以降に検討）

### 4.3 アクセシビリティ

- キーボードのみでステップ操作（8 種類＋先頭/末尾）・ビュー切り替え（`1`〜`9`）ができること
- 色分けに加えて形状・テキスト・パターンでも情報を伝えること（色覚多様性対応）
  - CallTree: 破線ボーダー（未実行）・太線（実行中）・状態アイコン（…/▶/✓）
  - ControlFlow: 戻りエッジを破線で表示
- ライト/ダーク両テーマで十分なコントラスト比を確保すること
- SVG ビューに `role="img"` と `aria-label` を付与すること

### 4.4 保守性

- 各ビューが `init/update/reset/destroy` の共通インターフェースを持つこと
- ビュー追加・削除がアプリ本体のコードを変更せずできること（`ViewSwitcher.register()` のみ）
- `TraceBuilder` 集計メソッドはキャッシュ付きで冪等であること（何度呼んでも同じ結果）

### 4.5 デプロイ・CI

| 項目 | 仕様 |
|------|------|
| ホスティング | GitHub Pages（`https://tntetsu.github.io/JSVisualizer/`） |
| デプロイトリガー | `main` ブランチへの push または手動実行（`workflow_dispatch`） |
| CI パイプライン | ① JSInterpreter クローン → ② `npm ci` → ③ `npm test`（71 テスト）→ ④ `npm run build` → ⑤ GitHub Pages へアップロード |
| 成果物 | `web/` ディレクトリ（`app.bundle.js` / `interpreter.bundle.js` / `index.html` / `style.css`） |
| 並行デプロイ | `concurrency: pages` で同時デプロイを 1 つに制限（前のデプロイをキャンセル） |

---

## 5. 用語定義

| 用語 | 定義 |
|------|------|
| TraceEvent | プログラム実行の1ステップに対応する情報。どの行・列で何の文・式が実行され、確定値がいくらかを記録する |
| cursor | trace 配列の現在位置を示す整数インデックス |
| humanStep | 人間が紙でトレースする際に記録する「意味のある変化点」（代入・条件判定・ループ更新・関数呼び出し等） |
| humanStep インデックス (hi) | getHumanStepList() が返す配列の添字（0 始まり）。LifetimeチャートのX軸に使用 |
| スナップショット | あるステップでの変数・スコープ・コールスタックの状態の複製 |
| diff / changedVars | 前後スナップショット間で変化した変数名のセット |
| オムニシェントデバッグ | プログラムを先に最後まで実行して全ステップを記録し、後から任意のステップに移動できるデバッグ方式 |
| 式ハイライト | 現在評価中の式の文字範囲をオレンジ（半透明）で着色して視覚化すること |
| 呼び出し元ハイライト | 関数内部を実行中のとき、その関数を呼び出した式をパープルで着色すること |
| FOUC | Flash of Unstyled Content。ページ読み込み時に一瞬デフォルトスタイルが見える現象。インラインスクリプトで防止する |
| jsv-theme | テーマ設定を永続化する localStorage キー。値 `"dark"` でダークテーマが適用される |
| jsv-active-tab | アクティブタブを永続化する localStorage キー。値はビューの登録 ID 文字列 |
| jsv-editor-pct | エディタペイン幅（%）を永続化する localStorage キー。`PaneResizer` が管理し 15〜75 の範囲でクランプ |
| jsv-console-h | コンソールパネル高さ（px）を永続化する localStorage キー。`app.js` が管理し 40〜400 の範囲でクランプ |
| エラーバッジ | エラー種別を視覚的に示す小型ラベル。「構文エラー」または「実行エラー」のいずれかを表示する |
| jsv-lang | 表示言語を永続化する localStorage キー。値は `'ja'`（日本語）または `'en'`（英語）。デフォルト `'ja'` |
