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

/**
 * マスクキャンバスの RGBA ピクセルを白黒マスク（白=マスク部）へ変換する。
 * 塗った部分はアルファ > 0 として扱い、ソフトエッジは輝度に反映する。
 */
export function maskToBlackWhite(
  src: Uint8ClampedArray,
  invert = false,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    const v = invert ? 255 - a : a;
    out[i] = v;
    out[i + 1] = v;
    out[i + 2] = v;
    out[i + 3] = 255;
  }
  return out;
}

/**
 * 元画像の RGBA にマスクのアルファを適用して切り抜き画像を作る。
 * 元画像自体の透過は保持する（アルファは乗算）。
 * invert = true でマスク部を透過（マスク外を残す）。
 */
export function applyMaskAlpha(
  image: Uint8ClampedArray,
  mask: Uint8ClampedArray,
  invert = false,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(image.length);
  for (let i = 0; i < image.length; i += 4) {
    out[i] = image[i];
    out[i + 1] = image[i + 1];
    out[i + 2] = image[i + 2];
    const a = mask[i + 3];
    const m = invert ? 255 - a : a;
    out[i + 3] = Math.round((image[i + 3] * m) / 255);
  }
  return out;
}

/** マスクに1ピクセルでも塗りがあるか。 */
export function hasMaskPixels(src: Uint8ClampedArray): boolean {
  for (let i = 3; i < src.length; i += 4) {
    if (src[i] > 0) return true;
  }
  return false;
}

/** 出力ファイル名を作る（例: photo.jpg → photo_mask.png）。 */
export function exportFileName(originalName: string, suffix: string): string {
  const base = originalName.replace(/\.[^.]+$/, '') || 'image';
  return `${base}_${suffix}.png`;
}
