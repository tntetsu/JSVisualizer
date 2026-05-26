/**
 * code-editor.js — コードエディタコンポーネント
 *
 * 実行前のコード入力エリアを管理する。
 * サンプルコードの選択と、Run/Reset ボタンのハンドリングを担当。
 */

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
    label: 'フィボナッチ数列（再帰）',
    code: `\
function fib(n) {
  if (n <= 1) return n;
  return fib(n - 1) + fib(n - 2);
}
fib(5);`,
  },

  factorial: {
    label: '階乗（再帰）',
    code: `\
function factorial(n) {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
factorial(6);`,
  },

  euclidLoop: {
    label: 'ユークリッド互除法（ループ）',
    code: `\
let x = 851;
let y = 629;
while (y > 0) {
  [x, y] = [y, x % y];
}
let gcd = x;`,
  },

  euclidRecursive: {
    label: 'ユークリッド互除法（再帰）',
    code: `\
function gcd(a, b) {
  if (b === 0) return a;
  return gcd(b, a % b);
}
gcd(851, 629);`,
  },

  bubbleSort: {
    label: 'バブルソート',
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
    label: '選択ソート',
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
    label: '線形探索',
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
    label: '二分探索',
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
    label: 'クイックソート',
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
    label: 'マージソート',
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
    label: 'オブジェクトのソート（数値キー）',
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
    label: 'オブジェクトのソート（文字列キー）',
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
    label: 'クロージャ',
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
    label: '二分木構築・探索',
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
    label: 'フィボナッチ（DP/メモ化）',
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
    label: 'クラスと継承',
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
    label: '連結リスト',
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
};

// ── CodeEditor ───────────────────────────────────────────────────────────────

export class CodeEditor {
  /** @type {HTMLTextAreaElement} */
  #textarea;

  /** @type {HTMLSelectElement} */
  #sampleSelect;

  /** @type {HTMLButtonElement} */
  #runBtn;

  /** @type {HTMLButtonElement} */
  #resetBtn;

  /** @type {HTMLElement} */
  #errorEl;

  /** @type {(code: string) => void} */
  #onRun;

  /** @type {() => void} */
  #onReset;

  /**
   * @param {Object} opts
   * @param {HTMLTextAreaElement} opts.textarea
   * @param {HTMLSelectElement}   opts.sampleSelect
   * @param {HTMLButtonElement}   opts.runBtn
   * @param {HTMLButtonElement}   opts.resetBtn
   * @param {HTMLElement}         opts.errorEl
   * @param {(code: string) => void} opts.onRun
   * @param {() => void}          opts.onReset
   */
  constructor({ textarea, sampleSelect, runBtn, resetBtn, errorEl, onRun, onReset }) {
    this.#textarea     = textarea;
    this.#sampleSelect = sampleSelect;
    this.#runBtn       = runBtn;
    this.#resetBtn     = resetBtn;
    this.#errorEl      = errorEl;
    this.#onRun        = onRun;
    this.#onReset      = onReset;

    this.#buildSampleOptions();
    this.#bindEvents();

    // デフォルトはフィボナッチ
    this.#textarea.value = SAMPLES.fibonacci.code;
  }

  // ── 公開 API ──────────────────────────────────────────────────────────────

  /** 現在のエディタ内容を返す */
  getCode() {
    return this.#textarea.value;
  }

  /**
   * エラーメッセージを表示する（null で非表示）。
   * @param {string|null} msg
   * @param {'parse'|'runtime'|null} [errorType]
   */
  showError(msg, errorType = null) {
    if (msg) {
      const typeLabel = errorType === 'parse'   ? '構文エラー'
                      : errorType === 'runtime' ? '実行エラー'
                      : null;
      this.#errorEl.innerHTML = typeLabel
        ? `<span class="error-badge">${typeLabel}</span> ${_esc(msg)}`
        : _esc(msg);
      this.#errorEl.dataset.errorType = errorType ?? '';
      this.#errorEl.hidden = false;
    } else {
      this.#errorEl.innerHTML = '';
      this.#errorEl.hidden = true;
    }
  }

  /** 実行中モード（エディタ非表示・Reset ボタン表示）に切り替える */
  setRunningMode(running) {
    this.#textarea.disabled  = running;
    this.#runBtn.hidden       = running;
    this.#resetBtn.hidden     = !running;
    this.#sampleSelect.disabled = running;
  }

  // ── 内部ヘルパー ──────────────────────────────────────────────────────────

  #buildSampleOptions() {
    // グループごとにオプションを追加
    const groups = [
      { label: '─ 探索 ─',               keys: ['linearSearch', 'binarySearch'] },
      { label: '─ ソート（基本） ─',      keys: ['bubbleSort', 'selectionSort'] },
      { label: '─ ソート（高度） ─',      keys: ['quickSort', 'mergeSort'] },
      { label: '─ ソート（オブジェクト） ─', keys: ['sortByNumericKey', 'sortByStringKey'] },
      { label: '─ 数学・アルゴリズム ─',  keys: ['euclidLoop', 'euclidRecursive', 'factorial', 'fibonacci', 'fibonacciDP'] },
      { label: '─ データ構造 ─',          keys: ['binaryTree', 'linkedList'] },
      { label: '─ スコープ・オブジェクト ─', keys: ['closure', 'classExample'] },
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
    this.#sampleSelect.addEventListener('change', () => {
      const key = this.#sampleSelect.value;
      if (key && SAMPLES[key]) {
        this.#textarea.value = SAMPLES[key].code;
        this.#sampleSelect.value = '';  // 再選択可能にリセット
        this.showError(null);
      }
    });

    this.#runBtn.addEventListener('click', () => {
      this.showError(null);
      this.#onRun(this.#textarea.value);
    });

    this.#resetBtn.addEventListener('click', () => {
      this.#onReset();
    });
  }
}
