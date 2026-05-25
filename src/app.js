/**
 * app.js — JSVisualizer エントリポイント・全体協調
 *
 * 依存関係:
 *   DebuggerAdapter ← StepController
 *   StepController  → adapter.moveTo()
 *   adapter 'step'  → CodeView.update(), updateDebugPanel()
 *   adapter 'ready' → CodeView.setSource(), StepControls.setEnabled()
 */

import { DebuggerAdapter }  from './core/debugger-adapter.js';
import { StepController }   from './core/step-controller.js';
import { TraceBuilder }     from './core/trace-builder.js';
import { CodeEditor }       from './components/code-editor.js';
import { StepControls }     from './components/step-controls.js';
import { CodeView }         from './views/code-view/index.js';

// ── DOM 参照 ───────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

const sourceEditor      = $('source-editor');
const codeDisplay       = $('code-display');
const editorArea        = $('editor-area');
const errorMsg          = $('error-msg');
const sampleSelect      = $('sample-select');
const btnRun            = $('btn-run');
const btnReset          = $('btn-reset');
const currentStepEl     = $('current-step');
const variablesEl       = $('variables');
const callstackEl       = $('callstack');
const consoleOutputEl   = $('console-output');
const consoleCountEl    = $('console-count');
const scopeAllCb        = $('scope-all');

// ── コアモジュールの初期化 ─────────────────────────────────────────────────

const adapter    = new DebuggerAdapter();
const controller = new StepController(adapter);

// ── ビューの初期化 ────────────────────────────────────────────────────────

const codeView = new CodeView();
codeView.init(codeDisplay);

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
  controller:      controller,
  btnStart:        $('btn-start'),
  btnExprBack:     $('btn-expr-back'),
  btnStmtBack:     $('btn-stmt-back'),
  btnExprForward:  $('btn-expr-forward'),
  btnStmtForward:  $('btn-stmt-forward'),
  btnEnd:          $('btn-end'),
  slider:          $('step-slider'),
  counter:         $('step-counter'),
});

// ── イベントリスナー ──────────────────────────────────────────────────────

adapter.addEventListener('ready', (e) => {
  const state = e.detail;
  const source = editor.getCode();

  // コードビューを実行モードに切り替え
  editorArea.classList.add('hidden');
  codeDisplay.classList.remove('hidden');
  codeView.setSource(source);

  editor.setRunningMode(true);
  stepControls.setEnabled(true);
  stepControls.update(state);
  updateDebugPanel(state);
});

adapter.addEventListener('error', (e) => {
  editor.showError(e.detail.message);
});

adapter.addEventListener('step', (e) => {
  const state = e.detail;
  codeView.update(state);
  stepControls.update(state);
  updateDebugPanel(state);
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
  stepControls.setEnabled(false);
  clearDebugPanel();

  editorArea.classList.remove('hidden');
  codeDisplay.classList.add('hidden');
  editor.setRunningMode(false);
  editor.showError(null);
}

// ── デバッグパネル更新 ────────────────────────────────────────────────────

/**
 * @param {import('./core/debugger-adapter.js').AppState} state
 */
function updateDebugPanel(state) {
  updateCurrentStep(state);
  updateVariables(state);
  updateCallStack(state);
  updateConsole(state);
}

function clearDebugPanel() {
  currentStepEl.innerHTML  = '<p class="placeholder">▶ Run を押して実行を開始してください</p>';
  variablesEl.innerHTML    = '<p class="placeholder">—</p>';
  callstackEl.innerHTML    = '<p class="placeholder">—</p>';
  consoleOutputEl.innerHTML = '<p class="placeholder">—</p>';
  consoleCountEl.textContent = '';
}

// ── Current Step ──────────────────────────────────────────────────────────

function updateCurrentStep(state) {
  const { event, done } = state;
  if (done || !event) {
    currentStepEl.innerHTML = '<p class="placeholder">実行完了</p>';
    return;
  }
  const phase    = event.phase === 'enter' ? '▶ enter' : '◀ exit';
  const phasecls = event.phase === 'enter' ? 'cs-phase-enter' : 'cs-phase-exit';
  const loc      = event.loc ? `line ${event.loc.line}` : '';
  const val      = event.value !== undefined
    ? `<span class="cs-value"> → ${formatValue(event.value)}</span>` : '';

  currentStepEl.innerHTML = `
    <div class="cs-line">
      <span class="${phaseclass(event.phase)}">${phase}</span>
      <span class="cs-node">${esc(event.nodeType)}</span>
      <span> ${esc(loc)}</span>
      ${val}
    </div>
    <div class="cs-line">depth: <span>${event.depth}</span>
      &nbsp; callDepth: <span>${event.callDepth}</span>
    </div>`;
}

function phaseclass(phase) {
  return phase === 'enter' ? 'cs-phase-enter' : 'cs-phase-exit';
}

// ── Variables ─────────────────────────────────────────────────────────────

const BUILTIN_NAMES = new Set([
  'undefined', 'NaN', 'Infinity',
  'Math', 'JSON', 'Date',
  'parseInt', 'parseFloat', 'isNaN', 'isFinite',
  'Number', 'String', 'Boolean', 'Array', 'Object', 'Symbol',
  'Promise', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Error', 'TypeError', 'RangeError', 'RegExp', 'console',
]);

function updateVariables(state) {
  const { scopes, variables, changedVars, event } = state;
  const scopeAll = scopeAllCb.checked;
  const changed  = new Set(changedVars);

  if (!event) {
    variablesEl.innerHTML = '<p class="placeholder">—</p>';
    return;
  }

  let html = '';

  if (scopeAll && scopes.length > 0) {
    // スコープ別表示
    scopes.forEach((scope, i) => {
      const label = state.callStack[i]?.name ?? (i === scopes.length - 1 ? 'global' : `scope[${i}]`);
      const entries = Object.entries(scope ?? {}).filter(([k]) => !BUILTIN_NAMES.has(k));
      if (!entries.length) return;
      html += `<div class="scope-frame">
        <div class="scope-label">${esc(label)}</div>`;
      for (const [name, val] of entries) {
        const flash = changed.has(name) ? ' var-row--changed' : '';
        html += `<div class="var-row${flash}">
          <span class="var-name">${esc(name)}</span>
          <span class="var-eq">=</span>
          ${formatValue(val)}
        </div>`;
      }
      html += '</div>';
    });
  } else {
    // フラット表示（ビルトインを除外）
    const entries = Object.entries(variables).filter(([k]) => !BUILTIN_NAMES.has(k));
    if (!entries.length) {
      variablesEl.innerHTML = '<p class="placeholder">変数なし</p>';
      return;
    }
    for (const [name, val] of entries) {
      const flash = changed.has(name) ? ' var-row--changed' : '';
      html += `<div class="var-row${flash}">
        <span class="var-name">${esc(name)}</span>
        <span class="var-eq">=</span>
        ${formatValue(val)}
      </div>`;
    }
  }

  variablesEl.innerHTML = html || '<p class="placeholder">変数なし</p>';
}

// ── Call Stack ────────────────────────────────────────────────────────────

function updateCallStack(state) {
  const { callStack } = state;
  if (!callStack || callStack.length === 0) {
    callstackEl.innerHTML = '<p class="placeholder">—</p>';
    return;
  }

  let html = '';
  [...callStack].reverse().forEach((frame, i) => {
    const isTop = i === 0;
    const name  = frame.name ?? '<anonymous>';
    const loc   = frame.loc ? `line ${frame.loc.line}` : '';
    html += `<div class="frame-card${isTop ? ' frame-card--top' : ''}">
      <span class="frame-name">${esc(name)}</span>
      <span class="frame-loc">${esc(loc)}</span>
    </div>`;
  });

  callstackEl.innerHTML = html;
}

// ── Console ───────────────────────────────────────────────────────────────

function updateConsole(state) {
  const { consoleOutput } = state;
  if (!consoleOutput || consoleOutput.length === 0) {
    consoleOutputEl.innerHTML = '<p class="placeholder">—</p>';
    consoleCountEl.textContent = '';
    return;
  }

  consoleCountEl.textContent = String(consoleOutput.length);
  let html = '';
  for (const log of consoleOutput) {
    const cls = log.level === 'warn'  ? ' console-line--warn'
              : log.level === 'error' ? ' console-line--error' : '';
    html += `<div class="console-line${cls}">${esc(log.text)}</div>`;
  }
  consoleOutputEl.innerHTML = html;
}

// ── 値フォーマット ─────────────────────────────────────────────────────────

function formatValue(v, depth = 0) {
  if (v === undefined)           return '<span class="v-undef">undefined</span>';
  if (v === null)                return '<span class="v-null">null</span>';
  if (typeof v === 'boolean')    return `<span class="v-bool">${v}</span>`;
  if (typeof v === 'number')     return `<span class="v-num">${v}</span>`;
  if (typeof v === 'string')     return `<span class="v-str">${esc(JSON.stringify(v))}</span>`;
  if (typeof v === 'function')   return '<span class="v-fn">[Function]</span>';
  if (Array.isArray(v)) {
    if (depth > 0) return '<span class="v-obj">[…]</span>';
    const items = v.slice(0, 8).map(x => formatValue(x, depth + 1)).join(', ');
    const ellipsis = v.length > 8 ? ', …' : '';
    return `<span class="v-obj">[${items}${ellipsis}]</span>`;
  }
  if (typeof v === 'object') {
    if (depth > 0) return '<span class="v-obj">{…}</span>';
    const entries = Object.entries(v).slice(0, 4);
    const items = entries.map(([k, val]) => `${esc(k)}: ${formatValue(val, depth + 1)}`).join(', ');
    const ellipsis = Object.keys(v).length > 4 ? ', …' : '';
    return `<span class="v-obj">{ ${items}${ellipsis} }</span>`;
  }
  return `<span>${esc(String(v))}</span>`;
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
