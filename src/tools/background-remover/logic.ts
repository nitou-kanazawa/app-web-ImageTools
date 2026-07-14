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

/** 自動除去の進行状態。 */
export interface AutoStatus {
  phase: 'idle' | 'loading' | 'running' | 'done' | 'error';
  message: string;
  /** 0-100。ダウンロード中のみ。 */
  progress?: number;
}

/**
 * transformers.js の progress_callback イベントを UI 表示用のステータスへ変換する。
 * 関心のないイベントは null を返す（表示を変えない）。
 */
export function statusFromProgressEvent(ev: {
  status?: string;
  file?: string;
  progress?: number;
}): AutoStatus | null {
  switch (ev.status) {
    case 'initiate':
    case 'download':
      return { phase: 'loading', message: `モデルを取得中... ${ev.file ?? ''}`.trim() };
    case 'progress':
      return {
        phase: 'loading',
        message: `モデルをダウンロード中... ${ev.file ?? ''}`.trim(),
        progress: typeof ev.progress === 'number' ? Math.round(ev.progress) : undefined,
      };
    case 'ready':
      return { phase: 'running', message: '背景を解析中...（初回は数十秒かかることがあります）' };
    default:
      return null;
  }
}

/**
 * モデル出力（RGBA）のアルファ値を「残す部分マスク」（白 + アルファ）の RGBA へ変換する。
 */
export function alphaToWhiteMask(src: Uint8ClampedArray): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = 255;
    out[i + 1] = 255;
    out[i + 2] = 255;
    out[i + 3] = src[i + 3];
  }
  return out;
}

/** RGBA ピクセル列の透明（アルファ < 255）ピクセル数を数える。 */
export function countTransparentPixels(src: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 3; i < src.length; i += 4) {
    if (src[i] < 255) n++;
  }
  return n;
}
