import { describe, it, expect } from 'vitest';
import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampPan,
  clampZoom,
  fitZoom,
  wheelZoomFactor,
  zoomAt,
} from './viewport';

describe('clampZoom / fitZoom', () => {
  it('ズーム率を範囲内へ丸める', () => {
    expect(clampZoom(1)).toBe(1);
    expect(clampZoom(0)).toBe(ZOOM_MIN);
    expect(clampZoom(100)).toBe(ZOOM_MAX);
  });

  it('フィットは収まる倍率（等倍上限）', () => {
    // 2000x1000 の画像を 1000x1000 に収める → 0.5
    expect(fitZoom(2000, 1000, 1000, 1000)).toBe(0.5);
    // 小さい画像は拡大しない
    expect(fitZoom(100, 100, 1000, 1000)).toBe(1);
    // 高さ制約が効くケース
    expect(fitZoom(1000, 2000, 1000, 1000)).toBe(0.5);
  });

  it('不正なサイズでは 1 を返す', () => {
    expect(fitZoom(0, 100, 100, 100)).toBe(1);
    expect(fitZoom(100, 100, 0, 100)).toBe(1);
  });
});

describe('clampPan', () => {
  it('ビューポートより小さい軸は中央寄せ', () => {
    expect(clampPan({ x: 999, y: -999 }, 100, 50, 200, 100)).toEqual({ x: 50, y: 25 });
  });

  it('ビューポートより大きい軸は端が離れない範囲に制限', () => {
    // scaled 400 / viewport 200 → x ∈ [-200, 0]
    expect(clampPan({ x: 10, y: 0 }, 400, 100, 200, 100).x).toBe(0);
    expect(clampPan({ x: -500, y: 0 }, 400, 100, 200, 100).x).toBe(-200);
    expect(clampPan({ x: -100, y: 0 }, 400, 100, 200, 100).x).toBe(-100);
  });
});

describe('zoomAt', () => {
  it('指定点の下の画像位置が変わらない', () => {
    // zoom 1 / pan (0,0) で点 (100, 50) を 2 倍へ
    const { zoom, pan } = zoomAt(1, { x: 0, y: 0 }, { x: 100, y: 50 }, 2);
    expect(zoom).toBe(2);
    // 点の下の画像座標: (100 - pan.x) / zoom = 100 → 変換後も (100 - (-100)) / 2 = 100
    expect((100 - pan.x) / zoom).toBeCloseTo(100);
    expect((50 - pan.y) / zoom).toBeCloseTo(50);
  });

  it('上限を超えるズームは丸められる', () => {
    const { zoom } = zoomAt(ZOOM_MAX, { x: 0, y: 0 }, { x: 0, y: 0 }, 2);
    expect(zoom).toBe(ZOOM_MAX);
  });
});

describe('wheelZoomFactor', () => {
  it('上スクロール（負の deltaY）で拡大、下で縮小', () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(0)).toBe(1);
  });
});
