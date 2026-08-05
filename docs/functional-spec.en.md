# Functional Specification

**Project**: JSVisualizer  
**Version**: 1.0  
**Created**: 2026-05-25  
**Last updated**: 2026-07-17  
**Author**: Tetsuo Tanaka

> [日本語版はこちら](functional-spec.md)

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-05-25 | Initial draft |
| 0.2 | 2026-05-25 | Added step-control UI (2-row × 4-col buttons), 3-layer code highlight, theme switching |
| 0.3 | 2026-05-26 | Phase 3 implementation: V-06 BarChart / V-07 ColorBox / V-08 Timeline / V-09 Heatmap |
| 0.4 | 2026-05-26 | Phase 3.5: V-02b LineTrace added; AnimatedTrace set as inactive |
| 0.5 | 2026-05-26 | Phase 4/5: V-10 RecursionTree / V-11 Lifetime / V-12 ControlFlow / V-13 MemoryView / V-14 ObjectGraph; new TraceBuilder methods |
| 0.6 | 2026-05-26 | Phase 6 polish: keyboard tab switching (1–9), active-tab persistence, error badges (parse vs runtime), 17 samples, color-blindness support, GitHub Pages deploy |
| 0.7 | 2026-05-26 | Fixes 1–8: destructuring support, draggable pane resizer, CodeMirror 6, program name display, always-visible Console panel, LineTrace improvements, TraceTable target column |
| 0.8 | 2026-06-02 | V-15 CallTree added; LineTrace 2-pane; ScopeView/StateView scope merge; Heatmap dots + ratio; RecursionTree arg expansion; Console height drag; callStack order fix |
| 0.9 | 2026-06-03 | Scope display algorithm rework (lexical scope `mergeScopesForDisplay`); buildRecursionTree filter to recursive-only + cost; buildCallTree fully independent; Heatmap dynamic background + 3× dot width |
| 1.0 | 2026-06-04 | Exact outer-frame variable display: `Environment.snapshotOwn()` + `Recorder.frameEnvStack`; `frameEnvs` per TraceEvent; `mergeScopesForDisplay` 3rd arg |
| 1.1 | 2026-06-04 | ScopeView/CallStackView removed from tabs (inactive); LineTrace switched to single-pane + snippet; ColorBox multi-select + per-pointer rows + no string truncation; Timeline dynamic Y-axis |
| 1.2 | 2026-06-04 | while/for condition evaluation added to humanStep; LineTrace & ExecTrace condition columns; Heatmap connect lines always-on; ColorBox max-size pre-computation |
| 1.3 | 2026-06-05 | V-02c SubstTrace and V-02d ExprTrace added; tab count 14 → 16 |
| 1.4 | 2026-06-08 | ExprTrace improvements: VariableDeclaration position via regex; more statement types; variable value timeline; real-time update in `update()` |
| 1.5 | 2026-06-16 | Diff highlighting (`formatValueDiff`); ObjectGraph hierarchical layout (Kahn topo-sort + longest-path) with elbow connectors, port spread, connected-component separation; object-identity bug fix in `Environment.snapshot()` |
| 1.6 | 2026-07-17 | (1) **Tab cleanup**: V-03 TraceTable, V-06 BarChart, V-08 Timeline set as inactive (tab count 16 → 13). (2) **ControlFlow rework**: replaced `buildControlFlow()` with `buildCFG()` — AST-based DOM flowchart with if/else shown as side-by-side true/false columns and loops as condition + body; unexecuted nodes grayed out (`cf-node--dead`); execution count badge (`×N`) per node. (3) **execCount fix**: `CfgBuilder` now counts line executions by transition (only when line changes), not all AST enter events. (4) **SubstTrace & ExprTrace object expansion**: `fmtPlain()` gains `depth` arg; depth < 3 expands object values recursively (keys omitted: `{3, null}`, `{2, {3, null}}`); depth ≥ 3 abbreviates as `{…}`; function-valued properties filtered out. (5) **Sample expansion**: 4 Study Tasks added for CELDA 2026 evaluation experiment; sample count 17 → 21; test count 66 → 70 |
| 1.7 | 2026-07-20 | (1) **Header layout redesign**: Edit mode shows Edit/Run buttons + sample select; Run mode shows Edit/Run buttons + step controls in the header center (footer removed). CSS visibility toggled via `.app-header.run-mode`. Header height changed to `auto` (min 44px); `app-main` uses `flex: 1`. (2) **Slider maximization & 2-row layout**: `.slider-area { min-width: 180px }` causes the slider to wrap to a second row on narrow windows. `body { min-width: 820px }` + `html { overflow-x: auto }` shows a horizontal scrollbar below the minimum width. (3) **View description bar**: `.view-desc` element auto-inserted below the tab bar. `ViewSwitcher.register()` accepts a 4th `description` argument; displayed on tab switch. All 13 views have descriptions. (4) **Light mode UI improvements**: active tab uses white background + blue top border + blue text + bold (`active tab` contrast enhancement via `:root:not([data-theme="dark"])`); console background set to white (`var(--bg)`) in light mode only. |
| 1.8 | 2026-07-20 | **Language switching (i18n)**: New `src/i18n.js` module (`STRINGS` object, `t(key)` / `getLang()` / `setLang()` functions, `langchange` custom event). Language persisted to `localStorage('jsv-lang')` as `'ja'` or `'en'`; defaults to `'ja'`. EN/日 toggle button (`btn-lang`) added to the right of the header. Static HTML elements use `data-i18n="key"` attributes, batch-updated by `applyI18n()`. Tab labels and descriptions are passed to `ViewSwitcher.register()` as `{ ja: '...', en: '...' }` objects and re-rendered by `ViewSwitcher.setLang(lang)`. `resolveStr(v, lang)` helper resolves both plain strings and `{ja,en}` objects. |

---

## 1. Purpose and Background

### 1.1 Problem

In programming education, students often cannot understand *what a program is doing*, making it hard to fix bugs. The root cause is an inability to follow how **memory state changes over time** — the dynamic behavior of a running program.

Existing approaches have the following problems:

| Approach | Problem |
|----------|---------|
| Paper / static slides | Cannot follow behavior continuously |
| PowerPoint animations | High authoring cost; must be remade when code changes |
| Algorithm Visualizer | Requires embedding custom visualization code; low generality |
| Python Tutor | Python-only; fixed layout; no JavaScript support |

### 1.2 Goal

Provide a web application that visualizes the execution of **any JavaScript code** from multiple angles, with no special annotations required.

### 1.3 Scope

- **Target language**: JavaScript (ES6+)
- **Target users**: Beginner-to-intermediate programming learners, educators
- **Target environment**: Modern web browsers (latest Chrome / Firefox / Safari)

---

## 2. Users and Use Cases

### 2.1 User Types

| Type | Description |
|------|-------------|
| **Learner** | A student who wants to verify and debug their own code's behavior |
| **Educator** | A teacher who wants to use it as a live demonstration during a lecture |
| **Content creator** | A designer who wants to quickly generate animated trace diagrams or flowcharts |

### 2.2 Key Use Cases

#### UC-01: Visualize custom code
1. User enters JavaScript code in the code editor
2. User clicks **▶ Run**
3. The app analyzes all steps and prepares visualizations
4. User steps through the execution one step at a time
5. User switches between views to examine the behavior from different angles

#### UC-02: Step forward and backward
1. User presses one of the 8 step buttons (or the corresponding keyboard shortcut)
2. The current position in the code (line, expression, call site) is highlighted, and all visualization views update in sync
3. User can jump to any position with the slider or the first/last buttons

#### UC-03: Switch visualization views
1. User selects a view by clicking a tab in the right pane
2. The selected view is mounted immediately and rendered at the current step
3. Keyboard keys `1`–`9` switch to the Nth registered tab (`<textarea>`/`<input>` focus suppresses this)
4. The last active tab is saved to `localStorage('jsv-active-tab')` and restored on next launch

#### UC-04: Use a sample program
1. User selects a learning scenario from the sample selector in the header (21 samples)
2. The code is inserted into the editor automatically and is ready to run

#### UC-06: Switch the display language
1. User clicks the **EN** button (or **日** button) at the top-right of the header
2. All UI text (button labels, tab names, descriptions, settings panel, etc.) switches instantly to English or Japanese
3. The selected language is saved to `localStorage('jsv-lang')` and restored on next visit

#### UC-05: Change the theme
1. User clicks the ⚙ button in the top-right corner to open the settings panel
2. User selects Light or Dark
3. The setting is applied immediately and persists across sessions

---

## 3. Functional Requirements

### 3.1 Core Features

#### F-01: Code Editor

| Item | Specification |
|------|---------------|
| Input | JavaScript (ES6+) text |
| Syntax highlighting | **CodeMirror 6** real-time highlighting (keywords, strings, numbers, comments); auto-switches with light/dark theme via `Compartment` + `MutationObserver` |
| Samples | Preset selector (21 programs: Bubble Sort, Fibonacci, Binary Tree, etc.); program name displayed in header when selected |
| Error display | Parse and runtime errors shown as distinct badges below the editor. Cursor moves to the error location with a blink animation when location info is available |
| Destructuring | Supports ES6 destructuring: `[a, b] = [b, a]`, `({ x, y } = obj)`, etc. |

#### F-02: Step Execution Controls

In Run mode, the **header center** holds the step buttons in a single row (wide) or two rows (narrow), plus first/last buttons at each end.

```
Wide:   ⏮ ⏭ │ ⏪Func ⏩Func │ ◁Human ▷Human │ ◀◀Stmt ▶▶Stmt │ ◀Expr ▶Expr │──slider──│ counter
Narrow: ⏮ ⏭ │ ⏪Func ⏩Func │ ◁Human ▷Human │ ◀◀Stmt ▶▶Stmt │ ◀Expr ▶Expr
        ─────────────────────── slider ──────────────────────────── │ counter
```

| Action | Button | Keyboard | Description |
|--------|--------|----------|-------------|
| First step | ⏮ | `Home` | Jump to step 0 |
| Expr back | ◀Expr | `b` / `←` | Decrease cursor by 1 |
| Expr forward | ▶Expr | `n` / `→` | Increase cursor by 1 |
| Stmt back | ◀◀Stmt | `V` | Go to start of previous statement |
| Stmt forward | ▶▶Stmt | `v` | Go to start of next statement |
| Human back | ◁Human | `H` | Go to previous humanStep |
| Human forward | ▷Human | `h` | Go to next humanStep |
| Func back | ⏪Func | `F` | Go to previous `callDepth` change |
| Func forward | ⏩Func | `f` | Go to next `callDepth` change |
| Last step | ⏭ | `End` | Jump to the final step |
| Jump to position | Slider | — | Jump to any position in the trace |

Button colors: fine-grained (Expr/Human) = accent blue; coarse-grained (Stmt/Func) = gray

#### F-03: Step Granularity

| Granularity | Internal API | Definition |
|-------------|-------------|------------|
| Expression (Expr) | cursor ± 1 | Every AST node enter/exit — finest granularity |
| Statement (Stmt) | `stepOver()` → `matchIdx` | Statement nodes only (skips sub-expressions) |
| Human | `humanStep()` / `humanStepBack()` | Meaningful change points: assignments, condition tests, while/do-while/for condition eval per iteration, for update expr, function calls |
| Function (Func) | Move cursor to next `callDepth` change in trace | Function call / return as a single unit |

---

### 3.2 Visualization Views

#### V-01: Call Stack View (CallStackView) ✅

**Tab label**: Call Stack

- Call Stack panel: frames from `mergeScopesForDisplay()`. A "Global" frame is always shown first (even when the call stack is empty), followed by call frames (innermost-first, with labels like `factorial(6)`; the innermost frame is highlighted)
- Changed variables flash

> The former "State" tab's Current Step card (phase/nodeType/line/value) and Variables card (redundant with the Call Stack's innermost frame) were removed per [ADR-026](../docs/adr/ADR-026-callstack-view-simplification.md).
> **Console output is in the always-visible panel** at the bottom of the right pane (see F-14).

**Input**: `state.event`, `state.scopes`, `state.callStack`, `state.frameEnvs`

---

#### V-02: Variable (Variable, formerly class LineTrace) ✅

**Tab label**: Variable

- **Single-pane layout**: line-number column + variable matrix table
  - Line-number column shows the line number and a 15-character snippet of source
- Rows = source lines (all lines shown statically); columns = variable names (dynamic, added as variables appear)
- Each cell shows the variable's value at the **last execution of that line**
- Changed cells flash orange when the cursor advances
- **Diff highlighting**: for the active row (`lt-row--active`), changed values are highlighted orange-bold via `formatValueDiff()` (arrays/objects highlighted element-by-element)
- Functions and class values are not shown in columns
- Current line is highlighted and scrolled into view
- **Column visibility**: toolbar buttons above the table toggle each variable column on/off
- **Column reordering**: drag `<th>` elements to reorder columns

**Input**: `builder.getHumanStepList()`, `builder.trace`, `builder.source`, `state.cursor`, `state.event`

---

#### V-02b: Execution Trace Table (ExecTrace) ✅

**Tab label**: Exec Trace

- Rows = one per humanStep, in execution order
- All humanStep rows rendered at `init()` time
- `update()` only moves the highlight row and calls `scrollIntoView()` — O(n)
- Columns: # | Line | Code (first 30 chars) | Variable columns (in appearance order) | Condition columns (in appearance order)
  - **Variable columns**: values via `flattenEnv`; diff-highlighted orange-bold via `formatValueDiff()` at `init()` time
  - **Condition columns**: while/for condition values shown per iteration (both `true` and final `false`)

**Input**: `builder.getHumanStepList()`, `builder.trace`, `builder.source`, `state.cursor`

---

#### V-02c: Substitution Trace (SubstTrace) ✅

**Tab label**: Subst

- Shows recursive function calls as a **substitution-model** expansion
- Starts from the first user-defined function call (e.g., `factorial(5)`)
- Each `ReturnStatement` replaces the call string with the evaluated return expression, adding a new row
- The final row shows the top-level call's resolved value (e.g., `→ 120`)
- **Two highlights**:
  - `.stx-hl-expanded` (orange background): the part just replaced
  - `.stx-hl-pending` (blue bold): the next call to be substituted
- `update()` attaches `.stx-line--active` to the latest row ≤ cursor; past rows get `.stx-line--past`

**Input**: `builder.trace`, `builder.source`

---

#### V-02d: Expression Trace (ExprTrace) ✅

**Tab label**: Expr

- Shows the evaluation of a single statement's expression as a sequence of partial substitutions converging to the final value
- Each section is visible while `cursor >= enterIdx && cursor <= exitIdx`
- Variable columns show only identifiers that appear in the expression text (functions excluded)
- **Two highlights**:
  - `.xev-hl-expanded` (orange background): the part just substituted
  - `.xev-hl-pending` (blue bold): the next sub-expression to be evaluated
- `update()` marks the latest row ≤ cursor as active and **rewrites that row's variable cells in real time** from `trace[cursor].env`

**Supported statement types**: `ExpressionStatement`, `VariableDeclaration` (init), `IfStatement` test, `WhileStatement` test (per iteration), `ReturnStatement` argument, `ForStatement` init/test (per iteration)/update (per iteration)

**Input**: `builder.trace`, `builder.source`

---

#### V-03: All Steps Table (TraceTable) ✅ (tab inactive)

**Tab label**: All Steps (currently unregistered)

- All humanSteps rendered at `init()` time
- `update()` only moves the highlight row and scrolls into view — O(1)
- Columns: # | Line | Event | **Target** | Value
  - **Target**: variable name (for assignments), `funcName(args)` (for calls), `"return"` (for return statements)

**Input**: `builder.getHumanStepList()`, `builder.trace`

---

#### V-04: Scope View (ScopeView) ✅ (inactive — not registered as a tab)

- Scope chain shown as nested boxes
- Innermost frame (currently executing scope) highlighted with accent border
- Changed variables flash

---

#### V-05: Call Stack View (CallStackView) ✅ (inactive — not registered as a tab)

- Stack frames shown as stacked cards
- Cards slide in on function call; top frame highlighted with accent color

---

#### V-06: Bar Chart (BarChart) ✅ (tab inactive)

**Tab label**: Bar Chart (currently unregistered)

- Numeric variables and numeric arrays shown as vertical bar charts
- Value changes animated as bar-height CSS transitions
- Variable selection chips (arrays selected by default; multi-select enabled)
- Bar color gradient from blue (small) to red (large) based on ratio to max value
- "Step forward to see the bar chart" guide shown at initial step (before any variables exist)
- **Tab grayed out** if the trace contains no numeric variables or numeric arrays

**Input**: `state.event.env`, `state.cursor`, `builder.trace`

---

#### V-07: Array Visualization (Arrays, formerly class ColorBox) ✅

**Tab label**: Arrays

- Multiple arrays displayed simultaneously; blocks wrap when the area is too narrow (`flex-wrap: wrap`)
- Each array block has a label, border, and background color (`.cb-array-block`)
- Box color gradient from blue to red based on value magnitude
- Variable selection chips (multi-select; last selection cannot be deselected)
- Pointer detection: integer variables in `[0, arr.length)` range are auto-detected and their target box is highlighted; each pointer variable appears in its own row
- String values shown without truncation
- **Pre-computed max size**: `#scanTrace()` determines `maxWidth` and `maxGridHeight` per array so blocks don't shift between steps
- **Tab grayed out** if the trace contains no array variables

**Input**: `state.event.env`, `state.cursor`, `builder.trace`

---

#### V-08: Variable Timeline (Timeline) ✅ (tab inactive)

**Tab label**: Timeline (currently unregistered)

- All humanSteps scanned at `init()` to build each variable's value history
- X-axis = humanStep index; Y-axis = variable value
- Multiple variables shown as color-coded SVG line charts
- Y-axis min/max recalculates dynamically when variable chip selection changes
- `update()` only moves the cursor vertical line — O(log n) binary search

**Input**: `builder.getHumanStepList()`, `builder.trace`

---

#### V-09: Execution Frequency Heatmap (Heatmap) ✅

**Tab label**: Heatmap

- Source lines shown with execution count as `"N / M times"` format + orange background intensity, updated per step
- **Timeline dots**: each line's execution moments shown as dots in a fixed-width track (360px); past dots highlighted in accent color, future dots in gray
- **Connector lines**: SVG lines between consecutive-humanStep dots that transition to different lines — always visible (no toggle)
- `update()` updates background color, count text, and dot states for all lines

**Input**: `builder.source`, `builder.buildHeatmap()`, `builder.getHumanStepList()`, `builder.trace`, `state.event`, `state.cursor`

---

#### V-10: Recursion Tree (RecursionTree) ✅ (inactive)

Reference implementation rendering `buildRecursionTree()` (recursive calls only, with cost) as an SVG tree. Per [ADR-027](adr/ADR-027-calltree-recursiontree-merge.md), V-10b Call Tree below now unifies node display and cost, so this view has been removed from tab registration (code kept at `src/views/recursion-tree/`).

**Input**: `builder.buildRecursionTree()`, `state.cursor`

---

#### V-10b: Call Tree (CallTree) ✅

**Tab label**: Call Tree

- All function calls — not just recursive ones — shown as an SVG tree
- Node display unified with RecursionTree ([ADR-027](adr/ADR-027-calltree-recursiontree-merge.md)): function name (line 1), args (`fmtArgsLines()`, up to 2 lines), return value, and cost (`cost:N`, bottom-left)
- Node colors and icons: not-yet-called (gray, dashed, "…") / executing (blue, thick border, "▶") / completed (green, "✓")
- Layout: recursive subtree-width calculation (leaf = NODE_W=160; parent = sum of children + gap); NODE_H=80
- `update()` only swaps node CSS classes
- **Tab grayed out** if the trace contains no function calls

**Input**: `builder.buildCallTree()`, `state.cursor`

---

#### V-11: Variable Lifetime (Lifetime) ✅

**Tab label**: Lifetime

- X-axis = humanStep index; Y-axis = call depth — a Gantt-style flame chart (SVG)
- Each bar shows the function name with arguments and local variable values
- Bar width is computed dynamically to accommodate labels without truncation, capped at 3× the minimum chart width
- Bar color coded by `callDepth` (different colors for different nesting depths)
- `update()` only moves the cursor vertical line

**Input**: `builder.getHumanStepList()`, `builder.trace`, `state.cursor`

---

#### V-12: Control Flow (ControlFlow) ✅

**Tab label**: Control Flow

- Nodes = executed source lines (in first-seen order, arranged vertically)
- Forward edges (right, blue); back edges / loop returns (left, orange dashed)
- Node background color intensity = execution count
- Current node highlighted with accent border
- **Color-blindness support**: back edges (loop returns) shown as dashed orange lines (`stroke-dasharray: 6 3`)

**Input**: `builder.buildControlFlow()`, `state.event`

---

#### V-13: Memory Model (MemoryView) ✅

**Tab label**: Memory

- Left column: stack (scope frames and primitive variables)
- Right column: heap (objects and arrays in `#N` ID boxes)
- SVG overlay: Bézier-curve arrows from reference cells to heap objects
- `WeakMap` tracks object identity to prevent duplicate heap nodes
- Changed variable rows highlighted in yellow
- Arrows recalculated via `getBoundingClientRect()` after `requestAnimationFrame`

**Input**: `state.scopes`, `state.callStack`, `state.changedVars`, `state.frameEnvs`

---

#### V-14: Object Graph (ObjectGraph) ✅

**Tab label**: Objects

- Nodes = objects and arrays (up to 6 levels deep, cycle detection via `WeakMap`)
- Edges = property references to other objects (label = property name)
- Variable name labels shown above root nodes
- Primitive variables listed in the top-left corner
- **Layout**: hierarchical (Kahn topological sort + longest-path column assignment; edges flow left→right)
- **Edges**: elbow connectors (`M x1,y1 H mx V y2 H x2`); port spread distributes multiple edges from the same node vertically
- **Connected-component separation**: undirected BFS detects components; each component laid out independently and stacked vertically; dashed boundary rect drawn when ≥2 components
- **Node colors**: 6-color palette (`--og-bg-0` through `--og-bg-5`) by node index
- **Tab grayed out** if the trace contains no heap objects

**Input**: `state.variables`, `state.scopes`

---

### 3.3 Common UI Features

#### F-10: Code Highlighting (shared by all views)

Three highlight layers are simultaneously rendered over the code panel:

| Layer | Color | Condition | Description |
|-------|-------|-----------|-------------|
| 1. Line highlight | 🟦 Blue (left border + background) | Always | The entire line at `event.loc.line` |
| 2. Expression highlight | 🟧 Orange (semi-transparent) | When `event.loc` and `event.end` both exist | Character range of the expression being evaluated |
| 3. Call-site highlight | 🟣 Purple (dashed underline) | When `callStack.length > 0` | The CallExpression that invoked the currently executing function |

Expression and call-site highlights use `position: absolute; calc(N * 1ch)` for monospace-accurate character-level placement.

#### F-11: View Tab Switching

- Tabs at the top of the right pane switch the active view
- On tab switch: `destroy()` the previous view, then `init()` the new one
- On each run (`adapter.load()` → `adapter.moveTo(0)` → `'ready'` event): the view is remounted with the latest `TraceBuilder`
- Keyboard shortcuts `1`–`9` switch to the Nth registered tab (suppressed when `<textarea>`/`<input>` is focused)
- Active tab saved to `localStorage('jsv-active-tab')` and restored on next launch
- **Tab grayout**: tabs whose view would show nothing for the entire run are grayed out (`opacity: 0.38`) via `static hasContent(builder)` — checked once per run without mounting the view

#### F-12: Theme Switching

| Item | Specification |
|------|---------------|
| Default | Light theme (Catppuccin Latte base) |
| How to switch | Header ⚙ button → Settings panel radio buttons |
| Choices | ☀️ Light / 🌙 Dark |
| Persistence | Saved to `localStorage('jsv-theme')` |
| FOUC prevention | Inline script in `<head>` applies dark theme before CSS loads |

#### F-15: Language Switching (i18n)

| Item | Specification |
|------|---------------|
| Languages | Japanese (`ja`) and English (`en`) |
| How to switch | Click the **EN** / **日** button (`btn-lang`) in the top-right of the header |
| Scope | Button labels, tab names, view descriptions, console title, settings panel text (~46 items) |
| Not localized | Error messages (from JSInterpreter), sample program names |
| Implementation | Static HTML uses `data-i18n="key"` attributes, batch-updated by `applyI18n()`. Tab labels and descriptions are passed as `{ ja: '...', en: '...' }` objects and re-rendered by `ViewSwitcher.setLang()` |
| Persistence | `localStorage('jsv-lang')` (default `'ja'`) |
| Event flow | `setLang()` → `dispatchEvent('langchange')` → `applyI18n()` + `switcher.setLang()` |

#### F-13: Error Badge Display

Syntax errors and runtime errors are visually distinguished below the editor.

| Error type | Detection | Badge label |
|------------|-----------|-------------|
| Syntax error | `err instanceof SyntaxError`, `err.name === 'SyntaxError'`, message matches `/^\[Parser\]/i` or `Unexpected token`, etc. | "Syntax Error" (red badge) |
| Runtime error | All other runtime exceptions | "Runtime Error" (orange badge) |

When the error includes location information (line/column), the CodeMirror cursor moves to that position and the active line blinks with a red animation (3 flashes).

#### F-14: Always-Visible Console Panel

A fixed panel at the bottom of the right pane, always visible regardless of which tab is selected.

| Item | Specification |
|------|---------------|
| Position | Fixed below the view container (default height 110px; drag top edge to resize between 40–400px; saved to `localStorage('jsv-console-h')`) |
| Content | `console.log` / `console.warn` / `console.error` output lines with log-count badge |
| Update | Updated on every `adapter.ready` and `adapter.step` event |
| Styling | `warn` → orange row; `error` → red row |

---

## 4. Non-Functional Requirements

### 4.1 Performance

| Metric | Target |
|--------|--------|
| `new JSDebugger(source)` completion (≤100-line program) | Within 500 ms |
| UI update per step operation | Within 50 ms |
| Maximum trace length | 100,000 steps |
| `TraceBuilder` aggregation method (first call) | Should not be perceptible during view `init()` |

### 4.2 Compatibility

- Chrome / Firefox / Safari (latest versions)
- Mobile browsers not in scope (responsive layout to be considered in a later phase)

### 4.3 Accessibility

- All step operations (8 directions + first/last) and tab switching (`1`–`9`) must be keyboard-operable
- State must be communicated via shape, text, and pattern — not color alone
  - CallTree: dashed border (not-yet-called), thick border (executing), icons (…/▶/✓)
  - ControlFlow: back edges shown as dashed lines
- Both light and dark themes must maintain sufficient contrast ratios
- SVG views should carry `role="img"` and `aria-label`

### 4.4 Maintainability

- Each view must implement the `init / update / reset / destroy` common interface
- Adding or removing a view must not require modifying the app core (only `ViewSwitcher.register()`)
- `TraceBuilder` aggregation methods must be idempotent and cached (same result each call)

### 4.5 Deployment / CI

| Item | Specification |
|------|---------------|
| Hosting | GitHub Pages (`https://tntetsu.github.io/JSVisualizer/`) |
| Deploy trigger | Push to `main` branch or manual `workflow_dispatch` |
| CI pipeline | ① Clone JSInterpreter → ② `npm ci` → ③ `npm test` (71 tests) → ④ `npm run build` → ⑤ Upload to GitHub Pages |
| Build artifacts | `web/` directory (`app.bundle.js` / `interpreter.bundle.js` / `index.html` / `style.css`) |
| Concurrency | `concurrency: pages` limits to one active deploy at a time (cancels previous) |

---

## 5. Glossary

| Term | Definition |
|------|------------|
| TraceEvent | Information for one step of program execution: which line/column, what statement/expression ran, and what value was resolved |
| cursor | Integer index into the `trace` array indicating the current position |
| humanStep | A "meaningful change point" a human would record when tracing on paper: assignments, condition tests, loop updates, function calls, etc. |
| humanStep index (hi) | Subscript into the array returned by `getHumanStepList()` (0-based); used as the X-axis in the Lifetime chart |
| snapshot | A copy of variables, scopes, and call stack at a given step |
| diff / changedVars | The set of variable names that changed between two consecutive snapshots |
| omniscient debugging | A debugging approach where the program runs to completion first and all steps are recorded, allowing navigation to any step afterward |
| expression highlight | Highlighting the character range of the expression being evaluated in orange (semi-transparent) |
| call-site highlight | While inside a function, highlighting the call expression that invoked it in purple |
| FOUC | Flash of Unstyled Content — a momentary flash of default styles on page load; prevented by an inline script in `<head>` |
| jsv-theme | `localStorage` key that persists the theme setting; value `"dark"` applies the dark theme |
| jsv-active-tab | `localStorage` key that persists the active tab; value is the view's registration ID string |
| jsv-editor-pct | `localStorage` key that persists the editor pane width (%); managed by `PaneResizer`; clamped to 15–75 |
| jsv-console-h | `localStorage` key that persists the console panel height (px); managed by `app.js`; clamped to 40–400 |
| error badge | A small label that visually identifies the error type — either "Syntax Error" or "Runtime Error" |
| jsv-lang | `localStorage` key that persists the display language; value is `'ja'` (Japanese) or `'en'` (English); defaults to `'ja'` |
