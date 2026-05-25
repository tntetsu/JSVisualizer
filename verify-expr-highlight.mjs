import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8001';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  const errors  = [];
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  const code = `const x = 1 + 2;\nconst y = x * 3;\nconsole.log(y);`;
  await page.locator('#source-editor').fill(code);
  await page.locator('#btn-run').click();
  await page.waitForTimeout(300);

  let highlighted = 0;
  for (let i = 0; i < 25; i++) {
    const done = await page.locator('#btn-expr-forward').isDisabled();
    if (done) break;
    await page.locator('#btn-expr-forward').click();
    await page.waitForTimeout(30);

    const cnt = await page.locator('.cv-expr-highlight').count();
    if (cnt > 0) {
      const box = await page.locator('.cv-expr-highlight').first().boundingBox();
      const codeTxt = await page.locator('.cv-line--active .cv-line-code').first().textContent().catch(() => '?');
      if (highlighted < 8) {
        console.log(`[step${i+1}] ✅ expr-highlight: left=${box?.x?.toFixed(0)}px w=${box?.width?.toFixed(0)}px | "${codeTxt.trim()}"`);
      }
      highlighted++;
    }
  }
  console.log(`\n式ハイライト発生ステップ数: ${highlighted}  ${highlighted >= 3 ? '✅' : '❌'}`);

  // 後退でも正しくハイライト位置が変わるか確認
  console.log('\n── 後退テスト ──');
  for (let i = 0; i < 3; i++) {
    await page.locator('#btn-expr-back').click();
    await page.waitForTimeout(40);
    const cnt = await page.locator('.cv-expr-highlight').count();
    const box = cnt > 0 ? await page.locator('.cv-expr-highlight').first().boundingBox() : null;
    const codeTxt = await page.locator('.cv-line--active .cv-line-code').first().textContent().catch(() => '?');
    console.log(`後退${i+1}: hl=${cnt} left=${box?.x?.toFixed(0) ?? '-'}px w=${box?.width?.toFixed(0) ?? '-'}px | "${codeTxt.trim()}"`);
  }

  // リセット後はハイライトが消えるか
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(200);
  const afterReset = await page.locator('.cv-expr-highlight').count();
  const afterActiveLine = await page.locator('.cv-line--active').count();
  console.log(`\nリセット後: expr-highlight=${afterReset}  active-line=${afterActiveLine}  ${afterReset === 0 && afterActiveLine === 0 ? '✅' : '❌'}`);

  if (errors.length > 0) console.log('\n❌ JS エラー:', errors);
  else console.log('✅ JS コンソールエラーなし');

  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
