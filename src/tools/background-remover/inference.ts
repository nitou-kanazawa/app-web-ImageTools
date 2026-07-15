/**
 * transformers.js を使った背景除去の推論。
 * このモジュールは tool.tsx から dynamic import される（transformers.js の遅延ロード）。
 * モデル本体はユーザのブラウザが Hugging Face Hub から直接取得し、
 * ブラウザキャッシュに保存される（サーバは介在しない）。
 */
import { RawImage } from '@huggingface/transformers';
import type { BackgroundRemovalPipeline, ProgressCallback } from '@huggingface/transformers';
import { runWithPipeline } from '../../lib/mlPipeline';
import type { BgModelDef } from './logic';

/**
 * キャンバスの画像に対して背景除去を実行し、
 * 「残す部分」のアルファ値（0-255、キャンバスと同サイズ）を返す。
 */
export async function removeBackgroundAlpha(
  canvas: HTMLCanvasElement,
  model: BgModelDef,
  onProgress: ProgressCallback,
): Promise<Uint8ClampedArray> {
  return runWithPipeline<BackgroundRemovalPipeline, Uint8ClampedArray>(
    { task: 'background-removal', modelId: model.id, dtype: model.dtype },
    onProgress,
    async (pipe) => {
      const input = RawImage.fromCanvas(canvas);
      const output = await pipe(input);
      const result = Array.isArray(output) ? output[0] : output;

      // 出力サイズが元画像と異なる場合はキャンバス経由でリサイズして合わせる
      const { width, height } = canvas;
      const outCanvas = result.toCanvas();
      const scaled = document.createElement('canvas');
      scaled.width = width;
      scaled.height = height;
      const ctx = scaled.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context を取得できませんでした');
      ctx.drawImage(outCanvas, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data;

      const alpha = new Uint8ClampedArray(width * height);
      for (let i = 0; i < alpha.length; i++) {
        alpha[i] = rgba[i * 4 + 3];
      }
      return alpha;
    },
  );
}
