/**
 * format.js — 値フォーマット・HTML エスケープ共有ユーティリティ
 */

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
function isJSFunction(v) {
  return v && typeof v === 'object' && v.__type__ === 'JSFunction';
}
function isJSClass(v) {
  return v && typeof v === 'object' && v.__type__ === 'JSClass';
}

/**
 * 値を HTML 文字列に変換する（型ごとに色付け）
 * @param {any}    v
 * @param {number} [depth=0]  再帰深さ（配列・オブジェクトの省略判定）
 * @returns {string}
 */
export function formatValue(v, depth = 0) {
  if (v === undefined)         return '<span class="v-undef">undefined</span>';
  if (v === null)              return '<span class="v-null">null</span>';
  if (typeof v === 'boolean')  return `<span class="v-bool">${v}</span>`;
  if (typeof v === 'number')   return `<span class="v-num">${v}</span>`;
  if (typeof v === 'string')   return `<span class="v-str">${esc(JSON.stringify(v))}</span>`;
  if (isJSFunction(v))         return `<span class="v-fn">ƒ ${esc(v.name || '(anonymous)')}</span>`;
  if (isJSClass(v))            return `<span class="v-fn">class ${esc(v.name || '(anonymous)')}</span>`;
  if (typeof v === 'function') return '<span class="v-fn">[native]</span>';
  if (Array.isArray(v)) {
    if (depth > 0) return '<span class="v-obj">[…]</span>';
    const items = v.slice(0, 8).map(x => formatValue(x, depth + 1)).join(', ');
    const more  = v.length > 8 ? `, <span class="v-muted">+${v.length - 8}</span>` : '';
    return `<span class="v-obj">[${items}${more}]</span>`;
  }
  if (typeof v === 'object') {
    if (depth > 0) return '<span class="v-obj">{…}</span>';
    const entries = Object.entries(v).slice(0, 4);
    const items   = entries.map(([k, val]) =>
      `<span class="v-key">${esc(k)}</span>: ${formatValue(val, depth + 1)}`
    ).join(', ');
    const more = Object.keys(v).length > 4 ? ', …' : '';
    return `<span class="v-obj">{ ${items}${more} }</span>`;
  }
  return `<span>${esc(String(v))}</span>`;
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
  if (val === undefined) return '<span class="v-undef">undefined</span>';
  if (val === null)      return '<span class="v-null">null</span>';
  if (isJSFunction(val)) return `<span class="v-fn">ƒ ${esc(val.name || '(anonymous)')}</span>`;
  if (isJSClass(val))    return `<span class="v-fn">class ${esc(val.name || '(anonymous)')}</span>`;
  if (typeof val === 'function') return '<span class="v-fn">[native]</span>';

  if (Array.isArray(val)) {
    const prev  = Array.isArray(prevVal) ? prevVal : [];
    const items = val.slice(0, 8).map((x, i) => {
      const cell = formatValue(x, 1);
      return valEqual(x, prev[i]) ? cell : `<b class="v-diff">${cell}</b>`;
    });
    const more = val.length > 8
      ? `, <span class="v-muted">+${val.length - 8}</span>` : '';
    return `<span class="v-obj">[${items.join(', ')}${more}]</span>`;
  }

  if (typeof val === 'object') {
    const prev    = (prevVal !== null && typeof prevVal === 'object' && !Array.isArray(prevVal))
      ? prevVal : {};
    const entries = Object.entries(val).slice(0, 4);
    const items   = entries.map(([k, v]) => {
      const fmt = `<span class="v-key">${esc(k)}</span>: ${formatValue(v, 1)}`;
      return valEqual(v, prev[k]) ? fmt : `<b class="v-diff">${fmt}</b>`;
    });
    const more = Object.keys(val).length > 4 ? ', …' : '';
    return `<span class="v-obj">{ ${items.join(', ')}${more} }</span>`;
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
  if (v === undefined || v === null) return String(v);
  if (typeof v === 'boolean' || typeof v === 'number') return String(v);
  if (typeof v === 'string') {
    const s = JSON.stringify(v);
    return s.length > 10 ? s.slice(0, 9) + '…"' : s;
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const elems = v.slice(0, 3).map(e => fmtArgPlain(e)).join(', ');
    return v.length > 3 ? `[${elems}, …]` : `[${elems}]`;
  }
  if (typeof v === 'object') return '{…}';
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
 * JSInterpreter の Recorder が各フレームの callEnv を frameEnvStack で管理し、
 * TraceEvent.frameEnvs として記録する（外→内の順、callStack と同じインデックス）。
 * この frameEnvs を使って各フレームのローカル変数（引数・let/const 宣言）を正確に表示する。
 *
 * アルゴリズム:
 *   - 最内側フレーム: scopes[0]〜scopes[M-2] を全てマージ（ブロックスコープ含む）
 *   - 外側フレーム:  frameEnvs[i] を使用（callEnv スナップショット）
 *   - グローバルフレーム: scopes[M-1]
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
 * @param {Object[]} [frameEnvs] 各フレームの callEnv スナップショット（AppState.frameEnvs）
 * @returns {Array<{label:string, vars:Object, isInnermost:boolean}>}
 */
export function mergeScopesForDisplay(scopes, callStack, frameEnvs = []) {
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

  // 外側フレーム: frameEnvs[i] に callEnv スナップショットが記録されている
  // （params + function-body let/const/var。ブロックスコープ内変数は含まない）
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
    vars:        { ...(scopes[M - 1] ?? {}) },
    isInnermost: false,
  });

  return display;
}
