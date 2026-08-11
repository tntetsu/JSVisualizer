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
  test('クエリなしなら全てnull・apiBaseは既定値', () => {
    expect(parseQuery('')).toEqual({
      exerciseId: null, codeId: null, apiBase: 'https://bhv-visualizer.web.app/api',
    });
  });

  test('exerciseIdのみ', () => {
    expect(parseQuery('?exerciseId=ex1')).toEqual({
      exerciseId: 'ex1', codeId: null, apiBase: 'https://bhv-visualizer.web.app/api',
    });
  });

  test('codeIdのみ', () => {
    expect(parseQuery('?codeId=co1')).toEqual({
      exerciseId: null, codeId: 'co1', apiBase: 'https://bhv-visualizer.web.app/api',
    });
  });

  test('exerciseId+codeId+bhvApiBase', () => {
    expect(parseQuery('?exerciseId=ex1&codeId=co1&bhvApiBase=http://localhost:5000/api')).toEqual({
      exerciseId: 'ex1', codeId: 'co1', apiBase: 'http://localhost:5000/api',
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

  test('exerciseIdのみ: addRemoteGroupが呼ばれ、setCodeは呼ばれない', async () => {
    const codes = [{ id: 'co1', title: 'コード1', code: 'a' }];
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ id: 'ex1', title: '演習1', codes }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?exerciseId=ex1' });
    expect(global.fetch).toHaveBeenCalledWith('https://bhv-visualizer.web.app/api/exercises/ex1');
    expect(editor.addRemoteGroup).toHaveBeenCalledWith('─ Exercise ─', codes);
    expect(editor.setCode).not.toHaveBeenCalled();
  });

  test('exerciseId+codeId: addRemoteGroup後、該当コードでsetCode', async () => {
    const codes = [
      { id: 'co1', title: 'コード1', code: 'a' },
      { id: 'co2', title: 'コード2', code: 'b' },
    ];
    global.fetch = jest.fn().mockReturnValue(jsonResponse({ id: 'ex1', title: '演習1', codes }));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?exerciseId=ex1&codeId=co2' });
    expect(editor.addRemoteGroup).toHaveBeenCalledWith('─ Exercise ─', codes);
    expect(editor.setCode).toHaveBeenCalledWith('b', 'コード2', 'remote:co2');
  });

  test('codeIdのみ: /codes/:id をfetchしsetCode', async () => {
    global.fetch = jest.fn().mockReturnValue(
      jsonResponse({ id: 'co1', title: 'コード1', code: 'a', exerciseId: 'ex1' }),
    );
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?codeId=co1' });
    expect(global.fetch).toHaveBeenCalledWith('https://bhv-visualizer.web.app/api/codes/co1');
    expect(editor.setCode).toHaveBeenCalledWith('a', 'コード1');
    expect(editor.addRemoteGroup).not.toHaveBeenCalled();
  });

  test('404（存在しない/非公開）: showErrorが呼ばれる', async () => {
    global.fetch = jest.fn().mockReturnValue(jsonResponse(null, false));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?codeId=nope' });
    expect(editor.showError).toHaveBeenCalled();
    expect(editor.setCode).not.toHaveBeenCalled();
  });

  test('ネットワークエラー: showErrorが呼ばれる', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down'));
    const editor = makeEditor();
    await loadExerciseFromQuery(editor, { search: '?codeId=co1' });
    expect(editor.showError).toHaveBeenCalled();
  });
});
