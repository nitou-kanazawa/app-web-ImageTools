import { test, expect } from '@playwright/test';

test('トップページにツール一覧が表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Web MiniTools' })).toBeVisible();
  // サンプルツールへのリンクが存在する（サイドバーとウェルカム画面の両方にある）
  await expect(page.getByRole('link', { name: /文字数カウンター/ }).first()).toBeVisible();
});

test('テーマを切り替えられる', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  // 既定はダーク
  await expect(html).toHaveClass(/dark/);

  const toggle = page.getByRole('button', { name: 'テーマを切り替え' });
  await toggle.click(); // ダーク → ライト
  await expect(html).not.toHaveClass(/dark/);
  await toggle.click(); // ライト → OS 連動（Playwright 既定はライト）
  await expect(html).not.toHaveClass(/dark/);
  await toggle.click(); // OS 連動 → ダーク
  await expect(html).toHaveClass(/dark/);

  // 選択が保存され、リロード後も維持される
  await page.reload();
  await expect(html).toHaveClass(/dark/);
});

test('文字数カウンターが動作する', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('link', { name: /文字数カウンター/ })
    .first()
    .click();

  const textarea = page.getByLabel('入力テキスト');
  await textarea.fill('hello world');

  // 「単語数」カードが 2 を表示する
  await expect(page.getByTestId('stat-words')).toContainText('2');
  await expect(page.getByTestId('stat-characters')).toContainText('11');
});
