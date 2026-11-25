/**
 * code-editor.js — CodeMirror 6 ベースのコードエディタ
 *
 * 実行前のコード入力エリアを管理する。
 * CodeMirror 6 でシンタックスハイライト・行番号・タブ補完を提供する（言語は言語プロファイルの editorExtension）。
 * サンプルコードの選択と、Run/Reset ボタンのハンドリングを担当。
 */

import { EditorView, basicSetup }    from 'codemirror';
import { oneDark }                   from '@codemirror/theme-one-dark';
import { Compartment, EditorState }  from '@codemirror/state';
import { keymap }                    from '@codemirror/view';
import { indentWithTab }             from '@codemirror/commands';
import { getLang }                   from '../i18n.js';
import { getLanguage }               from '../lang/index.js';
import { localizeErrorMessage }      from '../utils/error-message.js';

/** HTML エスケープ（エラーメッセージ表示用） */
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// サンプルコードは言語プロファイル（lang/javascript-samples.js）に移した。既存の import 先を保つため再 export する。
export { SAMPLES } from '../lang/javascript-samples.js';

// ── カスタム CodeMirror テーマ（ライトモード用） ─────────────────────────────

const lightTheme = EditorView.theme({
  '&': {
    background: 'var(--bg)',
    color:      'var(--text)',
    height:     '100%',
  },
  '.cm-scroller': { fontFamily: "'Consolas', 'Monaco', 'Cascadia Code', monospace", fontSize: '13px', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content':  { padding: '10px 0' },
  '.cm-gutters':  { background: 'var(--surface)', borderRight: '1px solid var(--border)', color: 'var(--text-muted)' },
  '.cm-activeLineGutter': { background: 'transparent' },
  '.cm-activeLine':       { background: 'transparent' },
  '.cm-focused':          { outline: 'none' },
  '.cm-selectionBackground': { background: 'var(--hl-select, rgba(100,150,255,0.25))' },
  '&.cm-focused .cm-selectionBackground': { background: 'var(--hl-select, rgba(100,150,255,0.35))' },
}, { dark: false });

// ── CodeEditor ───────────────────────────────────────────────────────────────

export class CodeEditor {
  /** @type {HTMLElement} CodeMirror を mount するコンテナ */
  #container;

  /** @type {EditorView} */
  #view;

  /** @type {Compartment} テーマ切り替え用 */
  #themeCompartment = new Compartment();

  /** @type {HTMLSelectElement} */
  #sampleSelect;

  /** @type {HTMLButtonElement} */
  #runBtn;

  /** @type {HTMLButtonElement} */
  #editBtn;

  /** @type {HTMLElement} */
  #errorEl;

  /** @type {{line:number,column:number}|null} 現在表示中のエラー位置（クリック再ジャンプ用） */
  #errorLoc = null;

  /** @type {{msg:string, errorType:'parse'|'runtime'|null}|null} 表示中のエラー（翻訳前。言語切替時に訳し直す） */
  #errorShown = null;

  /** @type {HTMLElement|null} プログラム名表示要素（修正4で使用） */
  #programNameEl = null;

  /** @type {(code: string) => void} */
  #onRun;

  /** @type {() => void} */
  #onReset;

  /** @type {Map<string, {title:string, code:string}>} exerciseId経由で取得したコード（BhvVisualizer連携。addRemoteGroup参照） */
  #remoteCodes = new Map();

  /** @type {MutationObserver|null} テーマ変更監視 */
  #themeObserver = null;

  /** @type {boolean} trueの間はsetRunningModeの呼び出しに関わらずサンプルセレクタを無効化し続ける（disableSampleSelect参照） */
  #sampleSelectLocked = false;

  /**
   * @param {Object} opts
   * @param {HTMLElement}            opts.container     CodeMirror を mount する div
   * @param {HTMLSelectElement}      opts.sampleSelect
   * @param {HTMLButtonElement}      opts.runBtn
   * @param {HTMLButtonElement}      opts.editBtn
   * @param {HTMLElement}            opts.errorEl
   * @param {HTMLElement}           [opts.programNameEl]  プログラム名表示要素
   * @param {(code: string) => void} opts.onRun
   * @param {() => void}             opts.onReset
   */
  constructor({ container, sampleSelect, runBtn, editBtn, errorEl, programNameEl, onRun, onReset }) {
    this.#container    = container;
    this.#sampleSelect = sampleSelect;
    this.#runBtn       = runBtn;
    this.#editBtn      = editBtn;
    this.#errorEl      = errorEl;
    this.#programNameEl = programNameEl ?? null;
    this.#onRun        = onRun;
    this.#onReset      = onReset;

    const { samples, defaultSample } = getLanguage();
    this.#createEditor(samples[defaultSample].code);
    this.#buildSampleOptions();
    this.#bindEvents();
    this.#watchTheme();

    // 初期ラベル
    if (this.#programNameEl) this.#programNameEl.textContent = samples[defaultSample].label;
  }

  // ── 公開 API ──────────────────────────────────────────────────────────────

  /** 現在のエディタ内容を返す */
  getCode() {
    return this.#view.state.doc.toString();
  }

  /**
   * エディタ内容を外部から設定する（BhvVisualizer連携: URLクエリ経由のコード読み込み。
   * exercise-source.js から呼ばれる）。
   * @param {string} code
   * @param {string} [label] プログラム名表示に使うラベル
   * @param {string} [selectValue] 設定後にサンプルセレクタへ反映する値（setRemoteCodesで登録したキー等）
   */
  setCode(code, label = '', selectValue = '') {
    this.#applyCode(code, label);
    if (selectValue) this.#sampleSelect.value = selectValue;
  }

  /**
   * サンプルセレクタの内容を、外部（exercise/code）から指定されたコード群だけに置き換える。
   * 組み込みの21種のサンプルはセレクタから取り除かれる（プレースホルダのoptionのみ残す）。
   * @param {{title:string, code:string}[]} items
   */
  setRemoteCodes(items) {
    this.#remoteCodes.clear();
    this.#sampleSelect.querySelectorAll('optgroup').forEach((el) => el.remove());
    items.forEach((item, index) => {
      const key = `remote:${index}`;
      this.#remoteCodes.set(key, { title: item.title, code: item.code });
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = item.title;
      this.#sampleSelect.appendChild(opt);
    });
  }

  /**
   * サンプルセレクタのプレースホルダ（既定は「— サンプル —」）を演習タイトルに置き換える。
   * 以後 i18n の言語切替で上書きされないよう data-i18n 属性を外す。
   * @param {string} title
   */
  setPlaceholderLabel(title) {
    const placeholder = this.#sampleSelect.querySelector('option[value=""]');
    if (!placeholder) return;
    placeholder.removeAttribute('data-i18n');
    placeholder.textContent = title;
  }

  /**
   * サンプルセレクタを選択不可にする（BhvVisualizer連携: 単一コードを`?code=`で指定された場合、
   * 切り替え先が存在せず選択の余地がないため）。以後setRunningModeによるEdit/Run切り替えでも
   * 有効化されない。
   */
  disableSampleSelect() {
    this.#sampleSelectLocked = true;
    this.#sampleSelect.disabled = true;
  }

  /**
   * エラーメッセージを表示する（null で非表示）。
   * @param {string|null} msg
   * @param {'parse'|'runtime'|null} [errorType]
   * @param {{line:number,column:number}|null} [loc]  エラー位置（1始まり）
   */
  showError(msg, errorType = null, loc = null) {
    if (msg) {
      this.#errorShown = { msg, errorType };
      this.#renderErrorText();
      this.#errorEl.dataset.errorType = errorType ?? '';
      this.#errorEl.hidden = false;

      this.#errorLoc = (loc && loc.line > 0) ? loc : null;
      if (this.#errorLoc) {
        this.#errorEl.style.cursor = 'pointer';
        this.#errorEl.title = `Click to jump to line ${loc.line}`;
        this.#moveCursorToError(this.#errorLoc);
      } else {
        this.#errorEl.style.cursor = '';
        this.#errorEl.title = '';
      }
    } else {
      this.#errorShown = null;
      this.#errorEl.innerHTML = '';
      this.#errorEl.hidden = true;
      this.#errorLoc = null;
      this.#errorEl.style.cursor = '';
      this.#errorEl.title = '';
    }
  }

  /** 表示中のエラーの本文を、現在の表示言語で描き直す（ADR-046） */
  #renderErrorText() {
    if (!this.#errorShown) return;
    const { msg, errorType } = this.#errorShown;
    const typeLabel = errorType === 'parse'   ? 'Syntax Error'
                    : errorType === 'runtime' ? 'Runtime Error'
                    : null;
    // 言語プロファイルが英語化を持っていればそれを使う（Python。PyVisualizer の ADR-010）。なければ JS 用（ADR-046）
    const text = (getLanguage().localizeError ?? localizeErrorMessage)(msg, getLang());
    this.#errorEl.innerHTML = typeLabel
      ? `<span class="error-badge">${typeLabel}</span> ${_esc(text)}`
      : _esc(text);
  }

  /** エラー位置にカーソルを移動しブリンクアニメーションを実行する */
  #moveCursorToError(loc) {
    // 編集モードでエディタが表示されているときのみ有効
    if (this.#container.hidden) return;

    const doc     = this.#view.state.doc;
    const lineNo  = Math.max(1, Math.min(loc.line, doc.lines));
    const lineObj = doc.line(lineNo);
    const col     = Math.max(0, Math.min(loc.column ?? 0, lineObj.length));
    const pos     = lineObj.from + col;

    // カーソルをエラー位置に移動してスクロール
    this.#view.dispatch({
      selection:      { anchor: pos, head: pos },
      scrollIntoView: true,
    });
    // フォーカスを与えてカーソルを可視化
    this.#view.focus();

    // active line を box-shadow で点滅させる
    // double-RAF で CM の描画サイクル（.cm-activeLine 配置）完了後にアニメーション起動
    const editorEl = this.#view.dom;
    editorEl.classList.remove('cm-error-blink');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      editorEl.classList.add('cm-error-blink');
      setTimeout(() => editorEl.classList.remove('cm-error-blink'), 1800);
    }));
  }

  /** Edit / Run モードの切り替え（ボタンのアクティブ状態と編集エリア表示を更新） */
  setRunningMode(running) {
    this.#container.hidden      = running;
    this.#sampleSelect.disabled = running || this.#sampleSelectLocked;
    this.#editBtn.classList.toggle('btn-mode--active', !running);
    this.#editBtn.classList.toggle('btn-mode', running);
    this.#runBtn.classList.toggle('btn-mode--active', running);
    this.#runBtn.classList.toggle('btn-mode', !running);
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  /** CodeMirror EditorView を生成してコンテナに mount する */
  #createEditor(initialCode) {
    const isDark = document.documentElement.dataset.theme === 'dark';

    this.#view = new EditorView({
      state: EditorState.create({
        doc: initialCode,
        extensions: [
          basicSetup,
          getLanguage().editorExtension(),
          keymap.of([indentWithTab]),
          lightTheme,
          EditorView.lineWrapping,
          this.#themeCompartment.of(isDark ? oneDark : []),
        ],
      }),
      parent: this.#container,
    });
  }

  /** ダーク/ライトテーマを切り替える */
  #applyTheme(dark) {
    this.#view.dispatch({
      effects: this.#themeCompartment.reconfigure(dark ? oneDark : []),
    });
  }

  /** html.dataset.theme の変化を MutationObserver で監視する */
  #watchTheme() {
    this.#themeObserver = new MutationObserver((records) => {
      for (const r of records) {
        if (r.attributeName === 'data-theme') {
          this.#applyTheme(document.documentElement.dataset.theme === 'dark');
        }
      }
    });
    this.#themeObserver.observe(document.documentElement, { attributes: true });
  }

  /** エディタ内容をコードに置き換え、プログラム名表示を更新する（サンプル選択・setCode共通処理） */
  #applyCode(code, label) {
    this.#view.dispatch({
      changes: { from: 0, to: this.#view.state.doc.length, insert: code },
    });
    this.showError(null);
    if (this.#programNameEl) this.#programNameEl.textContent = label ?? '';
  }

  #buildSampleOptions() {
    const groups = getLanguage().sampleGroups;

    for (const { label, keys } of groups) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = label;
      for (const key of keys) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = getLanguage().samples[key].label;
        optgroup.appendChild(opt);
      }
      this.#sampleSelect.appendChild(optgroup);
    }
  }

  #bindEvents() {
    // 言語切替: 表示中のエラーを訳し直す（カーソルは動かさない）
    document.addEventListener('langchange', () => this.#renderErrorText());

    // エラーメッセージクリック: mousedown でフォーカス移動を阻止してカーソルジャンプ
    this.#errorEl.addEventListener('mousedown', (e) => {
      if (this.#errorLoc) e.preventDefault(); // エディタのフォーカスを奪われない
    });
    this.#errorEl.addEventListener('click', () => {
      if (this.#errorLoc) this.#moveCursorToError(this.#errorLoc);
    });

    this.#sampleSelect.addEventListener('change', () => {
      const key = this.#sampleSelect.value;
      const item = this.#remoteCodes.get(key) ?? getLanguage().samples[key];
      if (key && item) {
        this.#applyCode(item.code, item.title ?? item.label);
        this.#sampleSelect.value = '';  // 再選択可能にリセット
      }
    });

    // テキスト入力でプログラム名をクリア
    this.#view.dom.addEventListener('keydown', () => {
      if (this.#programNameEl) this.#programNameEl.textContent = '';
    });

    this.#runBtn.addEventListener('click', () => {
      this.showError(null);
      this.#onRun(this.getCode());
    });

    this.#editBtn.addEventListener('click', () => {
      this.#onReset();
    });
  }
}
