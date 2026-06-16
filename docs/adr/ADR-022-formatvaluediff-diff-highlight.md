# ADR-022: トレース表の差分強調（formatValueDiff）

- **決定日**: 2026-06-16
- **ステータス**: 承認済み

## 背景・課題

LineTrace（トレース表）と ExecTrace（実行トレース）では、ステップが進んだとき変数値がどのセルで変わったかが分かりにくかった。特に配列やオブジェクト値は全体を比較しないと変化箇所が判別できない。

## 決定

`src/utils/format.js` に `formatValueDiff(val, prevVal)` を追加する。

### 比較単位

| 値の型 | 比較単位 |
|--------|---------|
| スカラー（number・boolean・string） | 値全体 |
| 配列 | 要素ごと（インデックス対応） |
| オブジェクト | プロパティごと（キー対応） |

変化した部分のみ `<b class="v-diff">...</b>` でラップする。内部は `formatValue(x, 1)` で深さ 1 の表示（`[…]`/`{…}` 省略形）。

等価比較は `JSON.stringify` ベース（`valEqual(a, b)`）。

### CSS

```css
:root            { --v-diff: #c05000; }  /* ライト: 濃いオレンジ */
[data-theme="dark"] { --v-diff: #ff9f5e; }  /* ダーク: 明るいオレンジ */

b.v-diff,
b.v-diff .v-num, b.v-diff .v-str, b.v-diff .v-bool,
b.v-diff .v-obj, b.v-diff .v-null, b.v-diff .v-undef {
  color: var(--v-diff);
}
```

### 適用箇所

| ビュー | 適用タイミング | 前値の取得方法 |
|--------|-------------|-------------|
| LineTrace | `update()` 時、アクティブ行（`lt-row--active`）の変数セルのみ | `prevVarsAtCursor`（cursor 直前の humanStep の env から取得） |
| ExecTrace | `init()` 時、全行の変数セルに一括適用 | `prevEnvMap`（前 humanStep の `flattenEnv` 結果） |

## 根拠

- **`init()` 時一括適用（ExecTrace）**: ExecTrace は全行を一括描画するため、`init()` 段階で `prevEnvMap` を追跡しながら全セルに適用する。`update()` では行ハイライト移動のみで済む（O(n)）
- **`update()` 時部分適用（LineTrace）**: LineTrace はアクティブ行のみ差分強調する。非アクティブ行のセルは通常の `formatValue` で描画済みであり、再計算が不要
- **フラッシュアニメーションとの共存**: 既存の `.lt-flash` アニメーション（変化セルのオレンジフラッシュ）は引き続き有効。差分強調は静的な太字橙色で「結果状態」を表す補完的な表現

## 結果・影響

- `format.js` に `formatValueDiff` を export 追加（`formatValue` の差分版）
- `line-trace/index.js` と `exec-trace/index.js` のインポートに `formatValueDiff` を追加
- `style.css` に `--v-diff` カスタムプロパティと `.v-diff` クラスを追加
