import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright 設定。
 * `webServer` で本番ビルドのプレビューを自動起動するので、
 * `npm run e2e` / `npm run screenshots` を実行するだけで検証できる。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 通常は Playwright が管理するブラウザを使う。
        // ブラウザを別途インストール済みの環境では PW_EXECUTABLE_PATH で上書きできる。
        launchOptions: process.env.PW_EXECUTABLE_PATH
          ? { executablePath: process.env.PW_EXECUTABLE_PATH }
          : {},
      },
    },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
