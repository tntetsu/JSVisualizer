/**
 * samples.test.js — 17サンプルコードの実行確認
 *
 * 全サンプルが JSDebugger でエラーなしに実行できること、
 * および trace が 1 ステップ以上存在することを確認する。
 */

import { JSDebugger } from '../../../JSInterpreter/src/interpreter/debugger.js';
import { SAMPLES }    from '../../src/components/code-editor.js';

describe('サンプルコードの実行テスト', () => {
  for (const [key, { label, code }] of Object.entries(SAMPLES)) {
    test(`${label} (${key}) — エラーなし・trace ≥ 1`, () => {
      let dbg;
      expect(() => {
        dbg = new JSDebugger(code, { maxSteps: 200_000 });
      }).not.toThrow();

      expect(dbg.trace.length).toBeGreaterThan(0);
    });
  }
});
