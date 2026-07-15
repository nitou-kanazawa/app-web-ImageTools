import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  isTheme,
  nextTheme,
  resolveIsDark,
  type Theme,
} from './theme';

/**
 * テーマ状態の管理。<html> の `dark` クラスを付け外しし、選択を localStorage に保存する。
 * `system` 選択中は OS 設定の変化にも追従する。
 * （初回描画前の適用は index.html のインラインスクリプトが行う）
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      return isTheme(stored) ? stored : DEFAULT_THEME;
    } catch {
      return DEFAULT_THEME;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // プライベートモード等で保存できなくても表示は続行する
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      document.documentElement.classList.toggle('dark', resolveIsDark(theme, mq.matches));
    apply();
    if (theme === 'system') {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [theme]);

  const cycleTheme = useCallback(() => setTheme(nextTheme), []);

  return { theme, cycleTheme };
}
