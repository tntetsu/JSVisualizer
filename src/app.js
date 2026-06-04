/**
 * app.js — JSVisualizer エントリポイント・全体協調
 *
 * 依存関係:
 *   DebuggerAdapter ← StepController
 *   StepController  → adapter.moveTo()
 *   adapter 'step'  → CodeView.update(), ViewSwitcher.update()
 *   adapter 'ready' → CodeView.setSource(), ViewSwitcher.onReady()
 */

import { DebuggerAdapter }  from './core/debugger-adapter.js';
import { StepController }   from './core/step-controller.js';
import { TraceBuilder }     from './core/trace-builder.js';
import { CodeEditor }       from './components/code-editor.js';
import { StepControls }     from './components/step-controls.js';
import { ViewSwitcher }     from './components/view-switcher.js';
import { SettingsPanel }    from './components/settings-panel.js';
import { PaneResizer }      from './components/pane-resizer.js';
import { esc }              from './utils/format.js';
import { CodeView }         from './views/code-view/index.js';
import { StateView }        from './views/state-view/index.js';
import { LineTrace }        from './views/line-trace/index.js';
import { TraceTable }       from './views/trace-table/index.js';
import { BarChart }         from './views/bar-chart/index.js';
import { ColorBox }         from './views/color-box/index.js';
import { Timeline }         from './views/timeline/index.js';
import { Heatmap }          from './views/heatmap/index.js';
import { RecursionTree }    from './views/recursion-tree/index.js';
import { CallTree }         from './views/call-tree/index.js';
import { Lifetime }         from './views/lifetime/index.js';
import { ControlFlow }      from './views/control-flow/index.js';
import { MemoryView }       from './views/memory-view/index.js';
import { ObjectGraph }      from './views/object-graph/index.js';

// ── DOM 参照 ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const editorCmEl      = $('source-editor-cm');  // CodeMirror mount 先
const codeDisplay     = $('code-display');
const editorArea      = $('editor-area');
const errorMsg        = $('error-msg');
const sampleSelect    = $('sample-select');
const btnRun          = $('btn-run');
const btnReset        = $('btn-reset');
const viewTabsEl      = $('view-tabs');
const viewContainerEl = $('view-container');
const btnSettings     = $('btn-settings');
const settingsPanelEl = $('settings-panel');
const consolePanelOut = $('console-output');
const consolePanelCnt = $('console-count');
const consolePanelEl  = $('console-panel');
const consoleResizerEl = $('console-resizer');

// ── コアモジュールの初期化 ─────────────────────────────────────────────────

const adapter    = new DebuggerAdapter();
const controller = new StepController(adapter);

// ── 設定パネルの初期化（テーマ切り替えを含む） ────────────────────────────
new SettingsPanel(btnSettings, settingsPanelEl);

// ── ペインリサイザーの初期化（ドラッグで editor/viz 幅を変更） ───────────
new PaneResizer($('pane-divider'), document.querySelector('.app-main'));

// ── コンソールパネル高さリサイザー ───────────────────────────────────────
{
  const STORAGE_KEY = 'jsv-console-h';
  const MIN_H = 40;
  const MAX_H = 400;

  const savedH = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (!isNaN(savedH)) {
    consolePanelEl.style.setProperty('--console-h', `${savedH}px`);
  }

  let startY = 0;
  let startH = 0;

  consoleResizerEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startY = e.clientY;
    startH = consolePanelEl.offsetHeight;
    consoleResizerEl.classList.add('console-resizer--active');

    function onMove(e) {
      const delta = startY - e.clientY; // 上にドラッグ → 高さ増加
      const newH  = Math.min(MAX_H, Math.max(MIN_H, startH + delta));
      consolePanelEl.style.setProperty('--console-h', `${newH}px`);
    }
    function onUp() {
      consoleResizerEl.classList.remove('console-resizer--active');
      const h = consolePanelEl.offsetHeight;
      localStorage.setItem(STORAGE_KEY, String(h));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  });
}

// ── ビューの初期化 ────────────────────────────────────────────────────────

// 左ペイン: コードハイライトビュー（ViewSwitcher 管理外）
const codeView = new CodeView();
codeView.init(codeDisplay);

// 右ペイン: ViewSwitcher でタブ切り替え管理
const switcher = new ViewSwitcher(viewTabsEl, viewContainerEl);
switcher.register('state',     '変数・スタック',   StateView);
switcher.register('trace',     'トレース表',       LineTrace);
switcher.register('table',     '全ステップ',       TraceTable);
switcher.register('bar',       '棒グラフ',         BarChart);
switcher.register('colorbox',  '配列',             ColorBox);
switcher.register('timeline',  '時系列',           Timeline);
switcher.register('heatmap',   'ヒートマップ',     Heatmap);
switcher.register('recursion', '再帰ツリー',       RecursionTree);
switcher.register('calltree',  '呼び出しツリー',   CallTree);
switcher.register('lifetime',  'ライフタイム',     Lifetime);
switcher.register('controlflow','制御フロー',       ControlFlow);
switcher.register('memory',    'メモリモデル',     MemoryView);
switcher.register('objgraph',  'オブジェクト',     ObjectGraph);

// ── UI コンポーネントの初期化 ──────────────────────────────────────────────

const editor = new CodeEditor({
  container:      editorCmEl,
  sampleSelect:   sampleSelect,
  runBtn:         btnRun,
  resetBtn:       btnReset,
  errorEl:        errorMsg,
  programNameEl:  $('program-name'),
  onRun:          (code) => runCode(code),
  onReset:        () => resetAll(),
});

const stepControls = new StepControls({
  controller:       controller,
  btnStart:         $('btn-start'),
  btnStmtBack:      $('btn-stmt-back'),
  btnExprBack:      $('btn-expr-back'),
  btnExprForward:   $('btn-expr-forward'),
  btnStmtForward:   $('btn-stmt-forward'),
  btnCallBack:      $('btn-call-back'),
  btnHumanBack:     $('btn-human-back'),
  btnHumanForward:  $('btn-human-forward'),
  btnCallForward:   $('btn-call-forward'),
  btnEnd:           $('btn-end'),
  slider:           $('step-slider'),
  counter:          $('step-counter'),
});

// ── イベントリスナー ──────────────────────────────────────────────────────

adapter.addEventListener('ready', (e) => {
  const state   = e.detail;
  const source  = editor.getCode();
  const builder = new TraceBuilder(adapter.getTrace(), source, adapter.getAST());

  // ViewSwitcher に builder + 初期 state を通知（builder 付きで再マウント）
  switcher.onReady(state, builder);

  // コードビューを実行モードに切り替え
  editorArea.classList.add('hidden');
  codeDisplay.classList.remove('hidden');
  codeView.setSource(source);
  codeView.setTrace(adapter.getTrace());   // 呼び出し元ハイライト用マップを構築

  editor.setRunningMode(true);
  stepControls.setEnabled(true);
  stepControls.update(state);
  updateConsolePanel(state);
});

adapter.addEventListener('error', (e) => {
  const { message, errorType } = e.detail;
  editor.showError(message, errorType);
});

adapter.addEventListener('step', (e) => {
  const state = e.detail;
  codeView.update(state);
  stepControls.update(state);
  switcher.update(state);
  updateConsolePanel(state);
});

// ── 常時コンソールパネルの更新 ───────────────────────────────────────────

function updateConsolePanel(state) {
  const logs = state?.consoleOutput ?? [];
  consolePanelCnt.textContent = logs.length > 0 ? String(logs.length) : '';
  if (logs.length === 0) {
    consolePanelOut.innerHTML = '<p class="placeholder">—</p>';
    return;
  }
  consolePanelOut.innerHTML = logs.map(log => {
    const cls = log.level === 'warn'  ? ' console-line--warn'
              : log.level === 'error' ? ' console-line--error' : '';
    return `<div class="console-line${cls}">${esc(log.text)}</div>`;
  }).join('');
  // 末尾にスクロール
  consolePanelOut.scrollTop = consolePanelOut.scrollHeight;
}

// ── 実行・リセット ────────────────────────────────────────────────────────

function runCode(source) {
  if (!source.trim()) return;
  editor.showError(null);
  adapter.load(source);
  // 先頭ステップに移動して初期状態を表示
  adapter.moveTo(0);
}

function resetAll() {
  codeView.reset();
  switcher.reset();
  stepControls.setEnabled(false);

  editorArea.classList.remove('hidden');
  codeDisplay.classList.add('hidden');
  editor.setRunningMode(false);
  editor.showError(null);
  updateConsolePanel(null);
}
