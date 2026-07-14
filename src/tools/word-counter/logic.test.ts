import { describe, it, expect } from 'vitest';
import { countText } from './logic';

describe('countText', () => {
  it('空文字はすべて 0', () => {
    expect(countText('')).toEqual({
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      lines: 0,
    });
  });

  it('単語と文字を数える', () => {
    const stats = countText('hello world');
    expect(stats.words).toBe(2);
    expect(stats.characters).toBe(11);
    expect(stats.charactersNoSpaces).toBe(10);
    expect(stats.lines).toBe(1);
  });

  it('改行を行数として数える', () => {
    expect(countText('a\nb\nc').lines).toBe(3);
  });

  it('前後の空白は単語数に影響しない', () => {
    expect(countText('  hello   world  ').words).toBe(2);
  });

  it('絵文字を1文字として数える', () => {
    expect(countText('😀').characters).toBe(1);
  });
});
