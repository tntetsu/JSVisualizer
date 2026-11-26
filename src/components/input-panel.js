/**
 * input-panel.js — 入力欄（input() で読む行をあらかじめ書いておく）
 *
 * 言語プロファイルが supportsInput: true のときだけ app.js が作る（Python の input()。JS 版では作らない）。
 * ソースペインのエラー表示の上に置き、実行するとその内容を Debugger に stdin として渡す（ADR-055）。
 */
import { t, getLang } from '../i18n.js';
import { getLanguage } from '../lang/index.js';

export class InputPanel {
  #el;
  #textarea;
  #label;

  /**
   * @param {HTMLElement} before この要素の前に入れる（エラー表示）
   */
  constructor(before) {
    this.#el = document.createElement('div');
    this.#el.className = 'input-panel';
    this.#label = document.createElement('label');
    this.#label.className = 'input-panel-label';
    this.#label.htmlFor = 'stdin-input';
    this.#textarea = document.createElement('textarea');
    this.#textarea.id = 'stdin-input';
    this.#textarea.className = 'input-panel-text';
    this.#textarea.rows = 3;
    this.#textarea.spellcheck = false;
    this.#el.append(this.#label, this.#textarea);
    before.parentNode.insertBefore(this.#el, before);
    this.#applyLang();
    document.addEventListener('langchange', () => this.#applyLang());
  }

  /** input() で読む内容（改行区切り） */
  get value() {
    return this.#textarea.value;
  }

  set value(v) {
    this.#textarea.value = v;
  }

  #applyLang() {
    // 言語プロファイルの inputText（省略できる。Java の Scanner）があれば、その文言を使う（ADR-055 追記）
    const own = getLanguage().inputText?.[getLang()];
    this.#label.textContent = own?.label ?? t('input-label');
    this.#textarea.placeholder = own?.placeholder ?? t('input-placeholder');
  }
}
