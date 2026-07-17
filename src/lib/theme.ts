/** テーマ（ライト/ダーク/OS 連動）の純粋ロジック。 */

export type Theme = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'wmt-theme';

/** 初回アクセス時の既定テーマ（VS Code 風のダークを既定にする）。 */
export const DEFAULT_THEME: Theme = 'dark';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** テーマ設定と OS のダーク設定から、実際にダーク表示すべきかを返す。 */
export function resolveIsDark(theme: Theme, systemPrefersDark: boolean): boolean {
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return systemPrefersDark;
}

/** 切替ボタンの循環順: ダーク → ライト → OS 連動 → ダーク。 */
export function nextTheme(current: Theme): Theme {
  switch (current) {
    case 'dark':
      return 'light';
    case 'light':
      return 'system';
    case 'system':
      return 'dark';
  }
}

/** UI 表示用のラベルとアイコン名（src/components/icons.tsx のアイコンを参照）。 */
export const THEME_LABELS: Record<Theme, { icon: string; label: string }> = {
  dark: { icon: 'moon', label: 'ダーク' },
  light: { icon: 'sun', label: 'ライト' },
  system: { icon: 'monitor', label: 'OS に合わせる' },
};
