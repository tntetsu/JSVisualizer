/**
 * base-view.js — 全ビューが実装すべき共通インターフェース
 *
 * 各ビューはこのクラスを継承し、4つのメソッドを実装する。
 */

export class BaseView {
  /**
   * ビューを DOM に初期描画する。
   * @param {HTMLElement}                                         container  マウント先
   * @param {import('../core/trace-builder.js').TraceBuilder}    builder    事前集計データ
   */
  // eslint-disable-next-line no-unused-vars
  init(container, builder) {
    throw new Error(`${this.constructor.name}.init() not implemented`);
  }

  /**
   * ステップ変化時に呼ばれる。
   * @param {import('../core/debugger-adapter.js').AppState} state
   */
  // eslint-disable-next-line no-unused-vars
  update(state) {
    throw new Error(`${this.constructor.name}.update() not implemented`);
  }

  /**
   * 状態を初期化する（コード再実行時）。
   * DOM は維持し、表示内容だけクリアする。
   */
  reset() {
    throw new Error(`${this.constructor.name}.reset() not implemented`);
  }

  /**
   * DOM をアンマウントする（ビュー非表示切り替え時）。
   */
  destroy() {
    throw new Error(`${this.constructor.name}.destroy() not implemented`);
  }
}
