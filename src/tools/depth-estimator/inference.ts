/**
 * transformers.js を使った深度推定。
 * このモジュールは tool.tsx から dynamic import される（transformers.js の遅延ロード）。
 */
import { RawImage } from '@huggingface/transformers';
import type { DepthEstimationPipeline, ProgressCallback } from '@huggingface/transformers';
import { runWithPipeline } from '../../lib/mlPipeline';
import { DEPTH_MODEL_ID } from './logic';

export interface DepthResult {
  /** ピクセルごとの深度（0-255、大きいほど手前）。 */
  depth: Uint8ClampedArray;
  width: number;
  height: number;
}

/** キャンバスの画像に対して深度推定を実行する。 */
export async function estimateDepth(
  canvas: HTMLCanvasElement,
  onProgress: ProgressCallback,
): Promise<DepthResult> {
  return runWithPipeline<DepthEstimationPipeline, DepthResult>(
    { task: 'depth-estimation', modelId: DEPTH_MODEL_ID, dtype: 'q8' },
    onProgress,
    async (pipe) => {
      const input = RawImage.fromCanvas(canvas);
      const output = await pipe(input);
      const result = Array.isArray(output) ? output[0] : output;
      const depthImage = result.depth; // グレースケール RawImage（入力と同サイズ）

      // 念のためサイズが異なる場合はキャンバス経由でリサイズする
      const { width, height } = canvas;
      if (depthImage.width === width && depthImage.height === height) {
        const gray = depthImage.data as Uint8ClampedArray | Uint8Array;
        const depth = new Uint8ClampedArray(width * height);
        const channels = depthImage.channels ?? 1;
        for (let i = 0; i < depth.length; i++) {
          depth[i] = gray[i * channels];
        }
        return { depth, width, height };
      }

      const outCanvas = depthImage.toCanvas();
      const scaled = document.createElement('canvas');
      scaled.width = width;
      scaled.height = height;
      const ctx = scaled.getContext('2d');
      if (!ctx) throw new Error('canvas 2d context を取得できませんでした');
      ctx.drawImage(outCanvas, 0, 0, width, height);
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const depth = new Uint8ClampedArray(width * height);
      for (let i = 0; i < depth.length; i++) {
        depth[i] = rgba[i * 4];
      }
      return { depth, width, height };
    },
  );
}
