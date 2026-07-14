import { test, expect, type Page } from '@playwright/test';

const FIXTURE = 'e2e/fixtures/sample.png';

/** オーバーレイキャンバスに描画済みピクセルがあるかを返す。 */
async function overlayHasPixels(page: Page): Promise<boolean> {
  return page.getByTestId('mask-overlay').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/tools/image-mask-editor');
  await page.getByLabel('対象画像').setInputFiles(FIXTURE);
  await expect(page.getByTestId('mask-canvas-area')).toBeVisible();
});

test('ブラシでマスクを描ける', async ({ page }) => {
  const area = page.getByTestId('mask-canvas-area');
  const box = await area.boundingBox();
  if (!box) throw new Error('canvas area not found');

  expect(await overlayHasPixels(page)).toBe(false);

  // 中央を横切るドラッグ
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();

  expect(await overlayHasPixels(page)).toBe(true);

  // PR 添付用スクリーンショット
  await page.screenshot({ path: 'screenshots/tool-image-mask-editor-drawing.png', fullPage: true });
});

test('Ctrl+ホイールでブラシサイズが変わる', async ({ page }) => {
  const area = page.getByTestId('mask-canvas-area');
  const box = await area.boundingBox();
  if (!box) throw new Error('canvas area not found');

  const sizeBefore = Number(await page.getByTestId('brush-size-value').textContent());

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100); // 上スクロール → 拡大
  await page.keyboard.up('Control');

  await expect(async () => {
    const sizeAfter = Number(await page.getByTestId('brush-size-value').textContent());
    expect(sizeAfter).toBeGreaterThan(sizeBefore);
  }).toPass();

  // Ctrl なしのホイールでは変わらない
  const sizeAfterCtrl = Number(await page.getByTestId('brush-size-value').textContent());
  await page.mouse.wheel(0, -100);
  await page.waitForTimeout(100);
  expect(Number(await page.getByTestId('brush-size-value').textContent())).toBe(sizeAfterCtrl);
});

test('元に戻す・全消去が機能する', async ({ page }) => {
  const area = page.getByTestId('mask-canvas-area');
  const box = await area.boundingBox();
  if (!box) throw new Error('canvas area not found');

  const undoButton = page.getByRole('button', { name: '元に戻す' });
  await expect(undoButton).toBeDisabled();

  // 1ストローク描く → 元に戻すで消える
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  expect(await overlayHasPixels(page)).toBe(true);

  await undoButton.click();
  expect(await overlayHasPixels(page)).toBe(false);

  // 描いて全消去でも消える
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 5 });
  await page.mouse.up();
  expect(await overlayHasPixels(page)).toBe(true);

  await page.getByRole('button', { name: '全消去' }).click();
  expect(await overlayHasPixels(page)).toBe(false);
});

test('マスク画像をダウンロードできる', async ({ page }) => {
  const area = page.getByTestId('mask-canvas-area');
  const box = await area.boundingBox();
  if (!box) throw new Error('canvas area not found');

  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5, { steps: 3 });
  await page.mouse.up();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'マスク画像を保存' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sample_mask.png');
});
