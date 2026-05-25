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
import { CodeView }         from './views/code-view/index.js';
import { StateView }        from './views/state-view/index.js';
import { AnimatedTrace }    from './views/animated-trace/index.js';
import { TraceTable }       from './views/trace-table/index.js';
import { ScopeView }        from './views/scope-view/index.js';
import { CallStackView }    from './views/callstack-view/index.js';

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

// ── コアモジュールの初期化 ─────────────────────────────────────────────────

const adapter    = new DebuggerAdapter();
const controller = new StepController(adapter);

// ── ビューの初期化 ────────────────────────────────────────────────────────

// 左ペイン: コードハイライトビュー（ViewSwitcher 管理外）
const codeView = new CodeView();
codeView.init(codeDisplay);

// 右ペイン: ViewSwitcher でタブ切り替え管理
const switcher = new ViewSwitcher(viewTabsEl, viewContainerEl);
switcher.register('state',   '変数・スタック', StateView);
switcher.register('scope',   'スコープ',       ScopeView);
switcher.register('trace',   'トレース',       AnimatedTrace);
switcher.register('table',   '全ステップ',     TraceTable);
switcher.register('callstack', 'コールスタック', CallStackView);

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
  const builder = new TraceBuilder(adapter.getTrace());

  // ViewSwitcher に builder + 初期 state を通知（builder 付きで再マウント）
  switcher.onReady(state, builder);

  // コードビューを実行モードに切り替え
  editorArea.classList.add('hidden');
  codeDisplay.classList.remove('hidden');
  codeView.setSource(source);

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
