import { test, expect, type Page } from '@playwright/test';

const FIXTURE = 'e2e/fixtures/sample.png';

/** 表示キャンバスの透明ピクセル数（アルファ < 255）を返す。 */
async function transparentCount(page: Page): Promise<number> {
  return page.getByTestId('bg-display').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return -1;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) n++;
    }
    return n;
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/#/tools/background-remover');
  await page.getByLabel('対象画像').setInputFiles(FIXTURE);
  await expect(page.getByTestId('bg-canvas-area')).toBeVisible();
});

test('手動ブラシで消す・戻すができる', async ({ page }) => {
  const area = page.getByTestId('bg-canvas-area');
  const box = await area.boundingBox();
  if (!box) throw new Error('canvas area not found');

  // 初期状態は全ピクセル不透明
  expect(await transparentCount(page)).toBe(0);

  // 「消す」モード（デフォルト）でドラッグ → 透過になる
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();
  const afterErase = await transparentCount(page);
  expect(afterErase).toBeGreaterThan(0);

  // PR 添付用スクリーンショット
  await page.screenshot({ path: 'screenshots/tool-background-remover-erased.png', fullPage: true });

  // 「戻す」モードで同じ場所をなぞる → 透過が減る
  await page.getByRole('button', { name: '戻す', exact: true }).click();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 10 });
  await page.mouse.up();
  const afterRestore = await transparentCount(page);
  expect(afterRestore).toBeLessThan(afterErase);
});

test('元に戻す・リセットが機能する', async ({ page }) => {
  const area = page.getByTestId('bg-canvas-area');
  const box = await area.boundingBox();
  if (!box) throw new Error('canvas area not found');

  await expect(page.getByRole('button', { name: '元に戻す' })).toBeDisabled();

  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  expect(await transparentCount(page)).toBeGreaterThan(0);

  // 元に戻す → 透過が消える
  await page.getByRole('button', { name: '元に戻す' }).click();
  expect(await transparentCount(page)).toBe(0);

  // もう一度消してからリセット → 透過が消える
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.4, { steps: 5 });
  await page.mouse.up();
  expect(await transparentCount(page)).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'リセット' }).click();
  expect(await transparentCount(page)).toBe(0);
});

test('Ctrl+ホイールでブラシサイズが変わる', async ({ page }) => {
  const area = page.getByTestId('bg-canvas-area');
  const box = await area.boundingBox();
  if (!box) throw new Error('canvas area not found');

  const before = Number(await page.getByTestId('brush-size-value').textContent());
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect(async () => {
    expect(Number(await page.getByTestId('brush-size-value').textContent())).toBeGreaterThan(
      before,
    );
  }).toPass();
});

test('透過 PNG をダウンロードできる', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '透過 PNG を保存' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sample_nobg.png');
});

// 自動背景除去はモデルのダウンロードと推論が必要なため CI（ネットワークあり）でのみ実行する。
// ローカルで試す場合: RUN_ML_E2E=1 npm run e2e -- background-remover
test('自動背景除去（人物向けモデル）が完走する', async ({ page }) => {
  test.skip(
    !process.env.CI && !process.env.RUN_ML_E2E,
    'モデルダウンロードが必要なため CI でのみ実行',
  );
  test.setTimeout(300_000);

  await page.getByRole('button', { name: '自動で背景を除去' }).click();

  const status = page.getByTestId('auto-status');
  await expect(status).toBeVisible();
  // 完了（done）になるまで待つ。error になったら即失敗させる。
  await expect(async () => {
    const phase = await status.getAttribute('data-phase');
    expect(phase, `status message: ${await status.textContent()}`).not.toBe('error');
    expect(phase).toBe('done');
  }).toPass({ timeout: 240_000, intervals: [2_000] });

  await page.screenshot({ path: 'screenshots/tool-background-remover-auto.png', fullPage: true });
});
