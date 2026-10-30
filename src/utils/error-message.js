/**
 * error-message.js — エラーメッセージの英語化（ADR-046）
 *
 * JSInterpreter（../JSInterpreter）のエラーメッセージと、URL クエリで読み込むときのエラーメッセージは
 * 日本語で作られる。英語表示のときは、ここで既知の文型を英語に置き換える。
 *
 * - 先頭の "[Parser] 5:10: " / "[Lexer] 3:2: " / "[Runtime] 7:4: " は残し、本文だけを置き換える
 * - 文型が見つからない本文（利用者が throw したメッセージなど）はそのまま返す
 * - JSInterpreter 側のメッセージを増やしたら、ここにも文型を足す
 *   （tests/utils/error-message.test.js が JSInterpreter のソースから日本語のメッセージを集めて、漏れを検出する）
 */

/** @type {Array<[RegExp, (...groups: string[]) => string]>} 本文全体に一致させる文型と英訳 */
const PATTERNS = [
  // ── 字句解析（Lexer） ──
  [/^予期しない文字: (.*)$/s,                    (c) => `Unexpected character: ${c}`],
  [/^ブロックコメントが閉じられていません$/,       () => 'Unterminated block comment'],
  [/^文字列リテラルが閉じられていません$/,         () => 'Unterminated string literal'],
  [/^8進数エスケープシーケンス.*$/s,              () => 'Octal escape sequences (such as \\01) are not allowed. Use \\x01 or \\u0001 instead'],
  [/^unicode エスケープが閉じられていません$/,     () => 'Unterminated unicode escape'],
  [/^無効なエスケープシーケンス$/,                () => 'Invalid escape sequence'],
  [/^テンプレートリテラルが閉じられていません$/,   () => 'Unterminated template literal'],
  [/^不正な数値リテラルです$/,                    () => 'Invalid numeric literal'],

  // ── 構文解析（Parser） ──
  [/^'(.*)' を期待しましたが '(.*)' がありました$/s, (want, got) => `Expected '${want}' but found '${got}'`],
  [/^'(.*)' を期待$/s,                            (want) => `Expected '${want}'`],
  [/^識別子を期待$/,                              () => 'Expected an identifier'],
  [/^throw 直後に改行は使えません$/,               () => "A line break is not allowed after 'throw'"],
  [/^catch か finally が必要です$/,               () => "'try' requires 'catch' or 'finally'"],
  [/^予期しないトークン: '(.*)'$/s,                (tok) => `Unexpected token: '${tok}'`],

  // ── 実行（Runtime） ──
  [/^(?:\[MaxSteps\]\s*)?実行が最大ステップ数 (.*) を超えたため停止しました$/s,
                                                  (n) => `Execution stopped because it exceeded the maximum of ${n} steps`],
  [/^Promise は保留中です（非同期 I\/O は未対応）$/, () => 'The Promise is still pending (asynchronous I/O is not supported)'],
  [/^ネイティブ Promise の await は未対応（同期実行のみサポート）$/,
                                                  () => 'await on a native Promise is not supported (only synchronous execution is supported)'],
  [/^識別子 '(.*)' はすでに宣言されています$/s,     (name) => `Identifier '${name}' has already been declared`],
  [/^変数 '(.*)' は初期化前にはアクセスできません$/s, (name) => `Cannot access '${name}' before initialization`],
  [/^未定義の変数: '(.*)'$/s,                      (name) => `'${name}' is not defined`],
  [/^未定義の変数への代入: '(.*)'$/s,              (name) => `Cannot assign to undefined variable '${name}'`],
  [/^代入できません: '(.*)' は const です$/s,      (name) => `Cannot assign to '${name}' because it is a constant`],
  [/^代入先が不正です$/,                          () => 'Invalid assignment target'],
  [/^null\/undefined のプロパティアクセス$/,       () => 'Cannot read properties of null or undefined'],
  [/^呼び出し不能な値: (.*)$/s,                    (v) => `Value is not callable: ${v}`],
  [/^呼び出し不能な値です$/,                      () => 'Value is not callable'],
  [/^クラスは new で呼び出してください$/,          () => "A class constructor must be called with 'new'"],
  [/^new の対象が関数またはクラスではありません$/,  () => "The target of 'new' is not a function or class"],
  [/^不明な論理演算子: (.*)$/s,                    (op) => `Unknown logical operator: ${op}`],
  [/^不明な単項演算子: (.*)$/s,                    (op) => `Unknown unary operator: ${op}`],
  [/^不明な演算子: (.*)$/s,                        (op) => `Unknown operator: ${op}`],
  [/^未対応のノード型: (.*)$/s,                    (type) => `Unsupported syntax (node type: ${type})`],
  [/^未対応のパターン型: (.*)$/s,                  (type) => `Unsupported pattern (type: ${type})`],

  // ── URL クエリでの読み込み（src/core/exercise-source.js） ──
  [/^演習が見つからないか非公開です$/,             () => 'The exercise was not found or is not public'],
  [/^コードが見つからないか非公開です$/,           () => 'The code was not found or is not public'],
  [/^コードの読み込みに失敗しました（ネットワークエラー）$/,
                                                  () => 'Failed to load the code (network error)'],
];

/** 先頭の "[Parser] 5:10: " などの前置き（位置は無いこともある） */
const PREFIX_RE = /^(\[(?:Parser|Lexer|Runtime)\]\s+(?:\d+:\d+:\s+)?)/;

/**
 * エラーメッセージを表示言語に合わせる。日本語表示のときは何もしない。
 * @param {string} message
 * @param {'ja'|'en'} lang
 * @returns {string}
 */
export function localizeErrorMessage(message, lang) {
  if (lang !== 'en' || typeof message !== 'string') return message;
  const prefix = message.match(PREFIX_RE)?.[1] ?? '';
  const body   = message.slice(prefix.length);
  for (const [re, toEnglish] of PATTERNS) {
    const m = body.match(re);
    if (m) return prefix + toEnglish(...m.slice(1));
  }
  return message;
}
