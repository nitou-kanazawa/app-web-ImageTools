/** 背景除去ツールのロジック（UI から分離した純粋関数群）。 */

/** 自動除去で選択できるモデル。 */
export interface BgModelDef {
  /** Hugging Face Hub のモデル ID。 */
  id: string;
  /** UI に表示する名前。 */
  label: string;
  /** 量子化設定。q8 はダウンロードが小さく、fp32 は精度が安定。 */
  dtype: 'fp32' | 'q8';
}

export const BG_MODELS: BgModelDef[] = [
  { id: 'Xenova/modnet', label: '人物向け（軽量・高速）', dtype: 'fp32' },
  { id: 'onnx-community/BiRefNet_lite', label: '汎用（高精度・処理が重い）', dtype: 'q8' },
];

/**
 * アルファ値の配列（ピクセルごとに 0-255）を
 * 「残す部分マスク」（白 + アルファ）の RGBA ピクセル列へ変換する。
 */
export function alphaToWhiteMask(alpha: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(alpha.length * 4);
  for (let i = 0; i < alpha.length; i++) {
    out[i * 4] = 255;
    out[i * 4 + 1] = 255;
    out[i * 4 + 2] = 255;
    out[i * 4 + 3] = alpha[i];
  }
  return out;
}

/** RGBA ピクセル列がすべて不透明（アルファ = 255）か。リセット不要判定に使う。 */
export function isFullyOpaque(src: Uint8ClampedArray): boolean {
  for (let i = 3; i < src.length; i += 4) {
    if (src[i] < 255) return false;
  }
  return true;
}
