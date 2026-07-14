/**
 * transformers.js パイプラインの共有インフラ（キャッシュ / WebGPU→WASM フォールバック / 進捗）。
 *
 * transformers.js は大きいため、このモジュールは各ツールの inference.ts からのみ
 * static import し、inference.ts 自体を dynamic import すること
 * （eager なモジュールから import すると初期バンドルに入ってしまう）。
 */
import { pipeline } from '@huggingface/transformers';
import type { ProgressCallback, ProgressInfo } from '@huggingface/transformers';

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

export interface MlPipelineSpec {
  task: 'background-removal' | 'depth-estimation';
  modelId: string;
  /** 量子化設定。q8 はダウンロードが小さく、fp32 は精度が安定。 */
  dtype: 'fp32' | 'q8';
}

interface CacheEntry {
  promise: Promise<unknown>;
  device: 'webgpu' | 'wasm';
  /** 常に最新の呼び出し元へ進捗を届けるための差し替え可能なコールバック。 */
  progress: { cb: ProgressCallback | null };
}

const cache = new Map<string, CacheEntry>();

// タスクごとに戻り値型が異なるオーバーロードを 1 つの汎用シグネチャへ落とす
const createPipeline = pipeline as unknown as (
  task: MlPipelineSpec['task'],
  modelId: string,
  options: object,
) => Promise<unknown>;

function createEntry(spec: MlPipelineSpec, device: 'webgpu' | 'wasm'): CacheEntry {
  const progress: CacheEntry['progress'] = { cb: null };
  const promise = createPipeline(spec.task, spec.modelId, {
    device,
    dtype: spec.dtype,
    progress_callback: (info: ProgressInfo) => progress.cb?.(info),
  });
  return { promise, device, progress };
}

function cacheKey(spec: MlPipelineSpec): string {
  return `${spec.task}:${spec.modelId}`;
}

/** WebGPU が使えれば WebGPU、失敗したら WASM でパイプラインを用意する（モデルごとにキャッシュ）。 */
async function getEntry(spec: MlPipelineSpec, onProgress: ProgressCallback): Promise<CacheEntry> {
  const key = cacheKey(spec);
  const cached = cache.get(key);
  if (cached) {
    cached.progress.cb = onProgress;
    return cached;
  }

  if (await isWebGpuAvailable()) {
    const entry = createEntry(spec, 'webgpu');
    entry.progress.cb = onProgress;
    cache.set(key, entry);
    try {
      await entry.promise;
      return entry;
    } catch {
      // WebGPU での構築に失敗（非対応の演算など）→ WASM にフォールバック
      cache.delete(key);
    }
  }

  const entry = createEntry(spec, 'wasm');
  entry.progress.cb = onProgress;
  cache.set(key, entry);
  try {
    await entry.promise;
  } catch (err) {
    cache.delete(key);
    throw err;
  }
  return entry;
}

/**
 * パイプラインを用意して run を実行する。
 * WebGPU は推論時に初めて失敗することがあるため、その場合は
 * 壊れたパイプラインをキャッシュから外し、WASM で一度だけ再試行する。
 */
export async function runWithPipeline<P, T>(
  spec: MlPipelineSpec,
  onProgress: ProgressCallback,
  run: (pipe: P) => Promise<T>,
): Promise<T> {
  const entry = await getEntry(spec, onProgress);
  try {
    return await run((await entry.promise) as P);
  } catch (err) {
    if (entry.device !== 'webgpu') throw err;
    // WebGPU の実行時エラー → WASM で作り直して再試行
    const key = cacheKey(spec);
    cache.delete(key);
    const fallback = createEntry(spec, 'wasm');
    fallback.progress.cb = onProgress;
    cache.set(key, fallback);
    try {
      return await run((await fallback.promise) as P);
    } catch (err2) {
      cache.delete(key);
      throw err2;
    }
  }
}
