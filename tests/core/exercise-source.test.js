/**
 * exercise-source.test.js — exercise-source.js のユニットテスト
 *
 * global.fetch をモックし、URLクエリの解析とエディタへの読み込み分岐を検証する。
 */

import { jest } from '@jest/globals';
import { parseQuery, loadExerciseFromQuery } from '../../src/core/exercise-source.js';

function makeEditor() {
  return {
    setCode: jest.fn(),
    addRemoteGroup: jest.fn(),
    showError: jest.fn(),
  };
}

function jsonResponse(body, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(body) });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('parseQuery', () => {
  test('クエリなしなら全てnull', () => {
    expect(parseQuery('')).toEqual({ codeUrl: null, exerciseUrl: null });
  });

  test('codeのみ', () => {
    expect(parseQuery('?code=https%3A%2F%2Fexample.com%2Fcodes%2Fabc')).toEqual({
      codeUrl: 'https://example.com/codes/abc', exerciseUrl: null,
    });
  });

  test('exerciseのみ', () => {
    expect(parseQuery('?exercise=https%3A%2F%2Fexample.com%2Fexercises%2Fex1')).toEqual({
      codeUrl: null, exerciseUrl: 'https://example.com/exercises/ex1',
    });
  });

  test('code+exercise', () => {
    expect(parseQuery('?exercise=https://example.com/exercises/ex1&code=https://example.com/codes/co2')).toEqual({
      codeUrl: 'https://example.com/codes/co2', exerciseUrl: 'https://example.com/exercises/ex1',
    });
  });
});

describe('loadExerciseFromQuery', () => {
  test('クエリなしなら何もしない（fetchも呼ばれない）', async () => {
    global.fetch = jest.fn();
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(editor.setCode).not.toHaveBeenCalled();
    expect(editor.addRemoteGroup).not.toHaveBeenCalled();
  });

  test('codeのみ: 指定URLをfetchしsetCode', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ title: 'コード1', code: 'a' }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?code=https://example.com/codes/co1' });
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/codes/co1');
    expect(editor.setCode).toHaveBeenCalledWith('a', 'コード1');
    expect(editor.addRemoteGroup).not.toHaveBeenCalled();
  });

  test('exerciseのみ: addRemoteGroupが呼ばれ、先頭のコードがsetCodeされる', async () => {
    const codes = [
      { title: 'コード1', code: 'a' },
      { title: 'コード2', code: 'b' },
    ];
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ codes }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?exercise=https://example.com/exercises/ex1' });
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/exercises/ex1');
    expect(editor.addRemoteGroup).toHaveBeenCalledWith('─ Exercise ─', codes);
    expect(editor.setCode).toHaveBeenCalledWith('a', 'コード1', 'remote:0');
  });

  test('exercise+code: addRemoteGroup後、code側のコードでsetCode（先頭ではなくcode優先）', async () => {
    const codes = [
      { title: 'コード1', code: 'a' },
      { title: 'コード2', code: 'b' },
    ];
    global.fetch = jest.fn()
      .mockImplementationOnce(() => jsonResponse({ codes }))
      .mockImplementationOnce(() => jsonResponse({ title: 'コード2', code: 'b' }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, {
      search: '?exercise=https://example.com/exercises/ex1&code=https://example.com/codes/co2',
    });
    expect(editor.addRemoteGroup).toHaveBeenCalledWith('─ Exercise ─', codes);
    expect(editor.setCode).toHaveBeenCalledTimes(1);
    expect(editor.setCode).toHaveBeenCalledWith('b', 'コード2');
  });

  test('exerciseのcodesが空配列なら自動読み込みしない', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ codes: [] }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?exercise=https://example.com/exercises/ex1' });
    expect(editor.addRemoteGroup).toHaveBeenCalledWith('─ Exercise ─', []);
    expect(editor.setCode).not.toHaveBeenCalled();
  });

  test('404（存在しない/非公開）: showErrorが呼ばれる', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse(null, false));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?code=https://example.com/codes/nope' });
    expect(editor.showError).toHaveBeenCalled();
    expect(editor.setCode).not.toHaveBeenCalled();
  });

  test('exerciseが不正な形式（codesが配列でない）: showErrorが呼ばれる', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ notCodes: [] }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?exercise=https://example.com/exercises/ex1' });
    expect(editor.showError).toHaveBeenCalled();
    expect(editor.addRemoteGroup).not.toHaveBeenCalled();
  });

  test('ネットワークエラー: showErrorが呼ばれる', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?code=https://example.com/codes/co1' });
    expect(editor.showError).toHaveBeenCalled();
  });
});
