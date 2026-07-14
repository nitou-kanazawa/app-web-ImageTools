import { test, expect } from '@playwright/test';

test('トップページにツール一覧が表示される', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Web MiniTools' })).toBeVisible();
  // サンプルツールへのリンクが存在する
  await expect(page.getByRole('link', { name: /文字数カウンター/ })).toBeVisible();
});

test('文字数カウンターが動作する', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /文字数カウンター/ }).click();

  const textarea = page.getByLabel('入力テキスト');
  await textarea.fill('hello world');

  // 「単語数」カードが 2 を表示する
  await expect(page.getByTestId('stat-words')).toContainText('2');
  await expect(page.getByTestId('stat-characters')).toContainText('11');
});
