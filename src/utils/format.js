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
 * 各関数呼び出しは通常 2 つのスコープ（paramScope + blockScope）を生成する。
 * これらをひとつの表示フレームに統合し、ラベルを `funcName(args)` 形式にする。
 *
 * env スナップショットの順序:
 *   scopes[0]   = 最内スコープ（block or param）
 *   scopes[M-1] = グローバルスコープ
 * callStack の順序:
 *   callStack[0]   = 最外側フレーム
 *   callStack[N-1] = 最内側フレーム
 *
 * @param {Object[]} scopes     env スコープチェーン（AppState.scopes）
 * @param {Object[]} callStack  コールスタック（AppState.callStack）
 * @returns {Array<{label:string, vars:Object, isInnermost:boolean}>}
 */
export function mergeScopesForDisplay(scopes, callStack) {
  const N = callStack ? callStack.length : 0;
  const M = scopes ? scopes.length : 0;

  if (M === 0) return [];

  // N=0: 関数外（グローバルのみ）
  if (N === 0) {
    return [{
      label: 'global',
      vars:  { ...(scopes[M - 1] ?? {}) },
      isInnermost: true,
    }];
  }

  const display = [];

  // 各関数フレーム i (0=最外側) に対応するスコープを収集してマージ
  // ─ 2スコープ/関数の前提 (param + block) で底から割り当て ─
  // scopes[M-1] = global
  // scopes[M-2-2*i] = callStack[i] の param scope
  // scopes[M-3-2*i] = callStack[i] の block scope
  // 最内側 (i=N-1) には余分な内側スコープも全部マージ

  for (let i = 0; i < N; i++) {
    const frame    = callStack[i];
    const merged   = {};

    const paramIdx = M - 2 - 2 * i;
    const blockIdx = M - 3 - 2 * i;

    if (i === N - 1) {
      // 最内側: index 0 から innermostParamIdx-1 までの余分スコープをマージ
      const innermostParamIdx = Math.max(0, paramIdx);
      for (let j = 0; j < innermostParamIdx; j++) {
        Object.assign(merged, scopes[j] ?? {});
      }
    }
    if (blockIdx >= 0) Object.assign(merged, scopes[blockIdx] ?? {});
    if (paramIdx >= 0) Object.assign(merged, scopes[paramIdx] ?? {});

    display.push({
      label:       formatFrameLabel(frame),
      vars:        merged,
      isInnermost: i === N - 1,
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
