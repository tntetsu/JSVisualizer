/**
 * code-editor.js — CodeMirror 6 ベースのコードエディタ
 *
 * 実行前のコード入力エリアを管理する。
 * CodeMirror 6 で JS シンタックスハイライト・行番号・タブ補完を提供する。
 * サンプルコードの選択と、Run/Reset ボタンのハンドリングを担当。
 */

import { EditorView, basicSetup }    from 'codemirror';
import { javascript }                from '@codemirror/lang-javascript';
import { oneDark }                   from '@codemirror/theme-one-dark';
import { Compartment, EditorState }  from '@codemirror/state';
import { keymap }                    from '@codemirror/view';
import { indentWithTab }             from '@codemirror/commands';

/** HTML エスケープ（エラーメッセージ表示用） */
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── サンプルコード ───────────────────────────────────────────────────────────

export const SAMPLES = {
  fibonacci: {
    label: 'Fibonacci (recursive)',
    code: `\
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}
fib(5);`,
  },

  factorial: {
    label: 'Factorial (recursive)',
    code: `\
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
factorial(6);`,
  },

  euclidLoop: {
    label: 'Euclid GCD (loop)',
    code: `\
let x = 851;
let y = 629;
while (y > 0) {
  [x, y] = [y, x % y];
}
let gcd = x;`,
  },

  euclidRecursive: {
    label: 'Euclid GCD (recursive)',
    code: `\
function gcd(a, b) {
  if (b === 0) return a;
  return gcd(b, a % b);
}
gcd(851, 629);`,
  },

  bubbleSort: {
    label: 'Bubble Sort',
    code: `\
function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      if (arr[j] > arr[j + 1]) {
        const tmp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = tmp;
      }
    }
  }
  return arr;
}
bubbleSort([5, 3, 8, 1, 2]);`,
  },

  selectionSort: {
    label: 'Selection Sort',
    code: `\
function selectionSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i;
    for (let k = i + 1; k < n; k++) {
      if (arr[k] < arr[minIdx]) minIdx = k;
    }
    [arr[i], arr[minIdx]] = [arr[minIdx], arr[i]];
  }
  return arr;
}
selectionSort([6, 5, 4, 1, 0, 2, 3]);`,
  },

  linearSearch: {
    label: 'Linear Search',
    code: `\
function linearSearch(arr, target) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i] === target) return i;
  }
  return -1;
}
linearSearch([3, 7, 1, 9, 4, 6], 9);`,
  },

  binarySearch: {
    label: 'Binary Search',
    code: `\
function binarySearch(arr, target) {
  let lo = 0;
  let hi = arr.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target)  lo = mid + 1;
    else                    hi = mid - 1;
  }
  return -1;
}
binarySearch([1, 3, 5, 7, 9, 11, 13], 7);`,
  },

  quickSort: {
    label: 'Quick Sort',
    code: `\
function quickSort(arr, lo = 0, hi = arr.length - 1) {
  if (lo >= hi) return arr;
  let pivot = arr[hi];
  let i = lo;
  for (let j = lo; j < hi; j++) {
    if (arr[j] <= pivot) {
      [arr[i], arr[j]] = [arr[j], arr[i]];
      i++;
    }
  }
  [arr[i], arr[hi]] = [arr[hi], arr[i]];
  quickSort(arr, lo, i - 1);
  quickSort(arr, i + 1, hi);
  return arr;
}
quickSort([5, 3, 8, 1, 2, 7, 4]);`,
  },

  mergeSort: {
    label: 'Merge Sort',
    code: `\
function mergeSort(arr) {
  if (arr.length <= 1) return arr;
  const mid = Math.floor(arr.length / 2);
  const left  = mergeSort(arr.slice(0, mid));
  const right = mergeSort(arr.slice(mid));
  return merge(left, right);
}
function merge(a, b) {
  const result = [];
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] <= b[j]) result.push(a[i++]);
    else              result.push(b[j++]);
  }
  return result.concat(a.slice(i)).concat(b.slice(j));
}
mergeSort([5, 3, 8, 1, 2]);`,
  },

  sortByNumericKey: {
    label: 'Sort objects (numeric key)',
    code: `\
const students = [
  { name: 'Alice', score: 82 },
  { name: 'Bob',   score: 95 },
  { name: 'Carol', score: 71 },
  { name: 'Dave',  score: 88 },
];
const sorted = students.slice().sort((a, b) => b.score - a.score);
sorted;`,
  },

  sortByStringKey: {
    label: 'Sort objects (string key)',
    code: `\
const fruits = [
  { name: 'banana',     color: 'yellow' },
  { name: 'apple',      color: 'red'    },
  { name: 'cherry',     color: 'red'    },
  { name: 'blueberry',  color: 'blue'   },
];
const sorted = fruits.slice().sort(
  (a, b) => a.name.localeCompare(b.name)
);
sorted;`,
  },

  closure: {
    label: 'Closure',
    code: `\
function makeCounter(start) {
  let count = start ?? 0;
  return function increment() {
    count += 1;
    return count;
  };
}
const counter = makeCounter(10);
counter();
counter();
counter();`,
  },

  binaryTree: {
    label: 'Binary Tree',
    code: `\
function insert(tree, value) {
  if (tree === null) return { value, left: null, right: null };
  if (value < tree.value) return { ...tree, left:  insert(tree.left,  value) };
  return { ...tree, right: insert(tree.right, value) };
}
function search(tree, value) {
  if (tree === null) return false;
  if (tree.value === value) return true;
  if (value < tree.value) return search(tree.left,  value);
  return search(tree.right, value);
}
let tree = null;
for (const v of [5, 3, 8, 1, 4]) tree = insert(tree, v);
search(tree, 4);`,
  },

  fibonacciDP: {
    label: 'Fibonacci (DP)',
    code: `\
function fibDP(n) {
  const dp = [0, 1];
  for (let i = 2; i <= n; i++) {
    dp[i] = dp[i - 1] + dp[i - 2];
  }
  return dp[n];
}
fibDP(8);`,
  },

  classExample: {
    label: 'Class & Inheritance',
    code: `\
class Animal {
  constructor(name) {
    this.name = name;
  }
  speak() {
    return this.name + ' makes a sound.';
  }
}
class Dog extends Animal {
  constructor(name) {
    super(name);
    this.tricks = [];
  }
  learn(trick) {
    this.tricks.push(trick);
  }
  speak() {
    return this.name + ' barks.';
  }
}
const dog = new Dog('Rex');
dog.learn('sit');
dog.learn('shake');
dog.speak();`,
  },

  linkedList: {
    label: 'Linked List',
    code: `\
function node(val, next = null) {
  return { val, next };
}
function prepend(list, val) {
  return node(val, list);
}
function toArray(list) {
  const result = [];
  let cur = list;
  while (cur !== null) {
    result.push(cur.val);
    cur = cur.next;
  }
  return result;
}
let list = null;
list = prepend(list, 3);
list = prepend(list, 2);
list = prepend(list, 1);
toArray(list);`,
  },

  // ── Study Tasks ────────────────────────────────────────────────────────────

  studyWarmup: {
    label: '[Warm-up] Factorial (loop)',
    code: `\
// [Warm-up] 階乗（繰り返し版）
// Run してからステップを進め、result の値がどう変化するか確認してください。
// いくつかのビューを切り替えて、使い方に慣れましょう。

function factorial(n) {
  let result = 1;
  for (let i = 1; i <= n; i++) {
    result = result * i;
  }
  return result;
}

console.log(factorial(5));`,
  },

  studyTask1: {
    label: '[Task 1] Selection Sort — find the bug',
    code: `\
// [Task 1] このコードにはバグがあります。
// 実行すると結果が [1, 2, 3, 5, 8, 9] になりません。
// ツールを使ってバグの原因を見つけ、どの行を修正すべきか答えてください。

function selectionSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    let minIdx = i + 1;
    for (let j = i + 1; j < n; j++) {
      if (arr[j] < arr[minIdx]) {
        minIdx = j;
      }
    }
    let temp = arr[i];
    arr[i] = arr[minIdx];
    arr[minIdx] = temp;
  }
  return arr;
}

const arr = [5, 3, 8, 1, 9, 2];
console.log(selectionSort(arr));`,
  },

  studyTask2: {
    label: '[Task 2] Fibonacci — count function calls',
    code: `\
// [Task 2] fib(4) を実行するとき、
// fib という関数は合計で何回呼ばれますか？
// （最初の fib(4) の呼び出しも 1 回として数えてください）

function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}

fib(4);`,
  },

  studyTask3: {
    label: '[Task 3] Bubble Sort — trace intermediate state',
    code: `\
// [Task 3] 外側のループの 2 回目（i = 1）が完了した直後、
// 配列 arr の中身はどうなっていますか？
// （最終結果ではなく、途中の状態を答えてください）

function bubbleSort(arr) {
  const n = arr.length;
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < n - 1 - i; j++) {
      if (arr[j] > arr[j + 1]) {
        let temp = arr[j];
        arr[j] = arr[j + 1];
        arr[j + 1] = temp;
      }
    }
  }
  return arr;
}

const arr = [5, 3, 8, 1, 9];
bubbleSort(arr);`,
  },
};

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

    this.#createEditor(SAMPLES.fibonacci.code);
    this.#buildSampleOptions();
    this.#bindEvents();
    this.#watchTheme();

    // 初期ラベル
    if (this.#programNameEl) this.#programNameEl.textContent = SAMPLES.fibonacci.label;
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
   * @param {string} [selectValue] 設定後にサンプルセレクタへ反映する値（addRemoteGroupで登録したキー等）
   */
  setCode(code, label = '', selectValue = '') {
    this.#applyCode(code, label);
    if (selectValue) this.#sampleSelect.value = selectValue;
  }

  /**
   * exercise 由来のコード群をサンプルセレクタに追加する（既存の21種の組み込みサンプルは変更しない）。
   * @param {string} label optgroupのラベル
   * @param {{title:string, code:string}[]} items
   */
  addRemoteGroup(label, items) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = label;
    items.forEach((item, index) => {
      const key = `remote:${index}`;
      this.#remoteCodes.set(key, { title: item.title, code: item.code });
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = item.title;
      optgroup.appendChild(opt);
    });
    this.#sampleSelect.appendChild(optgroup);
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
   * エラーメッセージを表示する（null で非表示）。
   * @param {string|null} msg
   * @param {'parse'|'runtime'|null} [errorType]
   * @param {{line:number,column:number}|null} [loc]  エラー位置（1始まり）
   */
  showError(msg, errorType = null, loc = null) {
    if (msg) {
      const typeLabel = errorType === 'parse'   ? 'Syntax Error'
                      : errorType === 'runtime' ? 'Runtime Error'
                      : null;
      this.#errorEl.innerHTML = typeLabel
        ? `<span class="error-badge">${typeLabel}</span> ${_esc(msg)}`
        : _esc(msg);
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
      this.#errorEl.innerHTML = '';
      this.#errorEl.hidden = true;
      this.#errorLoc = null;
      this.#errorEl.style.cursor = '';
      this.#errorEl.title = '';
    }
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
    this.#sampleSelect.disabled = running;
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
          javascript(),
          keymap.of([indentWithTab]),
          lightTheme,
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
    const groups = [
      { label: '─ Search ─',             keys: ['linearSearch', 'binarySearch'] },
      { label: '─ Sort (basic) ─',        keys: ['bubbleSort', 'selectionSort'] },
      { label: '─ Sort (advanced) ─',     keys: ['quickSort', 'mergeSort'] },
      { label: '─ Sort (objects) ─',      keys: ['sortByNumericKey', 'sortByStringKey'] },
      { label: '─ Math / Algorithms ─',   keys: ['euclidLoop', 'euclidRecursive', 'factorial', 'fibonacci', 'fibonacciDP'] },
      { label: '─ Data Structures ─',     keys: ['binaryTree', 'linkedList'] },
      { label: '─ Scope / Objects ─',     keys: ['closure', 'classExample'] },
      { label: '─ Study Tasks ─',          keys: ['studyWarmup', 'studyTask1', 'studyTask2', 'studyTask3'] },
    ];

    for (const { label, keys } of groups) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = label;
      for (const key of keys) {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = SAMPLES[key].label;
        optgroup.appendChild(opt);
      }
      this.#sampleSelect.appendChild(optgroup);
    }
  }

  #bindEvents() {
    // エラーメッセージクリック: mousedown でフォーカス移動を阻止してカーソルジャンプ
    this.#errorEl.addEventListener('mousedown', (e) => {
      if (this.#errorLoc) e.preventDefault(); // エディタのフォーカスを奪われない
    });
    this.#errorEl.addEventListener('click', () => {
      if (this.#errorLoc) this.#moveCursorToError(this.#errorLoc);
    });

    this.#sampleSelect.addEventListener('change', () => {
      const key = this.#sampleSelect.value;
      const item = this.#remoteCodes.get(key) ?? SAMPLES[key];
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
