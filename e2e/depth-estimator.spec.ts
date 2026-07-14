import { test, expect } from '@playwright/test';

const FIXTURE = 'e2e/fixtures/sample.png';

test.beforeEach(async ({ page }) => {
  await page.goto('/#/tools/depth-estimator');
  await page.getByLabel('対象画像').setInputFiles(FIXTURE);
  await expect(page.getByTestId('depth-canvas')).toBeVisible();
});

test('画像読み込み直後は保存が無効で、生成ボタンがある', async ({ page }) => {
  await expect(page.getByRole('button', { name: '深度マップを保存' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '深度マップを生成' })).toBeEnabled();
  await expect(page.getByLabel('表示')).toBeVisible();
});

// 深度推定はモデルのダウンロードと推論が必要なため CI（ネットワークあり）でのみ実行する。
// ローカルで試す場合: RUN_ML_E2E=1 npm run e2e -- depth-estimator
test('深度マップの生成が完走し、結果が描画される', async ({ page }) => {
  test.skip(
    !process.env.CI && !process.env.RUN_ML_E2E,
    'モデルダウンロードが必要なため CI でのみ実行',
  );
  test.setTimeout(300_000);

  await page.getByRole('button', { name: '深度マップを生成' }).click();

  const status = page.getByTestId('depth-status');
  await expect(status).toBeVisible();
  // 終端状態（done / error）になるまで待ち、error なら即失敗させる
  await expect
    .poll(() => status.getAttribute('data-phase'), { timeout: 240_000, intervals: [2_000] })
    .toMatch(/^(done|error)$/);
  expect(
    await status.getAttribute('data-phase'),
    `status message: ${await status.textContent()}`,
  ).toBe('done');

  // 深度キャンバスに不透明なピクセルが描画されている
  const hasPixels = await page.getByTestId('depth-canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true;
    }
    return false;
  });
  expect(hasPixels).toBe(true);

  // 保存ボタンが有効になり、ファイル名が正しい
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '深度マップを保存' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sample_depth.png');

  await page.screenshot({ path: 'screenshots/tool-depth-estimator-result.png', fullPage: true });
});
