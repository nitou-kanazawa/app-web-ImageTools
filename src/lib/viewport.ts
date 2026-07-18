/** キャンバスのズーム / パン（表示位置）の純粋ロジック。 */

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;

export interface Pan {
  x: number;
  y: number;
}

/** ズーム率を許容範囲に丸める。 */
export function clampZoom(zoom: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

/**
 * 画像全体がビューポートに収まるズーム率（等倍を上限とし、拡大はしない）。
 */
export function fitZoom(
  imageWidth: number,
  imageHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (imageWidth <= 0 || imageHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) return 1;
  return clampZoom(Math.min(viewportWidth / imageWidth, viewportHeight / imageHeight, 1));
}

/**
 * パンを妥当な範囲へ丸める。
 * 表示サイズがビューポートより小さい軸は中央寄せ、大きい軸は端が離れない範囲に制限する。
 */
export function clampPan(
  pan: Pan,
  scaledWidth: number,
  scaledHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): Pan {
  const clampAxis = (value: number, scaled: number, viewport: number) => {
    if (scaled <= viewport) return (viewport - scaled) / 2;
    return Math.min(0, Math.max(viewport - scaled, value));
  };
  return {
    x: clampAxis(pan.x, scaledWidth, viewportWidth),
    y: clampAxis(pan.y, scaledHeight, viewportHeight),
  };
}

/**
 * 指定点（ビューポート座標）を中心にズームしたときの新しいズーム率とパンを返す。
 * 返り値のパンは未クランプ（呼び出し側で clampPan する）。
 */
export function zoomAt(
  zoom: number,
  pan: Pan,
  point: Pan,
  factor: number,
): { zoom: number; pan: Pan } {
  const next = clampZoom(zoom * factor);
  const ratio = next / zoom;
  return {
    zoom: next,
    pan: {
      x: point.x - (point.x - pan.x) * ratio,
      y: point.y - (point.y - pan.y) * ratio,
    },
  };
}

/** ホイールの deltaY をズーム倍率へ変換する（上スクロールで拡大）。 */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.0015);
}
