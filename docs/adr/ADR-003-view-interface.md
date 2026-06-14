# ADR-003: ビュー共通インターフェース（init / update / reset / destroy）

- **決定日**: 2026-05-25
- **作成日**: 2026-06-14
- **ステータス**: 承認済み

## 背景・課題

16 種類の可視化ビューを統一的に管理するため、`ViewSwitcher` がどのビューも同一の方法でマウント・更新・アンマウントできるインターフェースが必要だった。

## 決定

全ビューが `BaseView` を継承（または同等のメソッド群を実装）し、以下の 4 メソッドを公開する。

```js
class BaseView {
  init(container, builder)  // DOM への初期描画（builder は TraceBuilder インスタンス）
  update(state)             // ステップ変化時の更新
  reset()                   // 状態クリア（コード再実行時）
  destroy()                 // DOM クリーンアップ（ビュー切り替え時）
}
```

`init()` には `TraceBuilder` を渡す。ビュー切り替え時は `ViewSwitcher.onReady()` が前のビューを `destroy()` → 新ビューを `init()` するため、ビューは常に最新の builder を受け取ることが保証される。

## 根拠

- `ViewSwitcher` がビューのクラスを知らなくてよい（`new ViewClass()` してインターフェース経由で操作）
- ビューが独立してライフサイクルを管理できるため、メモリリーク（イベントリスナー残留等）を防ぎやすい
- テスト容易性：インターフェースが明確なため、各ビューを独立してテストできる

## 結果・影響

- `ViewSwitcher` の `register(id, label, ViewClass)` でビューを登録するパターンが確立
- タブ切り替え時に必ず `destroy()` → `init()` が走るため、ビューは「再初期化コスト」を許容する設計になっている
- 重い集計処理は `TraceBuilder` のキャッシュ（ADR-004）に委ねることで、`init()` 内の処理を軽量に保てる
