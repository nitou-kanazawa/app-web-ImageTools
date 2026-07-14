/**
 * マスク画像作成ツール固有のロジック。
 * ブラシ操作・座標変換など共通部分は src/lib/brush.ts にある。
 */

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
