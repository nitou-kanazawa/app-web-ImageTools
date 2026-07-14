/**
 * transformers.js を使った背景除去の推論まわり。
 *
 * このモジュールは tool.tsx から dynamic import され、
 * transformers.js（大きい）を初回利用時にだけロードする。
 * モデル本体はユーザのブラウザが Hugging Face Hub から直接取得し、
 * ブラウザキャッシュに保存される（サーバは介在しない）。
 */
import { pipeline, RawImage } from '@huggingface/transformers';
import type {
  BackgroundRemovalPipeline,
  ProgressCallback,
  ProgressInfo,
} from '@huggingface/transformers';
import type { BgModelDef } from './logic';

/**
 * WebGPU が実際に使えるか（API が存在してもアダプタが取れない環境がある。
 * 例: CI のヘッドレスブラウザや GPU 無効環境）。
 */
async function isWebGpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return false;
    return (await gpu.requestAdapter()) != null;
  } catch {
    return false;
  }
}

interface CacheEntry {
  promise: Promise<BackgroundRemovalPipeline>;
  device: 'webgpu' | 'wasm';
  /** 常に最新の呼び出し元へ進捗を届けるための差し替え可能なコールバック。 */
  progress: { cb: ProgressCallback | null };
}

const pipelineCache = new Map<string, CacheEntry>();

function createEntry(model: BgModelDef, device: 'webgpu' | 'wasm'): CacheEntry {
  const progress: CacheEntry['progress'] = { cb: null };
  const promise = pipeline('background-removal', model.id, {
    device,
    dtype: model.dtype,
    progress_callback: (info: ProgressInfo) => progress.cb?.(info),
  });
  return { promise, device, progress };
}

/** WebGPU が使えれば WebGPU、失敗したら WASM でパイプラインを用意する（モデルごとにキャッシュ）。 */
async function getEntry(model: BgModelDef, onProgress: ProgressCallback): Promise<CacheEntry> {
  const cached = pipelineCache.get(model.id);
  if (cached) {
    cached.progress.cb = onProgress;
    return cached;
  }

  let entry: CacheEntry | null = null;
  if (await isWebGpuAvailable()) {
    entry = createEntry(model, 'webgpu');
    entry.progress.cb = onProgress;
    pipelineCache.set(model.id, entry);
    try {
      await entry.promise;
      return entry;
    } catch {
      // WebGPU での構築に失敗（非対応の演算など）→ WASM にフォールバック
      pipelineCache.delete(model.id);
    }
  }

  entry = createEntry(model, 'wasm');
  entry.progress.cb = onProgress;
  pipelineCache.set(model.id, entry);
  try {
    await entry.promise;
  } catch (err) {
    pipelineCache.delete(model.id);
    throw err;
  }
  return entry;
}

async function runInference(
  entry: CacheEntry,
  canvas: HTMLCanvasElement,
): Promise<Uint8ClampedArray> {
  const pipe = await entry.promise;
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

/**
 * キャンバスの画像に対して背景除去を実行し、
 * 「残す部分」のアルファ値（0-255、キャンバスと同サイズ）を返す。
 * WebGPU は推論時に初めて失敗することがあるため、その場合は
 * 壊れたパイプラインをキャッシュから外し、WASM で一度だけ再試行する。
 */
export async function removeBackgroundAlpha(
  canvas: HTMLCanvasElement,
  model: BgModelDef,
  onProgress: ProgressCallback,
): Promise<Uint8ClampedArray> {
  const entry = await getEntry(model, onProgress);
  try {
    return await runInference(entry, canvas);
  } catch (err) {
    if (entry.device !== 'webgpu') throw err;
    // WebGPU の実行時エラー → WASM で作り直して再試行
    pipelineCache.delete(model.id);
    const fallback = createEntry(model, 'wasm');
    fallback.progress.cb = onProgress;
    pipelineCache.set(model.id, fallback);
    try {
      return await runInference(fallback, canvas);
    } catch (err2) {
      pipelineCache.delete(model.id);
      throw err2;
    }
  }
}
