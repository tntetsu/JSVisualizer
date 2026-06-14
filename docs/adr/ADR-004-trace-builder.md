# ADR-004: TraceBuilder による事前集計パターン（キャッシュ付き）

- **決定日**: 2026-05-25（ヒートマップ集計）、2026-05-26（再帰ツリー・ライフタイム等に拡張）
- **作成日**: 2026-06-14
- **ステータス**: 承認済み

## 背景・課題

ヒートマップ・再帰ツリー・変数ライフタイム・制御フロー等のビューは、trace 全体を走査して集計データを生成する必要がある。これをビューの `init()` または `update()` 内で毎回行うと、ビュー切り替えのたびに O(n) の走査が繰り返される。

## 決定

`src/core/trace-builder.js` の `TraceBuilder` クラスに集計メソッドを集約する。各メソッドは初回呼び出し時のみ O(n) 走査を行い、結果をプライベートフィールドにキャッシュする。2 回目以降の呼び出しは O(1)。

```js
class TraceBuilder {
  constructor(trace, source)

  // 集計メソッド（すべてキャッシュ付き）
  buildHumanIndices()   // → Set<number>
  getHumanStepList()    // → number[]
  buildHeatmap()        // → Map<lineNo, count>
  buildRecursionTree()  // → TreeNode[]
  buildCallTree()       // → TreeNode[]
  buildLifetime()       // → LifetimeEntry[]
  buildControlFlow()    // → { nodes, edges, humanSteps }
}
```

`TraceBuilder` インスタンスは `onReady` 時に 1 つ生成され、`init(container, builder)` を通じて各ビューに渡される。

## 根拠

- ビューが切り替わるたびに重複走査が起きるのを防ぐ
- 集計ロジックをビューコードから分離することでテストが書きやすい（`trace-builder.test.js` に 40+ テスト）
- 新しいビューを追加するときは `TraceBuilder` に集計メソッドを追加するだけで済む

## 結果・影響

- `buildRecursionTree()` と `buildCallTree()` は内部で `#buildFullCallTree()` を共有しつつ独立キャッシュを持つという設計になった
- ビューの `init()` が高速に完了するため、タブ切り替えが軽快になった
