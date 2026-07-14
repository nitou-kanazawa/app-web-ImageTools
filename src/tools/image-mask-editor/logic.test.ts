import { describe, it, expect } from 'vitest';
import {
  BRUSH_MAX,
  BRUSH_MIN,
  applyMaskAlpha,
  clampBrushSize,
  exportFileName,
  hasMaskPixels,
  maskToBlackWhite,
  nextBrushSize,
  screenToImage,
} from './logic';

describe('clampBrushSize', () => {
  it('範囲内はそのまま（丸めのみ）', () => {
    expect(clampBrushSize(40)).toBe(40);
    expect(clampBrushSize(40.6)).toBe(41);
  });

  it('下限・上限に丸める', () => {
    expect(clampBrushSize(0)).toBe(BRUSH_MIN);
    expect(clampBrushSize(-10)).toBe(BRUSH_MIN);
    expect(clampBrushSize(9999)).toBe(BRUSH_MAX);
  });
});

describe('nextBrushSize', () => {
  it('上スクロール（deltaY < 0）で拡大する', () => {
    expect(nextBrushSize(40, -100)).toBeGreaterThan(40);
  });

  it('下スクロール（deltaY > 0）で縮小する', () => {
    expect(nextBrushSize(40, 100)).toBeLessThan(40);
  });

  it('小さいサイズでも最低 1px は変化する', () => {
    expect(nextBrushSize(2, -1)).toBe(3);
    expect(nextBrushSize(2, 1)).toBe(1);
  });

  it('deltaY = 0 では変化しない', () => {
    expect(nextBrushSize(40, 0)).toBe(40);
  });

  it('範囲を超えない', () => {
    expect(nextBrushSize(BRUSH_MAX, -1000)).toBe(BRUSH_MAX);
    expect(nextBrushSize(BRUSH_MIN, 1000)).toBe(BRUSH_MIN);
  });

  it('連続して縮小すれば必ず下限に到達する（無限ループしない）', () => {
    let size = BRUSH_MAX;
    for (let i = 0; i < 1000 && size > BRUSH_MIN; i++) {
      const next = nextBrushSize(size, 100);
      expect(next).toBeLessThan(size);
      size = next;
    }
    expect(size).toBe(BRUSH_MIN);
  });
});

describe('screenToImage', () => {
  const rect = { left: 10, top: 20, width: 100, height: 50 };

  it('表示座標を画像ピクセル座標へ変換する', () => {
    // 表示 100x50 / 内部 200x100 → 2倍
    expect(screenToImage(rect, 200, 100, 10, 20)).toEqual({ x: 0, y: 0 });
    expect(screenToImage(rect, 200, 100, 60, 45)).toEqual({ x: 100, y: 50 });
    expect(screenToImage(rect, 200, 100, 110, 70)).toEqual({ x: 200, y: 100 });
  });

  it('表示サイズ 0 では 0,0 を返す（ゼロ除算しない）', () => {
    expect(screenToImage({ left: 0, top: 0, width: 0, height: 0 }, 200, 100, 5, 5)).toEqual({
      x: 0,
      y: 0,
    });
  });
});

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
});

describe('hasMaskPixels', () => {
  it('塗りが1ピクセルでもあれば true', () => {
    expect(hasMaskPixels(new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 10]))).toBe(true);
  });

  it('未塗りなら false', () => {
    expect(hasMaskPixels(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
});

describe('exportFileName', () => {
  it('拡張子を除いて suffix を付ける', () => {
    expect(exportFileName('photo.jpg', 'mask')).toBe('photo_mask.png');
    expect(exportFileName('a.b.c.png', 'cutout')).toBe('a.b.c_cutout.png');
  });

  it('拡張子なし・空文字にも対応する', () => {
    expect(exportFileName('photo', 'mask')).toBe('photo_mask.png');
    expect(exportFileName('', 'mask')).toBe('image_mask.png');
  });
});
