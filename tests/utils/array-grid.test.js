/**
 * array-grid.test.js — computeSubscriptVars / detectPointerVars / renderArrayGrid のユニットテスト
 */

import { computeSubscriptVars, detectPointerVars, renderArrayGrid } from '../../src/utils/array-grid.js';

// ── computeSubscriptVars ─────────────────────────────────────────────────

describe('computeSubscriptVars()', () => {
  test('配列添字として使われている識別子を抽出する', () => {
    const source = `
      function selectionSort(arr) {
        for (let i = 0; i < n - 1; i++) {
          let minIdx = i + 1;
          for (let j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) { minIdx = j; }
          }
        }
      }
    `;
    const result = computeSubscriptVars(source);
    expect(result.has('j')).toBe(true);
    expect(result.has('minIdx')).toBe(true);
  });

  test('配列リテラル中の識別子は誤検出しない', () => {
    const result = computeSubscriptVars('const pair = [a, b];');
    expect(result.has('a')).toBe(false);
    expect(result.has('b')).toBe(false);
  });

  test('空文字列・undefinedでは空集合を返す', () => {
    expect(computeSubscriptVars('').size).toBe(0);
    expect(computeSubscriptVars(undefined).size).toBe(0);
  });
});

// ── detectPointerVars ────────────────────────────────────────────────────

describe('detectPointerVars()', () => {
  const arr = [5, 3, 8, 1, 9, 2];
  const subscriptVars = new Set(['i', 'minIdx', 'j']);
  const arrayVarNames = new Set(['arr']);

  test('配列添字ホワイトリストに含まれる整数変数をポインタとして検出する', () => {
    const vars = new Map([['arr', arr], ['i', 0], ['minIdx', 1], ['j', 2]]);
    const result = detectPointerVars(vars, arr, subscriptVars, arrayVarNames);
    expect(result.get('i')).toBe(0);
    expect(result.get('minIdx')).toBe(1);
    expect(result.get('j')).toBe(2);
  });

  test('配列変数自身はポインタとして扱わない', () => {
    const vars = new Map([['arr', arr], ['other', arr]]);
    const result = detectPointerVars(vars, arr, subscriptVars, new Set(['arr', 'other']));
    expect(result.has('arr')).toBe(false);
    expect(result.has('other')).toBe(false);
  });

  test('添字ホワイトリストに無い変数は値が範囲内でも除外する', () => {
    const vars = new Map([['arr', arr], ['unrelated', 2]]);
    const result = detectPointerVars(vars, arr, subscriptVars, arrayVarNames);
    expect(result.has('unrelated')).toBe(false);
  });

  test('範囲外・非整数の値は除外する', () => {
    const vars = new Map([['arr', arr], ['i', 99], ['minIdx', 1.5]]);
    const result = detectPointerVars(vars, arr, subscriptVars, arrayVarNames);
    expect(result.has('i')).toBe(false);
    expect(result.has('minIdx')).toBe(false);
  });

  test('配列でない・空配列のときは空のMapを返す', () => {
    expect(detectPointerVars(new Map(), undefined, subscriptVars, arrayVarNames).size).toBe(0);
    expect(detectPointerVars(new Map(), [], subscriptVars, arrayVarNames).size).toBe(0);
  });
});

// ── renderArrayGrid ───────────────────────────────────────────────────────

describe('renderArrayGrid()', () => {
  test('ポインタラベルを対応するインデックスのセルに描画する', () => {
    const arr = [5, 3, 8, 1, 9, 2];
    const ptrByName = new Map([['i', 0], ['minIdx', 1]]);
    const html = renderArrayGrid({ arrName: 'arr', arr, ptrByName, cellPx: 20 });

    expect(html).toContain('cb-array-block');
    expect(html).toContain('cb-cell--ptr');
    // ポインタ行のセルを順に見て、ラベルが空でないセルだけを抜き出す（各行1つずつのはず）
    const ptrLabels = [...html.matchAll(/cb-cell cb-cell--ptr"[^>]*>([^<]*)</g)].map(m => m[1]);
    expect(ptrLabels.filter(s => s !== '')).toEqual(['i', 'minIdx']);
  });

  test('配列が空/未定義のときは emptyText を表示する', () => {
    const html = renderArrayGrid({ arrName: 'arr', arr: undefined, cellPx: 20, emptyText: '配列が空です' });
    expect(html).toContain('配列が空です');
    expect(html).not.toContain('cb-cell--ptr');
  });
});
