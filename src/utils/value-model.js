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
