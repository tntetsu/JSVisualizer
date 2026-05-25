/**
 * step-controls.js — ステップ操作バーコンポーネント
 *
 * ボタン・スライダー・粒度セレクターを管理し、
 * StepController へのハンドリングとキーボードショートカットを担当する。
 */

export class StepControls {
  /** @type {import('../core/step-controller.js').StepController} */
  #ctrl;

  /** @type {HTMLButtonElement} */ #btnStart;
  /** @type {HTMLButtonElement} */ #btnBack;
  /** @type {HTMLButtonElement} */ #btnForward;
  /** @type {HTMLButtonElement} */ #btnEnd;
  /** @type {HTMLSelectElement} */ #granularitySelect;
  /** @type {HTMLInputElement}  */ #slider;
  /** @type {HTMLElement}       */ #counter;

  /** @type {(e: KeyboardEvent) => void} キーボードハンドラの参照（解除用） */
  #keyHandler = null;

  /**
   * @param {Object} opts
   * @param {import('../core/step-controller.js').StepController} opts.controller
   * @param {HTMLButtonElement} opts.btnStart
   * @param {HTMLButtonElement} opts.btnBack
   * @param {HTMLButtonElement} opts.btnForward
   * @param {HTMLButtonElement} opts.btnEnd
   * @param {HTMLSelectElement} opts.granularitySelect
   * @param {HTMLInputElement}  opts.slider
   * @param {HTMLElement}       opts.counter
   */
  constructor({ controller, btnStart, btnBack, btnForward, btnEnd,
                granularitySelect, slider, counter }) {
    this.#ctrl             = controller;
    this.#btnStart         = btnStart;
    this.#btnBack          = btnBack;
    this.#btnForward       = btnForward;
    this.#btnEnd           = btnEnd;
    this.#granularitySelect = granularitySelect;
    this.#slider           = slider;
    this.#counter          = counter;

    this.#bindEvents();
    this.setEnabled(false);
  }

  // ── 公開 API ──────────────────────────────────────────────────────────────

  /**
   * ステップ変化時に UI を更新する。
   * @param {import('../core/debugger-adapter.js').AppState} state
   */
  update(state) {
    const { cursor, totalSteps, done } = state;

    // スライダー
    this.#slider.max   = String(totalSteps);
    this.#slider.value = String(cursor);

    // カウンター
    this.#counter.textContent = `${cursor} / ${totalSteps}`;

    // ボタンの有効/無効
    this.#btnStart.disabled   = cursor === 0;
    this.#btnBack.disabled    = cursor === 0;
    this.#btnForward.disabled = done;
    this.#btnEnd.disabled     = done;
  }

  /**
   * コントロール全体の有効/無効を切り替える。
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    [this.#btnStart, this.#btnBack, this.#btnForward, this.#btnEnd,
     this.#granularitySelect, this.#slider].forEach(el => {
      el.disabled = !enabled;
    });

    if (enabled) {
      this.#registerKeyboard();
    } else {
      this.#unregisterKeyboard();
      this.#counter.textContent = '';
      this.#slider.value = '0';
    }
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  #bindEvents() {
    this.#btnStart.addEventListener('click',   () => this.#ctrl.goToStart());
    this.#btnBack.addEventListener('click',    () => this.#ctrl.stepBackward());
    this.#btnForward.addEventListener('click', () => this.#ctrl.stepForward());
    this.#btnEnd.addEventListener('click',     () => this.#ctrl.goToEnd());

    this.#granularitySelect.addEventListener('change', () => {
      this.#ctrl.setGranularity(
        /** @type {any} */ (this.#granularitySelect.value)
      );
    });

    this.#slider.addEventListener('input', () => {
      this.#ctrl.jumpTo(Number(this.#slider.value));
    });
  }

  #registerKeyboard() {
    if (this.#keyHandler) return;  // 二重登録防止
    this.#keyHandler = (e) => {
      // テキストエリアにフォーカスがある場合はスキップ
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'b':
          e.preventDefault();
          this.#ctrl.stepBackward();
          break;
        case 'ArrowRight':
        case 'n':
        case 'Enter':
          e.preventDefault();
          this.#ctrl.stepForward();
          break;
        case 'Home':
          e.preventDefault();
          this.#ctrl.goToStart();
          break;
        case 'End':
          e.preventDefault();
          this.#ctrl.goToEnd();
          break;
      }
    };
    document.addEventListener('keydown', this.#keyHandler);
  }

  #unregisterKeyboard() {
    if (this.#keyHandler) {
      document.removeEventListener('keydown', this.#keyHandler);
      this.#keyHandler = null;
    }
  }
}
