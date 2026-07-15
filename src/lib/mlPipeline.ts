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
  /** promise 解決後に確定する実際の実行デバイス。 */
  device: () => 'webgpu' | 'wasm';
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

function cacheKey(spec: MlPipelineSpec): string {
  return `${spec.task}:${spec.modelId}:${spec.dtype}`;
}

/** エントリが今もキャッシュの現物である場合のみ削除する（他の呼び出しの分を消さない）。 */
function evict(key: string, entry: CacheEntry) {
  if (cache.get(key) === entry) cache.delete(key);
}

function buildEntry(spec: MlPipelineSpec, forceDevice?: 'wasm'): CacheEntry {
  const progress: CacheEntry['progress'] = { cb: null };
  let device: 'webgpu' | 'wasm' = 'wasm';
  const options = (dev: 'webgpu' | 'wasm') => ({
    device: dev,
    dtype: spec.dtype,
    progress_callback: (info: ProgressInfo) => progress.cb?.(info),
  });
  // デバイス選定も promise 内で行い、キャッシュ登録は同期的に済ませる
  // （同時呼び出しでモデルを二重ダウンロードしないため）
  const promise = (async () => {
    if (!forceDevice && (await isWebGpuAvailable())) {
      try {
        device = 'webgpu';
        return await createPipeline(spec.task, spec.modelId, options('webgpu'));
      } catch {
        // WebGPU での構築に失敗（非対応の演算など）→ WASM にフォールバック
        device = 'wasm';
      }
    }
    return createPipeline(spec.task, spec.modelId, options('wasm'));
  })();
  return { promise, device: () => device, progress };
}

/** パイプラインを取得する（モデルごとにキャッシュ、登録は同期）。 */
function getEntry(spec: MlPipelineSpec, onProgress: ProgressCallback): CacheEntry {
  const key = cacheKey(spec);
  const cached = cache.get(key);
  if (cached) {
    cached.progress.cb = onProgress;
    return cached;
  }
  const entry = buildEntry(spec);
  cache.set(key, entry);
  entry.promise.catch(() => evict(key, entry));
  entry.progress.cb = onProgress;
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
  const key = cacheKey(spec);
  const entry = getEntry(spec, onProgress);
  try {
    return await run((await entry.promise) as P);
  } catch (err) {
    if (entry.device() !== 'webgpu') throw err;
    // WebGPU の実行時エラー → WASM で作り直して再試行
    // （別の呼び出しが既に作り直していた場合はそれを使う）
    evict(key, entry);
    let fallback = cache.get(key);
    if (!fallback) {
      const created = buildEntry(spec, 'wasm');
      cache.set(key, created);
      created.promise.catch(() => evict(key, created));
      fallback = created;
    }
    fallback.progress.cb = onProgress;
    try {
      return await run((await fallback.promise) as P);
    } catch (err2) {
      evict(key, fallback);
      throw err2;
    }
  }
}
