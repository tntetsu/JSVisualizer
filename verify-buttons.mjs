import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8001';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();
  const errors  = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console',   m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 1. ボタン数確認
  const btns = await page.locator('.ctrl-btn').count();
  console.log(`[1] ctrl-btn 総数: ${btns} (期待: ⏮+8+⏭=10)`);

  // 2. nav ボタンが2つあるか
  const navBtns = await page.locator('.ctrl-btn--nav').count();
  console.log(`[2] ctrl-btn--nav: ${navBtns} (期待: 2)`);

  // 3. グリッドが存在するか
  const grid = await page.locator('.ctrl-grid').count();
  console.log(`[3] ctrl-grid: ${grid} (期待: 1)`);

  // 4. 各ボタンの存在確認
  for (const id of ['btn-start','btn-stmt-back','btn-expr-back','btn-expr-forward',
                    'btn-stmt-forward','btn-call-back','btn-human-back',
                    'btn-human-forward','btn-call-forward','btn-end']) {
    const count = await page.locator(`#${id}`).count();
    const ok    = count === 1 ? '✅' : '❌';
    console.log(`[4] #${id}: ${ok}`);
  }

  // 5. コードを実行してボタンが有効になるか
  const code = `function fib(n){if(n<=1)return n;return fib(n-1)+fib(n-2);}fib(5);`;
  await page.locator('#source-editor').fill(code);
  await page.locator('#btn-run').click();
  await page.waitForTimeout(400);

  const startDisabled = await page.locator('#btn-start').isDisabled();
  console.log(`[5] 実行後 btn-start disabled=${startDisabled} (先頭にいるので期待: true)`);

  // 6. 人間単位ステップ（▷人ボタン）を5回クリック
  const counter0 = await page.locator('#step-counter').textContent();
  for (let i = 0; i < 5; i++) {
    await page.locator('#btn-human-forward').click();
    await page.waitForTimeout(60);
  }
  const counter5h = await page.locator('#step-counter').textContent();
  console.log(`[6] 人間単位5回: ${counter0} → ${counter5h}`);

  // 7. 関数単位ステップ（⏩関ボタン）を1回クリック
  const counterBefore = await page.locator('#step-counter').textContent();
  await page.locator('#btn-call-forward').click();
  await page.waitForTimeout(100);
  const counterAfter = await page.locator('#step-counter').textContent();
  console.log(`[7] 関数単位1回: ${counterBefore} → ${counterAfter} (大きくジャンプするはず)`);

  // 8. キーボード h で人間単位前進
  const counterBeforeKey = await page.locator('#step-counter').textContent();
  await page.keyboard.press('h');
  await page.waitForTimeout(100);
  const counterAfterKey = await page.locator('#step-counter').textContent();
  console.log(`[8] キー h（人間単位）: ${counterBeforeKey} → ${counterAfterKey}  ${counterBeforeKey !== counterAfterKey ? '✅' : '❌'}`);

  // 9. キーボード f で関数単位前進
  const c1 = await page.locator('#step-counter').textContent();
  await page.keyboard.press('f');
  await page.waitForTimeout(100);
  const c2 = await page.locator('#step-counter').textContent();
  console.log(`[9] キー f（関数単位）: ${c1} → ${c2}  ${c1 !== c2 ? '✅' : '❌'}`);

  // 10. ⏪ 関数単位後退
  await page.locator('#btn-call-back').click();
  await page.waitForTimeout(100);
  const c3 = await page.locator('#step-counter').textContent();
  console.log(`[10] 関数単位後退: ${c2} → ${c3}  ${c2 !== c3 ? '✅' : '❌'}`);

  if (errors.length > 0) {
    console.log(`\n❌ JS エラー (${errors.length}件):`);
    errors.slice(0,5).forEach(e => console.log('  '+e));
  } else {
    console.log('\n✅ JS コンソールエラーなし');
  }
  await browser.close();
}
run().catch(e => { console.error(e); process.exit(1); });
