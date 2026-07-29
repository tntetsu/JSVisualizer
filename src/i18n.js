/**
 * i18n.js — 日本語 / 英語 切り替えモジュール
 *
 * 使い方:
 *   import { t, getLang, setLang } from './i18n.js';
 *   t('btn-edit')   // 現在言語の文字列を返す
 *   setLang('en')   // 言語変更 → 'langchange' カスタムイベントを発火
 */

const STRINGS = {
  ja: {
    // ── ヘッダー ──────────────────────────────────────────────
    'btn-edit':              '✏ 編集',
    'btn-run':               '▶ 実行',
    // ── ソースペイン ──────────────────────────────────────────
    'source-title':          'ソース',
    // ── サンプルセレクト ──────────────────────────────────────
    'sample-ph':             '— サンプル —',
    // ── ステップボタンラベル ──────────────────────────────────
    'label-func':            '関数',
    'label-human':           '人',
    'label-stmt':            '文',
    'label-expr':            '式',
    // ── ExprTrace ビュー ──────────────────────────────────────
    'exprtrace-col-expr':    '式',
    // ── コンソール ────────────────────────────────────────────
    'console-title':         'コンソール',
    // ── 設定パネル ────────────────────────────────────────────
    'settings-title':        '設定',
    'settings-theme-title':  'テーマ',
    'settings-light':        'ライト',
    'settings-dark':         'ダーク',
  },
  en: {
    'btn-edit':              '✏ Edit',
    'btn-run':               '▶ Run',
    'source-title':          'Source',
    'sample-ph':             '— Sample —',
    'label-func':            'Func',
    'label-human':           'Human',
    'label-stmt':            'Stmt',
    'label-expr':            'Expr',
    'exprtrace-col-expr':    'Expression',
    'console-title':         'Console',
    'settings-title':        'Settings',
    'settings-theme-title':  'Theme',
    'settings-light':        'Light',
    'settings-dark':         'Dark',
  },
};

const STORAGE_KEY = 'jsv-lang';

let currentLang = (() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  return (saved === 'ja' || saved === 'en') ? saved : 'ja';
})();

/**
 * 現在言語のキーに対応する文字列を返す。
 * 見つからない場合は英語フォールバック、それでもなければキー自体を返す。
 * @param {string} key
 * @returns {string}
 */
export function t(key) {
  return STRINGS[currentLang]?.[key] ?? STRINGS['en']?.[key] ?? key;
}

/** @returns {'ja'|'en'} */
export function getLang() {
  return currentLang;
}

/**
 * 言語を切り替え、'langchange' イベントを document に発火する。
 * @param {'ja'|'en'} lang
 */
export function setLang(lang) {
  if (lang === currentLang) return;
  currentLang = lang;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
  document.dispatchEvent(new CustomEvent('langchange', { detail: lang }));
}
