/**
 * verify-bhv-hook.mjs — BhvVisualizer連携フック(# BHV:)の単体動作検証
 *
 * postMessageハンドシェイク・run/step/lifecycleイベント送出を、実ブラウザ(Playwright)で確認する。
 * Firestore/BhvVisualizer本体は使わず、iframe埋め込みをその場で模したページで検証する。
 *
 * 実行: node verify-bhv-hook.mjs
 */
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR   = path.join(__dirname, 'web');
const JSV_PORT  = 8010;
const BHV_PORT  = 5000; // app.js の BHV_ALLOWED_ORIGINS に含まれるポート

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function serveDir(dir, port) {
  const server = http.createServer((req, res) => {
    const filePath = path.join(dir, req.url === '/' ? '/index.html' : req.url);
    fs.readFile(filePath, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

const PARENT_HTML = `<!doctype html>
<html><body>
<iframe id="jsv" src="http://localhost:${JSV_PORT}/index.html" style="width:900px;height:700px;"></iframe>
<script>
  window.__received = [];
  window.addEventListener('message', (e) => {
    if (e.data && e.data.source === 'jsvisualizer') window.__received.push(e.data);
  });
  window.sendInit = (sessionId) => {
    document.getElementById('jsv').contentWindow.postMessage(
      { source: 'bhv', type: 'init', studentUid: 'test-uid', sessionId, context: { courseId: 'c1' } },
      'http://localhost:${JSV_PORT}'
    );
  };
</script>
</body></html>`;

let failures = 0;
function check(label, cond) {
  console.log(`${cond ? '✅' : '❌'} ${label}`);
  if (!cond) failures++;
}

async function run() {
  fs.mkdirSync(path.join(__dirname, '.bhv-test-tmp'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, '.bhv-test-tmp', 'parent.html'), PARENT_HTML);

  const jsvServer = await serveDir(WEB_DIR, JSV_PORT);
  const bhvServer = await serveDir(path.join(__dirname, '.bhv-test-tmp'), BHV_PORT);

  const browser = await chromium.launch({ headless: true });

  try {
    // ── テストA: スタンドアロン起動時に副作用がないこと ────────────────
    {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

      await page.goto(`http://localhost:${JSV_PORT}/index.html`, { waitUntil: 'networkidle' });
      await page.selectOption('#sample-select', { label: 'Fibonacci (recursive)' });
      await page.click('#btn-run');
      await page.waitForTimeout(200);
      await page.click('#btn-human-forward');
      await page.waitForTimeout(100);

      check('[A] スタンドアロン起動でJSエラーが発生しない', errors.length === 0);
      if (errors.length) console.log('  errors:', errors);
      await page.close();
    }

    // ── テストB: 埋め込まれていても init を受け取るまでは記録しないこと ──
    {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${BHV_PORT}/parent.html`, { waitUntil: 'networkidle' });
      const frame = page.frameLocator('#jsv');
      await frame.locator('#sample-select').selectOption({ label: 'Fibonacci (recursive)' });
      await frame.locator('#btn-run').click();
      await page.waitForTimeout(200);
      await frame.locator('#btn-human-forward').click();
      await page.waitForTimeout(100);

      const received = await page.evaluate(() => window.__received);
      check('[B] init未送信ならメッセージが一切届かない', received.length === 0);
      await page.close();
    }

    // ── テストC: init 送信後、lifecycle/run/step/reset が届くこと ────────
    {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${BHV_PORT}/parent.html`, { waitUntil: 'networkidle' });
      const frame = page.frameLocator('#jsv');

      await page.evaluate((sid) => window.sendInit(sid), 'test-session-1');
      await page.waitForTimeout(100);

      let received = await page.evaluate(() => window.__received);
      const lifecycleStart = received.find((m) => m.type === 'lifecycle' && m.phase === 'start');
      check('[C] init受理直後に lifecycle:start が届く', !!lifecycleStart);
      check('[C] lifecycle:start に sessionId が付与されている', lifecycleStart?.sessionId === 'test-session-1');

      await frame.locator('#sample-select').selectOption({ label: 'Fibonacci (recursive)' }); // Fibonacci (recursive)
      await frame.locator('#btn-run').click();
      await page.waitForTimeout(200);

      received = await page.evaluate(() => window.__received);
      const runEvent = received.find((m) => m.type === 'run');
      check('[C] Run操作で run イベントが届く', !!runEvent);
      check('[C] run イベントに success:true が入る', runEvent?.success === true);
      check('[C] run イベントに code(全文)が入る', typeof runEvent?.code === 'string' && runEvent.code.includes('fib'));
      check('[C] run イベントに traceLength が入る', typeof runEvent?.traceLength === 'number' && runEvent.traceLength > 0);

      await frame.locator('#btn-human-forward').click();
      await page.waitForTimeout(100);

      received = await page.evaluate(() => window.__received);
      const stepEvent = received.find((m) => m.type === 'step' && m.action === 'humanFwd');
      check('[C] ステップ操作で step イベントが届く', !!stepEvent);
      check('[C] step イベントに loc(行番号)が入る', !!stepEvent?.loc && typeof stepEvent.loc.line === 'number');

      await frame.locator('#btn-edit').click();
      await page.waitForTimeout(100);
      received = await page.evaluate(() => window.__received);
      check('[C] Editへ戻る操作で reset イベントが届く', received.some((m) => m.type === 'reset'));

      await page.close();
    }

    // ── テストD: 構文エラー時も run イベント(success:false)が届くこと ──
    {
      const page = await browser.newPage();
      await page.goto(`http://localhost:${BHV_PORT}/parent.html`, { waitUntil: 'networkidle' });
      const frame = page.frameLocator('#jsv');
      await page.evaluate((sid) => window.sendInit(sid), 'test-session-2');
      await page.waitForTimeout(100);

      // CodeMirrorの内容を直接書き換えて不正なコードを実行させる
      await frame.locator('.cm-content').click();
      await page.keyboard.press('Control+A');
      await page.keyboard.type('function( {{{ invalid syntax', { delay: 5 });
      await frame.locator('#btn-run').click();
      await page.waitForTimeout(200);

      const received = await page.evaluate(() => window.__received);
      const errRun = received.find((m) => m.type === 'run' && m.success === false);
      check('[D] 構文エラー時も run イベント(success:false)が届く', !!errRun);
      check('[D] errorType が parse になる', errRun?.errorType === 'parse');
      await page.close();
    }
  } finally {
    await browser.close();
    jsvServer.close();
    bhvServer.close();
    fs.rmSync(path.join(__dirname, '.bhv-test-tmp'), { recursive: true, force: true });
  }

  console.log(`\n${failures === 0 ? '✅ 全テスト合格' : `❌ ${failures}件失敗`}`);
  process.exit(failures === 0 ? 0 : 1);
}

run();
