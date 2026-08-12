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
    setRemoteCodes: jest.fn(),
    setPlaceholderLabel: jest.fn(),
    disableSampleSelect: jest.fn(),
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
  test('クエリなしなら何もしない（fetchも呼ばれない、組み込みサンプルには触れない）', async () => {
    global.fetch = jest.fn();
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(editor.setCode).not.toHaveBeenCalled();
    expect(editor.setRemoteCodes).not.toHaveBeenCalled();
  });

  test('codeのみ: 指定URLをfetchしsetCode、セレクタはそのコード1件だけに置き換わり、プレースホルダがコードタイトルになった上で選択不可になる', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ title: 'コード1', code: 'a' }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?code=https://example.com/codes/co1' });
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/codes/co1');
    expect(editor.setRemoteCodes).toHaveBeenCalledWith([{ title: 'コード1', code: 'a' }]);
    expect(editor.setPlaceholderLabel).toHaveBeenCalledWith('コード1');
    expect(editor.disableSampleSelect).toHaveBeenCalled();
    expect(editor.setCode).toHaveBeenCalledWith('a', 'コード1');
  });

  test('exerciseのみ: setRemoteCodesで演習のコード一覧に置き換わり、先頭のコードがsetCodeされ、プレースホルダが演習タイトルになる', async () => {
    const codes = [
      { title: 'コード1', code: 'a' },
      { title: 'コード2', code: 'b' },
    ];
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ title: '演習1', codes }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?exercise=https://example.com/exercises/ex1' });
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/exercises/ex1');
    expect(editor.setPlaceholderLabel).toHaveBeenCalledWith('演習1');
    expect(editor.setRemoteCodes).toHaveBeenCalledWith(codes);
    expect(editor.setCode).toHaveBeenCalledWith('a', 'コード1');
  });

  test('exerciseのtitleが無ければsetPlaceholderLabelは呼ばれない', async () => {
    const codes = [{ title: 'コード1', code: 'a' }];
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ codes }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?exercise=https://example.com/exercises/ex1' });
    expect(editor.setPlaceholderLabel).not.toHaveBeenCalled();
  });

  test('exercise+code: setRemoteCodesは演習の一覧で1回だけ呼ばれ（codeで上書きしない）、code側のコードでsetCode', async () => {
    const codes = [
      { title: 'コード1', code: 'a' },
      { title: 'コード2', code: 'b' },
    ];
    global.fetch = jest.fn()
      .mockImplementationOnce(() => jsonResponse({ title: '演習1', codes }))
      .mockImplementationOnce(() => jsonResponse({ title: 'コード2', code: 'b' }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, {
      search: '?exercise=https://example.com/exercises/ex1&code=https://example.com/codes/co2',
    });
    expect(editor.setPlaceholderLabel).toHaveBeenCalledWith('演習1');
    expect(editor.setRemoteCodes).toHaveBeenCalledTimes(1);
    expect(editor.setRemoteCodes).toHaveBeenCalledWith(codes);
    expect(editor.setCode).toHaveBeenCalledTimes(1);
    expect(editor.setCode).toHaveBeenCalledWith('b', 'コード2');
    // exercise指定時はコード切り替えの余地があるため、code側のtitleでプレースホルダを
    // 上書きしたり選択不可にしたりしない（演習タイトルのまま・選択可能なまま）
    expect(editor.disableSampleSelect).not.toHaveBeenCalled();
  });

  test('exerciseのcodesが空配列なら自動読み込みしない（セレクタは空になる）', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ codes: [] }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?exercise=https://example.com/exercises/ex1' });
    expect(editor.setRemoteCodes).toHaveBeenCalledWith([]);
    expect(editor.setCode).not.toHaveBeenCalled();
  });

  test('404（存在しない/非公開）: showErrorが呼ばれ、セレクタは変更しない', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse(null, false));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?code=https://example.com/codes/nope' });
    expect(editor.showError).toHaveBeenCalled();
    expect(editor.setCode).not.toHaveBeenCalled();
    expect(editor.setRemoteCodes).not.toHaveBeenCalled();
  });

  test('exerciseが不正な形式（codesが配列でない）: showErrorが呼ばれる', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ notCodes: [] }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?exercise=https://example.com/exercises/ex1' });
    expect(editor.showError).toHaveBeenCalled();
    expect(editor.setRemoteCodes).not.toHaveBeenCalled();
  });

  test('ネットワークエラー: showErrorが呼ばれる', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?code=https://example.com/codes/co1' });
    expect(editor.showError).toHaveBeenCalled();
  });
});
