# JSVisualizer — アーキテクチャ決定記録（ADR）

このディレクトリには、JSVisualizer の設計で行った重要な決定を記録した ADR（Architecture Decision Record）が含まれています。  
git 履歴（2026-05-25〜2026-06-08）と設計ドキュメントをもとに 2026-06-14 に作成。2026-06-15 に ADR-016〜019 を追加。2026-06-16 に ADR-020〜023 を追加。2026-07-23 に ADR-024〜025 を追加。2026-08-11 に ADR-028 を追加。2026-08-12 に ADR-029〜031 を追加。

**ADR運用ルール**: BhvVisualizerからの要求による変更に限らず、JSVisualizer単体の改良のための変更も含め、重要な設計判断を伴う場合は都度ADRを追加し、この一覧表も更新する（2026-08-12改定、ADR-030参照）。

## 一覧

| No. | タイトル | 決定日 |
|-----|---------|--------|
| [001](ADR-001-omniscient-debugging.md) | オムニシェントデバッグモデル（全ステップ事前記録） | 2026-05-25 |
| [002](ADR-002-single-source-of-truth.md) | DebuggerAdapter を単一の真実の源とする | 2026-05-25 |
| [003](ADR-003-view-interface.md) | ビュー共通インターフェース（init / update / reset / destroy） | 2026-05-25 |
| [004](ADR-004-trace-builder.md) | TraceBuilder による事前集計パターン（キャッシュ付き） | 2026-05-25〜26 |
| [005](ADR-005-four-granularity-step.md) | 4 粒度ステップシステム | 2026-05-25 |
| [006](ADR-006-no-visualization-libraries.md) | 外部可視化ライブラリを使用しない | 2026-05-25 |
| [007](ADR-007-codemirror6.md) | CodeMirror 6 の採用（シンタックスハイライト付きエディタ） | 2026-05-26 |
| [008](ADR-008-humanstep-definition.md) | humanStep の停止点定義（意味的ステップ） | 2026-05-26、2026-06-04 |
| [009](ADR-009-console-fixed-panel.md) | Console 出力を常時表示の固定パネルに分離 | 2026-05-26 |
| [010](ADR-010-callstack-ordering.md) | callStack の順序規約（[0]=最外側・[last]=最内側） | 2026-06-02 |
| [011](ADR-011-frameenvs-lexical-scope.md) | lexical scope 問題と frameEnvs による解決 | 2026-06-04 |
| [012](ADR-012-linetrace-single-pane.md) | LineTrace の単一ペイン化（ソースパネル廃止） | 2026-06-04 |
| [013](ADR-013-colorbox-stable-layout.md) | ColorBox の 2 パス走査による安定レイアウト | 2026-06-04 |
| [014](ADR-014-substitution-model-views.md) | 置換モデルビュー（SubstTrace・ExprTrace）の導入 | 2026-06-05〜08 |
| [015](ADR-015-scope-callstack-tabs-removed.md) | ScopeView・CallStackView のタブ非登録化 | 2026-06-04 |
| [016](ADR-016-theme-system.md) | テーマシステム（Catppuccin Latte/Mocha + FOUC 防止） | 2026-05-25 |
| [017](ADR-017-error-classification.md) | エラーハンドリング（分類・位置表示・ブリンク） | 2026-05-25 |
| [018](ADR-018-controlflow-ast-refactor.md) | 制御フロービューの AST ベース構造的フローチャートへの刷新 | 2026-06-04 |
| [019](ADR-019-weakmap-object-identity.md) | MemoryView・ObjectGraph でのオブジェクト同一性追跡（WeakMap） | 2026-05-26 |
| [020](ADR-020-try-catch-host-exception.md) | try-catch におけるホスト例外の ThrowSignal 変換 | 2026-06-15 |
| [021](ADR-021-objectgraph-hierarchical-layout.md) | ObjectGraph の階層型レイアウト（Kahn トポソート + 最長パス法） | 2026-06-16 |
| [022](ADR-022-formatvaluediff-diff-highlight.md) | formatValueDiff による差分強調表示 | 2026-06-16 |
| [023](ADR-023-var-let-const-semantics.md) | var/let/const スコープセマンティクスの正確な実装 | 2026-06-16 |
| [024](ADR-024-session-logger.md) | Session Logger — 操作ログ機能（ワンクリックマーカー含む） | 2026-07-16 |
| [025](ADR-025-i18n-system.md) | 言語切替（i18n）システム | 2026-07-20 |
| [026](ADR-026-callstack-view-simplification.md) | Call Stack ビューの簡略化と Global 疑似フレーム導入 | 2026-08-05 |
| [027](ADR-027-calltree-recursiontree-merge.md) | CallTree / RecursionTree の統合、RecursionTree の非アクティブ化 | 2026-08-05 |
| [028](ADR-028-bhv-visualizer-integration-hooks.md) | BhvVisualizer 連携フック（`# BHV:` タグ）の設計 | 2026-08-11 |
| [029](ADR-029-url-query-exercise-loading.md) | URLクエリ（exerciseId/codeId）によるコード読み込み | 2026-08-12 |
| [030](ADR-030-error-msg-hidden-attribute-cascade-fix.md) | `error-msg`の`hidden`属性がCSSカスケードで無効化される不具合の修正 | 2026-08-12 |
| [031](ADR-031-url-based-exercise-loading.md) | URLクエリを「ID+ベースURL」方式から「完全なURL」方式へ再設計 | 2026-08-12 |
