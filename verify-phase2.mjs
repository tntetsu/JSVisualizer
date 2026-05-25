import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8001';

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));

  await page.goto(BASE, { waitUntil: 'networkidle' });

  // 1. タブが5つ生成されているか確認
  const tabCount = await page.locator('.view-tab').count();
  console.log(`[1] タブ数: ${tabCount} (期待: 5)  ${tabCount === 5 ? '✅' : '❌'}`);

  // 2. コードを入力して実行
  const code = `function fib(n) {\n  if (n <= 1) return n;\n  return fib(n-1) + fib(n-2);\n}\nconst result = fib(4);\nconsole.log(result);`;
  await page.locator('#source-editor').fill(code);
  await page.locator('#btn-run').click();
  await page.waitForTimeout(500);

  // 3. 実行後: StateView が表示されているか
  const activeTab = await page.locator('.view-tab--active').textContent().catch(() => '(none)');
  console.log(`[3] 実行後アクティブタブ: "${activeTab.trim()}"`);
  const csNode = await page.locator('.cs-node').count();
  console.log(`[3b] cs-node 要素数: ${csNode}  ${csNode >= 1 ? '✅' : '❌'}`);

  // 4. 5ステップ進める
  for (let i = 0; i < 5; i++) {
    await page.locator('#btn-expr-forward').click();
    await page.waitForTimeout(60);
  }

  // 5. タブラベル確認
  const tabLabels = await page.locator('.view-tab').allTextContents();
  console.log(`[5] タブラベル: ${tabLabels.map(s => s.trim()).join(' | ')}`);

  // ヘルパー: タブをクリック
  const clickTab = async (keyword) => {
    const idx = tabLabels.findIndex(t => t.trim().includes(keyword));
    if (idx >= 0) { await page.locator('.view-tab').nth(idx).click(); await page.waitForTimeout(250); return true; }
    return false;
  };

  // 6. スコープビュー
  if (await clickTab('スコープ')) {
    const frames = await page.locator('.scv-frame').count();
    console.log(`[6] ScopeView フレーム数: ${frames}  ${frames >= 1 ? '✅' : '❌'}`);
    const varRows = await page.locator('.scv-frame .var-row').count();
    console.log(`[6b] ScopeView 変数行数: ${varRows}`);
  }

  // 7. AnimatedTrace
  if (await clickTab('トレース')) {
    const rows = await page.locator('.at-row').count();
    console.log(`[7] AnimatedTrace 行数: ${rows}  ${rows >= 5 ? '✅' : '❌'}`);
    const active = await page.locator('.at-row--active').count();
    console.log(`[7b] アクティブ行: ${active}  ${active === 1 ? '✅' : '❌'}`);
  }

  // 8. TraceTable
  if (await clickTab('全ステップ')) {
    const rows = await page.locator('.tt-row').count();
    console.log(`[8] TraceTable 行数: ${rows}  ${rows >= 5 ? '✅' : '❌'}`);
    const active = await page.locator('.tt-row--active').count();
    console.log(`[8b] アクティブ行: ${active}  ${active === 1 ? '✅' : '❌'}`);
  }

  // 9. CallStackView
  if (await clickTab('コールスタック')) {
    const cards = await page.locator('.csv-card').count();
    console.log(`[9] CallStackView カード数: ${cards}`);
  }

  // 10. さらに進める（fib の再帰に入る）
  await clickTab('変数');
  for (let i = 0; i < 20; i++) {
    await page.locator('#btn-expr-forward').click();
    await page.waitForTimeout(40);
  }

  // コールスタック深度確認
  await clickTab('コールスタック');
  const cards = await page.locator('.csv-card').count();
  console.log(`[10] 再帰後 コールスタックカード数: ${cards}  ${cards >= 2 ? '✅' : '❌'}`);

  // 11. AnimatedTrace で行が増えているか確認
  await clickTab('トレース');
  const rowsAfter = await page.locator('.at-row').count();
  console.log(`[11] 25ステップ後 AnimatedTrace 行数: ${rowsAfter}  ${rowsAfter > 5 ? '✅' : '❌'}`);

  // 12. 後退テスト（AnimatedTrace で行が減るか）
  for (let i = 0; i < 5; i++) {
    await page.locator('#btn-expr-back').click();
    await page.waitForTimeout(40);
  }
  const rowsBack = await page.locator('.at-row').count();
  console.log(`[12] 5ステップ戻り後 AnimatedTrace 行数: ${rowsBack} (before=${rowsAfter})  ${rowsBack < rowsAfter ? '✅' : '❌'}`);

  // 13. リセット
  await page.locator('#btn-reset').click();
  await page.waitForTimeout(200);
  const editorVisible = await page.locator('#editor-area').isVisible();
  console.log(`[13] リセット後 エディタ表示: ${editorVisible}  ${editorVisible ? '✅' : '❌'}`);

  // 14. 再実行してビルダーが再生成されるか（TraceTable を確認）
  await page.locator('#source-editor').fill('for(let i=0;i<3;i++){console.log(i);}');
  await page.locator('#btn-run').click();
  await page.waitForTimeout(400);
  await clickTab('全ステップ');
  const newRows = await page.locator('.tt-row').count();
  console.log(`[14] 再実行後 TraceTable 行数: ${newRows}  ${newRows >= 1 ? '✅' : '❌'}`);

  // JS エラーまとめ
  if (errors.length > 0) {
    console.log(`\n❌ JS エラー (${errors.length}件):`);
    errors.slice(0, 5).forEach(e => console.log('  ' + e));
  } else {
    console.log('\n✅ JS コンソールエラーなし');
  }

  await browser.close();
}

run().catch(e => { console.error(e); process.exit(1); });
