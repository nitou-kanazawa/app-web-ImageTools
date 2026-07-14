import { describe, it, expect } from 'vitest';
import { applyMaskAlpha, maskToBlackWhite } from './logic';

describe('maskToBlackWhite', () => {
  // 2ピクセル: [塗り(alpha=255), 未塗り(alpha=0)]
  const src = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);

  it('塗った部分を白、未塗りを黒にする', () => {
    const out = maskToBlackWhite(src);
    expect([...out.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...out.slice(4, 8)]).toEqual([0, 0, 0, 255]);
  });

  it('invert で白黒が反転する', () => {
    const out = maskToBlackWhite(src, true);
    expect([...out.slice(0, 4)]).toEqual([0, 0, 0, 255]);
    expect([...out.slice(4, 8)]).toEqual([255, 255, 255, 255]);
  });

  it('ソフトエッジ（中間アルファ）は輝度に反映する', () => {
    const soft = new Uint8ClampedArray([255, 255, 255, 128]);
    const out = maskToBlackWhite(soft);
    expect(out[0]).toBe(128);
    expect(out[3]).toBe(255);
  });
});

describe('applyMaskAlpha', () => {
  // 画像2ピクセル（赤・緑、どちらも不透明）
  const image = new Uint8ClampedArray([200, 10, 10, 255, 10, 200, 10, 255]);
  // マスク: 1ピクセル目だけ塗り
  const mask = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);

  it('マスク部だけ残す（アルファに反映）', () => {
    const out = applyMaskAlpha(image, mask);
    expect([...out.slice(0, 4)]).toEqual([200, 10, 10, 255]);
    expect([...out.slice(4, 8)]).toEqual([10, 200, 10, 0]);
  });

  it('invert でマスク部を透過する', () => {
    const out = applyMaskAlpha(image, mask, true);
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(255);
  });

  it('元画像の透過を保持する（アルファは乗算）', () => {
    // 元画像: [完全透過, 半透過(128)]
    const transparent = new Uint8ClampedArray([200, 10, 10, 0, 10, 200, 10, 128]);
    // マスク: 両ピクセルとも塗り
    const full = new Uint8ClampedArray([255, 255, 255, 255, 255, 255, 255, 255]);
    const out = applyMaskAlpha(transparent, full);
    expect(out[3]).toBe(0); // 透過ピクセルは透過のまま
    expect(out[7]).toBe(128); // 半透過も維持
  });
});
