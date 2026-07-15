/** @type {import('tailwindcss').Config} */
export default {
  // テーマ切替 UI から <html class="dark"> で制御する（OS 連動は useTheme が仲介）
  darkMode: 'selector',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
