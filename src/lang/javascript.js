/**
 * lang/javascript.js — JS の言語プロファイル（JSVisualizer の既定）
 */
import { javascript } from '@codemirror/lang-javascript';
import { JSDebugger, ExecutionError } from '../../web/interpreter.bundle.js';
import { SAMPLES, SAMPLE_GROUPS } from './javascript-samples.js';

/**
 * JS の値の見せ方（ビューは utils/value-model.js の vm() 経由で使う）。
 * ここの結果は、言語プロファイルを導入する前のビューのコードが作っていた文字列と同じ。
 * @type {import('./index.js').ValueModel}
 */
const javascriptValueModel = {
  kind(v) {
    if (typeof v === 'symbol' && v.description === 'TDZ') return 'tdz';
    if (v === undefined) return 'undefined';
    if (v === null) return 'none';
    switch (typeof v) {
      case 'boolean': return 'bool';
      case 'number':  return 'number';
      case 'string':  return 'string';
      case 'function': return 'native';
    }
    if (v.__type__ === 'JSFunction') return 'function';
    if (v.__type__ === 'JSClass') return 'class';
    if (Array.isArray(v)) return 'sequence';
    if (typeof v === 'object') return 'object';
    return 'other';
  },
  numberValue(v) {
    return v;
  },
  literal(v) {
    if (v === undefined) return 'undefined';
    if (v === null) return 'null';
    if (typeof v === 'string') return JSON.stringify(v);
    return String(v);
  },
  entries(v, { hidden = false } = {}) {
    if (Array.isArray(v)) return v.map((x, i) => [i, x]);
    const all = Object.entries(v);
    return hidden ? all : all.filter(([k]) => !k.startsWith('__'));
  },
  length(v, { hidden = false } = {}) {
    if (Array.isArray(v)) return v.length;
    const keys = Object.keys(v);
    return hidden ? keys.length : keys.filter(k => !k.startsWith('__')).length;
  },
  label(v) {
    return Array.isArray(v) ? `Array[${v.length}]` : 'Object';
  },
  shortLabel(v) {
    return Array.isArray(v) ? 'Array' : 'Obj';
  },
  brackets(v) {
    return Array.isArray(v) ? ['[', ']'] : ['{', '}'];
  },
};

/** @type {import('./index.js').LanguageProfile} */
export const javascriptProfile = {
  id: 'javascript',
  name: 'JavaScript',
  Debugger: JSDebugger,
  ExecutionError,
  editorExtension: () => javascript(),
  samples: SAMPLES,
  sampleGroups: SAMPLE_GROUPS,
  defaultSample: 'fibonacci',
  // TraceBuilder.buildHumanIndices（Exec Trace などの行）で、enter / exit で行を作るノード型
  traceRowTypes: {
    enter: ['ExpressionStatement', 'IfStatement', 'ForOfStatement', 'ForInStatement', 'BreakStatement', 'ContinueStatement'],
    exit:  ['VariableDeclaration', 'AssignmentExpression', 'UpdateExpression', 'ReturnStatement', 'ThrowStatement', 'CallExpression'],
  },
  valueModel: javascriptValueModel,
  syntaxTokens: [
    { cls: 'tok-comment', re: /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g },
    { cls: 'tok-string',  re: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g },
    { cls: 'tok-number',  re: /\b(\d+(?:\.\d+)?)\b/g },
    { cls: 'tok-keyword', re: /\b(function|return|if|else|while|for|let|const|var|new|class|extends|import|export|break|continue|null|undefined|true|false|this|of|in|typeof|instanceof|throw|try|catch|finally|async|await)\b/g },
  ],
};
