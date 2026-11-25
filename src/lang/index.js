/**
 * lang/index.js — 言語プロファイルの登録所
 *
 * JSVisualizer のフロントエンドは、言語ごとの違い（実行エンジン・エディタの言語・サンプル・コード表示の色分けなど）を
 * 言語プロファイルから受け取る。既定は JS（lang/javascript.js）。他の言語のアプリ（PyVisualizer など）は、
 * app.js より先に評価されるモジュールで setLanguage() を呼ぶ：
 *
 *   // register-python.js
 *   import { setLanguage } from 'js-visualizer/src/lang/index.js';
 *   setLanguage(pythonProfile);
 *
 *   // 入口
 *   import './register-python.js';   // app.js より先に評価される
 *   import 'js-visualizer/src/app.js';
 *
 * 各部品は、使うときに getLanguage() で取り出す（import した時点の値を保持しない）。
 *
 * @typedef {Object} LanguageProfile
 * @property {string}   id               'javascript' | 'python' など
 * @property {string}   name             表示名
 * @property {Function} Debugger         new Debugger(source, { maxSteps }) でトレースを作るクラス（JSInterpreter の TraceDebugger 互換）。static fromTrace() を持つ
 * @property {Function} ExecutionError   実行時エラー（部分トレースつき）のクラス
 * @property {() => any} editorExtension CodeMirror 6 の言語の拡張を返す
 * @property {Object<string, {label: string, code: string}>} samples  組み込みサンプル
 * @property {{label: string, keys: string[]}[]} sampleGroups サンプル選択の optgroup
 * @property {string}   defaultSample    起動時に表示するサンプルのキー
 * @property {{enter: string[], exit: string[]}} traceRowTypes TraceBuilder.buildHumanIndices（Exec Trace などの行）で、enter / exit で行を作るノード型
 * @property {boolean} [supportsInput] true なら、ソースペインに入力欄を出し、実行時に Debugger へ { stdin } を渡す（Python の input()）
 * @property {(message: string, lang: 'ja'|'en') => string} [localizeError]  エラーの表示欄の文字列を表示言語に合わせる。
 *   省略すると JS 用の utils/error-message.js の localizeErrorMessage（JSInterpreter のメッセージの英訳）を使う
 * @property {{classMethods?: boolean, switchCases?: boolean}} [controlFlow]  制御フローのビューの描き方（省略できる）。
 *   classMethods：クラスの中のメソッドをスコープとして描く。switchCases：switch を case ごとの分岐として描く（Java）
 * @property {(name: string, frame: object|null, callStack: object[]) => string|null} [varType]  変数の宣言の型（省略できる）。
 *   コールスタック・メモリのビューが変数名の前に表示する（Java の int x）。frame はその変数のフレーム（グローバルは null）
 * @property {{label?: string, hideEmpty?: boolean}} [globalScope]  コールスタック・メモリのビューのグローバルのスコープの
 *   見出しと、空のときに隠すか（省略できる。Java：static フィールドを置くので { label: 'static', hideEmpty: true }）
 * @property {ValueModel} valueModel  値の見せ方（ビューは utils/value-model.js の vm() 経由で使う）
 * @property {{cls: string, re: RegExp}[]} syntaxTokens コード表示の色分けの規則。先頭 2 つ（コメント・文字列）は HTML エスケープ前に、残りはエスケープ後に適用する
 *
 * @typedef {Object} ValueModel  値の見せ方。ビューは整形の規則（切り詰め方など）を持ち、言語で変わる部分だけをこれに尋ねる
 * @property {(v: any) => string} kind  'tdz' | 'undefined' | 'none' | 'bool' | 'number' | 'string' | 'native'（ホストの関数）
 *   | 'function' | 'class' | 'sequence'（配列・list・tuple） | 'mapping'（dict） | 'object'（オブジェクト・インスタンス） | 'other'。
 *   sequence はどの言語でも JS の配列で表す（配列のビューが添字でアクセスするため）
 * @property {(v: any) => number} numberValue  kind が 'number' の値の JS の数値（色分け・棒の長さに使う）
 * @property {(v: any) => string} literal  スカラー（undefined・none・bool・number・string）の書き方（JS: null・true・"abc"、Python: None・True・'abc'）
 * @property {(v: any, opts?: {hidden?: boolean}) => Array<[string|number, any]>} entries  sequence・mapping・object の要素（キーと値の組）。
 *   sequence のキーは添字、mapping のキーは言語の書き方の文字列。hidden: true なら内部用のキー（JS の __ で始まるキー）も含める
 * @property {(v: any, opts?: {hidden?: boolean}) => number} length  要素の数
 * @property {(v: any) => string} label  見出し（JS: Array[3]・Object）
 * @property {(v: any) => string} shortLabel  短い見出し（JS: Array・Obj）
 * @property {(v: any) => [string, string]} brackets  かっこ（JS: [ ]・{ }）
 * @property {(v: any) => boolean} [onHeap]  スカラーでも、メモリのビューでヒープの箱として置いて矢印で指す値か（省略できる。
 *   Java の String：同じリテラルは同じ箱、new String(…) は別の箱になり、== の違いが見える）。箱の見出しは label(v)
 * @property {boolean} [padMapping]  mapping・object のかっこの内側に空白を入れる書き方の箇所で、空白を入れるか（既定 true。
 *   JS: { a: 1 }、Python: {'a': 1}）。utils/value-model.js の wrapItems() が使う
 * @property {(v: any) => string|null} [emptyText]  要素が 0 個のときの書き方（かっこを並べた形と違う場合だけ。Python の set → set()）
 * @property {(v: any, count: number) => boolean} [trailingComma]  要素を count 個すべて並べたとき、最後にコンマを付けるか（Python の 1 要素の tuple → (1,)）
 */
import { javascriptProfile } from './javascript.js';

/** @type {LanguageProfile} */
let current = javascriptProfile;

/** 言語プロファイルを切り替える（app.js が評価される前に呼ぶ） */
export function setLanguage(profile) {
  current = profile;
}

/** @returns {LanguageProfile} */
export function getLanguage() {
  return current;
}
