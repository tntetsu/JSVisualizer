# ADR-008: humanStep の停止点定義（意味的ステップ）

- **決定日**: 2026-05-26（基本定義）、2026-06-04（while/for 条件式を追加）
- **作成日**: 2026-06-14
- **ステータス**: 承認済み（commit `5abd6b8`, `b47e82d`）

## 背景・課題

「人間がトレース表に書き込む」粒度でのステップ実行を実現するため、AST の enter/exit イベントのうち「どれを停止点とするか」の基準が必要だった。

commit `5abd6b8` (2026-05-26) で VariableDeclaration / ReturnStatement / ThrowStatement の停止タイミングを enter から exit に統一した。これは「値が確定してから記録する」ためで、enter 時点では右辺が未評価のため変数の新しい値がまだ env に反映されていない。

その後 2026-06-04（commit `b47e82d`）で while/for ループの条件式評価がイテレーションごとに humanStep として記録されていなかった問題を修正した。

## 決定

以下のルールで humanStep の停止点を定義する（`TraceBuilder.buildHumanIndices()` に実装）。

| 条件 | 対象ノード |
|------|-----------|
| **enter** フェーズ | `ExpressionStatement`, `IfStatement`, `ForOfStatement`, `ForInStatement`, `BreakStatement`, `ContinueStatement` |
| **exit** フェーズ（副作用確定後） | `VariableDeclaration`, `AssignmentExpression`, `UpdateExpression`, `ReturnStatement`, `ThrowStatement`, `CallExpression` |
| while/do-while **条件式 exit**（イテレーションごと） | `WhileStatement`/`DoWhileStatement` の `matchIdx` 範囲内で、深さ D+1・`BlockStatement` 以外の exit |
| for **条件式・更新式 exit**（イテレーションごと） | `ForStatement` の `matchIdx` 範囲内で、深さ D+1・`VariableDeclaration`・`BlockStatement` 以外の exit |

`WhileStatement`/`ForStatement` の enter 自体は humanStep に含まない。各イテレーションの条件式 exit がその代わりになる。

`matchIdx` による範囲限定はネストしたループへの誤検出を防ぐための重要な仕組み。

## 根拠

- exit を採用する副作用ノードは「値確定後に記録」が自然なセマンティクス
- while/for 条件式をイテレーションごとに停止しないと、ループの繰り返しを「人間ステップ」で追えなかった
- `ExpressionStatement` は enter で停止する（文の開始を認識させるため）

## 結果・影響

- この定義が `LineTrace` / `ExecTrace` の「条件式列」表示ロジックとも共有されている（`buildConditionExitSet()` + `buildCondInfo()`）
- humanStep の追加によりスライダーのスナップ位置が意味のある単位に揃った
- 定義の変更（特に while/for の追加）は TraceBuilder のテストを要した
