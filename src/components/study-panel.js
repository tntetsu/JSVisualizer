/**
 * study-panel.js — 評価実験用 UI（Session Log 配線 + ワンクリックマーカー）
 *
 * 【実験終了後の削除手順】
 *   1. このファイルを削除
 *   2. app.js の `// STUDY:` コメントが付いた import 行を削除
 *   3. index.html の <!-- STUDY MODE --> ～ <!-- /STUDY MODE --> ブロックを削除
 *
 * session-logger.js 本体と step-controller / view-switcher の logStep / logView 呼び出しは
 * セッション非アクティブ時に no-op になるため、残置しても無害。
 */

import { sessionLogger } from '../core/session-logger.js';

// ── ワンクリックマーカー定義 ──────────────────────────────────────────────────

const MARKERS = [
  { label: 'task1-start', display: 'T1 開始' },
  { label: 'task1-hint',  display: 'T1 ヒント' },
  { label: 'task1-done',  display: 'T1 完了' },
  { label: 'task2-start', display: 'T2 開始' },
  { label: 'task2-hint',  display: 'T2 ヒント' },
  { label: 'task2-done',  display: 'T2 完了' },
  { label: 'task3-start', display: 'T3 開始' },
  { label: 'task3-hint',  display: 'T3 ヒント' },
  { label: 'task3-done',  display: 'T3 完了' },
];

// ── DOM 参照 ───────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

const logStatusEl   = $('log-status');
const btnLogStart   = $('btn-log-start');
const logMarkerText = $('log-marker-text');
const btnLogMarker  = $('btn-log-marker');
const btnLogJson    = $('btn-log-json');
const btnLogCsv     = $('btn-log-csv');
const markerGridEl  = $('study-marker-grid');

// ── ステータス更新 ─────────────────────────────────────────────────────────

function updateLogUI(count) {
  const active = sessionLogger.isActive;
  logStatusEl.textContent = active
    ? `● Recording (${count} entries)`
    : '● Inactive';
  logStatusEl.classList.toggle('log-status--active', active);
  btnLogStart.textContent = active ? 'New Session' : 'Start Session';
  btnLogJson.disabled = count === 0;
  btnLogCsv.disabled  = count === 0;
  markerGridEl.querySelectorAll('.study-marker-btn').forEach(btn => {
    btn.disabled = !active;
  });
}

sessionLogger.onCountChange(updateLogUI);

// ── イベント配線 ────────────────────────────────────────────────────────────

btnLogStart.addEventListener('click', () => {
  sessionLogger.startSession();
  updateLogUI(0);
});

btnLogMarker.addEventListener('click', () => {
  if (!sessionLogger.isActive) return;
  sessionLogger.logMarker(logMarkerText.value);
  logMarkerText.value = '';
});

logMarkerText.addEventListener('keydown', e => {
  if (e.key === 'Enter') btnLogMarker.click();
});

btnLogJson.addEventListener('click', () => sessionLogger.exportJSON());
btnLogCsv.addEventListener('click',  () => sessionLogger.exportCSV());

// ── ワンクリックマーカーボタン生成 ───────────────────────────────────────────

for (const { label, display } of MARKERS) {
  const btn = document.createElement('button');
  btn.className   = 'log-btn study-marker-btn';
  btn.textContent = display;
  btn.disabled    = true;
  btn.addEventListener('click', () => sessionLogger.logMarker(label));
  markerGridEl.appendChild(btn);
}
