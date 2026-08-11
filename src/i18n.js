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
    'editor-hint':           'コードは自由に編集して実行できます',
    // ── ステップボタンラベル ──────────────────────────────────
    'label-func':            '関数',
    'label-human':           '人',
    'label-stmt':            '文',
    'label-expr':            '式',
    // ── ExprTrace ビュー ──────────────────────────────────────
    'exprtrace-col-expr':    '式',
    'exprtrace-empty':       '式評価ステップが検出されませんでした',
    // ── ExecTrace ビュー ──────────────────────────────────────
    'exectrace-empty':       'ステップがありません',
    'exectrace-col-line':    '行',
    'exectrace-col-code':    'コード',
    // ── ColorBox（配列）ビュー ─────────────────────────────────
    'colorbox-empty':        '選択された配列が見つかりません',
    'colorbox-no-arrays':    '配列変数が見つかりません',
    // ── CallTree / RecursionTree ビュー（アクセシビリティラベル） ─
    'calltree-aria':         '呼び出しツリー',
    'recursiontree-aria':    '再帰ツリー',
    // ── BarChart / Timeline ビュー（非アクティブタブ） ──────────
    'barchart-empty':        'ステップを進めると棒グラフが表示されます',
    'timeline-empty':        '数値型の変数が見つかりません',
    // ── ControlFlow ビュー ─────────────────────────────────────
    'controlflow-global':    '◀▶ グローバル',
    // ── MemoryView ビュー ──────────────────────────────────────
    'memoryview-empty':      'オブジェクトなし',
    // ── ScopeView / CallStackView（非アクティブタブ） ───────────
    'view-waiting':          '実行待ち',
    'scopeview-empty':       'スコープなし',
    'scopeview-no-vars':     '（変数なし）',
    // ── LineTrace ビュー（列表示切替ボタン） ────────────────────
    'action-hide':           '非表示',
    'action-show':           '表示',
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
    'editor-hint':           'You can freely edit and run this code',
    'label-func':            'Func',
    'label-human':           'Human',
    'label-stmt':            'Stmt',
    'label-expr':            'Expr',
    'exprtrace-col-expr':    'Expression',
    'exprtrace-empty':       'No expression evaluation steps detected',
    'exectrace-empty':       'No steps',
    'exectrace-col-line':    'Line',
    'exectrace-col-code':    'Code',
    'colorbox-empty':        'No selected arrays found',
    'colorbox-no-arrays':    'No array variables found',
    'calltree-aria':         'Call tree',
    'recursiontree-aria':    'Recursion tree',
    'barchart-empty':        'Step forward to see the bar chart',
    'timeline-empty':        'No numeric variables found',
    'controlflow-global':    '◀▶ Global',
    'memoryview-empty':      'No objects',
    'view-waiting':          'Waiting to run',
    'scopeview-empty':       'No scope',
    'scopeview-no-vars':     '(no variables)',
    'action-hide':           'Hide',
    'action-show':           'Show',
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
