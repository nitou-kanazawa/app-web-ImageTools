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

test('サイドバーを開閉できる（ボタン / Ctrl+B / 記憶）', async ({ page }) => {
  await page.goto('/');
  const sidebarLink = page.locator('aside').getByRole('link', { name: 'マスク画像作成' });
  await expect(sidebarLink).toBeVisible();

  // ボタンで閉じる
  await page.getByRole('button', { name: 'サイドバーを開閉' }).click();
  await expect(sidebarLink).not.toBeVisible();

  // Ctrl+B で開く
  await page.keyboard.press('Control+b');
  await expect(sidebarLink).toBeVisible();

  // 閉じた状態はリロード後も維持される
  await page.keyboard.press('Control+b');
  await expect(sidebarLink).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Web MiniTools' })).toBeVisible();
  await expect(sidebarLink).not.toBeVisible();
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
