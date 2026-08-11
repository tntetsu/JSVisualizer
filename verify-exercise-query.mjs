/**
 * verify-exercise-query.mjs — exerciseId/codeId クエリによるコード読み込み機能の単体動作検証
 *
 * BhvVisualizer公開APIを模した簡易サーバーを立て、実ブラウザ(Playwright)で
 * URLクエリ4パターン + 404 + スタンドアロン起動時の回帰（既定のFibonacci表示・
 * 組み込みサンプルの動作）を確認する。BhvVisualizer本体・Firestoreは使わない。
 *
 * 実行: node verify-exercise-query.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR   = path.join(__dirname, 'web');
const JSV_PORT  = 8010;
const API_PORT  = 5050;
const API_BASE  = `http://localhost:${API_PORT}/api`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serveDir(dir, port) {
  const server = http.createServer((req, res) => {
    const pathname = req.url.split('?')[0];
    const filePath = path.join(dir, pathname === '/' ? '/index.html' : pathname);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const FIXTURE_EXERCISE = {
  id: 'ex1',
  title: '演習1',
  codes: [
    { id: 'co1', title: 'コード1', code: 'console.log("code1");' },
    { id: 'co2', title: 'コード2', code: 'console.log("code2");' },
  ],
};
const FIXTURE_CODE = { id: 'co3', title: '単体コード', code: 'console.log("standalone code");', exerciseId: 'ex-other' };

function serveApi(port) {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/api/exercises/ex1') { res.writeHead(200); res.end(JSON.stringify(FIXTURE_EXERCISE)); return; }
    if (req.url === '/api/codes/co3') { res.writeHead(200); res.end(JSON.stringify(FIXTURE_CODE)); return; }
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not_found' }));
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}

async function run() {
  const jsvServer = await serveDir(WEB_DIR, JSV_PORT);
  const apiServer = await serveApi(API_PORT);
  const browser = await chromium.launch({ headless: true });

  try {
    // ── テストA: クエリなし → 既定のFibonacciのまま、編集可能ヒントが表示される ──
    {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${JSV_PORT}/index.html`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(200);

      const code = await page.locator('.cm-content').textContent();
      check('[A] クエリなしなら既定のFibonacciサンプルが表示される（上書きされない）', code.includes('fib'));

      const hint = await page.locator('.editor-hint').textContent();
      check('[A] 編集可能であることを示すヒントが表示される', hint.trim().length > 0);

      // 回帰確認: 組み込みサンプルが引き続き選択・実行できる
      await page.selectOption('#sample-select', { label: 'Factorial (recursive)' });
      await page.click('#btn-run');
      await page.waitForTimeout(200);
      const errorVisible = await page.locator('#error-msg').isVisible();
      check('[A] 組み込みサンプル(Factorial)選択→実行がエラーなく動作する', !errorVisible);
      await page.close();
    }

    // ── テストB: exerciseIdのみ → セレクタに追加され、エディタはFibonacciのまま ──
    {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${JSV_PORT}/index.html?exerciseId=ex1&bhvApiBase=${API_BASE}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const optgroupLabel = await page.locator('#sample-select optgroup').last().getAttribute('label');
      check('[B] exerciseId指定でセレクタに演習用optgroupが追加される', optgroupLabel === '─ Exercise ─');

      const code = await page.locator('.cm-content').textContent();
      check('[B] codeId未指定ならエディタはFibonacciのまま（上書きされない）', code.includes('fib'));
      await page.close();
    }

    // ── テストC: exerciseId+codeId → セレクタ追加 かつ 指定コードで上書き ──
    {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${JSV_PORT}/index.html?exerciseId=ex1&codeId=co2&bhvApiBase=${API_BASE}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const code = await page.locator('.cm-content').textContent();
      check('[C] exerciseId+codeId指定でエディタが指定コードに上書きされる', code.includes('code2'));

      const programName = await page.locator('#program-name').textContent();
      check('[C] プログラム名がコードのtitleに更新される', programName.includes('コード2'));
      await page.close();
    }

    // ── テストD: codeIdのみ → /api/codes/:id を直接取得してエディタに反映 ──
    {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${JSV_PORT}/index.html?codeId=co3&bhvApiBase=${API_BASE}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const code = await page.locator('.cm-content').textContent();
      check('[D] codeIdのみ指定でエディタが該当コードに上書きされる', code.includes('standalone code'));
      await page.close();
    }

    // ── テストE: 存在しないcodeId(404) → エラーメッセージが表示される ──
    {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${JSV_PORT}/index.html?codeId=nope&bhvApiBase=${API_BASE}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const errorVisible = await page.locator('#error-msg').isVisible();
      check('[E] 存在しないcodeIdでエラーメッセージが表示される', errorVisible);
      await page.close();
    }
  } finally {
    await browser.close();
    jsvServer.close();
    apiServer.close();
  }

  console.log(`\n${failures === 0 ? '✅ 全テスト合格' : `❌ ${failures}件失敗`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
