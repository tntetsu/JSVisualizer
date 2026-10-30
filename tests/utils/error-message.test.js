/**
 * error-message.test.js — エラーメッセージの英語化（localizeErrorMessage）と言語の自動判定（detectLang）のテスト（ADR-046）
 *
 * JSInterpreter のメッセージは日本語で作られ、JSVisualizer が英語表示のときに英訳する。
 * JSInterpreter 側でメッセージが増えたり変わったりしたときに英訳の漏れに気づけるよう、
 * JSInterpreter のソースから日本語のメッセージを集めて、すべて英訳されることを確かめる。
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDebugger } from '../../../JSInterpreter/src/interpreter/debugger.js';
import { localizeErrorMessage } from '../../src/utils/error-message.js';
import { detectLang } from '../../src/i18n.js';

const JAPANESE = /[぀-ヿ一-鿿]/;

/** JSDebugger で実行し、投げられたエラーのメッセージを返す（app と同じく err.message を使う） */
function errorMessageOf(code) {
  try {
    new JSDebugger(code, { maxSteps: 10_000 });
  } catch (err) {
    return err.message;
  }
  throw new Error(`エラーにならなかった: ${code}`);
}

describe('localizeErrorMessage', () => {
  test('日本語表示ではそのまま返す', () => {
    const msg = "[Runtime] 5:13: 未定義の変数: 'i'";
    expect(localizeErrorMessage(msg, 'ja')).toBe(msg);
  });

  test('位置付きの前置きを残して本文を英訳する', () => {
    expect(localizeErrorMessage("[Runtime] 5:13: 未定義の変数: 'i'", 'en'))
      .toBe("[Runtime] 5:13: 'i' is not defined");
    expect(localizeErrorMessage("[Parser] 2:7: ';' を期待しましたが 'x' がありました", 'en'))
      .toBe("[Parser] 2:7: Expected ';' but found 'x'");
    expect(localizeErrorMessage("[Parser] 1:9: '(' を期待", 'en'))
      .toBe("[Parser] 1:9: Expected '('");
  });

  test('位置のない前置き・前置きのないメッセージも英訳する', () => {
    expect(localizeErrorMessage("[Runtime] 識別子 'x' はすでに宣言されています", 'en'))
      .toBe("[Runtime] Identifier 'x' has already been declared");
    expect(localizeErrorMessage('実行が最大ステップ数 200,000 を超えたため停止しました', 'en'))
      .toBe('Execution stopped because it exceeded the maximum of 200,000 steps');
    expect(localizeErrorMessage('コードが見つからないか非公開です', 'en'))
      .toBe('The code was not found or is not public');
  });

  test('知らない文型（利用者が throw したメッセージなど）はそのまま返す', () => {
    expect(localizeErrorMessage('[Runtime] 3:1: 自分で投げたエラー', 'en')).toBe('[Runtime] 3:1: 自分で投げたエラー');
    expect(localizeErrorMessage('Maximum call stack size exceeded', 'en')).toBe('Maximum call stack size exceeded');
  });

  test.each([
    ['let sum = 0;\nfor (let i = 1; i <= 5; i++) {\n  sum = sum + i;\n}\nconsole.log(i);\n', "[Runtime] 5:13: 'i' is not defined"],
    ['const a = 1;\na = 2;\n',              "Cannot assign to 'a' because it is a constant"],
    ['console.log(x);\nlet x = 1;\n',       "Cannot access 'x' before initialization"],
    ['let o = null;\no.p;\n',               'Cannot read properties of null or undefined'],
    ['let s = "abc;\n',                     'Unterminated string literal'],
    ['if (true {\n}\n',                     "Expected ')'"],
    ['while (true) {}\n',                   'Execution stopped because it exceeded the maximum of 10,000 steps'],
  ])('実際のエラーを英訳する: %j', (code, expected) => {
    const en = localizeErrorMessage(errorMessageOf(code), 'en');
    expect(en).toContain(expected);
    expect(en).not.toMatch(JAPANESE);
  });
});

describe('JSInterpreter のメッセージがすべて英訳される', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../JSInterpreter/src');

  /** ソースから、エラーを作る行・consume() の行にある日本語の文字列リテラルを集める（${...} は x に置き換える） */
  function collectMessages() {
    const files = fs.readdirSync(root, { recursive: true })
      .filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
    const messages = new Set();
    for (const f of files) {
      for (const line of fs.readFileSync(path.join(root, f), 'utf8').split('\n')) {
        if (/^\s*(\/\/|\*)/.test(line) || !/Error\(|consume\(/.test(line)) continue;
        for (const [, lit] of line.matchAll(/(`[^`]*`|'[^']*'|"[^"]*")/g)) {
          const text = lit.slice(1, -1).replace(/\$\{[^}]*\}/g, 'x').replace(/\\\\/g, '\\');
          if (JAPANESE.test(text)) messages.add(text);
        }
      }
    }
    return [...messages];
  }

  const messages = collectMessages();

  test('メッセージを集められている', () => {
    expect(messages.length).toBeGreaterThan(30);
  });

  test.each(messages)('%s', (msg) => {
    const en = localizeErrorMessage(`[Runtime] 1:1: ${msg}`, 'en');
    expect(en).not.toMatch(JAPANESE);
  });
});

describe('detectLang', () => {
  test.each([
    [['ja'], 'ja'],
    [['ja-JP', 'en-US'], 'ja'],
    [['en-US', 'ja'], 'en'],
    [['fr-FR'], 'en'],
    [['zh-CN'], 'en'],
    [[], 'ja'],
    [[undefined], 'ja'],
    [undefined, 'ja'],
  ])('%j → %s', (languages, expected) => {
    expect(detectLang(languages)).toBe(expected);
  });
});
