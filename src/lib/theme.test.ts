import { describe, it, expect } from 'vitest';
import { DEFAULT_THEME, isTheme, nextTheme, resolveIsDark, THEME_LABELS } from './theme';

describe('isTheme', () => {
  it('有効な値だけを受け付ける', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('system')).toBe(true);
    expect(isTheme('blue')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
  });
});

describe('resolveIsDark', () => {
  it('dark / light は OS 設定に関係なく固定', () => {
    expect(resolveIsDark('dark', false)).toBe(true);
    expect(resolveIsDark('dark', true)).toBe(true);
    expect(resolveIsDark('light', true)).toBe(false);
    expect(resolveIsDark('light', false)).toBe(false);
  });

  it('system は OS 設定に従う', () => {
    expect(resolveIsDark('system', true)).toBe(true);
    expect(resolveIsDark('system', false)).toBe(false);
  });
});

describe('nextTheme', () => {
  it('ダーク → ライト → OS 連動 → ダーク の循環', () => {
    expect(nextTheme('dark')).toBe('light');
    expect(nextTheme('light')).toBe('system');
    expect(nextTheme('system')).toBe('dark');
  });

  it('既定テーマとラベルが揃っている', () => {
    expect(isTheme(DEFAULT_THEME)).toBe(true);
    for (const t of ['light', 'dark', 'system'] as const) {
      expect(THEME_LABELS[t].label).not.toBe('');
      expect(THEME_LABELS[t].icon).not.toBe('');
    }
  });
});
