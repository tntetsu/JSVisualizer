# JSVisualizer

> 🚀 **[Live Demo](https://tntetsu.github.io/JSVisualizer/)** — Hosted on GitHub Pages

> [日本語版 README はこちら](README.md)

An interactive, educational web application that visualizes JavaScript program execution step by step.

Step through your code at four levels of granularity and watch the program's behavior unfold across **12 visualization views**.

![JSVisualizer demo](img/demo.gif)

---

## Features

### Step Granularity (8-direction button grid)

The footer contains a 2-row × 4-column grid offering 4 granularities × forward/back = 8 step operations.

```
⏮  │  ◀◀Stmt  ◀Expr  ▶Expr  ▶▶Stmt  │  ⏭  ── slider ── counter
   │  ⏪Func   ◁Human ▷Human  ⏩Func  │
```

| Granularity | Buttons | Keyboard | Description |
|-------------|---------|----------|-------------|
| **Expr** | ◀Expr / ▶Expr | `b`/`←`, `n`/`→` | Every AST node evaluation (finest) |
| **Stmt** | ◀◀Stmt / ▶▶Stmt | `V` / `v` | Statement-level (skips sub-expressions) |
| **Human** | ◁Human / ▷Human | `H` / `h` | Meaningful change points: assignments, condition tests, loop updates |
| **Func** | ⏪Func / ⏩Func | `F` / `f` | Function call / return as a single unit |

Other: `Home` → first step, `End` → last step, `1`–`9` → switch tabs

### Code Highlighting (3 layers)

The code panel simultaneously displays three highlight layers:

| Layer | Color | Meaning |
|-------|-------|---------|
| Line highlight | 🟦 Blue (left border + background) | Currently executing line |
| Expression highlight | 🟧 Orange (semi-transparent) | Character range of the expression being evaluated |
| Call-site highlight | 🟣 Purple (dashed underline) | While inside a function, highlights the call expression that invoked it |

### Visualization Views (12 tabs)

| Category | Tab | Description |
|----------|-----|-------------|
| **Basic** | Call Stack | Global + per-call-frame variable panel. Innermost frame first, labels like `factorial(6)` |
| **Trace** | Variable | Row-per-line variable matrix. Source snippet in line column. Changed values highlighted in orange-bold. Column show/hide & drag-to-reorder |
| | Exec Trace | All humanStep events in execution order. Variable columns + condition columns. while/for condition values shown per iteration |
| | Subst | Recursive calls shown as substitution-model expansion. Each `return` expression replaced step by step, with expansion (orange) and pending (blue-bold) highlights |
| | Expr | Sub-expression evaluation: one statement's expression is progressively substituted toward its final value. Two-color highlights. Variable values updated in real time |
| **Graph** | Arrays | Multiple arrays displayed as color-coded indexed boxes. Pointer variables shown in individual rows. Blocks separated by border + background, wrap when too wide |
| | Heatmap | Execution count per line shown as "N/M times" + background color, updated per step. Execution timeline dots with SVG connector lines between transitions |
| **Structure** | Call Tree | All function calls (recursive and non-recursive) as SVG tree. Subtree cost (`cost:N`) shown per node |
| | Lifetime | Variable lifetime as SVG Gantt chart. |
| | Control Flow | AST-based flowchart: if/else shown as side-by-side true/false branches; loops as condition + body. Unexecuted nodes grayed out — untaken branches visible at a glance |
| | Memory | Stack (scope frames) and heap (objects/arrays) in separate columns with SVG reference arrows |
| | Objects | Object/array reference graph as SVG (hierarchical layout, connected components auto-separated, nodes color-coded by depth) |

`console.log` output always appears in the **always-visible panel** at the bottom of the right pane, regardless of which tab is selected.

### Editor Features

- **Syntax highlighting** — CodeMirror 6 with keyword/string/comment coloring (light/dark theme)
- **Pane resizer** — Drag the divider to resize the editor and visualization panes (width is saved)
- **Program name display** — Selecting a sample shows the sample name in the header

### Loading code from a URL query

Besides picking a built-in sample or pasting your own code, JSVisualizer can load code directly from a URL query string, driven by an external app (e.g. [BhvVisualizer](https://github.com/tntetsu/BhvVisualizer), or your own self-hosted static JSON). This works as a general-purpose "direct link to a specific piece of code" feature even when JSVisualizer is used standalone — it has nothing to do with the `# BHV:`-tagged logging wiring (see [ADR-031](docs/adr/ADR-031-url-based-exercise-loading.md) for the design background).

| Query parameter | Meaning |
|---|---|
| `exercise` | A **complete URL** to fetch an exercise (a set of code) from. When present, the fetched codes are added to the sample selector as a "─ Exercise ─" group |
| `code` | A **complete URL** to fetch the specific code to display. When present, that code is loaded directly into the editor |

`exercise`/`code` don't require JSVisualizer to know any ID scheme or API path convention — **the caller just passes a fetchable URL directly**. JSVisualizer fetches that URL and reads its `title`/`code` fields; it has no opinion on where the code is hosted (BhvVisualizer or anything else).

Behavior by combination:

| Params present | Behavior |
|---|---|
| `exercise` only | The exercise's codes are added to the sample selector, and **the first one is automatically loaded into the editor**. If the exercise has a title, the sample selector's placeholder (normally "─ Sample ─") is replaced with it |
| `code` only | The specified code is loaded directly into the editor |
| `exercise` + `code` | The sample selector is extended, and the editor shows the code specified by `code` (which takes priority over the automatic first-code load). The selector's placeholder still becomes the exercise title |
| Neither | Nothing happens (editor stays on the default Fibonacci sample, and the 21 built-in samples are unaffected) |

Examples:

```
# Direct link to a single piece of code
https://tntetsu.github.io/JSVisualizer/?code=https%3A%2F%2Fbhv-visualizer.web.app%2Fapi%2Fcodes%2Fabc123

# Open an exercise (first code shown automatically; others reachable via the sample selector)
https://tntetsu.github.io/JSVisualizer/?exercise=https%3A%2F%2Fbhv-visualizer.web.app%2Fapi%2Fexercises%2Fex1

# Open a specific code within an exercise
https://tntetsu.github.io/JSVisualizer/?exercise=https%3A%2F%2Fbhv-visualizer.web.app%2Fapi%2Fexercises%2Fex1&code=https%3A%2F%2Fbhv-visualizer.web.app%2Fapi%2Fcodes%2Fco2

# Point at a local development API (no dedicated bhvApiBase-style param needed — just point the URL locally)
https://tntetsu.github.io/JSVisualizer/?code=http%3A%2F%2Flocalhost%3A5000%2Fapi%2Fcodes%2Fabc123
```

`exercise`/`code` values must be URL-encoded (building them with `URLSearchParams` handles this automatically). If a URL doesn't exist or isn't public, an error message is shown in the error banner. Note that there is **no way to jump to a specific line or cursor position** — the URL query only controls which code gets loaded, not where the cursor lands.

#### Live demo

These links load static JSON files hosted at `web/samples/` in this repository (served via GitHub Pages, unrelated to BhvVisualizer). Click them to see the feature in action.

- [`code` demo (opens a single piece of code directly)](https://tntetsu.github.io/JSVisualizer/?code=https%3A%2F%2Ftntetsu.github.io%2FJSVisualizer%2Fsamples%2Fcode-demo.json)
- [`exercise` demo (adds multiple codes to the sample selector, auto-loads the first one)](https://tntetsu.github.io/JSVisualizer/?exercise=https%3A%2F%2Ftntetsu.github.io%2FJSVisualizer%2Fsamples%2Fexercise-demo.json)

The JSON files themselves ([`code-demo.json`](web/samples/code-demo.json), [`exercise-demo.json`](web/samples/exercise-demo.json)) also serve as live examples of the expected API response format.

#### Expected API response format

The URL(s) passed via `exercise`/`code` must return JSON in the following shape (this is what `src/core/exercise-source.js` reads).

```
GET <value of exercise>
  200 OK →
    {
      "title": "...",
      "codes": [
        { "title": "...", "code": "...(JavaScript source string)" },
        ...
      ]
    }
  Non-200 (404, etc.) → treated as "exercise not found / not public"

GET <value of code>
  200 OK →
    { "title": "...", "code": "...(JavaScript source string)" }
  Non-200 (404, etc.) → treated as "code not found / not public"
```

The top-level `title` on the `exercise` response is optional — if present, it's used for the sample selector's placeholder; if omitted, the placeholder stays as the default "─ Sample ─". JSVisualizer only reads these fields; anything else is ignored. Any non-200 status is treated as "not found / not public" regardless of reason, so the response body format on error doesn't matter.

Any API that responds in this shape can be used in place of BhvVisualizer — including your own self-hosted static JSON. BhvVisualizer's implementation is documented in [BhvVisualizer/docs/design.md](https://github.com/tntetsu/BhvVisualizer/blob/main/docs/design.md), section 2.4.

### Themes

Click the ⚙ button (top-right) to switch between **Light** and **Dark** themes.  
Default is Light. The setting is saved and restored on next visit.

### Language (日本語 / English)

Click the **EN / 日** button in the header to switch the display language. Button labels, tab names, descriptions, and the settings panel (about 46 items) update instantly. Default is Japanese. The setting is saved and restored on next visit (error messages and sample program names are not localized).

### Miscellaneous

- **Step-back support** — Go back to any previous step (O(1))
- **21 built-in samples** — Bubble sort, Fibonacci (recursive/DP), Class & Inheritance, Linked List, and more
- **Destructuring assignment** — Supports `[a, b] = [b, a]` swap syntax
- **Custom code** — Paste any JavaScript and run it
- **Persistent settings** — Theme, last active tab, and pane width saved to `localStorage`
- **Color-blindness friendly** — State communicated via shape, pattern, and icon — not color alone
- **Clear error display** — Syntax and runtime errors shown as distinct badges; cursor jumps to the error location with a blink animation

---

## Installation

```bash
git clone https://github.com/tntetsu/JSVisualizer.git
cd JSVisualizer
npm install
```

> JSInterpreter must exist at `../JSInterpreter`.

```bash
# If JSInterpreter is not yet cloned
cd ..
git clone https://github.com/tntetsu/JSInterpreter.git
cd JSVisualizer
```

---

## Usage

### Start the development server

```bash
npm run dev
```

Open `http://localhost:8000` in your browser. Files are automatically rebuilt on save.

### Production build

```bash
npm run build
# Output is generated under web/
```

### Tests

```bash
npm test
```

---

## Sample Programs (21 built-in)

| Category | Samples |
|----------|---------|
| **Search** | Linear Search, Binary Search |
| **Sort (basic)** | Bubble Sort, Selection Sort |
| **Sort (advanced)** | Quick Sort, Merge Sort |
| **Sort (objects)** | Sort by numeric key, Sort by string key |
| **Math / Algorithms** | Euclid GCD (loop / recursive), Factorial, Fibonacci (recursive), Fibonacci (DP) |
| **Data Structures** | Binary Tree (insert + search), Linked List |
| **Scope / Objects** | Closure, Class & Inheritance |
| **Study Tasks** | [Warm-up] Factorial (loop), [Task 1] Selection Sort (with bug), [Task 2] Fibonacci (call count), [Task 3] Bubble Sort (intermediate state) |

---

## Target Audience

- **Programming learners** — Verify your code's behavior one step at a time
- **Educators** — Show a running program during a lecture
- **Instructional designers** — Quickly generate animated trace diagrams

---

## Background & Motivation

A major cause of student difficulty in fixing bugs is a poor mental model of program execution. Static slides and paper traces fail to convey runtime behavior, and existing visualization tools (Algorithm Visualizer, Python Tutor, etc.) require special annotations or have limited display options.

JSVisualizer embeds a **general-purpose JavaScript interpreter**, so any code can be pasted and visualized immediately with rich, multi-view output.

---

## Tech Stack

| Item | Technology |
|------|------------|
| Core engine | [JSInterpreter](../JSInterpreter) (custom JS interpreter) |
| Frontend | Vanilla JS (ES2022+) + HTML + CSS |
| Build tool | esbuild |
| Tests | Jest (71 tests) |
| Code editor | CodeMirror 6 |
| Visualization | DOM + CSS animations + hand-crafted SVG |
| Themes | CSS custom properties (Catppuccin Latte / Catppuccin Mocha) |
| CI/CD | GitHub Actions → GitHub Pages |

---

## Documentation

- [Functional Specification](docs/functional-spec.en.md)
- [Design Document](docs/design.md) *(Japanese)*
- [Development Plan](docs/development-plan.md) *(Japanese)*

---

## License

MIT
