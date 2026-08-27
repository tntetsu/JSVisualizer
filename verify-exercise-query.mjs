/**
 * verify-exercise-query.mjs — URLクエリ（code/exercise）によるコード読み込み機能の単体動作検証
 *
 * 外部API（呼び出し元が完全なURLで指定する想定）を模した簡易サーバーを立て、実ブラウザ
 * (Playwright)でURLクエリのパターン（クエリがあれば組み込みサンプルは消え、指定されたコード
 * だけがセレクタに残る）+ 404 + スタンドアロン起動時の回帰（既定のFibonacci表示・組み込み
 * サンプルの動作）を確認する。BhvVisualizer本体・Firestoreは使わない。
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
  title: '演習1',
  codes: [
    { title: 'コード1', code: 'console.log("code1");' },
    { title: 'コード2', code: 'console.log("code2");' },
  ],
};
const FIXTURE_CODE = { title: '単体コード', code: 'console.log("standalone code");' };

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

    // ── テストB: exerciseのみ → 組み込みサンプルは消え、演習のコード一覧だけになり、先頭が自動表示される ──
    {
      const page = await browser.newPage();
      const exerciseUrl = encodeURIComponent(`${API_BASE}/exercises/ex1`);
      await page.goto(`http://localhost:${JSV_PORT}/index.html?exercise=${exerciseUrl}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const optgroupCount = await page.locator('#sample-select optgroup').count();
      check('[B] exercise指定で組み込みサンプルのoptgroupが消える', optgroupCount === 0);

      const optionTexts = await page.locator('#sample-select option:not([value=""])').allTextContents();
      check('[B] セレクタの選択肢が演習のコード一覧（2件）だけになる', JSON.stringify(optionTexts) === JSON.stringify(['コード1', 'コード2']));

      const code = await page.locator('.cm-content').textContent();
      check('[B] code未指定なら演習の先頭コードが自動表示される', code.includes('code1'));

      const programName = await page.locator('#program-name').textContent();
      check('[B] プログラム名が先頭コードのtitleになる', programName.includes('コード1'));

      const placeholderText = await page.locator('#sample-select option[value=""]').textContent();
      check('[B] サンプルセレクタのプレースホルダが演習タイトルになる', placeholderText === '演習1');
      await page.close();
    }

    // ── テストC: exercise+code → セレクタは演習の一覧のまま、エディタはcodeで指定したコードが優先して表示 ──
    {
      const page = await browser.newPage();
      const exerciseUrl = encodeURIComponent(`${API_BASE}/exercises/ex1`);
      const codeUrl = encodeURIComponent(`${API_BASE}/codes/co3`);
      await page.goto(`http://localhost:${JSV_PORT}/index.html?exercise=${exerciseUrl}&code=${codeUrl}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const optionTexts = await page.locator('#sample-select option:not([value=""])').allTextContents();
      check('[C] exercise+code指定でもセレクタは演習のコード一覧（2件）のまま', JSON.stringify(optionTexts) === JSON.stringify(['コード1', 'コード2']));

      const code = await page.locator('.cm-content').textContent();
      check('[C] exercise+code指定でエディタはcode側の内容になる（先頭コードではない）', code.includes('standalone code'));

      const programName = await page.locator('#program-name').textContent();
      check('[C] プログラム名がcode側のtitleになる', programName.includes('単体コード'));

      const placeholderText = await page.locator('#sample-select option[value=""]').textContent();
      check('[C] exercise+code指定でもサンプルセレクタのプレースホルダは演習タイトルになる', placeholderText === '演習1');
      await page.close();
    }

    // ── テストD: codeのみ → 組み込みサンプルは消え、指定コード1件だけがセレクタに表示される ──
    {
      const page = await browser.newPage();
      const codeUrl = encodeURIComponent(`${API_BASE}/codes/co3`);
      await page.goto(`http://localhost:${JSV_PORT}/index.html?code=${codeUrl}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const code = await page.locator('.cm-content').textContent();
      check('[D] codeのみ指定でエディタが該当コードに上書きされる', code.includes('standalone code'));

      const optgroupCount = await page.locator('#sample-select optgroup').count();
      check('[D] codeのみ指定で組み込みサンプルのoptgroupが消える', optgroupCount === 0);

      const optionTexts = await page.locator('#sample-select option:not([value=""])').allTextContents();
      check('[D] セレクタの選択肢が指定コード1件だけになる', JSON.stringify(optionTexts) === JSON.stringify(['単体コード']));

      const placeholderText = await page.locator('#sample-select option[value=""]').textContent();
      check('[D] サンプルセレクタのプレースホルダがコードタイトルになる', placeholderText === '単体コード');

      const isDisabled = await page.locator('#sample-select').isDisabled();
      check('[D] codeのみ指定でサンプルセレクタが選択不可になる', isDisabled);
      await page.close();
    }

    // ── テストE: 存在しないcode URL(404) → エラーメッセージが表示される ──
    {
      const page = await browser.newPage();
      const codeUrl = encodeURIComponent(`${API_BASE}/codes/nope`);
      await page.goto(`http://localhost:${JSV_PORT}/index.html?code=${codeUrl}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const errorVisible = await page.locator('#error-msg').isVisible();
      check('[E] 存在しないcode URLでエラーメッセージが表示される', errorVisible);
      await page.close();
    }

    // ── テストF: code+view → 実行後、指定したビューが最初から開いている（ADR-036） ──
    {
      const page = await browser.newPage();
      const codeUrl = encodeURIComponent(`${API_BASE}/codes/co3`);
      await page.goto(`http://localhost:${JSV_PORT}/index.html?code=${codeUrl}&view=memory`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      await page.click('#btn-run');
      await page.waitForTimeout(300);

      const isActive = await page.locator('.view-tab[data-view="memory"]').evaluate(
        (el) => el.classList.contains('view-tab--active'),
      );
      check('[F] view=memory指定で実行後にMemoryタブが最初からアクティブになる', isActive);
      await page.close();
    }

    // ── テストG: view未指定 → 従来通り最初のビュー（コールスタック）が開く（回帰確認） ──
    {
      const page = await browser.newPage();
      const codeUrl = encodeURIComponent(`${API_BASE}/codes/co3`);
      await page.goto(`http://localhost:${JSV_PORT}/index.html?code=${codeUrl}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      await page.click('#btn-run');
      await page.waitForTimeout(300);

      const isActive = await page.locator('.view-tab[data-view="state"]').evaluate(
        (el) => el.classList.contains('view-tab--active'),
      );
      check('[G] view未指定なら従来通り最初のビュー（コールスタック）が開く（回帰確認）', isActive);
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
