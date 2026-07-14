import { describe, it, expect } from 'vitest';
import {
  BRUSH_MAX,
  BRUSH_MIN,
  clampBrushSize,
  hasMaskPixels,
  nextBrushSize,
  screenToImage,
  strokeDirtyRect,
} from './brush';

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

describe('hasMaskPixels', () => {
  it('塗りが1ピクセルでもあれば true', () => {
    expect(hasMaskPixels(new Uint8ClampedArray([0, 0, 0, 0, 255, 255, 255, 10]))).toBe(true);
  });

  it('未塗りなら false', () => {
    expect(hasMaskPixels(new Uint8ClampedArray([0, 0, 0, 0, 0, 0, 0, 0]))).toBe(false);
  });
});

describe('strokeDirtyRect', () => {
  it('点（開始ドット）はブラシ半径+余白の矩形になる', () => {
    const rect = strokeDirtyRect({ x: 50, y: 50 }, null, 20, 200, 200);
    expect(rect).toEqual({ x: 39, y: 39, w: 22, h: 22 });
  });

  it('セグメントは両端点を含む矩形になる', () => {
    const rect = strokeDirtyRect({ x: 100, y: 60 }, { x: 50, y: 50 }, 20, 200, 200);
    expect(rect).toEqual({ x: 39, y: 39, w: 72, h: 32 });
  });

  it('キャンバス外にはみ出す分はクランプされる', () => {
    const rect = strokeDirtyRect({ x: 5, y: 5 }, null, 20, 200, 200);
    expect(rect).toEqual({ x: 0, y: 0, w: 16, h: 16 });
  });

  it('完全にキャンバス外なら null', () => {
    expect(strokeDirtyRect({ x: -100, y: -100 }, null, 20, 200, 200)).toBeNull();
  });
});
