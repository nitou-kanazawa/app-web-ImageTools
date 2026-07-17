import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';

const FIXTURE = 'e2e/fixtures/sample.png';
const FIXTURE2 = 'e2e/fixtures/sample2.png';

/** DataTransfer 経由でドロップイベントを発火し、ファイル添付をシミュレートする。 */
async function dropFile(page: Page, selector: string, path: string, name: string) {
  const bytes = Array.from(readFileSync(path));
  await page.evaluate(
    ({ selector, bytes, name }) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`drop target not found: ${selector}`);
      const dt = new DataTransfer();
      dt.items.add(new File([new Uint8Array(bytes)], name, { type: 'image/png' }));
      el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }));
    },
    { selector, bytes, name },
  );
}

test.beforeEach(async ({ page }) => {
  // ローカル実行では自動生成（モデルダウンロード）を無効にしてテストを決定的にする
  await page.addInitScript(() => localStorage.setItem('wmt-depth-autorun', '0'));
  await page.goto('/#/tools/depth-estimator');
  await page.getByLabel('対象画像').setInputFiles(FIXTURE);
  await expect(page.getByTestId('depth-canvas')).toBeVisible();
});

test('画像読み込み直後は保存が無効で、操作 UI が揃っている', async ({ page }) => {
  await expect(page.getByRole('button', { name: '深度マップを保存' })).toBeDisabled();
  await expect(page.getByRole('button', { name: '深度マップを生成' })).toBeEnabled();
  // 表示モード / カラーマップのトグルグループ
  await expect(page.getByRole('button', { name: '横並び' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重ねて比較' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'グレー', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Viridis' })).toBeVisible();
  // 自動生成チェックボックス
  await expect(page.getByLabel('読み込み時に自動生成')).toBeVisible();
});

test('ドラッグ&ドロップで画像を素早く差し替えられる', async ({ page }) => {
  await expect(page.getByTestId('status-size')).toHaveText('200×150px');

  await dropFile(page, '[data-testid="depth-drop-target"]', FIXTURE2, 'second.png');

  await expect(page.getByTestId('status-size')).toHaveText('120×90px');
  // 前の画像の結果は破棄され、保存は再び無効になる
  await expect(page.getByRole('button', { name: '深度マップを保存' })).toBeDisabled();
});

test('重ねて比較（ワイパー）へ切り替えると分割線が表示され、ドラッグで動く', async ({ page }) => {
  await page.getByRole('button', { name: '重ねて比較' }).click();
  const divider = page.getByTestId('wiper-divider');
  await expect(divider).toBeVisible();

  const view = page.getByTestId('depth-view');
  const box = await view.boundingBox();
  if (!box) throw new Error('depth view not found');

  // 左端付近へドラッグ → 分割線が左へ寄る
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();

  const dividerBox = await divider.boundingBox();
  if (!dividerBox) throw new Error('divider not found');
  expect(dividerBox.x - box.x).toBeLessThan(box.width * 0.2);

  // 横並びへ戻せる
  await page.getByRole('button', { name: '横並び' }).click();
  await expect(divider).not.toBeVisible();
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

  // ワイパー表示に切り替えても結果が保持されている（キャンバスは再マウントされない）
  await page.getByRole('button', { name: '重ねて比較' }).click();
  await expect(page.getByTestId('wiper-divider')).toBeVisible();

  // 保存ボタンが有効になり、ファイル名が正しい
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '深度マップを保存' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sample_depth.png');

  await page.screenshot({ path: 'screenshots/tool-depth-estimator-result.png', fullPage: true });
});
