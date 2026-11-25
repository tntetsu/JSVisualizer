/**
 * console-lines.js — コンソール出力を 1 行 1 件にまとめる
 *
 * 言語によっては、行の途中で終わる出力（Python の print(x, end=" ")）を「断片」として記録する
 * （JSInterpreter の共通コアの Recorder.write()。各断片は eol を持ち、行の途中で終わる断片は eol: false）。
 * コンソールのビューは 1 件を 1 行として表示するので、断片を行にまとめてから渡す。
 * 断片を含まない出力（JS の console.log。eol を持たない）はそのまま返す。
 * JSInterpreter の joinConsoleLines() と同じ規則（各行の atIndex は、その行の最後の断片の位置）。
 *
 * @param {Array<{atIndex:number, level:string, text:string, eol?:boolean}>} logs
 * @returns {Array<{atIndex:number, level:string, text:string}>}
 */
export function joinConsoleLines(logs) {
  if (!logs.some(l => l.eol !== undefined)) return logs;
  const out = [];
  let pending = null;
  for (const log of logs) {
    if (log.eol === undefined) {
      if (pending) { out.push(pending); pending = null; }
      out.push({ atIndex: log.atIndex, level: log.level, text: log.text });
      continue;
    }
    if (!pending) pending = { atIndex: log.atIndex, level: log.level, text: '' };
    pending.text += log.text;
    pending.atIndex = log.atIndex;
    if (log.eol) { out.push(pending); pending = null; }
  }
  if (pending) out.push(pending);
  return out;
}
