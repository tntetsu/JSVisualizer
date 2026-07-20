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
import { sessionLogger }   from './core/session-logger.js'; // STUDY: logRun/logReset のため残置
import './components/study-panel.js'; // STUDY: 実験UI（削除手順は study-panel.js 冒頭を参照）
import { CodeView }         from './views/code-view/index.js';
import { StateView }        from './views/state-view/index.js';
import { LineTrace }        from './views/line-trace/index.js';
import { TraceTable }       from './views/trace-table/index.js';
import { ExecTrace }        from './views/exec-trace/index.js';
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
import { SubstTrace }      from './views/subst-trace/index.js';
import { ExprTrace }       from './views/expr-trace/index.js';

// ── DOM 参照 ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const editorCmEl      = $('source-editor-cm');  // CodeMirror mount 先
const codeDisplay     = $('code-display');
const editorArea      = $('editor-area');
const errorMsg        = $('error-msg');
const sampleSelect    = $('sample-select');
const btnRun          = $('btn-run');
const btnEdit         = $('btn-edit');
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
switcher.register('state',      'State',        StateView,
  '現在ステップの変数値・スコープ・コールスタックを一覧表示します。');
switcher.register('trace',      'Trace',        LineTrace,
  'ソースの各行が何回目にどんな変数値で実行されたかを行×変数のマトリクスで確認できます。');
switcher.register('exectrace',  'Exec Trace',   ExecTrace,
  '代入・条件判定・関数呼び出しなど意味のある変化が起きたステップを時系列で一覧表示します。条件式の真偽も確認できます。');
switcher.register('subst',      'Subst',        SubstTrace,
  '再帰呼び出しを「置換モデル（関数呼び出しを等価な式に置き換えること）」で段階的に展開し、計算が縮約される過程を追跡します。');
switcher.register('exprtrace',  'Expr',         ExprTrace,
  '式が部分式の逐次置換によって値へ評価される過程を、ステップごとに追跡します。');
// switcher.register('table',     'All Steps',    TraceTable);   // 非アクティブ
// switcher.register('bar',       'Bar Chart',    BarChart);      // 非アクティブ
switcher.register('colorbox',   'Arrays',       ColorBox,
  '配列の各要素をマス目で視覚化します。複数配列とポインタ変数を同時に表示できます。');
// switcher.register('timeline',  'Timeline',     Timeline);      // 非アクティブ
switcher.register('heatmap',    'Heatmap',      Heatmap,
  '各行の実行回数を色の濃さで表示します。ループで繰り返し実行された行が一目でわかります。');
switcher.register('recursion',  'Rec. Tree',    RecursionTree,
  '再帰呼び出しの構造を木で表示します。各ノードのサブツリーコストも確認できます。');
switcher.register('calltree',   'Call Tree',    CallTree,
  'すべての関数呼び出し（再帰・非再帰）を呼び出し順の木構造で可視化します。');
switcher.register('lifetime',   'Lifetime',     Lifetime,
  '変数が「いつ生まれていつ消えるか」の生存区間をガントチャートで表示します。');
switcher.register('controlflow','Control Flow', ControlFlow,
  'if・while・for の分岐とループ構造をフローチャートで表示します。実行されなかったパスはグレーアウトされます。');
switcher.register('memory',     'Memory',       MemoryView,
  'スタックフレームとヒープのメモリ構造をボックス図で表示します。参照はポインタ矢印で示します。');
switcher.register('objgraph',   'Objects',      ObjectGraph,
  'オブジェクト・配列の参照関係を有向グラフで可視化します。連結リストや木構造の確認に適しています。');

// ── UI コンポーネントの初期化 ──────────────────────────────────────────────

const editor = new CodeEditor({
  container:      editorCmEl,
  sampleSelect:   sampleSelect,
  runBtn:         btnRun,
  editBtn:        btnEdit,
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

  // サンプル名を取得（選択中のオプションのテキスト、または 'custom'）
  const selectedOpt = sampleSelect.options[sampleSelect.selectedIndex];
  const sampleName  = (selectedOpt && selectedOpt.value)
    ? selectedOpt.text
    : 'custom';
  sessionLogger.logRun(sampleName, adapter.getTrace().length); // STUDY:

  // ViewSwitcher に builder + 初期 state を通知（builder 付きで再マウント）
  switcher.onReady(state, builder);

  // コードビューを実行モードに切り替え
  editorArea.classList.add('hidden');
  codeDisplay.classList.remove('hidden');
  codeView.setSource(source);
  codeView.setTrace(adapter.getTrace());   // 呼び出し元ハイライト用マップを構築

  document.querySelector('.app-header').classList.add('run-mode');
  editor.setRunningMode(true);
  stepControls.setEnabled(true);
  stepControls.update(state);
  updateConsolePanel(state);
});

adapter.addEventListener('error', (e) => {
  const { message, errorType, loc } = e.detail;
  editor.showError(message, errorType, loc);
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
  document.querySelector('.app-header').classList.remove('run-mode');
  codeView.reset();
  switcher.reset();
  stepControls.setEnabled(false);

  editorArea.classList.remove('hidden');
  codeDisplay.classList.add('hidden');
  editor.setRunningMode(false);
  editor.showError(null);
  updateConsolePanel(null);

  sessionLogger.logReset(); // STUDY:
}

