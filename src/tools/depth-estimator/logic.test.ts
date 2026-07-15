import { describe, it, expect } from 'vitest';
import { COLORMAPS, DEPTH_MODEL_ID, depthToRgba } from './logic';

describe('DEPTH_MODEL_ID / COLORMAPS', () => {
  it('モデル ID は owner/name 形式', () => {
    expect(DEPTH_MODEL_ID).toMatch(/\//);
  });

  it('カラーマップ定義が揃っている', () => {
    expect(COLORMAPS.length).toBeGreaterThanOrEqual(2);
    for (const c of COLORMAPS) {
      expect(c.label).not.toBe('');
    }
  });
});

describe('depthToRgba', () => {
  const depth = new Uint8ClampedArray([0, 128, 255]);

  it('gray: 深度値をそのまま輝度にする', () => {
    const out = depthToRgba(depth, 'gray');
    expect(out.length).toBe(12);
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...out.slice(4, 8)]).toEqual([128, 128, 128, 255]);
    expect([...out.slice(8, 12)]).toEqual([255, 255, 255, 255]);
  });

  it('gray-inverted: 輝度を反転する', () => {
    const out = depthToRgba(depth, 'gray-inverted');
    expect(out[0]).toBe(255);
    expect(out[8]).toBe(0);
  });

  it('viridis: 端点がアンカー色と一致し、すべて不透明', () => {
    const out = depthToRgba(depth, 'viridis');
    expect([...out.slice(0, 3)]).toEqual([68, 1, 84]); // 最遠
    expect([...out.slice(8, 11)]).toEqual([253, 231, 37]); // 最近
    expect(out[3]).toBe(255);
    expect(out[11]).toBe(255);
  });

  it('inferno: 端点がアンカー色と一致する', () => {
    const out = depthToRgba(depth, 'inferno');
    expect([...out.slice(0, 3)]).toEqual([0, 0, 4]);
    expect([...out.slice(8, 11)]).toEqual([252, 255, 164]);
  });
});
