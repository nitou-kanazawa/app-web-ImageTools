import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolMeta } from '../types';
import { drawSegment, hasMaskPixels } from '../../lib/brush';
import { downloadImageData, exportFileName } from '../../lib/download';
import { loadImageFile } from '../../lib/loadImageFile';
import { useBrushEditor } from '../../lib/useBrushEditor';
import { useMaskUndo } from '../../lib/useMaskUndo';
import { BrushModeToggle, BrushSizeControl } from '../../components/BrushControls';
import { ImageDropZone } from '../../components/ImageDropZone';
import { applyMaskAlpha, maskToBlackWhite } from './logic';

export const meta: ToolMeta = {
  slug: 'image-mask-editor',
  title: 'マスク画像作成',
  description:
    '画像の上をブラシでなぞってマスク画像（白黒）を作成します。Ctrl+ホイールでブラシサイズを変更できます。',
  tags: ['image'],
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

  const downloadMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    if (!mask || !ctx || !image) return;
    const src = ctx.getImageData(0, 0, mask.width, mask.height);
    const out = new ImageData(maskToBlackWhite(src.data, invertExport), mask.width, mask.height);
    downloadImageData(out, exportFileName(image.name, 'mask'));
  }, [image, invertExport]);

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
    <div className="space-y-4">
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
        <ImageDropZone inputId="mask-image-input" icon="🖼️" onFile={loadFile} />
      ) : (
        <>
          {/* ツールバー */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
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
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                元に戻す
              </button>
              <button
                type="button"
                onClick={clearMask}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                全消去
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            画像の上をドラッグしてマスクを塗ります。<kbd>Ctrl</kbd>+ホイールでブラシサイズを変更。
          </p>

          {/* キャンバス */}
          <div
            ref={brush.wrapRef}
            data-testid="mask-canvas-area"
            className="relative inline-block max-w-full cursor-crosshair overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800"
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
              className="pointer-events-none absolute rounded-full border border-blue-500 bg-blue-500/10"
              style={{ display: 'none' }}
            />
          </div>

          {/* 出力 */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                checked={invertExport}
                onChange={(e) => setInvertExport(e.target.checked)}
                className="accent-blue-600"
              />
              反転して出力（塗った部分を黒/透過に）
            </label>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadMask}
                disabled={maskEmpty}
                title={maskEmpty ? '先にマスクを塗ってください' : undefined}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                マスク画像を保存
              </button>
              <button
                type="button"
                onClick={downloadCutout}
                disabled={maskEmpty}
                title={maskEmpty ? '先にマスクを塗ってください' : undefined}
                className="rounded-md border border-blue-600 px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 disabled:opacity-40 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-950"
              >
                切り抜き画像を保存
              </button>
              <label
                htmlFor="mask-image-input"
                className="cursor-pointer rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                別の画像を選択
              </label>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            マスク画像は塗った部分が白・それ以外が黒の PNG です（{image.width}×{image.height}）。
          </p>
        </>
      )}
    </div>
  );
}
