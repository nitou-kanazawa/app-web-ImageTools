import { describe, it, expect } from 'vitest';
import { BG_MODELS, alphaToWhiteMask, isFullyOpaque } from './logic';

describe('BG_MODELS', () => {
  it('モデル定義が揃っている', () => {
    expect(BG_MODELS.length).toBeGreaterThanOrEqual(2);
    for (const m of BG_MODELS) {
      expect(m.id).toMatch(/\//); // HF Hub の owner/name 形式
      expect(m.label).not.toBe('');
    }
  });
});

describe('alphaToWhiteMask', () => {
  it('アルファ配列から白マスク RGBA を作る', () => {
    const alpha = new Uint8ClampedArray([200, 0]);
    const out = alphaToWhiteMask(alpha);
    expect(out.length).toBe(8);
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 200]);
    expect([...out.slice(4, 8)]).toEqual([255, 255, 255, 0]);
  });
});

describe('isFullyOpaque', () => {
  it('すべて不透明なら true', () => {
    expect(isFullyOpaque(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]))).toBe(true);
  });

  it('1ピクセルでも透過があれば false', () => {
    expect(isFullyOpaque(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 254]))).toBe(false);
  });
});
