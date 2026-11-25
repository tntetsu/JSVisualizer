/**
 * format.js — 値フォーマット・HTML エスケープ共有ユーティリティ
 *
 * 値の種類と書き方は言語プロファイルの valueModel（utils/value-model.js の vm()）に尋ねる。
 */
import { vm, truncLiteral } from './value-model.js';

export const BUILTIN_NAMES = new Set([
  'undefined', 'NaN', 'Infinity',
  'Math', 'JSON', 'Date',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'Number', 'String', 'Boolean', 'Array', 'Object', 'Symbol',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Error', 'TypeError', 'RangeError', 'RegExp', 'console',
]);

/** HTML エスケープ */
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * JSInterpreter の内部オブジェクト（JSFunction / JSClass）かを判定する
 * @param {any} v
 */
export function isJSFunction(v) {
  return v && typeof v === 'object' && v.__type__ === 'JSFunction';
}
export function isJSClass(v) {
  return v && typeof v === 'object' && v.__type__ === 'JSClass';
}

/**
 * JSInterpreter の TDZ センチネル（let/const 宣言前のアクセス検出用、
 * `Environment` 内の `Symbol('TDZ')`）かを判定する。
 * 参照を直接importせず description で判定することで、interpreter.bundle.js の
 * ビルド構成に依存しない（値そのものはスナップショット経由で同一Symbol参照が渡る）。
 * @param {any} v
 */
export function isTDZ(v) {
  return typeof v === 'symbol' && v.description === 'TDZ';
}

/**
 * 値を HTML 文字列に変換する（型ごとに色付け）
 * @param {any}    v
 * @param {number} [depth=0]  再帰深さ（配列・オブジェクトの省略判定）
 * @returns {string}
 */
export function formatValue(v, depth = 0) {
  const m = vm();
  switch (m.kind(v)) {
    case 'tdz':       return '<span class="lt-empty">—</span>';
    case 'undefined': return `<span class="v-undef">${m.literal(v)}</span>`;
    case 'none':      return `<span class="v-null">${m.literal(v)}</span>`;
    case 'bool':      return `<span class="v-bool">${m.literal(v)}</span>`;
    case 'number':    return `<span class="v-num">${m.literal(v)}</span>`;
    case 'string':    return `<span class="v-str">${esc(m.literal(v))}</span>`;
    case 'function':  return `<span class="v-fn">ƒ ${esc(v.name || '(anonymous)')}</span>`;
    case 'class':     return `<span class="v-fn">class ${esc(v.name || '(anonymous)')}</span>`;
    case 'native':    return '<span class="v-fn">[native]</span>';
    case 'sequence': {
      const [open, close] = m.brackets(v);
      if (depth > 0) return `<span class="v-obj">${open}…${close}</span>`;
      const all   = m.entries(v);
      const items = all.slice(0, 8).map(([, x]) => formatValue(x, depth + 1)).join(', ');
      const more  = all.length > 8 ? `, <span class="v-muted">+${all.length - 8}</span>` : '';
      return `<span class="v-obj">${open}${items}${more}${close}</span>`;
    }
    case 'mapping':
    case 'object': {
      const [open, close] = m.brackets(v);
      if (depth > 0) return `<span class="v-obj">${open}…${close}</span>`;
      const entries = m.entries(v, { hidden: true }).slice(0, 4);
      const items   = entries.map(([k, val]) =>
        `<span class="v-key">${esc(k)}</span>: ${formatValue(val, depth + 1)}`
      ).join(', ');
      const more = m.length(v, { hidden: true }) > 4 ? ', …' : '';
      return `<span class="v-obj">${open} ${items}${more} ${close}</span>`;
    }
  }
  return `<span>${esc(String(v))}</span>`;
}

/**
 * 値をプレーンテキストに変換する（式評価・置換ビューの式の中に埋め込む表記）
 * @param {any}    v
 * @param {number} [depth=0]  再帰深さ（配列・オブジェクトの省略判定）
 * @returns {string}
 */
export function formatPlain(v, depth = 0) {
  const m = vm();
  switch (m.kind(v)) {
    case 'tdz':       return '';
    case 'undefined':
    case 'none':
    case 'bool':
    case 'number':
    case 'string':    return m.literal(v);
    case 'function':
    case 'class':
    case 'native':    return 'ƒ';
    case 'sequence': {
      const [open, close] = m.brackets(v);
      if (depth >= 3) return `${open}…${close}`;
      const all = m.entries(v);
      if (all.length === 0) return open + close;
      const elems = all.slice(0, 6).map(([, x]) => formatPlain(x, depth + 1)).join(', ');
      return open + elems + (all.length > 6 ? ', …' : '') + close;
    }
    case 'mapping':
    case 'object': {
      const [open, close] = m.brackets(v);
      if (depth >= 3) return `${open}…${close}`;
      const entries = m.entries(v).filter(([, x]) => !['function', 'class', 'native'].includes(m.kind(x)));
      if (entries.length === 0) return open + close;
      const items = entries.slice(0, 6).map(([k, x]) => `${k}: ${formatPlain(x, depth + 1)}`).join(', ');
      return `${open} ` + items + (entries.length > 6 ? ', …' : '') + ` ${close}`;
    }
  }
  return String(v);
}

/** 深い等価比較（JSON.stringify ベース） */
function valEqual(a, b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
}

/**
 * prevVal と比較して変化した部分を <b> で強調した HTML を返す。
 * 配列・オブジェクトは要素単位で比較し、変化した要素だけを <b> で包む。
 * スカラー値は全体を <b> で包む。
 * prevVal が undefined の場合（初登場）は全体を強調する。
 *
 * @param {any} val     現在の値
 * @param {any} prevVal 前ステップの値（undefined = 初登場）
 * @returns {string}  HTML 文字列
 */
export function formatValueDiff(val, prevVal) {
  const m = vm();
  const kind = m.kind(val);
  switch (kind) {
    case 'tdz':       return '<span class="lt-empty">—</span>';
    case 'undefined': return `<span class="v-undef">${m.literal(val)}</span>`;
    case 'none':      return `<span class="v-null">${m.literal(val)}</span>`;
    case 'function':  return `<span class="v-fn">ƒ ${esc(val.name || '(anonymous)')}</span>`;
    case 'class':     return `<span class="v-fn">class ${esc(val.name || '(anonymous)')}</span>`;
    case 'native':    return '<span class="v-fn">[native]</span>';
  }

  if (kind === 'sequence') {
    const [open, close] = m.brackets(val);
    const prev  = m.kind(prevVal) === 'sequence' ? m.entries(prevVal).map(([, x]) => x) : [];
    const all   = m.entries(val);
    const items = all.slice(0, 8).map(([, x], i) => {
      const cell = formatValue(x, 1);
      return valEqual(x, prev[i]) ? cell : `<b class="v-diff">${cell}</b>`;
    });
    const more = all.length > 8
      ? `, <span class="v-muted">+${all.length - 8}</span>` : '';
    return `<span class="v-obj">${open}${items.join(', ')}${more}${close}</span>`;
  }

  if (kind === 'mapping' || kind === 'object') {
    const [open, close] = m.brackets(val);
    const prevKind = m.kind(prevVal);
    const prev    = new Map(prevKind === 'mapping' || prevKind === 'object' ? m.entries(prevVal, { hidden: true }) : []);
    const entries = m.entries(val, { hidden: true }).slice(0, 4);
    const items   = entries.map(([k, v]) => {
      const fmt = `<span class="v-key">${esc(k)}</span>: ${formatValue(v, 1)}`;
      return valEqual(v, prev.get(k)) ? fmt : `<b class="v-diff">${fmt}</b>`;
    });
    const more = m.length(val, { hidden: true }) > 4 ? ', …' : '';
    return `<span class="v-obj">${open} ${items.join(', ')}${more} ${close}</span>`;
  }

  // スカラー（number, boolean, string）
  return valEqual(val, prevVal) ? formatValue(val) : `<b class="v-diff">${formatValue(val)}</b>`;
}

/**
 * env スナップショット（スコープチェーン配列）をフラット Map に変換する。
 * env[0] が最内スコープ。内側が外側を上書き。
 * @param {Object[]} envChain
 * @returns {Map<string, any>}
 */
export function flattenEnv(envChain) {
  const map = new Map();
  if (!envChain) return map;
  for (let i = envChain.length - 1; i >= 0; i--) {
    for (const [k, v] of Object.entries(envChain[i] ?? {})) {
      map.set(k, v);
    }
  }
  return map;
}

/**
 * 引数値をプレーンテキストで短縮フォーマットする（ラベル表示用）
 * @param {any} v
 * @returns {string}
 */
function fmtArgPlain(v) {
  const m = vm();
  switch (m.kind(v)) {
    case 'undefined':
    case 'none':
    case 'bool':
    case 'number':    return m.literal(v);
    case 'string':    return truncLiteral(m.literal(v), 10);
    case 'sequence': {
      const [open, close] = m.brackets(v);
      const all = m.entries(v);
      if (all.length === 0) return open + close;
      const elems = all.slice(0, 3).map(([, e]) => fmtArgPlain(e)).join(', ');
      return all.length > 3 ? `${open}${elems}, …${close}` : `${open}${elems}${close}`;
    }
    case 'mapping':
    case 'object':
    case 'function':
    case 'class': {
      const [open, close] = m.brackets(v);
      return `${open}…${close}`;
    }
  }
  return String(v).slice(0, 12);
}

/**
 * callStack フレームのラベルを `funcName(arg1, arg2, ...)` 形式で返す
 * @param {{ name: string, args?: any[] }|null} frame
 * @returns {string}
 */
export function formatFrameLabel(frame) {
  if (!frame) return '(unknown)';
  const name = frame.name || '<anonymous>';
  if (!Array.isArray(frame.args) || frame.args.length === 0) return `${name}()`;
  const argStr = frame.args.map(fmtArgPlain).join(', ');
  return `${name}(${argStr})`;
}

/**
 * env スコープチェーンと callStack フレームをマージして表示用スコープ配列を返す。
 *
 * JavaScript は lexical scoping を採用しており、callFunction は
 * `new Environment(callee.closure)` でスコープを作成する。
 * そのため、同一スコープレベルで定義された関数同士（例: quickSort と merge）や
 * 再帰呼び出し（factorial(3)→factorial(2)）では、外側フレームのスコープが
 * env チェーンに含まれない。
 *
 * JSInterpreter の Recorder が各フレームの変数を、呼び出した地点から見えるものまで含めて
 * TraceEvent.frameEnvs として記録する（外→内の順、callStack と同じインデックス）。
 * この frameEnvs を使って各フレームのローカル変数（引数・let/const 宣言）を正確に表示する。
 * グローバルのブロック（for の本体など）の変数は TraceEvent.globalBlockVars に記録される。
 *
 * アルゴリズム:
 *   - 最内側フレーム: scopes[0]〜scopes[M-2] を全てマージ（ブロックスコープ含む）
 *   - 外側フレーム:  frameEnvs[i] を使用（呼び出した地点から見える変数のスナップショット）
 *   - グローバルフレーム: scopes[M-1] と globalBlockVars
 *
 * env スナップショットの順序:
 *   scopes[0]   = 最内スコープ（最もネストしたブロック or パラメータ）
 *   scopes[M-1] = グローバルスコープ
 * callStack / frameEnvs の順序:
 *   [0]   = 最外側フレーム
 *   [N-1] = 最内側フレーム（現在実行中）
 *
 * 返り値は innermost-first 順（先頭が最内側）。
 *
 * @param {Object[]} scopes      env スコープチェーン（AppState.scopes）
 * @param {Object[]} callStack   コールスタック（AppState.callStack）
 * @param {Object[]} [frameEnvs] 各フレームの変数のスナップショット（AppState.frameEnvs）
 * @param {Object}   [globalBlockVars] 関数の呼び出し中に、グローバルのブロック（for の本体など）にある変数（AppState.globalBlockVars）
 * @returns {Array<{label:string, vars:Object, isInnermost:boolean}>}
 */
export function mergeScopesForDisplay(scopes, callStack, frameEnvs = [], globalBlockVars = {}) {
  const N = callStack?.length ?? 0;
  const M = scopes?.length ?? 0;

  if (M === 0) return [];

  // N=0: 関数外（グローバルスコープのみ）
  // for ループ内のブロックスコープなども含め全スコープをマージ
  if (N === 0) {
    const merged = {};
    for (let j = M - 1; j >= 0; j--) Object.assign(merged, scopes[j] ?? {});
    return [{ label: 'global', vars: merged, isInnermost: true }];
  }

  const display = [];

  // 最内側関数: scopes[0]〜scopes[M-2] を全てマージ（ブロックスコープ・クロージャ含む）
  const innermostVars = {};
  for (let j = M - 2; j >= 0; j--) {
    Object.assign(innermostVars, scopes[j] ?? {});
  }
  display.push({
    label:       formatFrameLabel(callStack[N - 1]),
    vars:        innermostVars,
    isInnermost: true,
  });

  // 外側フレーム: frameEnvs[i] に、次のフレームを呼び出した地点から見える変数が記録されている
  // （引数、関数本体やブロックの let/const/var。ADR-049）
  for (let i = N - 2; i >= 0; i--) {
    display.push({
      label:       formatFrameLabel(callStack[i]),
      vars:        frameEnvs[i] ? { ...frameEnvs[i] } : {},
      isInnermost: false,
    });
  }

  // グローバルスコープ
  display.push({
    label:       'global',
    vars:        { ...(scopes[M - 1] ?? {}), ...globalBlockVars },
    isInnermost: false,
  });

  return display;
}
