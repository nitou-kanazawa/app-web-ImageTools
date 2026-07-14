import { test } from '@playwright/test';

/**
 * 全ツールのスクリーンショットを `screenshots/` に保存する。
 *   npm run screenshots
 *
 * Claude が見た目を自己確認したり、PR にビフォー/アフターを添付するのに使う。
 * トップページのリンクを辿って各ツールを自動で巡回するので、
 * ツールを追加してもこのファイルを編集する必要はない。
 */
test('全ツールのスクリーンショットを撮影', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'screenshots/home.png', fullPage: true });

  // トップページにある各ツールへのリンク (#/tools/<slug>) を収集
  const hrefs = await page
    .locator('a[href*="#/tools/"]')
    .evaluateAll((els) =>
      els
        .map((el) => (el as HTMLAnchorElement).getAttribute('href') ?? '')
        .filter((href, i, arr) => href !== '' && arr.indexOf(href) === i),
    );

  for (const href of hrefs) {
    const slug = href.split('#/tools/')[1]?.replace(/\/$/, '');
    if (!slug) continue;
    await page.goto(`/#/tools/${slug}`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: `screenshots/tool-${slug}.png`, fullPage: true });
  }
});
