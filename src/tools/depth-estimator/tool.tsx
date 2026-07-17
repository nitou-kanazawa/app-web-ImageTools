import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolMeta } from '../types';
import { downloadCanvasPng, exportFileName } from '../../lib/download';
import { loadImageFile } from '../../lib/loadImageFile';
import { statusFromProgressEvent, type AutoStatus } from '../../lib/mlStatus';
import { useStatusItems } from '../../lib/statusBar';
import { useImageFileTarget } from '../../lib/useImageFileTarget';
import { DropOverlay } from '../../components/DropOverlay';
import { ImageDropZone } from '../../components/ImageDropZone';
import { Icon } from '../../components/icons';
import { ToggleGroup } from '../../components/ToggleGroup';
import { COLORMAPS, depthToRgba, type ColormapName } from './logic';

export const meta: ToolMeta = {
  slug: 'depth-estimator',
  title: '深度マップ生成',
  description:
    '画像から深度マップ（近い/遠いの濃淡画像）を AI で自動生成します。すべてブラウザ内で処理されます。',
  tags: ['image', 'ai'],
  icon: 'mountain',
};

type ViewMode = 'side' | 'wiper';

const AUTORUN_STORAGE_KEY = 'wmt-depth-autorun';

export default function DepthEstimator() {
  const [image, setImage] = useState<{ name: string; width: number; height: number } | null>(null);
  const [status, setStatus] = useState<AutoStatus>({ phase: 'idle', message: '' });
  const [colormap, setColormap] = useState<ColormapName>('gray');
  const [hasResult, setHasResult] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('side');
  const [wiperPos, setWiperPos] = useState(50);
  // 連続作業向け: 画像を読み込んだら自動で生成する（選択は保存）
  const [autoRun, setAutoRun] = useState(() => {
    try {
      return localStorage.getItem(AUTORUN_STORAGE_KEY) !== '0';
    } catch {
      return true;
    }
  });

  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const depthCanvasRef = useRef<HTMLCanvasElement>(null);
  const depthDataRef = useRef<{ depth: Uint8ClampedArray; width: number; height: number } | null>(
    null,
  );
  const pendingImgRef = useRef<HTMLImageElement | null>(null);
  // 何枚目の画像かの通し番号。推論中に画像が差し替えられたことを検出する
  // （source キャンバス要素は再利用されるため、要素比較では検出できない）
  const loadSeqRef = useRef(0);
  // 推論完了時に「最新の」カラーマップで描画するためのミラー
  const colormapRef = useRef(colormap);
  colormapRef.current = colormap;
  const autoRunRef = useRef(autoRun);
  autoRunRef.current = autoRun;
  const wiperDragRef = useRef(false);

  const busy = status.phase === 'loading' || status.phase === 'running';

  useEffect(() => {
    try {
      localStorage.setItem(AUTORUN_STORAGE_KEY, autoRun ? '1' : '0');
    } catch {
      // 保存できない環境でも動作は続行する
    }
  }, [autoRun]);

  const loadFile = useCallback((file: File) => {
    loadImageFile(file, (img) => {
      loadSeqRef.current += 1;
      pendingImgRef.current = img;
      depthDataRef.current = null;
      setHasResult(false);
      setStatus({ phase: 'idle', message: '' });
      setImage({ name: file.name, width: img.naturalWidth, height: img.naturalHeight });
    });
  }, []);

  // ドラッグ&ドロップ / Ctrl+V で素早く画像を差し替えられるようにする
  const { dragActive, dropHandlers } = useImageFileTarget(loadFile, !busy);

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

  const runEstimate = useCallback(async () => {
    const source = sourceCanvasRef.current;
    if (!source || busy) return;
    const seq = loadSeqRef.current;
    setStatus({ phase: 'loading', message: 'AI モデルを準備中...' });
    try {
      const { estimateDepth } = await import('./inference');
      const result = await estimateDepth(source, (ev) => {
        const next = statusFromProgressEvent(ev as { status?: string });
        if (next) setStatus(next);
      });
      // 推論中に画像が差し替えられていたら結果を破棄する
      if (loadSeqRef.current !== seq) {
        setStatus({ phase: 'idle', message: '' });
        return;
      }
      depthDataRef.current = result;
      setHasResult(true);
      renderDepth(colormapRef.current);
      setStatus({ phase: 'done', message: '完了' });
    } catch (err) {
      setStatus({
        phase: 'error',
        message: `失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }, [busy, renderDepth]);

  const runEstimateRef = useRef(runEstimate);
  runEstimateRef.current = runEstimate;

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
    // 連続作業向け: 読み込みと同時に生成を開始する
    if (autoRunRef.current) runEstimateRef.current();
  }, [image]);

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

  /** 画像と結果を破棄して初期状態（ドロップゾーン）へ戻す。 */
  const clearImage = useCallback(() => {
    loadSeqRef.current += 1; // 実行中の推論結果があっても破棄させる
    depthDataRef.current = null;
    pendingImgRef.current = null;
    setHasResult(false);
    setStatus({ phase: 'idle', message: '' });
    setImage(null);
  }, []);

  /** ワイパー位置をポインタ座標から更新する。 */
  const updateWiper = useCallback((clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const pos = ((clientX - rect.left) / rect.width) * 100;
    setWiperPos(Math.min(100, Math.max(0, pos)));
  }, []);

  const isWiper = viewMode === 'wiper';

  return (
    <div className="relative space-y-4" data-testid="depth-drop-target" {...dropHandlers}>
      <DropOverlay active={dragActive} />
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
        <ImageDropZone inputId="depth-image-input" />
      ) : (
        <>
          {/* 実行 */}
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runEstimate}
                disabled={busy}
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {busy ? '処理中...' : '深度マップを生成'}
              </button>
              <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
                <input
                  type="checkbox"
                  checked={autoRun}
                  onChange={(e) => setAutoRun(e.target.checked)}
                  className="accent-zinc-700 dark:accent-zinc-300"
                />
                読み込み時に自動生成
              </label>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                ドラッグ&ドロップ / Ctrl+V でも画像を差し替えられます
              </span>
            </div>
            {status.phase !== 'idle' && (
              <div data-testid="depth-status" data-phase={status.phase} className="space-y-1">
                <p
                  className={`text-sm ${
                    status.phase === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {status.message}
                </p>
                {typeof status.progress === 'number' && (
                  <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded bg-zinc-700 transition-[width] dark:bg-zinc-200"
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 表示設定 */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">表示</span>
              <ToggleGroup
                value={viewMode}
                onChange={setViewMode}
                ariaLabel="表示モード"
                options={[
                  { value: 'side', label: '横並び' },
                  { value: 'wiper', label: '重ねて比較' },
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">カラー</span>
              <ToggleGroup
                value={colormap}
                onChange={changeColormap}
                ariaLabel="カラーマップ"
                options={COLORMAPS.map((c) => ({ value: c.value, label: c.label }))}
              />
            </div>
          </div>

          {/* 元画像 / 深度マップ */}
          <div
            data-testid="depth-view"
            className={
              isWiper
                ? 'relative w-fit max-w-full cursor-ew-resize touch-none select-none'
                : 'grid gap-4 sm:grid-cols-2'
            }
            onPointerDown={(e) => {
              if (!isWiper) return;
              e.currentTarget.setPointerCapture(e.pointerId);
              wiperDragRef.current = true;
              updateWiper(e.clientX, e.currentTarget);
            }}
            onPointerMove={(e) => {
              if (!isWiper || !wiperDragRef.current) return;
              updateWiper(e.clientX, e.currentTarget);
            }}
            onPointerUp={() => {
              wiperDragRef.current = false;
            }}
            onPointerCancel={() => {
              wiperDragRef.current = false;
            }}
          >
            <figure className={isWiper ? 'm-0' : 'space-y-1'}>
              <figcaption
                className={isWiper ? 'hidden' : 'text-xs text-zinc-500 dark:text-zinc-400'}
              >
                元画像
              </figcaption>
              <canvas
                ref={sourceCanvasRef}
                className="block max-w-full rounded-lg border border-zinc-200 dark:border-zinc-800"
              />
            </figure>
            <figure
              className={isWiper ? 'absolute inset-0 m-0' : 'space-y-1'}
              style={isWiper ? { clipPath: `inset(0 0 0 ${wiperPos}%)` } : undefined}
            >
              <figcaption
                className={isWiper ? 'hidden' : 'text-xs text-zinc-500 dark:text-zinc-400'}
              >
                深度マップ（明るいほど手前）
              </figcaption>
              <canvas
                ref={depthCanvasRef}
                data-testid="depth-canvas"
                className={
                  isWiper
                    ? 'block h-full w-full rounded-lg'
                    : 'block max-w-full rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950'
                }
              />
            </figure>
            {isWiper && (
              <div
                data-testid="wiper-divider"
                className="pointer-events-none absolute inset-y-0 z-10"
                style={{ left: `${wiperPos}%` }}
              >
                <div className="h-full w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" />
                <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-300 bg-white p-1.5 text-zinc-700 shadow dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
                  <Icon name="chevrons-left-right" size={14} />
                </div>
              </div>
            )}
          </div>
          {isWiper && !hasResult && (
            <p className="text-xs text-zinc-500 dark:text-zinc-500">
              生成すると左右のドラッグで元画像と深度マップを比較できます
            </p>
          )}

          {/* 出力 */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              PNG（{image.width}×{image.height}）
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadDepth}
                disabled={!hasResult || busy}
                title={!hasResult ? '先に深度マップを生成してください' : undefined}
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                深度マップを保存
              </button>
              <button
                type="button"
                onClick={clearImage}
                disabled={busy}
                className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                画像をクリア
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
