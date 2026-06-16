# JSVisualizer

> 🚀 **[Live Demo](https://tntetsu.github.io/JSVisualizer/)** — Hosted on GitHub Pages

> [日本語版 README はこちら](README.md)

An interactive, educational web application that visualizes JavaScript program execution step by step.

Step through your code at four levels of granularity and watch the program's behavior unfold across **16 visualization views**.

---

## Screenshots

*(coming soon)*

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

### Visualization Views (16 tabs)

| Category | Tab | Description |
|----------|-----|-------------|
| **Basic** | State | Variables + call stack panel. Innermost frame first, labels like `factorial(6)` |
| **Trace** | Trace | Row-per-line variable matrix. Source snippet in line column. Changed values highlighted in orange-bold. Column show/hide & drag-to-reorder |
| | Exec Trace | All humanStep events in execution order. Variable columns + condition columns. while/for condition values shown per iteration |
| | Subst | Recursive calls shown as substitution-model expansion. Each `return` expression replaced step by step, with expansion (orange) and pending (blue-bold) highlights |
| | Expr | Sub-expression evaluation: one statement's expression is progressively substituted toward its final value. Two-color highlights. Variable values updated in real time |
| | All Steps | All humanSteps listed. "Target" column shows variable name, function name, or `return` |
| **Graph** | Bar Chart | Numeric variable / array changes as animated bar chart (CSS transition) |
| | Arrays | Multiple arrays displayed as color-coded indexed boxes. Pointer variables shown in individual rows. Blocks separated by border + background, wrap when too wide |
| | Timeline | Variable value history as SVG line chart. Y-axis rescales dynamically on chip selection |
| | Heatmap | Execution count per line shown as "N/M times" + background color, updated per step. Execution timeline dots with SVG connector lines between transitions |
| **Structure** | Rec. Tree | **Recursive calls only** rendered as SVG tree. Subtree cost (`cost:N`) shown per node |
| | Call Tree | All function calls (recursive and non-recursive) as SVG tree |
| | Lifetime | Variable lifetime as SVG Gantt chart (flame graph). Bars show function name + args |
| | Control Flow | Executed source lines as SVG flowchart. Back-edges (loops) shown as orange dashed arrows |
| | Memory | Stack (scope frames) and heap (objects/arrays) in separate columns with SVG reference arrows |
| | Objects | Object/array reference graph as SVG (hierarchical layout, connected components auto-separated, nodes color-coded by depth) |

`console.log` output always appears in the **always-visible panel** at the bottom of the right pane, regardless of which tab is selected.

### Editor Features

- **Syntax highlighting** — CodeMirror 6 with keyword/string/comment coloring (light/dark theme)
- **Pane resizer** — Drag the divider to resize the editor and visualization panes (width is saved)
- **Program name display** — Selecting a sample shows the sample name in the header

### Themes

Click the ⚙ button (top-right) to switch between **Light** and **Dark** themes.  
Default is Light. The setting is saved and restored on next visit.

### Miscellaneous

- **Step-back support** — Go back to any previous step (O(1))
- **17 built-in samples** — Bubble sort, Fibonacci (recursive/DP), Class & Inheritance, Linked List, and more
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

## Sample Programs (17 built-in)

| Category | Samples |
|----------|---------|
| **Search** | Linear Search, Binary Search |
| **Sort (basic)** | Bubble Sort, Selection Sort |
| **Sort (advanced)** | Quick Sort, Merge Sort |
| **Sort (objects)** | Sort by numeric key, Sort by string key |
| **Math / Algorithms** | Euclid GCD (loop / recursive), Factorial, Fibonacci (recursive), Fibonacci (DP) |
| **Data Structures** | Binary Tree (insert + search), Linked List |
| **Scope / Objects** | Closure, Class & Inheritance |

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
| Tests | Jest (66 tests) |
| Code editor | CodeMirror 6 |
| Visualization | DOM + CSS animations + hand-crafted SVG |
| Themes | CSS custom properties (VS Code Light Modern / Catppuccin Mocha) |
| CI/CD | GitHub Actions → GitHub Pages |

---

## Documentation

- [Functional Specification](docs/functional-spec.en.md)
- [Design Document](docs/design.md) *(Japanese)*
- [Development Plan](docs/development-plan.md) *(Japanese)*

---

## License

MIT
