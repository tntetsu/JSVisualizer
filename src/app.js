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
import { t, getLang, setLang } from './i18n.js';
import { sessionLogger }   from './core/session-logger.js'; // STUDY: logRun/logReset のため残置
import './components/study-panel.js'; // STUDY: 実験UI（削除手順は study-panel.js 冒頭を参照）
import { CodeView }         from './views/code-view/index.js';
import { CallStackView }    from './views/state-view/index.js';
import { Variable }         from './views/line-trace/index.js';
import { TraceTable }       from './views/trace-table/index.js';
import { ExecTrace }        from './views/exec-trace/index.js';
import { BarChart }         from './views/bar-chart/index.js';
import { Arrays }           from './views/color-box/index.js';
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

// ── i18n 初期化 ───────────────────────────────────────────────────────────

/** [data-i18n] 要素を現在言語で一括更新する */
function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.documentElement.lang = getLang();
  const btnLang = $('btn-lang');
  if (btnLang) btnLang.textContent = getLang() === 'ja' ? 'EN' : '日';
}

// 起動時に初期言語を適用
applyI18n();

// 言語トグルボタン
$('btn-lang').addEventListener('click', () => {
  setLang(getLang() === 'ja' ? 'en' : 'ja');
});

// 言語変更イベントを受信して UI を更新
document.addEventListener('langchange', (e) => {
  applyI18n();
  switcher.setLang(e.detail);
});

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
switcher.register('state',
  { ja: 'コールスタック', en: 'Call Stack' },
  CallStackView,
  { ja: 'Global・関数呼び出しのスコープごとに変数値を一覧表示します。',
    en: 'Shows variables scoped to Global and each function-call frame.' });
switcher.register('trace',
  { ja: '変数', en: 'Variable' },
  Variable,
  { ja: 'ソースの各行が何回目にどんな変数値で実行されたかを行×変数のマトリクスで確認できます。',
    en: 'Matrix of source lines × variables showing values at each execution.' });
switcher.register('exectrace',
  { ja: '実行トレース', en: 'Exec Trace' },
  ExecTrace,
  { ja: '代入・条件判定・関数呼び出しなど意味のある変化が起きたステップを時系列で一覧表示します。条件式の真偽も確認できます。',
    en: 'Lists meaningful steps (assignments, conditions, calls) in chronological order. Shows truth values of conditions.' });
switcher.register('subst',
  { ja: '代入展開', en: 'Subst' },
  SubstTrace,
  { ja: '再帰呼び出しを「置換モデル（関数呼び出しを等価な式に置き換えること）」で段階的に展開し、計算が縮約される過程を追跡します。',
    en: 'Expands recursive calls step by step using the substitution model (replacing a call with its equivalent expression).' });
switcher.register('exprtrace',
  { ja: '式評価', en: 'Expr' },
  ExprTrace,
  { ja: '式が部分式の逐次置換によって値へ評価される過程を、ステップごとに追跡します。',
    en: 'Tracks how an expression reduces to a value through step-by-step sub-expression substitution.' });
// switcher.register('table', ...);  // 非アクティブ
// switcher.register('bar',   ...);  // 非アクティブ
switcher.register('colorbox',
  { ja: '配列', en: 'Arrays' },
  Arrays,
  { ja: '配列の各要素をマス目で視覚化します。複数配列とポインタ変数を同時に表示できます。',
    en: 'Visualizes array elements as colored cells. Displays multiple arrays and pointer variables simultaneously.' });
// switcher.register('timeline', ...);  // 非アクティブ
switcher.register('heatmap',
  { ja: 'ヒートマップ', en: 'Heatmap' },
  Heatmap,
  { ja: '各行の実行回数を色の濃さで表示します。ループで繰り返し実行された行が一目でわかります。',
    en: 'Shows execution frequency per line as color intensity. Highlights hot loops at a glance.' });
// switcher.register('recursion', ...);  // 非アクティブ（CallTree に統合。ADR-027）
switcher.register('calltree',
  { ja: '呼び出しツリー', en: 'Call Tree' },
  CallTree,
  { ja: 'すべての関数呼び出し（再帰・非再帰）を呼び出し順の木構造で可視化します。各ノードのサブツリーコストも確認できます。',
    en: 'Visualizes all function calls (recursive and non-recursive) as an ordered call tree. Each node shows its subtree cost.' });
switcher.register('lifetime',
  { ja: '変数寿命', en: 'Lifetime' },
  Lifetime,
  { ja: '変数が「いつ生まれていつ消えるか」の生存区間をガントチャートで表示します。',
    en: "Shows each variable's lifetime as a Gantt chart bar — when it's created and when it goes out of scope." });
switcher.register('controlflow',
  { ja: '制御フロー', en: 'Control Flow' },
  ControlFlow,
  { ja: 'if・while・for の分岐とループ構造をフローチャートで表示します。実行されなかったパスはグレーアウトされます。',
    en: 'Displays if/while/for branching and loop structure as a flowchart. Unexecuted paths are grayed out.' });
switcher.register('memory',
  { ja: 'メモリ', en: 'Memory' },
  MemoryView,
  { ja: 'スタックフレームとヒープのメモリ構造をボックス図で表示します。参照はポインタ矢印で示します。',
    en: 'Shows stack frames and heap memory as box diagrams. References are shown as pointer arrows.' });
switcher.register('objgraph',
  { ja: 'オブジェクト', en: 'Objects' },
  ObjectGraph,
  { ja: 'オブジェクト・配列の参照関係を有向グラフで可視化します。連結リストや木構造の確認に適しています。',
    en: 'Visualizes object and array references as a directed graph. Ideal for linked lists and tree structures.' });

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

