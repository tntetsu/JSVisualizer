/**
 * settings-panel.js — 設定パネルコンポーネント
 *
 * テーマ切り替え（ライト/ダーク）を提供する。
 * 設定は localStorage に永続化し、次回起動時も維持する。
 *
 * テーマの適用方式:
 *   - ライト (デフォルト): <html> に data-theme 属性なし
 *   - ダーク:              <html data-theme="dark">
 *   CSS で [data-theme="dark"] セレクタがカスタムプロパティを上書きする。
 */

const STORAGE_KEY = 'jsv-theme';
const DEFAULT_THEME = 'light';

/**
 * テーマを即時適用する（HTML 要素の data-theme 属性を更新）。
 * @param {'light'|'dark'} theme
 */
export function applyTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.dataset.theme = 'dark';
  } else {
    delete document.documentElement.dataset.theme;
  }
}

/** localStorage から保存済みテーマを読み込む。未設定なら DEFAULT_THEME。 */
export function loadTheme() {
  return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
}

// ── SettingsPanel ─────────────────────────────────────────────────────────

export class SettingsPanel {
  /** @type {HTMLButtonElement} */
  #btn;

  /** @type {HTMLElement} */
  #panel;

  /** @type {NodeListOf<HTMLInputElement>} */
  #themeRadios;

  #isOpen = false;

  /**
   * @param {HTMLButtonElement} btnEl   設定ボタン要素
   * @param {HTMLElement}       panelEl 設定パネル要素
   */
  constructor(btnEl, panelEl) {
    this.#btn   = btnEl;
    this.#panel = panelEl;
    this.#themeRadios = panelEl.querySelectorAll('input[name="theme"]');

    // 保存済みテーマを適用してラジオボタンと同期
    const theme = loadTheme();
    applyTheme(theme);
    this.#syncRadios(theme);

    this.#bindEvents();
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  #bindEvents() {
    // 設定ボタン: パネルのトグル
    this.#btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#isOpen ? this.#close() : this.#open();
    });

    // パネル外クリック: 閉じる
    document.addEventListener('click', (e) => {
      if (this.#isOpen && !this.#panel.contains(e.target)) {
        this.#close();
      }
    });

    // Esc キー: 閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.#isOpen) this.#close();
    });

    // テーマ選択ラジオボタン
    this.#themeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.checked) {
          const theme = radio.value;
          localStorage.setItem(STORAGE_KEY, theme);
          applyTheme(theme);
        }
      });
    });
  }

  #open() {
    this.#isOpen = true;
    // アニメーションを毎回発火させるため一度削除して再追加
    this.#panel.classList.remove('hidden');
    void this.#panel.offsetWidth;   // reflow trigger

    // パネルをボタン直下・右端揃えに配置
    const rect = this.#btn.getBoundingClientRect();
    this.#panel.style.top   = `${rect.bottom + 4}px`;
    this.#panel.style.right = `${window.innerWidth - rect.right}px`;
    this.#panel.style.left  = '';
  }

  #close() {
    this.#isOpen = false;
    this.#panel.classList.add('hidden');
  }

  #syncRadios(theme) {
    this.#themeRadios.forEach(radio => {
      radio.checked = radio.value === theme;
    });
  }
}
