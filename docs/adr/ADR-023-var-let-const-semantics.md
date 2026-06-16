# ADR-023: var/let/const スコープセマンティクスの正確な実装

**日付**: 2026-06-16  
**ステータス**: 採用済み  
**決定者**: Tetsuo Tanaka

---

## 背景

JSInterpreter では `var`・`let`・`const` がすべて同じ挙動（ブロックスコープ・巻き上げなし）になっていた。  
教育用ビジュアライザーとして、初学者が JS の変数スコープを正しく学べるためには ES2022 仕様への準拠が必須だった。

具体的に発覚していた問題:

| 問題 | 期待する動作 |
|------|------------|
| `var` がブロックスコープになっていた | 関数スコープ（またはグローバル）にバインドされるべき |
| `var` 巻き上げが未実装 | 宣言前アクセスが `undefined` を返すべき |
| `const` の再代入が黙って成功していた | `TypeError` を投げるべき |
| `let`/`const` の再宣言が検出されなかった | `SyntaxError`（実装上は `RuntimeError`）を投げるべき |
| TDZ エラーメッセージが汎用的だった | 「初期化前にアクセスできません」と明示するべき |
| `for (let i = 0; ...)` でクロージャが全イテレーション同一値を捕捉 | 各イテレーションが独立したバインディングを持つべき |

---

## 決定

`environment.js` と `interpreter.js` を拡張して、ES2022 仕様に準拠した変数宣言セマンティクスを実装する。

### 1. `TDZ_SENTINEL`

`const TDZ_SENTINEL = Symbol('TDZ')` を `environment.js` で定義してエクスポート。  
`let`/`const` は宣言前に `TDZ_SENTINEL` でバインディングを事前作成し、`get()` 時に検出して固有のエラーメッセージを投げる。

### 2. `Environment` の拡張

- `kind: 'block' | 'function' | 'global'` — スコープ種別
- `immutables: Set<string>` — const バインディング名のセット
- `getFunctionScope()` — 最近傍の function/global スコープを返す
- `markConst(name)` — `immutables` に追加

### 3. 巻き上げ処理

- `hoistVars(node, funcEnv)` — Program enter・callFunction 前に AST 全体を走査して `var` 宣言を `undefined` で関数スコープに事前定義
- `hoistLexicals(node, env)` — BlockStatement/Program enter 時に直接子の `let`/`const` を `TDZ_SENTINEL` でブロックスコープに事前定義

### 4. `for (let …)` イテレーション別バインディング

`forEnv`（init/test/次イテレーション値）・`iterEnv`（ボディ・クロージャ）・`updateEnv`（更新式専用コピー）の 3 環境を使い分ける。  
`updateEnv` で更新を計算し結果を `forEnv` に書き戻すことで、`iterEnv` は更新前の値のまま保持され、クロージャが正しい値を捕捉できる。

---

## 代替案

### 代替案 A: パースフェーズで変数種別をチェックする

`Parser` が `var`/`let`/`const` の種別を解析時に検証し、スコープ違反をエラーにする。

**却下理由**: パーサーはスコープ情報を持たないためブロック深さの追跡が複雑になる。インタープリターで実行時に検出するほうが既存設計との親和性が高い。

### 代替案 B: 専用の「VarEnvironment」クラスを用意する

`var` バインディング専用の環境クラスを別途用意する。

**却下理由**: `kind` フィールド＋`getFunctionScope()` で十分であり、クラス数を増やすメリットがない。

---

## 影響

- `environment.js`: `TDZ_SENTINEL`・`kind`・`immutables`・`getFunctionScope`・`markConst` を追加
- `interpreter.js`: `hoistVars`・`hoistLexicals`・`checkNoRedecl`・`markConstNames`・`getPatternNames` を追加。`ForStatement` に `iterEnv`/`updateEnv` ロジックを追加
- `debugger.test.js`: TDZ 事前定義に合わせてテストを更新（`TDZ_SENTINEL` インポート追加）
- テスト数: 187 → 249（62 件追加）

### 既知の制限（仕様との差異）

| 制限 | 詳細 |
|------|------|
| `let` 再宣言検出タイミング | 実行時（宣言行到達時）のみ。本来はパース時に検出すべき |
| 引数名と `let` 名の衝突 | `function f(x) { let x = 1; }` はエラーにならない |
| `for (let …)` の TDZ | `forEnv` には `let` 変数が TDZ 事前定義されていない |

---

## 関連 ADR

- [ADR-011](ADR-011-frameenvs-lexical-scope.md) — `frameEnvs` 生成機構（Environment 設計の前提）
