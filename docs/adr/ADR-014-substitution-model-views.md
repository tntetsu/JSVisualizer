# ADR-014: 置換モデルビュー（SubstTrace・ExprTrace）の導入

- **決定日**: 2026-06-05（SubstTrace）、2026-06-08（ExprTrace 改善）
- **作成日**: 2026-06-14
- **ステータス**: 承認済み（commit `fe7d0ad`, `cfd12ff`）

## 背景・課題

既存のビュー群（トレース表、実行トレース等）は「変数の値の変化」を行単位で追うが、「式がどのように評価されたか」の過程を示せていなかった。特に:

- 再帰関数の return 式が何に展開されるかを追うのが難しい
- `a + b * c` のような複合式で、部分式がどの順番でどの値に評価されたかが見えない

計算機科学の教育では「置換モデル（substitution model）」が式評価の直観的な説明に使われるが、これを動的に可視化するビューが存在しなかった。

## 決定

**SubstTrace（代入展開ビュー）**: 最初のユーザー定義関数呼び出しを追跡し、`ReturnStatement` enter ごとに return 式の識別子・サブ呼び出しを評価済みテキストに置換して展開行を積み重ねる。

```
factorial(4)
  → 4 * factorial(3)
  → 4 * 3 * factorial(2)
  → 4 * 3 * 2 * factorial(1)
  → 4 * 3 * 2 * 1
  → 24
```

**ExprTrace（式評価ビュー）**: 1 つの文（`ExpressionStatement`・`VariableDeclaration` init・`IfStatement` test・`WhileStatement` test・`ReturnStatement` 引数・`ForStatement` init/test/update）の部分式が逐次置換される過程をトレース表形式で表示する。

```
初期式:        a + b * 2   (a=3, b=4)
exit Literal:  a + b * 2   (→ 2 が確定)
exit Binary:   a + 8       (b*2=8 が確定)
exit Identifier: 3 + 8     (a=3 が確定)
exit Binary:   11          (最終値)
```

ソース座標（1始まり）を表示座標（0始まり）に変換する `srcPosToDispPos()` / `srcRangeToDispRange()` を実装した。

## 根拠

- 教育用ツールとして「式の評価過程」の可視化は本質的なニーズ
- ExprTrace は `ev.callDepth !== outerCallDepth` で関数内部を除外することで、現在の文にフォーカスを当てられる
- SubstTrace は再帰関数の「展開」の直観（置換のステップ）を視覚化する

## 結果・影響

- `VariableDeclaration` のソース位置取得では、JSInterpreter が `VariableDeclarator` イベントを emit しないため、ソース正規表現ベースの位置取得が必要だった（ADR-014 の実装上の制約）
- ExprTrace は `update()` でアクティブ行の TD を `trace[cursor].env` からリアルタイム書き換えするため、`#trace` フィールドを保持する必要があった
- タブ登録数が 14 → 16 に増加した
