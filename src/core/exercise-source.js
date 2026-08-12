/**
 * exercise-source.js — 外部（BhvVisualizer等）が指定するURLからのコード読み込み
 *
 * URLクエリ（`code`/`exercise`）に応じてエディタへコードを読み込む、JSVisualizer単体の機能改善
 * （`# BHV:` タグは付けない。ADR-031・ADR-033参照）。呼び出し元が完全なURLを直接渡すため、
 * JSVisualizerはコードの取得元のパス規約・スキーマを一切知らない。クエリなし時は何もせず、
 * 既定のFibonacciサンプル・21種の組み込みサンプルのまま起動する。クエリがある場合は組み込み
 * サンプルをサンプル選択から取り除き、`exercise`/`code`が指すコードだけを表示する（ADR-033）。
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
        editor.setRemoteCodes(exercise.codes); // 組み込みサンプルは表示せず、演習のコード一覧だけにする
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
      if (!exerciseUrl) {
        // exercise未指定なら、組み込みサンプルの代わりにこのコード1件だけをセレクタに表示する。
        // 切り替え先の候補が存在しないため、プレースホルダはコードタイトルに置き換えた上で
        // セレクタ自体を選択不可にする。
        editor.setRemoteCodes([{ title: code.title, code: code.code }]);
        editor.setPlaceholderLabel(code.title);
        editor.disableSampleSelect();
      }
      editor.setCode(code.code, code.title);
    }
  } catch (err) {
    console.error('[exercise-source] failed to load code', err);
    editor.showError('コードの読み込みに失敗しました（ネットワークエラー）');
  }
}
