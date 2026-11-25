/**
 * javascript-samples.js — JS の組み込みサンプル（言語プロファイル lang/javascript.js が使う）
 *
 * 以前は components/code-editor.js にあった。テストなどの既存の import 先を保つため、
 * code-editor.js からも SAMPLES を再 export している。
 */

export const SAMPLES = {
  fibonacci: {
    label: 'Fibonacci (recursive)',
    code: `\
function fib(n) {
  if (n == 1 || n == 2) return 1;
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

/** サンプル選択の optgroup（表示順） */
export const SAMPLE_GROUPS = [
  { label: '─ Search ─',             keys: ['linearSearch', 'binarySearch'] },
  { label: '─ Sort (basic) ─',        keys: ['bubbleSort', 'selectionSort'] },
  { label: '─ Sort (advanced) ─',     keys: ['quickSort', 'mergeSort'] },
  { label: '─ Sort (objects) ─',      keys: ['sortByNumericKey', 'sortByStringKey'] },
  { label: '─ Math / Algorithms ─',   keys: ['euclidLoop', 'euclidRecursive', 'factorial', 'fibonacci', 'fibonacciDP'] },
  { label: '─ Data Structures ─',     keys: ['binaryTree', 'linkedList'] },
  { label: '─ Scope / Objects ─',     keys: ['closure', 'classExample'] },
  { label: '─ Study Tasks ─',          keys: ['studyWarmup', 'studyTask1', 'studyTask2', 'studyTask3'] },
];
