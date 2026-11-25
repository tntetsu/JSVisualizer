/**
 * value-model.js — 値の見せ方（言語プロファイルの valueModel）をビューから使うためのヘルパー
 *
 * ビューは値の形（typeof・Array.isArray・Object.entries）や書き方（null・true・JSON.stringify）を直接扱わず、
 * vm().kind(v)・vm().literal(v)・vm().entries(v) などを使う。JS 版の結果は、導入前のビューと同じ文字列になる。
 */
import { getLanguage } from '../lang/index.js';

/** @returns {import('../lang/index.js').ValueModel} */
export const vm = () => getLanguage().valueModel;

/** ヒープに乗る値（関数を除くオブジェクト・配列・dict など）か */
export function isContainer(v) {
  const k = vm().kind(v);
  return k === 'sequence' || k === 'mapping' || k === 'object';
}

/** スカラー（undefined・none・bool・number・string）か */
export function isScalar(v) {
  const k = vm().kind(v);
  return k === 'undefined' || k === 'none' || k === 'bool' || k === 'number' || k === 'string';
}

/**
 * 文字列の書き方を最大 max 文字に切り詰める（閉じる引用符は残す）。
 * JS 版は導入前の `s.slice(0, max - 1) + '…"'` と同じ結果になる。
 */
export function truncLiteral(s, max) {
  return s.length > max ? s.slice(0, max - 1) + '…' + s[s.length - 1] : s;
}

/** JS のオブジェクトとして扱っていた値（旧コードの `v !== null && typeof v === 'object'` に当たる。関数・クラスを含む） */
export function isObjectLike(v) {
  const k = vm().kind(v);
  return k === 'sequence' || k === 'mapping' || k === 'object' || k === 'function' || k === 'class';
}

/**
 * sequence・mapping・object を、かっこと要素の並びで書く（言語ごとの違いは valueModel の brackets・padMapping・
 * emptyText・trailingComma に尋ねる）。JS 版の結果は、導入前の各ビューの書き方と同じになる。
 * @param {any} v
 * @param {string[]} items 書き終えた要素（区切りの ', ' は付けない）
 * @param {{ more?: string, pad?: boolean }} [opts]
 *   more：要素を省略したときに続ける文字列（', …' など。空なら全部並べた）。
 *   pad：かっこの内側に空白を入れる箇所か（JS の { a: 1 }。valueModel.padMapping が false なら入れない）
 * @returns {string}
 */
export function wrapItems(v, items, { more = '', pad = false } = {}) {
  const m = vm();
  const [open, close] = m.brackets(v);
  if (items.length === 0 && !more) {
    const empty = m.emptyText?.(v);
    if (empty != null) return empty;
  }
  const sp    = pad && m.padMapping !== false ? ' ' : '';
  const comma = !more && m.trailingComma?.(v, items.length) ? ',' : '';
  return open + sp + items.join(', ') + comma + more + sp + close;
}

/** 中身を省略して書く（{…}・[…]。Python のインスタンスは Dog{…}） */
export function elided(v) {
  const [open, close] = vm().brackets(v);
  return `${open}…${close}`;
}
