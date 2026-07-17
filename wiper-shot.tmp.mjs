import { chromium } from '@playwright/test';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript(() => localStorage.setItem('wmt-depth-autorun', '0'));
await page.goto('http://localhost:4173/#/tools/depth-estimator');
await page.setInputFiles('input[aria-label="対象画像"]', 'e2e/fixtures/sample.png');
await page.waitForTimeout(300);
// ダミーの深度結果を描画（見た目確認用）
await page.evaluate(() => {
  const canvas = document.querySelector('[data-testid="depth-canvas"]');
  const ctx = canvas.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, canvas.width, 0);
  g.addColorStop(0, '#111');
  g.addColorStop(1, '#eee');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
});
await page.getByRole('button', { name: '重ねて比較' }).click();
await page.waitForTimeout(200);
await page.screenshot({ path: 'screenshots/wiper-check.png', fullPage: true });
await browser.close();
console.log('done');
