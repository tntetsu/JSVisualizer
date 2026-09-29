/**
 * capture-manual-screenshots.mjs — マニュアル（web/manual.html・web/manual.en.html）のスクリーンショットを撮り直す
 *
 * web/ をその場でローカル配信し、組み込みサンプルを使って日本語表示・英語表示それぞれの画面を撮影する。
 * 画面を変更したら `npm run build` の後に実行し、web/manual/ja・web/manual/en の画像を更新してコミットする。
 *
 * 実行: node scripts/capture-manual-screenshots.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT    = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const WEB_DIR = path.join(ROOT, 'web');
const PORT    = 8020;
const MIME    = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

function serveDir(dir, port) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const filePath = path.join(dir, urlPath === '/' ? '/index.html' : urlPath);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

/**
 * @param {import('playwright').Browser} browser
 * @param {'ja'|'en'} lang
 */
async function captureLang(browser, lang) {
  const out = path.join(WEB_DIR, 'manual', lang);
  fs.mkdirSync(out, { recursive: true });

  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // 表示言語を固定し、前回タブの復元の影響を受けないようにする
  await context.addInitScript((l) => {
    localStorage.setItem('jsv-lang', l);
    localStorage.removeItem('jsv-active-tab');
  }, lang);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle' });

  const shot = (file) => page.screenshot({ path: path.join(out, file) });
  // コード表示エリアはペインの高さいっぱいで下が空白になるため、コードのある範囲だけに切り詰める
  const shotCode = async (file) => {
    const display = page.locator('#code-display');
    const box = await display.boundingBox();
    const codeHeight = await display.evaluate((el) => {
      const last = el.querySelector(':scope > *:last-child');
      return last ? last.getBoundingClientRect().bottom - el.getBoundingClientRect().top : el.clientHeight;
    });
    await page.screenshot({ path: path.join(out, file), clip: { ...box, height: Math.min(box.height, codeHeight + 16) } });
  };
  const shotView = async (viewId, file) => {
    await page.locator(`#view-tabs [data-view="${viewId}"]`).click();
    await page.waitForTimeout(600);
    await page.locator('.debug-pane').screenshot({ path: path.join(out, file) });
  };
  /** 編集モードでサンプルを選び、実行して humanStep を n 回進める */
  const runSample = async (key, humanSteps) => {
    if (await page.locator('#btn-edit').isEnabled()) await page.locator('#btn-edit').click();
    await page.selectOption('#sample-select', key);
    await page.waitForTimeout(300);
    await page.locator('#btn-run').click();
    await page.locator('#btn-human-forward').waitFor({ state: 'visible' });
    for (let i = 0; i < humanSteps; i++) await page.locator('#btn-human-forward').click();
    await page.waitForTimeout(400);
  };

  // ── 編集モード（起動直後の画面） ──
  await page.selectOption('#sample-select', 'bubbleSort');
  await page.waitForTimeout(400);
  await shot('screen-edit.png');

  // ── 実行モード（バブルソート） ──
  await runSample('bubbleSort', 14);
  await page.locator('#btn-expr-forward').click();
  await page.waitForTimeout(400);
  await shot('screen-run.png');
  await page.locator('#step-controls-area').screenshot({ path: path.join(out, 'step-controls.png') });
  await shotCode('code-highlight-line.png');
  await shotView('trace', 'view-trace.png');
  await shotView('exectrace', 'view-exectrace.png');
  await shotView('colorbox', 'view-colorbox.png');
  await shotView('heatmap', 'view-heatmap.png');
  await shotView('controlflow', 'view-controlflow.png');
  await shotView('memory', 'view-memory.png');

  // ── 再帰関数（フィボナッチ） ──
  await runSample('fibonacci', 9);
  await shotCode('code-highlight-call.png');
  await shotView('state', 'view-callstack.png');
  await shotView('calltree', 'view-calltree.png');
  await shotView('subst', 'view-subst.png');
  await shotView('exprtrace', 'view-exprtrace.png');
  await shotView('lifetime', 'view-lifetime.png');

  // ── オブジェクト（連結リスト） ──
  await runSample('linkedList', 0);
  // 末尾は変数がなく何も表示されないため、末尾から少し戻った（リストを配列に変換している）時点にする
  await page.locator('#btn-end').click();
  for (let i = 0; i < 4; i++) await page.locator('#btn-human-back').click();
  await page.waitForTimeout(400);
  await shotView('objgraph', 'view-objgraph.png');

  // ── エラー表示（構文エラー） ──
  await page.locator('#btn-edit').click();
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nlet x = ;');
  await page.locator('#btn-run').click();
  await page.locator('#error-msg:not([hidden])').waitFor();
  await page.locator('#editor-pane').screenshot({ path: path.join(out, 'error.png') });

  await context.close();
}

const server = await serveDir(WEB_DIR, PORT);
const browser = await chromium.launch({ headless: true });
try {
  await captureLang(browser, 'ja');
  await captureLang(browser, 'en');
  console.log('✅ スクリーンショットを web/manual/ja・web/manual/en に保存しました');
} finally {
  await browser.close();
  server.close();
}
