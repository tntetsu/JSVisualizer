# ADR-019: MemoryView・ObjectGraph でのオブジェクト同一性追跡（WeakMap）

- **決定日**: 2026-05-26
- **作成日**: 2026-06-15
- **ステータス**: 承認済み（commit `c942c2b`）

## 背景・課題

`MemoryView`（スタック/ヒープ表示）と `ObjectGraph`（参照グラフ）は、JavaScript のオブジェクト・配列値をヒープ領域に表示する。各ステップで `update()` が呼ばれるたびに `AppState` から新しいスナップショット（`env` のディープクローン）が渡される。

素朴に実装すると以下の問題が生じた。

- 同一のオブジェクト参照（例: 変数 `a` と変数 `b` が同じ配列を指している）が **2 つの独立したヒープノード** として描画されてしまう
- ステップが進むたびにオブジェクトのアドレスが変わって見え、「同じオブジェクトが変化している」という連続性が失われる

## 決定

`WeakMap<object, heapId>` を使って **参照の同一性**を追跡する。

```js
// MemoryView / ObjectGraph 共通パターン
this.#heapMap = new WeakMap();  // object reference → heap node id

function getOrCreateHeapId(obj) {
  if (!this.#heapMap.has(obj)) {
    this.#heapMap.set(obj, nextId++);
  }
  return this.#heapMap.get(obj);
}
```

- 同一オブジェクト参照は同一 `heapId` を持つ → 複数の変数が同じヒープノードを指す矢印として描画される
- `update()` ごとに `WeakMap` を **リセットしない**（ビュー生存中は同一オブジェクトが同一ノードにマッピングされ続ける）

## 根拠

- `WeakMap` はオブジェクトが GC されれば自動的にエントリが消えるため、ビューが `destroy()` されても手動クリーンアップが不要
- オブジェクトの参照等価性（`===`）で同一性を判定できるのは JavaScript の強みであり、`heapId` をクローン側の値に埋め込む（`obj.__id__` 等）よりも侵襲性が低い
- `WeakMap` のキーはオブジェクト参照のみ（プリミティブ値は不可）のため、プリミティブ値はスタック側に表示するという設計上の区分が自然に強制される

## 結果・影響

- MemoryView・ObjectGraph のいずれも `init()` 時に `WeakMap` を初期化し、`destroy()` でも明示的なクリーンアップは不要
- 同一オブジェクトを参照する複数の変数を **共有ノード** として可視化でき、JavaScript の参照セマンティクスを正確に表現できるようになった
- `isFunctionVal(v)` でフィルタされた関数値はヒープに登録しない（`JSFunction`・`JSClass`・ネイティブ関数を除外）

## フォローアップ修正（2026-06-16）

WeakMap 追跡は機能的には正しいが、**前提条件に問題**があることが判明した。

`Environment.snapshot()` が各変数 `v` に対して `deepClone(v)` を**別々の `seen` WeakMap** で呼んでいたため、同一元オブジェクト（例: グローバルの `list` と関数引数の `head` が同じリストノードを指す場合）が **別クローン** として生成されていた。

WeakMap はクローンの JS オブジェクト参照をキーとするため、論理的には同一でも JS 参照が異なると別ノードとして登録してしまっていた。

**修正**: `snapshot()` と `snapshotOwn()` を `seen` WeakMap をスコープチェーン全体（または各フレーム内）で共有するよう変更した（`../JSInterpreter/src/interpreter/environment.js`）。

```js
// 修正後
snapshot() {
  const seen = new WeakMap();  // 全バインディングで共有
  let cur = this;
  while (cur) {
    for (const [k, v] of cur.bindings) {
      frame[k] = deepClone(v, seen);  // 同一元オブジェクト → 同一クローン
    }
    cur = cur.parent;
  }
}
```

これにより ObjectGraph・MemoryView の WeakMap 追跡が正しく機能し、連結リストの `prepend` 呼び出し中に既存ノードが重複表示されていたバグが解消された。
