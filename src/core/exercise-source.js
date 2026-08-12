/**
 * exercise-source.js — 外部（BhvVisualizer等）が指定するURLからのコード読み込み
 *
 * URLクエリ（`code`/`exercise`）に応じてエディタへコードを読み込む、JSVisualizer単体の機能改善
 * （`# BHV:` タグは付けない。ADR-031参照）。呼び出し元が完全なURLを直接渡すため、JSVisualizerは
 * コードの取得元のパス規約・スキーマを一切知らない。クエリが無い場合は何もせず、既定のFibonacci
 * サンプルのまま起動する。
 */

/**
 * @param {string} [search]
 * @returns {{ codeUrl: string|null, exerciseUrl: string|null }}
 */
export function parseQuery(search = location.search) {
  const params = new URLSearchParams(search);
  return {
    codeUrl: params.get('code'),
    exerciseUrl: params.get('exercise'),
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
  const { codeUrl, exerciseUrl } = parseQuery(opts.search);
  if (!codeUrl && !exerciseUrl) return; // クエリなし: 何もしない

  try {
    if (exerciseUrl) {
      const exercise = await fetchJson(exerciseUrl);
      if (!exercise || !Array.isArray(exercise.codes)) {
        editor.showError('演習が見つからないか非公開です');
      } else {
        if (exercise.title) editor.setPlaceholderLabel(exercise.title);
        editor.addRemoteGroup('─ Exercise ─', exercise.codes);
        // code未指定なら先頭のコードを既定表示にする（セレクタの表示は演習タイトルのまま変えない）
        if (!codeUrl && exercise.codes.length > 0) {
          const first = exercise.codes[0];
          editor.setCode(first.code, first.title);
        }
      }
    }

    if (codeUrl) {
      const code = await fetchJson(codeUrl);
      if (!code) return editor.showError('コードが見つからないか非公開です');
      editor.setCode(code.code, code.title);
    }
  } catch (err) {
    console.error('[exercise-source] failed to load code', err);
    editor.showError('コードの読み込みに失敗しました（ネットワークエラー）');
  }
}
