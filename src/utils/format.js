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
