/**
 * exercise-source.js — BhvVisualizer公開API（/api/exercises/:id, /api/codes/:id）からのコード読み込み
 *
 * URLクエリ（exerciseId/codeId）に応じてエディタへコードを読み込む、JSVisualizer単体の機能改善
 * （BhvVisualizer/docs/design.md 2.4節）。`# BHV:` タグは付けない（BhvVisualizerの存在を前提としない
 * 汎用機能のため。ADR-029参照）。クエリが無い場合は何もせず、既定のFibonacciサンプルのまま起動する。
 */
const DEFAULT_API_BASE = 'https://bhv-visualizer.web.app/api';

/**
 * @param {string} [search]
 * @returns {{ exerciseId: string|null, codeId: string|null, apiBase: string }}
 */
export function parseQuery(search = location.search) {
  const params = new URLSearchParams(search);
  return {
    exerciseId: params.get('exerciseId'),
    codeId: params.get('codeId'),
    apiBase: params.get('bhvApiBase') || DEFAULT_API_BASE,
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  return res.ok ? res.json() : null;
}

/**
 * @param {import('../components/code-editor.js').CodeEditor} editor
 * @param {{ search?: string }} [opts]
 */
export async function loadExerciseFromQuery(editor, opts = {}) {
  const { exerciseId, codeId, apiBase } = parseQuery(opts.search);
  if (!exerciseId && !codeId) return; // クエリなし: 何もしない

  try {
    if (exerciseId) {
      const exercise = await fetchJson(`${apiBase}/exercises/${encodeURIComponent(exerciseId)}`);
      if (!exercise) return editor.showError(`演習が見つからないか非公開です（id: ${exerciseId}）`);
      editor.addRemoteGroup('─ Exercise ─', exercise.codes);
      if (codeId) {
        const match = exercise.codes.find((c) => c.id === codeId);
        if (match) editor.setCode(match.code, match.title, `remote:${match.id}`);
        else editor.showError(`コードが見つかりません（id: ${codeId}）`);
      }
      return;
    }
    const code = await fetchJson(`${apiBase}/codes/${encodeURIComponent(codeId)}`);
    if (!code) return editor.showError(`コードが見つからないか非公開です（id: ${codeId}）`);
    editor.setCode(code.code, code.title);
  } catch (err) {
    console.error('[exercise-source] failed to load from BhvVisualizer API', err);
    editor.showError('演習の読み込みに失敗しました（ネットワークエラー）');
  }
}
