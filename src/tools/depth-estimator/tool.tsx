import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolMeta } from '../types';
import { downloadCanvasPng, exportFileName } from '../../lib/download';
import { loadImageFile } from '../../lib/loadImageFile';
import { statusFromProgressEvent, type AutoStatus } from '../../lib/mlStatus';
import { useStatusItems } from '../../lib/statusBar';
import { ImageDropZone } from '../../components/ImageDropZone';
import { COLORMAPS, depthToRgba, type ColormapName } from './logic';

export const meta: ToolMeta = {
  slug: 'depth-estimator',
  title: '深度マップ生成',
  description:
    '画像から深度マップ（近い/遠いの濃淡画像）を AI で自動生成します。すべてブラウザ内で処理されます。',
  tags: ['image', 'ai'],
  icon: '🏔️',
};

export default function DepthEstimator() {
  const [image, setImage] = useState<{ name: string; width: number; height: number } | null>(null);
  const [status, setStatus] = useState<AutoStatus>({ phase: 'idle', message: '' });
  const [colormap, setColormap] = useState<ColormapName>('gray');
  const [hasResult, setHasResult] = useState(false);

  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement>(null);
  const depthDataRef = useRef<{ depth: Uint8ClampedArray; width: number; height: number } | null>(
    null,
  );
  const pendingImgRef = useRef<HTMLImageElement | null>(null);

  const busy = status.phase === 'loading' || status.phase === 'running';

  const loadFile = useCallback((file: File) => {
    loadImageFile(file, (img) => {
      pendingImgRef.current = img;
      depthDataRef.current = null;
      setHasResult(false);
      setStatus({ phase: 'idle', message: '' });
      setImage({ name: file.name, width: img.naturalWidth, height: img.naturalHeight });
    });
  }, []);

  // 画像 state が反映（canvas がマウント）されてから元画像を描画する
  useEffect(() => {
    const img = pendingImgRef.current;
    const source = sourceCanvasRef.current;
    if (!image || !img || !source) return;
    pendingImgRef.current = null;
    source.width = image.width;
    source.height = image.height;
    source.getContext('2d')?.drawImage(img, 0, 0);
    const depth = depthCanvasRef.current;
    if (depth) {
      depth.width = image.width;
      depth.height = image.height;
      depth.getContext('2d')?.clearRect(0, 0, image.width, image.height);
    }
  }, [image]);

  /** 保持している深度データを現在のカラーマップで深度キャンバスへ描画する。 */
  const renderDepth = useCallback((map: ColormapName) => {
    const data = depthDataRef.current;
    const canvas = depthCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!data || !canvas || !ctx) return;
    const imageData = ctx.createImageData(data.width, data.height);
    imageData.data.set(depthToRgba(data.depth, map));
    ctx.putImageData(imageData, 0, 0);
  }, []);

  useStatusItems(
    image
      ? [
          { key: 'size', text: `${image.width}×${image.height}px`, title: '画像サイズ' },
          {
            key: 'colormap',
            text: COLORMAPS.find((c) => c.value === colormap)?.label ?? colormap,
          },
          ...(status.phase !== 'idle'
            ? [{ key: 'ml', text: status.message, title: '深度推定の状態' }]
            : []),
        ]
      : [],
  );

  const runEstimate = useCallback(async () => {
    const source = sourceCanvasRef.current;
    if (!source || busy) return;
    setStatus({ phase: 'loading', message: 'AI モデルを準備中...' });
    try {
      const { estimateDepth } = await import('./inference');
      const result = await estimateDepth(source, (ev) => {
        const next = statusFromProgressEvent(ev as { status?: string });
        if (next) setStatus(next);
      });
      // 推論中に画像が差し替えられていたら結果を破棄する
      if (sourceCanvasRef.current !== source || source.width !== result.width) {
        setStatus({ phase: 'idle', message: '' });
        return;
      }
      depthDataRef.current = result;
      setHasResult(true);
      renderDepth(colormap);
      setStatus({ phase: 'done', message: '完了' });
    } catch (err) {
      setStatus({
        phase: 'error',
        message: `失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }, [busy, colormap, renderDepth]);

  const changeColormap = useCallback(
    (map: ColormapName) => {
      setColormap(map);
      renderDepth(map);
    },
    [renderDepth],
  );

  const downloadDepth = useCallback(() => {
    const canvas = depthCanvasRef.current;
    if (!canvas || !image || !hasResult) return;
    downloadCanvasPng(canvas, exportFileName(image.name, 'depth'));
  }, [image, hasResult]);

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="image/*"
        aria-label="対象画像"
        id="depth-image-input"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadFile(file);
          e.target.value = '';
        }}
      />

      {!image ? (
        <ImageDropZone inputId="depth-image-input" icon="🏔️" onFile={loadFile} />
      ) : (
        <>
          {/* 実行 */}
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runEstimate}
                disabled={busy}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {busy ? '処理中...' : '深度マップを生成'}
              </button>
              <label
                htmlFor="depth-colormap"
                className="text-sm text-slate-600 dark:text-slate-400"
              >
                表示
              </label>
              <select
                id="depth-colormap"
                value={colormap}
                onChange={(e) => changeColormap(e.target.value as ColormapName)}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {COLORMAPS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                初回はモデルのダウンロードがあります（ブラウザ内で処理・画像は送信されません。処理中は画面が固まる場合があります）
              </span>
            </div>
            {status.phase !== 'idle' && (
              <div data-testid="depth-status" data-phase={status.phase} className="space-y-1">
                <p
                  className={`text-sm ${
                    status.phase === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {status.message}
                </p>
                {typeof status.progress === 'number' && (
                  <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded bg-blue-600 transition-[width]"
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 元画像 / 深度マップ */}
          <div className="grid gap-4 sm:grid-cols-2">
            <figure className="space-y-1">
              <figcaption className="text-xs text-slate-500 dark:text-slate-400">元画像</figcaption>
              <canvas
                ref={sourceCanvasRef}
                className="block max-w-full rounded-lg border border-slate-200 dark:border-slate-800"
              />
            </figure>
            <figure className="space-y-1">
              <figcaption className="text-xs text-slate-500 dark:text-slate-400">
                深度マップ（明るいほど手前）
              </figcaption>
              <canvas
                ref={depthCanvasRef}
                data-testid="depth-canvas"
                className="block max-w-full rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-950"
              />
            </figure>
          </div>

          {/* 出力 */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <span className="text-xs text-slate-500 dark:text-slate-400">
              PNG（{image.width}×{image.height}）
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadDepth}
                disabled={!hasResult || busy}
                title={!hasResult ? '先に深度マップを生成してください' : undefined}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                深度マップを保存
              </button>
              <label
                htmlFor="depth-image-input"
                className={`rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-300 ${
                  busy
                    ? 'cursor-not-allowed opacity-40'
                    : 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                別の画像を選択
              </label>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
