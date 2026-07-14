/**
 * transformers.js を使った背景除去の推論まわり。
 *
 * このモジュールは tool.tsx から dynamic import され、
 * transformers.js（大きい）を初回利用時にだけロードする。
 * モデル本体はユーザのブラウザが Hugging Face Hub から直接取得し、
 * ブラウザキャッシュに保存される（サーバは介在しない）。
 */
import { env, pipeline, RawImage } from '@huggingface/transformers';
import type { BackgroundRemovalPipeline, ProgressCallback } from '@huggingface/transformers';
import type { BgModelDef } from './logic';

// WASM 実行を Web Worker に逃がして UI のフリーズを軽減する
if (env.backends.onnx?.wasm) {
  env.backends.onnx.wasm.proxy = true;
}

const pipelineCache = new Map<string, Promise<BackgroundRemovalPipeline>>();

function createPipeline(
  model: BgModelDef,
  device: 'webgpu' | 'wasm',
  onProgress: ProgressCallback,
): Promise<BackgroundRemovalPipeline> {
  return pipeline('background-removal', model.id, {
    device,
    dtype: model.dtype,
    progress_callback: onProgress,
  });
}

/** WebGPU が使えれば WebGPU、失敗したら WASM でパイプラインを用意する（モデルごとにキャッシュ）。 */
async function getBgPipeline(
  model: BgModelDef,
  onProgress: ProgressCallback,
): Promise<BackgroundRemovalPipeline> {
  const cached = pipelineCache.get(model.id);
  if (cached) return cached;

  const promise = (async () => {
    if ('gpu' in navigator) {
      try {
        return await createPipeline(model, 'webgpu', onProgress);
      } catch {
        // WebGPU 非対応の演算があるモデルでは WASM にフォールバック
      }
    }
    return createPipeline(model, 'wasm', onProgress);
  })();

  pipelineCache.set(model.id, promise);
  promise.catch(() => pipelineCache.delete(model.id));
  return promise;
}

/**
 * キャンバスの画像に対して背景除去を実行し、
 * 「残す部分」のアルファ値（0-255、キャンバスと同サイズ）を返す。
 */
export async function removeBackgroundAlpha(
  canvas: HTMLCanvasElement,
  model: BgModelDef,
  onProgress: ProgressCallback,
): Promise<Uint8ClampedArray> {
  const pipe = await getBgPipeline(model, onProgress);

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
}
