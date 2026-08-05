# ADR-026: Call Stack ビューの簡略化と Global 疑似フレーム導入

**日付**: 2026-08-05
**ステータス**: 採用済み
**決定者**: Tetsuo Tanaka

---

## 背景

CELDA 2026 論文（`docs/study/paper-draft/03-design-principles.md` §3.2）の可視化対象・方式の整理を進める過程で、State ビュー（3 カード構成: Current Step / Variables / Call Stack）の設計を見直した。

- **Current Step カード**: `phase`（enter/exit）・`nodeType`（AST種別）・`depth`（AST走査深さ）・`callDepth`（コールスタック深さ）・`value` を表示していたが、これらは JSDebugger の生イベントをほぼそのまま表示しているだけで、Code View の3層ハイライト（行・式・呼び出し元）や Expr Trace ビューと情報が重複していた。特に `depth`/`callDepth` は学習者にとって意味づけが困難な内部デバッグ情報だった。
- **Variables カード**: `flattenEnv(ev.env)` を表示していたが、これは Call Stack カードの最内側フレームの中身（`mergeScopesForDisplay()` が計算するもの）とほぼ完全に重複していた。
- 一方、`mergeScopesForDisplay()`（`src/utils/format.js`）は callStack が空（グローバルスコープ実行中、関数呼び出し前後）のときも `{label: 'global', vars: merged, isInnermost: true}` を返す実装になっていたが、State ビューの `#renderCallStack()` は `callStack.length === 0` の場合に早期リターンしてプレースホルダーを表示するだけで、この global フレームを一切描画していなかった。そのため、グローバルスコープ実行中に変数を見る手段は事実上 Variables カードのみだった。

## 決定

1. Current Step カード・Variables カードを削除し、State ビューを Call Stack カード1枚の構成にする。
2. `#renderCallStack()` の早期リターンを撤廃し、常に `mergeScopesForDisplay(scopes, callStack, frameEnvs)` を呼び出す。
3. 同関数が返す `label === 'global'` のフレームを、返却順序（関数呼び出し中は末尾）に関わらず、このビューでは常に先頭に「Global」として表示する（`mergeScopesForDisplay()` 自体の返却順序は scope-view・memory-view でも使われる共有契約のため変更しない。並べ替えは State ビュー内でのみ行う）。
4. クラス名を `StateView` → `CallStackView` に変更し、タブ名を「変数・スタック/State」→「コールスタック/Call Stack」に変更する（`switcher.register()` の id は `'state'` のまま維持し、`localStorage('jsv-active-tab')` の互換性を保つ）。

## 代替案

### 代替案 A: Variables カードのみ削除し、Global 変数は Call Stack カードとは別に表示する

**却下理由**: 表示位置が増えるだけで根本的な重複解消にならない。`mergeScopesForDisplay()` が既に global フレームを返す実装になっている以上、それをそのまま使うのが最小の変更で済む。

### 代替案 B: Global フレームを `mergeScopesForDisplay()` の返却順序どおり（関数呼び出し中は末尾）に表示する

**却下理由**: グローバルスコープは常に存在する「背景」であり、関数呼び出しの有無に関わらず同じ位置に見えるほうが学習者にとって予測しやすい。呼び出し中でも直近の操作対象（最内側フレーム）は `scv-frame--active` の強調表示で区別できるため、Global を先頭に固定しても「今どこにいるか」の把握を妨げない。

## 影響

- `src/views/state-view/index.js`: `StateView` → `CallStackView` にリネーム。Current Step/Variables 関連のフィールド・メソッド・DOM を削除
- `src/app.js`: import・`switcher.register('state', ...)` のラベルを更新
- `web/style.css`: `.current-step`/`.cs-*`/`.variables` の未使用スタイルを削除
- 動作確認: トップレベル実行中は Global フレームのみ（`(no variables)` または宣言済みグローバル変数）、関数呼び出し中は Global（関数宣言等を含む）+ 呼び出しフレーム（innermost-first）が表示され、最内側フレームに `scv-frame--active` が付与されることを Playwright で確認済み

## 関連 ADR

- [ADR-011](ADR-011-frameenvs-lexical-scope.md) — `frameEnvs` 生成機構（`mergeScopesForDisplay()` が依存する外側フレーム変数の再構築元）
