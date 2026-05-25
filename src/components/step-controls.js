/**
 * step-controls.js — ステップ操作バーコンポーネント
 *
 * ボタン構成:
 *   [⏮ 先頭]  [◀◀ 文戻り]  [◀ 式戻り]  [▶ 式進む]  [▶▶ 文進む]  [⏭ 末尾]
 *   [スライダー]  [カウンター]
 *
 * キーボードショートカット:
 *   b / ← … 式単位で戻る
 *   n / → … 式単位で進む
 *   v      … 文単位で進む
 *   V      … 文単位で戻る
 *   Home   … 先頭へ
 *   End    … 末尾へ
 */

export class StepControls {
  /** @type {import('../core/step-controller.js').StepController} */
  #ctrl;

  /** @type {HTMLButtonElement} */ #btnStart;
  /** @type {HTMLButtonElement} */ #btnExprBack;
  /** @type {HTMLButtonElement} */ #btnStmtBack;
  /** @type {HTMLButtonElement} */ #btnExprForward;
  /** @type {HTMLButtonElement} */ #btnStmtForward;
  /** @type {HTMLButtonElement} */ #btnEnd;
  /** @type {HTMLInputElement}  */ #slider;
  /** @type {HTMLElement}       */ #counter;

  /** @type {(e: KeyboardEvent) => void} */
  #keyHandler = null;

  /**
   * @param {Object} opts
   * @param {import('../core/step-controller.js').StepController} opts.controller
   * @param {HTMLButtonElement} opts.btnStart
   * @param {HTMLButtonElement} opts.btnExprBack
   * @param {HTMLButtonElement} opts.btnStmtBack
   * @param {HTMLButtonElement} opts.btnExprForward
   * @param {HTMLButtonElement} opts.btnStmtForward
   * @param {HTMLButtonElement} opts.btnEnd
   * @param {HTMLInputElement}  opts.slider
   * @param {HTMLElement}       opts.counter
   */
  constructor({ controller, btnStart, btnExprBack, btnStmtBack,
                btnExprForward, btnStmtForward, btnEnd, slider, counter }) {
    this.#ctrl           = controller;
    this.#btnStart       = btnStart;
    this.#btnExprBack    = btnExprBack;
    this.#btnStmtBack    = btnStmtBack;
    this.#btnExprForward = btnExprForward;
    this.#btnStmtForward = btnStmtForward;
    this.#btnEnd         = btnEnd;
    this.#slider         = slider;
    this.#counter        = counter;

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

    this.#slider.max   = String(totalSteps);
    this.#slider.value = String(cursor);
    this.#counter.textContent = `${cursor} / ${totalSteps}`;

    const atStart = cursor === 0;
    this.#btnStart.disabled       = atStart;
    this.#btnExprBack.disabled    = atStart;
    this.#btnStmtBack.disabled    = atStart;
    this.#btnExprForward.disabled = done;
    this.#btnStmtForward.disabled = done;
    this.#btnEnd.disabled         = done;
  }

  /**
   * コントロール全体の有効/無効を切り替える。
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    [this.#btnStart, this.#btnExprBack, this.#btnStmtBack,
     this.#btnExprForward, this.#btnStmtForward, this.#btnEnd,
     this.#slider].forEach(el => {
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
    this.#btnStart.addEventListener('click',       () => this.#ctrl.goToStart());
    this.#btnExprBack.addEventListener('click',    () => this.#ctrl.stepExprBackward());
    this.#btnStmtBack.addEventListener('click',    () => this.#ctrl.stepStmtBackward());
    this.#btnExprForward.addEventListener('click', () => this.#ctrl.stepExprForward());
    this.#btnStmtForward.addEventListener('click', () => this.#ctrl.stepStmtForward());
    this.#btnEnd.addEventListener('click',         () => this.#ctrl.goToEnd());

    this.#slider.addEventListener('input', () => {
      this.#ctrl.jumpTo(Number(this.#slider.value));
    });
  }

  #registerKeyboard() {
    if (this.#keyHandler) return;
    this.#keyHandler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;

      switch (e.key) {
        case 'ArrowLeft':
        case 'b':
          e.preventDefault();
          this.#ctrl.stepExprBackward();
          break;
        case 'ArrowRight':
        case 'n':
          e.preventDefault();
          this.#ctrl.stepExprForward();
          break;
        case 'v':
          e.preventDefault();
          this.#ctrl.stepStmtForward();
          break;
        case 'V':
          e.preventDefault();
          this.#ctrl.stepStmtBackward();
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
