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
import { CodeView }         from './views/code-view/index.js';
import { StateView }        from './views/state-view/index.js';
import { LineTrace }        from './views/line-trace/index.js';
import { TraceTable }       from './views/trace-table/index.js';
import { ScopeView }        from './views/scope-view/index.js';
import { CallStackView }    from './views/callstack-view/index.js';
import { BarChart }         from './views/bar-chart/index.js';
import { ColorBox }         from './views/color-box/index.js';
import { Timeline }         from './views/timeline/index.js';
import { Heatmap }          from './views/heatmap/index.js';
import { RecursionTree }    from './views/recursion-tree/index.js';
import { Lifetime }         from './views/lifetime/index.js';
import { ControlFlow }      from './views/control-flow/index.js';

// ── DOM 参照 ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const sourceEditor    = $('source-editor');
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

// ── コアモジュールの初期化 ─────────────────────────────────────────────────

const adapter    = new DebuggerAdapter();
const controller = new StepController(adapter);

// ── 設定パネルの初期化（テーマ切り替えを含む） ────────────────────────────
new SettingsPanel(btnSettings, settingsPanelEl);

// ── ビューの初期化 ────────────────────────────────────────────────────────

// 左ペイン: コードハイライトビュー（ViewSwitcher 管理外）
const codeView = new CodeView();
codeView.init(codeDisplay);

// 右ペイン: ViewSwitcher でタブ切り替え管理
const switcher = new ViewSwitcher(viewTabsEl, viewContainerEl);
switcher.register('state',     '変数・スタック',   StateView);
switcher.register('scope',     'スコープ',         ScopeView);
switcher.register('trace',     'トレース表',       LineTrace);
switcher.register('table',     '全ステップ',       TraceTable);
switcher.register('callstack', 'コールスタック',   CallStackView);
switcher.register('bar',       '棒グラフ',         BarChart);
switcher.register('colorbox',  '色付き箱',         ColorBox);
switcher.register('timeline',  '時系列',           Timeline);
switcher.register('heatmap',   'ヒートマップ',     Heatmap);
switcher.register('recursion', '再帰ツリー',       RecursionTree);
switcher.register('lifetime',  'ライフタイム',     Lifetime);
switcher.register('controlflow','制御フロー',       ControlFlow);

// ── UI コンポーネントの初期化 ──────────────────────────────────────────────

const editor = new CodeEditor({
  textarea:     sourceEditor,
  sampleSelect: sampleSelect,
  runBtn:       btnRun,
  resetBtn:     btnReset,
  errorEl:      errorMsg,
  onRun:        (code) => runCode(code),
  onReset:      () => resetAll(),
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
  const builder = new TraceBuilder(adapter.getTrace(), source);

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
});

adapter.addEventListener('error', (e) => {
  editor.showError(e.detail.message);
});

adapter.addEventListener('step', (e) => {
  const state = e.detail;
  codeView.update(state);
  stepControls.update(state);
  switcher.update(state);
});

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
}
