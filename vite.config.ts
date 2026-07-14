import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// base を './' にすることで、GitHub Pages のサブパスや PR プレビューなど
// どの配信パスに置かれても相対パスでアセットを解決できる。
// ルーティングは HashRouter を使うため、サーバ側のリライト設定は不要。
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // E2E (Playwright) は vitest の対象外にする
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
});
