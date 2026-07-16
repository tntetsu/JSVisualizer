# ADR-024: Session Logger — 操作ログ機能の設計

## ステータス

採択済み（2026-07-16）

## コンテキスト

CELDA 2026 での発表に向けた評価実験において、参加者の操作行動を客観的に記録する必要がある。
具体的には「4段階ステップ粒度のどれを何回使ったか」「どのビューに切り替えたか」「タスクの開始・終了マーカー」などを、アンケートの主観評価を補完するエビデンスとして収集したい。

既存のコードに後付けで埋め込む形が最小侵襲であり、可視化機能本体への影響を最小限に抑える必要がある。

## 決定

`src/core/session-logger.js` にモジュールレベルのシングルトン `sessionLogger` を実装し、各操作モジュールから呼び出す方式を採用した。

### ログエントリの種類

| type | 記録内容 |
|------|---------|
| `run` | サンプル名・traceLength |
| `reset` | （なし） |
| `step` | action（粒度+方向）・cursor before/after |
| `view` | viewId |
| `marker` | label（実験者が手動入力） |

### action 名の定義

```
exprFwd / exprBack   — 式単位
stmtFwd / stmtBack   — 文単位
humanFwd / humanBack — 人間単位
callFwd / callBack   — 関数単位
goStart / goEnd      — 先頭/末尾ジャンプ
slider               — スライダードラッグ
```

### エクスポート形式

- **JSON**: `{ sessionStart, entries: [{t, type, ...}] }` の生データ
- **CSV**: `t_ms, type, action, cursor_before, cursor_after, view_id, sample_name, trace_length, label`

ファイル名は `jsv-log-YYYYMMDD-HHmmss.{json|csv}` で `Blob` + `<a>` タグによりダウンロード。

### UI

設定パネル内に Session Log セクションを追加:
- `Start Session` ボタン → セッション開始・エントリリセット
- `Marker label` テキスト入力 + `Add` ボタン → 任意マーカーを挿入
- `JSON` / `CSV` エクスポートボタン（エントリが 0 件の間は disabled）
- ステータス表示（Inactive / Recording (N entries)）

## 結果

- `step-controller.js`: 9 操作すべてで `sessionLogger.logStep()` を呼び出す
- `view-switcher.js`: `#activate()` 内で `sessionLogger.logView()` を呼び出す
- `app.js`: `resetAll()` と 'ready' ハンドラで `logReset()` / `logRun()` を呼び出す
- セッションが非アクティブの間はログエントリを一切蓄積しない（`isActive` ガード）

## 代替案

- **外部送信（サーバー側に蓄積）**: 実験環境のネットワーク依存を避けるため不採用
- **IndexedDB に永続化**: 実験終了後にエクスポートすれば十分なためオーバーキル
- **グローバル変数方式**: モジュール封止性とテスタビリティの観点からシングルトンを優先
