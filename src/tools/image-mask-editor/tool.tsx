import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolMeta } from '../types';
import {
  BRUSH_DEFAULT,
  BRUSH_MAX,
  BRUSH_MIN,
  applyMaskAlpha,
  exportFileName,
  maskToBlackWhite,
  nextBrushSize,
  screenToImage,
} from './logic';

export const meta: ToolMeta = {
  slug: 'image-mask-editor',
  title: 'マスク画像作成',
  description:
    '画像の上をブラシでなぞってマスク画像（白黒）を作成します。Ctrl+ホイールでブラシサイズを変更できます。',
  tags: ['image'],
};

type BrushMode = 'paint' | 'erase';

const UNDO_LIMIT = 30;
const OVERLAY_COLOR = '#ef4444';

/** ImageData を PNG としてダウンロードする。 */
function downloadImageData(data: ImageData, filename: string) {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  canvas.getContext('2d')?.putImageData(data, 0, 0);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

export default function ImageMaskEditor() {
  const [image, setImage] = useState<{ name: string; width: number; height: number } | null>(null);
  const [brushSize, setBrushSize] = useState(BRUSH_DEFAULT);
  const [mode, setMode] = useState<BrushMode>('paint');
  const [invertExport, setInvertExport] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });

  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const drawingRef = useRef<{ active: boolean; last: { x: number; y: number } | null }>({
    active: false,
    last: null,
  });
  const displayScaleRef = useRef(1);
  const canvasWrapRef = useRef<HTMLDivElement>(null);

  /** マスク（オフスクリーン）を赤半透明としてオーバーレイに反映する。 */
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

  const pendingImgRef = useRef<HTMLImageElement | null>(null);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      pendingImgRef.current = img;
      undoStackRef.current = [];
      setUndoCount(0);
      setImage({ name: file.name, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, []);

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

  const pushUndo = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    if (!mask || !ctx) return;
    const stack = undoStackRef.current;
    stack.push(ctx.getImageData(0, 0, mask.width, mask.height));
    if (stack.length > UNDO_LIMIT) stack.shift();
    setUndoCount(stack.length);
  }, []);

  const undo = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    const prev = undoStackRef.current.pop();
    if (!mask || !ctx || !prev) return;
    ctx.putImageData(prev, 0, 0);
    setUndoCount(undoStackRef.current.length);
    redrawOverlay();
  }, [redrawOverlay]);

  const clearMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    if (!mask || !ctx) return;
    pushUndo();
    ctx.clearRect(0, 0, mask.width, mask.height);
    redrawOverlay();
  }, [pushUndo, redrawOverlay]);

  /** ポインタ位置を画像ピクセル座標へ変換し、表示倍率も記録する。 */
  const toImagePoint = useCallback((clientX: number, clientY: number) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    displayScaleRef.current = rect.width > 0 ? rect.width / overlay.width : 1;
    return screenToImage(rect, overlay.width, overlay.height, clientX, clientY);
  }, []);

  const strokeTo = useCallback(
    (point: { x: number; y: number }, isStart: boolean) => {
      const ctx = maskCanvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.globalCompositeOperation = mode === 'erase' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = '#fff';
      ctx.fillStyle = '#fff';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = brushSize;
      const last = drawingRef.current.last;
      ctx.beginPath();
      if (isStart || !last) {
        ctx.arc(point.x, point.y, brushSize / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
      }
      drawingRef.current.last = point;
      redrawOverlay();
    },
    [brushSize, mode, redrawOverlay],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0) return;
      const point = toImagePoint(e.clientX, e.clientY);
      if (!point) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      pushUndo();
      drawingRef.current = { active: true, last: null };
      strokeTo(point, true);
    },
    [pushUndo, strokeTo, toImagePoint],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      setCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
      if (!drawingRef.current.active) return;
      const point = toImagePoint(e.clientX, e.clientY);
      if (point) strokeTo(point, false);
    },
    [strokeTo, toImagePoint],
  );

  const endStroke = useCallback(() => {
    drawingRef.current = { active: false, last: null };
  }, []);

  // Ctrl+ホイールでブラシサイズ変更（ブラウザズームを抑止するため passive: false で登録）
  useEffect(() => {
    const el = canvasWrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setBrushSize((s) => nextBrushSize(s, e.deltaY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [image]);

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

  const cursorRadius = (brushSize / 2) * displayScaleRef.current;

  const modeButton = (value: BrushMode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        mode === value
          ? 'bg-blue-600 text-white'
          : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      {label}
    </button>
  );

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
        <label
          htmlFor="mask-image-input"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) loadFile(file);
          }}
          className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
        >
          <span className="text-3xl">🖼️</span>
          <span className="text-sm font-medium">
            クリックして画像を選択（ドラッグ&ドロップも可）
          </span>
        </label>
      ) : (
        <>
          {/* ツールバー */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              {modeButton('paint', 'ブラシ')}
              {modeButton('erase', '消しゴム')}
            </div>
            <div className="flex items-center gap-2">
              <label htmlFor="brush-size" className="text-sm text-slate-600 dark:text-slate-400">
                ブラシサイズ
              </label>
              <input
                id="brush-size"
                type="range"
                min={BRUSH_MIN}
                max={BRUSH_MAX}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-32 accent-blue-600"
              />
              <span
                data-testid="brush-size-value"
                className="w-10 text-right text-sm tabular-nums text-slate-600 dark:text-slate-400"
              >
                {brushSize}
              </span>
            </div>
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
            ref={canvasWrapRef}
            data-testid="mask-canvas-area"
            className="relative inline-block max-w-full cursor-crosshair overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800"
            onPointerLeave={() => setCursor((c) => ({ ...c, visible: false }))}
          >
            <canvas ref={baseCanvasRef} className="block max-w-full" />
            <canvas
              ref={overlayCanvasRef}
              data-testid="mask-overlay"
              className="absolute inset-0 h-full w-full opacity-50"
              style={{ touchAction: 'none' }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
            />
            {cursor.visible && (
              <div
                aria-hidden
                className="pointer-events-none absolute rounded-full border border-blue-500 bg-blue-500/10"
                style={{
                  left: cursor.x - cursorRadius,
                  top: cursor.y - cursorRadius,
                  width: cursorRadius * 2,
                  height: cursorRadius * 2,
                }}
              />
            )}
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
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                マスク画像を保存
              </button>
              <button
                type="button"
                onClick={downloadCutout}
                className="rounded-md border border-blue-600 px-4 py-1.5 text-sm font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
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
