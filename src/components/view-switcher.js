/**
 * view-switcher.js — ビュー切り替えタブコンポーネント
 *
 * ビュークラスを登録してタブ UI を自動生成する。
 * タブクリックで前ビューを destroy → 新ビューを init + update する。
 *
 * キーボードショートカット（実行中のみ有効）:
 *   1〜9  … 登録順の N 番目のタブへ切り替え
 */

import { sessionLogger } from '../core/session-logger.js';

const STORAGE_KEY_TAB = 'jsv-active-tab';

export class ViewSwitcher {
  /** @type {HTMLElement} タブボタン置き場 */
  #tabsEl;

  /** @type {HTMLElement} ビュー DOM の置き場 */
  #containerEl;

  /**
   * @type {Map<string, { label: string, ViewClass: Function, instance: import('../views/base-view.js').BaseView|null }>}
   */
  #registry = new Map();

  /** @type {string|null} 現在アクティブなビュー ID */
  #activeId = null;

  /** @type {import('../core/debugger-adapter.js').AppState|null} 最後の state */
  #lastState = null;

  /** @type {import('../core/trace-builder.js').TraceBuilder|null} */
  #builder = null;

  /** @type {((e: KeyboardEvent) => void)|null} キーボードハンドラ */
  #keyHandler = null;

  /**
   * @param {HTMLElement} tabsEl      タブボタン置き場
   * @param {HTMLElement} containerEl ビューコンテンツ置き場
   */
  constructor(tabsEl, containerEl) {
    this.#tabsEl      = tabsEl;
    this.#containerEl = containerEl;
  }

  // ── 公開 API ──────────────────────────────────────────────────────────────

  /**
   * ビュークラスを登録してタブボタンを生成する。
   * @param {string}   id         ビューの一意 ID
   * @param {string}   label      タブに表示するラベル
   * @param {Function} ViewClass  BaseView を継承したクラス
   */
  register(id, label, ViewClass) {
    this.#registry.set(id, { label, ViewClass, instance: null });
    this.#addTab(id, label);
  }

  /**
   * 実行開始時に呼ぶ。builder をセットしてアクティブビューを再初期化する。
   * @param {import('../core/debugger-adapter.js').AppState}     state
   * @param {import('../core/trace-builder.js').TraceBuilder}    builder
   */
  onReady(state, builder) {
    this.#builder   = builder;
    this.#lastState = state;

    this.#updateGrayout(builder);

    // キーボードショートカットを登録
    this.#registerKeyboard();

    if (this.#activeId) {
      // builder が更新されるため、常に destroy → 再マウントして
      // init(container, builder) を最新の builder で呼び直す。
      const entry = this.#registry.get(this.#activeId);
      if (entry?.instance) {
        entry.instance.destroy();
        entry.instance = null;
      }
      this.#mountView(this.#activeId);
    } else {
      // 前回保存したタブ → なければ最初のビュー
      const savedId = localStorage.getItem(STORAGE_KEY_TAB);
      const targetId = (savedId && this.#registry.has(savedId))
        ? savedId
        : this.#registry.keys().next().value;
      if (targetId) this.#activate(targetId);
    }
  }

  /**
   * ステップ変化時に呼ぶ。アクティブビューを更新する。
   * @param {import('../core/debugger-adapter.js').AppState} state
   */
  update(state) {
    this.#lastState = state;
    const entry = this.#activeId ? this.#registry.get(this.#activeId) : null;
    entry?.instance?.update(state);
  }

  /**
   * リセット時に呼ぶ。全ビューを destroy して状態をクリアする。
   */
  reset() {
    this.#unregisterKeyboard();
    for (const [, entry] of this.#registry) {
      entry.instance?.destroy();
      entry.instance = null;
    }
    this.#containerEl.innerHTML = '';
    this.#lastState = null;
    this.#builder   = null;
    this.#clearGrayout();
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /**
   * 各ビューの hasContent() を呼んでコンテンツ空のタブをグレーアウトする。
   */
  #updateGrayout(builder) {
    for (const [id, entry] of this.#registry) {
      const tab = this.#tabsEl.querySelector(`[data-view="${id}"]`);
      if (!tab) continue;
      const empty = typeof entry.ViewClass.hasContent === 'function'
        ? !entry.ViewClass.hasContent(builder)
        : false;
      tab.classList.toggle('view-tab--empty', empty);
    }
  }

  /** グレーアウトをすべて解除する（リセット時）。 */
  #clearGrayout() {
    this.#tabsEl.querySelectorAll('.view-tab--empty').forEach(btn => {
      btn.classList.remove('view-tab--empty');
    });
  }

  /**
   * タブボタンを生成して追加する。
   */
  #addTab(id, label) {
    const btn = document.createElement('button');
    btn.className    = 'view-tab';
    btn.dataset.view = id;
    btn.textContent  = label;
    btn.addEventListener('click', () => this.#activate(id));
    this.#tabsEl.appendChild(btn);
  }

  /**
   * キーボードショートカット（1〜9 でタブ切り替え）を登録する。
   */
  #registerKeyboard() {
    if (this.#keyHandler) return;
    const ids = [...this.#registry.keys()];
    this.#keyHandler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9) {
        const id = ids[digit - 1];
        if (id) { e.preventDefault(); this.#activate(id); }
      }
    };
    document.addEventListener('keydown', this.#keyHandler);
  }

  /** キーボードショートカットを解除する。 */
  #unregisterKeyboard() {
    if (this.#keyHandler) {
      document.removeEventListener('keydown', this.#keyHandler);
      this.#keyHandler = null;
    }
  }

  /**
   * 指定ビューをアクティブにする。
   */
  #activate(id) {
    if (id === this.#activeId) return;

    // 前ビューを非表示（destroy せず DOM を保持する設計も可だが
    // シンプルに destroy + 再 init 方式を採用）
    if (this.#activeId) {
      const prev = this.#registry.get(this.#activeId);
      if (prev?.instance) {
        prev.instance.destroy();
        prev.instance = null;
      }
    }

    this.#activeId = id;

    // アクティブタブを localStorage に保存
    try { localStorage.setItem(STORAGE_KEY_TAB, id); } catch { /* ignore */ }

    sessionLogger.logView(id);

    // タブのアクティブ状態を更新
    this.#tabsEl.querySelectorAll('.view-tab').forEach(btn => {
      btn.classList.toggle('view-tab--active', btn.dataset.view === id);
    });

    // 新ビューをマウント
    this.#mountView(id);
  }

  /**
   * ビューを DOM にマウントして初期化する。
   */
  #mountView(id) {
    const entry = this.#registry.get(id);
    if (!entry) return;

    // コンテナをクリアして新ビューの DOM 置き場を作成
    this.#containerEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'view-wrapper';
    this.#containerEl.appendChild(wrapper);

    // インスタンス生成・初期化
    entry.instance = new entry.ViewClass();
    entry.instance.init(wrapper, this.#builder);

    // builder が既にあれば（実行済み状態なら）最後の state で更新
    if (this.#lastState) {
      entry.instance.update(this.#lastState);
    }
  }
}
