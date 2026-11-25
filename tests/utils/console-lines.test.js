/**
 * console-lines.test.js — コンソール出力の断片を行にまとめる（utils/console-lines.js）
 */
import { joinConsoleLines } from '../../src/utils/console-lines.js';

describe('joinConsoleLines', () => {
  test('断片を含まない出力（JS の console.log）はそのまま返す', () => {
    const logs = [{ atIndex: 0, level: 'log', text: 'a' }, { atIndex: 3, level: 'warn', text: 'b' }];
    expect(joinConsoleLines(logs)).toBe(logs);
  });

  test('行の途中の断片をつなげ、atIndex は行が完成した位置にする', () => {
    const logs = [
      { atIndex: 1, level: 'log', text: '0 ', eol: false },
      { atIndex: 5, level: 'log', text: '1 ', eol: false },
      { atIndex: 9, level: 'log', text: '', eol: true },
      { atIndex: 9, level: 'log', text: 'end', eol: true },
    ];
    expect(joinConsoleLines(logs)).toEqual([
      { atIndex: 9, level: 'log', text: '0 1 ' },
      { atIndex: 9, level: 'log', text: 'end' },
    ]);
  });

  test('まだ改行していない行も、途中まで 1 行として表示する', () => {
    const logs = [{ atIndex: 2, level: 'log', text: 'x ', eol: false }];
    expect(joinConsoleLines(logs)).toEqual([{ atIndex: 2, level: 'log', text: 'x ' }]);
  });
});
