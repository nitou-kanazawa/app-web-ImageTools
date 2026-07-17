import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolMeta } from '../types';
import { drawSegment, hasMaskPixels } from '../../lib/brush';
import { downloadImageData, exportFileName } from '../../lib/download';
import { loadImageFile } from '../../lib/loadImageFile';
import { useBrushEditor } from '../../lib/useBrushEditor';
import { useMaskUndo } from '../../lib/useMaskUndo';
import { BrushModeToggle, BrushSizeControl } from '../../components/BrushControls';
import { ImageDropZone } from '../../components/ImageDropZone';
import { useStatusItems } from '../../lib/statusBar';
import { useImageFileTarget } from '../../lib/useImageFileTarget';
import { DropOverlay } from '../../components/DropOverlay';
import { applyMaskAlpha, maskToBlackWhite } from './logic';

export const meta: ToolMeta = {
  slug: 'image-mask-editor',
  title: 'マスク画像作成',
  description:
    '画像の上をブラシでなぞってマスク画像（白黒）を作成します。Ctrl+ホイールでブラシサイズを変更できます。',
  tags: ['image'],
  icon: 'brush',
};

type BrushMode = 'paint' | 'erase';

const OVERLAY_COLOR = '#ef4444';

export default function ImageMaskEditor() {
  const [image, setImage] = useState<{ name: string; width: number; height: number } | null>(null);
  const [mode, setMode] = useState<BrushMode>('paint');
  const [invertExport, setInvertExport] = useState(false);
  const [maskEmpty, setMaskEmpty] = useState(true);

  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingImgRef = useRef<HTMLImageElement | null>(null);

  const { undoCount, pushUndo, popUndo, resetHistory } = useMaskUndo(maskCanvasRef);

  /** マスク（オフスクリーン）を赤で着色してオーバーレイへ全面反映する（undo/クリア/読み込み時用）。 */
  const redrawOverlay = useCallback(() => {
    const overlay = overlayCanvasRef.current;
    const mask = maskCanvasRef.current;
    const ctx = overlay?.getContext('2d');
    if (!overlay || !mask || !ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = OVERLAY_COLOR;
    ctx.fillRect(0, 0, overlay.width, overlay.height);
    ctx.globalCompositeOperation = 'source-over';
  }, []);

  const brush = useBrushEditor({
    onStrokeStart: () => pushUndo(),
    onStroke: (point, last) => {
      const maskCtx = maskCanvasRef.current?.getContext('2d');
      const overlayCtx = overlayCanvasRef.current?.getContext('2d');
      if (!maskCtx || !overlayCtx) return;
      const erase = mode === 'erase';
      // マスク本体と表示用オーバーレイへ同じセグメントを描く（全面再合成を避ける）
      drawSegment(maskCtx, '#fff', erase, brush.brushSize, point, last);
      drawSegment(overlayCtx, OVERLAY_COLOR, erase, brush.brushSize, point, last);
    },
    onStrokeEnd: () => {
      if (mode === 'paint') {
        setMaskEmpty(false);
        return;
      }
      // 消しゴムで全部消えた可能性があるのでストローク終了時のみ走査する
      const mask = maskCanvasRef.current;
      const ctx = mask?.getContext('2d');
      if (mask && ctx) {
        setMaskEmpty(!hasMaskPixels(ctx.getImageData(0, 0, mask.width, mask.height).data));
      }
    },
  });

  const loadFile = useCallback(
    (file: File) => {
      loadImageFile(file, (img) => {
        pendingImgRef.current = img;
        resetHistory();
        setMaskEmpty(true);
        setImage({ name: file.name, width: img.naturalWidth, height: img.naturalHeight });
      });
    },
    [resetHistory],
  );

  // ドラッグ&ドロップ / Ctrl+V で素早く画像を差し替えられるようにする
  const { dragActive, dropHandlers } = useImageFileTarget(loadFile, true);

  // 画像 state が反映（canvas がマウント）されてからキャンバス群を初期化する
  useEffect(() => {
    const img = pendingImgRef.current;
    const base = baseCanvasRef.current;
    const overlay = overlayCanvasRef.current;
    if (!image || !img || !base || !overlay) return;
    pendingImgRef.current = null;
    base.width = image.width;
    base.height = image.height;
    base.getContext('2d')?.drawImage(img, 0, 0);
    overlay.width = image.width;
    overlay.height = image.height;
    const mask = document.createElement('canvas');
    mask.width = image.width;
    mask.height = image.height;
    maskCanvasRef.current = mask;
  }, [image]);

  const undo = useCallback(() => {
    const prev = popUndo();
    if (!prev) return;
    setMaskEmpty(!hasMaskPixels(prev.data));
    redrawOverlay();
  }, [popUndo, redrawOverlay]);

  const clearMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    if (!mask || !ctx) return;
    const snapshot = ctx.getImageData(0, 0, mask.width, mask.height);
    if (!hasMaskPixels(snapshot.data)) return; // 既に空なら何もしない
    pushUndo(snapshot);
    ctx.clearRect(0, 0, mask.width, mask.height);
    setMaskEmpty(true);
    redrawOverlay();
  }, [pushUndo, redrawOverlay]);

  useStatusItems(
    image
      ? [
          { key: 'size', text: `${image.width}×${image.height}px`, title: '画像サイズ' },
          { key: 'brush', text: `ブラシ ${brush.brushSize}px`, title: 'Ctrl+ホイールで変更' },
          { key: 'mode', text: mode === 'paint' ? 'ブラシ' : '消しゴム' },
        ]
      : [],
  );

  const downloadMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    if (!mask || !ctx || !image) return;
    const src = ctx.getImageData(0, 0, mask.width, mask.height);
    const out = new ImageData(maskToBlackWhite(src.data, invertExport), mask.width, mask.height);
    downloadImageData(out, exportFileName(image.name, 'mask'));
  }, [image, invertExport]);

  /** 画像とマスクを破棄して初期状態（ドロップゾーン）へ戻す。 */
  const clearImage = useCallback(() => {
    maskCanvasRef.current = null;
    pendingImgRef.current = null;
    resetHistory();
    setMaskEmpty(true);
    setImage(null);
  }, [resetHistory]);

  const downloadCutout = useCallback(() => {
    const base = baseCanvasRef.current;
    const mask = maskCanvasRef.current;
    const baseCtx = base?.getContext('2d');
    const maskCtx = mask?.getContext('2d');
    if (!base || !mask || !baseCtx || !maskCtx || !image) return;
    const imgData = baseCtx.getImageData(0, 0, base.width, base.height);
    const maskData = maskCtx.getImageData(0, 0, mask.width, mask.height);
    const out = new ImageData(
      applyMaskAlpha(imgData.data, maskData.data, invertExport),
      base.width,
      base.height,
    );
    downloadImageData(out, exportFileName(image.name, 'cutout'));
  }, [image, invertExport]);

  return (
    <div className="relative space-y-4" data-testid="mask-drop-target" {...dropHandlers}>
      <DropOverlay active={dragActive} />
      <input
        type="file"
        accept="image/*"
        aria-label="対象画像"
        id="mask-image-input"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadFile(file);
          e.target.value = '';
        }}
      />

      {!image ? (
        <ImageDropZone inputId="mask-image-input" />
      ) : (
        <>
          {/* ツールバー */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <BrushModeToggle
              value={mode}
              onChange={setMode}
              options={[
                { value: 'paint', label: 'ブラシ' },
                { value: 'erase', label: '消しゴム' },
              ]}
            />
            <BrushSizeControl value={brush.brushSize} onChange={brush.setBrushSize} />
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={undoCount === 0}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                元に戻す
              </button>
              <button
                type="button"
                onClick={clearMask}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                全消去
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            画像の上をドラッグしてマスクを塗ります。<kbd>Ctrl</kbd>+ホイールでブラシサイズを変更。
          </p>

          {/* キャンバス */}
          <div
            ref={brush.wrapRef}
            data-testid="mask-canvas-area"
            className="relative inline-block max-w-full cursor-crosshair overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
            onPointerLeave={brush.onWrapPointerLeave}
          >
            <canvas ref={baseCanvasRef} className="block max-w-full" />
            <canvas
              ref={overlayCanvasRef}
              data-testid="mask-overlay"
              className="absolute inset-0 h-full w-full touch-none opacity-50"
              {...brush.pointerHandlers}
            />
            <div
              ref={brush.cursorElRef}
              aria-hidden
              className="pointer-events-none absolute rounded-full border border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
              style={{ display: 'none' }}
            />
          </div>

          {/* 出力 */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <label className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={invertExport}
                onChange={(e) => setInvertExport(e.target.checked)}
                className="accent-zinc-700 dark:accent-zinc-300"
              />
              反転して出力（塗った部分を黒/透過に）
            </label>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadMask}
                disabled={maskEmpty}
                title={maskEmpty ? '先にマスクを塗ってください' : undefined}
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                マスク画像を保存
              </button>
              <button
                type="button"
                onClick={downloadCutout}
                disabled={maskEmpty}
                title={maskEmpty ? '先にマスクを塗ってください' : undefined}
                className="rounded-md border border-zinc-400 px-4 py-1.5 text-sm font-medium text-zinc-800 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                切り抜き画像を保存
              </button>
              <button
                type="button"
                onClick={clearImage}
                className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                画像をクリア
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            マスク画像は塗った部分が白・それ以外が黒の PNG です（{image.width}×{image.height}）。
          </p>
        </>
      )}
    </div>
  );
}
