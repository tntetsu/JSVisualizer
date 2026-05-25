/**
 * step-controls.js — ステップ操作バーコンポーネント
 *
 * ボタン配置（2 行 × 4 列、両端に先頭/末尾ボタン）:
 *
 *  ⏮(高) │  ◀◀文  ◀式  ▶式  ▶▶文  │ ⏭(高) ── slider ── counter
 *         │  ⏪関  ◁人  ▷人  ⏩関  │
 *
 * キーボードショートカット:
 *   b / ←  … 式単位で戻る
 *   n / →  … 式単位で進む
 *   h      … 人間単位で進む
 *   H      … 人間単位で戻る
 *   v      … 文単位で進む
 *   V      … 文単位で戻る
 *   f      … 関数単位で進む
 *   F      … 関数単位で戻る
 *   Home   … 先頭へ
 *   End    … 末尾へ
 */

export class StepControls {
  /** @type {import('../core/step-controller.js').StepController} */
  #ctrl;

  /** @type {HTMLButtonElement} */ #btnStart;
  /** @type {HTMLButtonElement} */ #btnExprBack;
  /** @type {HTMLButtonElement} */ #btnHumanBack;
  /** @type {HTMLButtonElement} */ #btnStmtBack;
  /** @type {HTMLButtonElement} */ #btnCallBack;
  /** @type {HTMLButtonElement} */ #btnExprForward;
  /** @type {HTMLButtonElement} */ #btnHumanForward;
  /** @type {HTMLButtonElement} */ #btnStmtForward;
  /** @type {HTMLButtonElement} */ #btnCallForward;
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
   * @param {HTMLButtonElement} opts.btnHumanBack
   * @param {HTMLButtonElement} opts.btnStmtBack
   * @param {HTMLButtonElement} opts.btnCallBack
   * @param {HTMLButtonElement} opts.btnExprForward
   * @param {HTMLButtonElement} opts.btnHumanForward
   * @param {HTMLButtonElement} opts.btnStmtForward
   * @param {HTMLButtonElement} opts.btnCallForward
   * @param {HTMLButtonElement} opts.btnEnd
   * @param {HTMLInputElement}  opts.slider
   * @param {HTMLElement}       opts.counter
   */
  constructor({ controller,
                btnStart,
                btnExprBack, btnHumanBack, btnStmtBack, btnCallBack,
                btnExprForward, btnHumanForward, btnStmtForward, btnCallForward,
                btnEnd, slider, counter }) {
    this.#ctrl            = controller;
    this.#btnStart        = btnStart;
    this.#btnExprBack     = btnExprBack;
    this.#btnHumanBack    = btnHumanBack;
    this.#btnStmtBack     = btnStmtBack;
    this.#btnCallBack     = btnCallBack;
    this.#btnExprForward  = btnExprForward;
    this.#btnHumanForward = btnHumanForward;
    this.#btnStmtForward  = btnStmtForward;
    this.#btnCallForward  = btnCallForward;
    this.#btnEnd          = btnEnd;
    this.#slider          = slider;
    this.#counter         = counter;

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
    this.#btnStart.disabled        = atStart;
    this.#btnExprBack.disabled     = atStart;
    this.#btnHumanBack.disabled    = atStart;
    this.#btnStmtBack.disabled     = atStart;
    this.#btnCallBack.disabled     = atStart;
    this.#btnExprForward.disabled  = done;
    this.#btnHumanForward.disabled = done;
    this.#btnStmtForward.disabled  = done;
    this.#btnCallForward.disabled  = done;
    this.#btnEnd.disabled          = done;
  }

  /**
   * コントロール全体の有効/無効を切り替える。
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    [this.#btnStart,
     this.#btnExprBack, this.#btnHumanBack, this.#btnStmtBack, this.#btnCallBack,
     this.#btnExprForward, this.#btnHumanForward, this.#btnStmtForward, this.#btnCallForward,
     this.#btnEnd, this.#slider,
    ].forEach(el => { el.disabled = !enabled; });

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
    this.#btnStart.addEventListener('click',         () => this.#ctrl.goToStart());
    this.#btnExprBack.addEventListener('click',      () => this.#ctrl.stepExprBackward());
    this.#btnHumanBack.addEventListener('click',     () => this.#ctrl.stepHumanBackward());
    this.#btnStmtBack.addEventListener('click',      () => this.#ctrl.stepStmtBackward());
    this.#btnCallBack.addEventListener('click',      () => this.#ctrl.stepCallBackward());
    this.#btnExprForward.addEventListener('click',   () => this.#ctrl.stepExprForward());
    this.#btnHumanForward.addEventListener('click',  () => this.#ctrl.stepHumanForward());
    this.#btnStmtForward.addEventListener('click',   () => this.#ctrl.stepStmtForward());
    this.#btnCallForward.addEventListener('click',   () => this.#ctrl.stepCallForward());
    this.#btnEnd.addEventListener('click',           () => this.#ctrl.goToEnd());

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
        case 'b': e.preventDefault(); this.#ctrl.stepExprBackward();  break;
        case 'ArrowRight':
        case 'n': e.preventDefault(); this.#ctrl.stepExprForward();   break;
        case 'h': e.preventDefault(); this.#ctrl.stepHumanForward();  break;
        case 'H': e.preventDefault(); this.#ctrl.stepHumanBackward(); break;
        case 'v': e.preventDefault(); this.#ctrl.stepStmtForward();   break;
        case 'V': e.preventDefault(); this.#ctrl.stepStmtBackward();  break;
        case 'f': e.preventDefault(); this.#ctrl.stepCallForward();   break;
        case 'F': e.preventDefault(); this.#ctrl.stepCallBackward();  break;
        case 'Home': e.preventDefault(); this.#ctrl.goToStart(); break;
        case 'End':  e.preventDefault(); this.#ctrl.goToEnd();   break;
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
