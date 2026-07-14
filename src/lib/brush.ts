/**
 * ブラシ描画系ツール（マスク作成・背景除去など）で共有する純粋ロジック。
 */

/** ブラシサイズの下限・上限（画像ピクセル単位の直径）。 */
export const BRUSH_MIN = 1;
export const BRUSH_MAX = 300;
/** ブラシサイズの初期値。 */
export const BRUSH_DEFAULT = 40;

/** ブラシサイズを許容範囲に丸める。 */
export function clampBrushSize(size: number): number {
  return Math.min(BRUSH_MAX, Math.max(BRUSH_MIN, Math.round(size)));
}

/**
 * Ctrl+ホイールでのブラシサイズ変更。
 * 上スクロール（deltaY < 0）で拡大、下スクロールで縮小。
 * サイズに比例した増減にしつつ、小サイズでも最低 1px は変化させる。
 */
export function nextBrushSize(current: number, deltaY: number): number {
  if (deltaY === 0) return clampBrushSize(current);
  const factor = Math.exp(-deltaY * 0.002);
  let next = current * factor;
  if (Math.abs(next - current) < 1) {
    next = current + (deltaY < 0 ? 1 : -1);
  }
  return clampBrushSize(next);
}

/**
 * 表示要素上の座標（clientX/Y）を画像のピクセル座標へ変換する。
 * キャンバスは CSS で縮小表示されるため、表示サイズと内部解像度の比で補正する。
 */
export function screenToImage(
  rect: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
  return {
    x: ((clientX - rect.left) / rect.width) * canvasWidth,
    y: ((clientY - rect.top) / rect.height) * canvasHeight,
  };
}

/** RGBA ピクセル列に1ピクセルでもアルファ > 0 の点があるか。 */
export function hasMaskPixels(src: Uint8ClampedArray): boolean {
  for (let i = 3; i < src.length; i += 4) {
    if (src[i] > 0) return true;
  }
  return false;
}

export interface DirtyRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * ブラシ1セグメントが影響する矩形（ダーティリスト）を返す。
 * 巨大画像でストロークごとに全面再合成しないための部分更新に使う。
 * キャンバス外にはみ出す分はクランプし、面積が 0 なら null。
 */
export function strokeDirtyRect(
  point: { x: number; y: number },
  last: { x: number; y: number } | null,
  brushSize: number,
  canvasWidth: number,
  canvasHeight: number,
): DirtyRect | null {
  const r = brushSize / 2 + 1; // アンチエイリアス分の余白
  const x0 = Math.floor(Math.min(point.x, last?.x ?? point.x) - r);
  const y0 = Math.floor(Math.min(point.y, last?.y ?? point.y) - r);
  const x1 = Math.ceil(Math.max(point.x, last?.x ?? point.x) + r);
  const y1 = Math.ceil(Math.max(point.y, last?.y ?? point.y) + r);
  const x = Math.max(0, x0);
  const y = Math.max(0, y0);
  const w = Math.min(canvasWidth, x1) - x;
  const h = Math.min(canvasHeight, y1) - y;
  if (w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

/** ブラシ1セグメント分を対象コンテキストへ描画する。erase = true で消去。 */
export function drawSegment(
  ctx: CanvasRenderingContext2D,
  color: string,
  erase: boolean,
  size: number,
  point: { x: number; y: number },
  last: { x: number; y: number } | null,
) {
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size;
  ctx.beginPath();
  if (!last) {
    ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}
