/** 深度マップ生成ツールのロジック（UI から分離した純粋関数群）。 */

/** 使用する深度推定モデル（Apache-2.0・非 gated）。 */
export const DEPTH_MODEL_ID = 'onnx-community/depth-anything-v2-small';

export type ColormapName = 'gray' | 'gray-inverted' | 'viridis' | 'inferno';

export const COLORMAPS: { value: ColormapName; label: string }[] = [
  { value: 'gray', label: 'グレースケール（近い=白）' },
  { value: 'gray-inverted', label: 'グレースケール（近い=黒）' },
  { value: 'viridis', label: 'カラー (Viridis)' },
  { value: 'inferno', label: 'カラー (Inferno)' },
];

// カラーマップのアンカー色（matplotlib の代表点を線形補間する近似）
const VIRIDIS_ANCHORS: [number, number, number][] = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [109, 205, 89],
  [180, 222, 44],
  [253, 231, 37],
];

const INFERNO_ANCHORS: [number, number, number][] = [
  [0, 0, 4],
  [27, 12, 65],
  [74, 12, 107],
  [120, 28, 109],
  [165, 44, 96],
  [207, 68, 70],
  [237, 105, 37],
  [251, 155, 6],
  [247, 209, 61],
  [252, 255, 164],
];

/** 0-1 の値をアンカー列の線形補間で RGB へ変換する。 */
function sampleAnchors(anchors: [number, number, number][], t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  const pos = clamped * (anchors.length - 1);
  const i = Math.min(anchors.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = anchors[i];
  const b = anchors[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}

/**
 * 深度値（ピクセルごとに 0-255、大きいほど手前）を
 * 指定カラーマップの RGBA ピクセル列へ変換する。
 */
export function depthToRgba(
  depth: Uint8Array | Uint8ClampedArray,
  colormap: ColormapName,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(depth.length * 4);
  for (let i = 0; i < depth.length; i++) {
    const v = depth[i];
    let r: number;
    let g: number;
    let b: number;
    switch (colormap) {
      case 'gray':
        r = g = b = v;
        break;
      case 'gray-inverted':
        r = g = b = 255 - v;
        break;
      case 'viridis':
        [r, g, b] = sampleAnchors(VIRIDIS_ANCHORS, v / 255);
        break;
      case 'inferno':
        [r, g, b] = sampleAnchors(INFERNO_ANCHORS, v / 255);
        break;
    }
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  }
  return out;
}
