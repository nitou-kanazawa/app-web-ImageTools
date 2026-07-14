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
