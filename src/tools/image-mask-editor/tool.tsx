import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolMeta } from '../types';
import {
  BRUSH_DEFAULT,
  BRUSH_MAX,
  BRUSH_MIN,
  applyMaskAlpha,
  exportFileName,
  hasMaskPixels,
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
// undo スナップショットの合計バイト数上限。巨大画像でタブがメモリ不足にならないようにする。
const UNDO_BYTE_BUDGET = 256 * 1024 * 1024;
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
    // ダウンロード開始前に revoke すると失敗するブラウザがあるため遅延させる
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}

/** ブラシ1セグメント分を対象コンテキストへ描画する（マスクとオーバーレイで共用）。 */
function drawSegment(
  ctx: CanvasRenderingContext2D,
  color: string,
  erase: boolean,
  size: number,
  point: { x: number; y: number },
  last: { x: number; y: number } | null,
) {
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size;
  ctx.beginPath();
  if (!last) {
    ctx.arc(point.x, point.y, size / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}

export default function ImageMaskEditor() {
  const [image, setImage] = useState<{ name: string; width: number; height: number } | null>(null);
  const [brushSize, setBrushSize] = useState(BRUSH_DEFAULT);
  const [mode, setMode] = useState<BrushMode>('paint');
  const [invertExport, setInvertExport] = useState(false);
  const [undoCount, setUndoCount] = useState(0);
  const [maskEmpty, setMaskEmpty] = useState(true);

  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const drawingRef = useRef<{
    active: boolean;
    pointerId: number;
    last: { x: number; y: number } | null;
  }>({ active: false, pointerId: -1, last: null });
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const pendingImgRef = useRef<HTMLImageElement | null>(null);

  // ブラシカーソルのプレビュー。pointermove ごとの再レンダーを避けるため
  // React state ではなく DOM を直接更新する。
  const cursorElRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<{ x: number; y: number; scale: number; visible: boolean }>({
    x: 0,
    y: 0,
    scale: 1,
    visible: false,
  });

  const updateCursorEl = useCallback((size: number) => {
    const el = cursorElRef.current;
    const h = hoverRef.current;
    if (!el) return;
    if (!h.visible) {
      el.style.display = 'none';
      return;
    }
    const r = (size / 2) * h.scale;
    el.style.display = 'block';
    el.style.left = `${h.x - r}px`;
    el.style.top = `${h.y - r}px`;
    el.style.width = `${r * 2}px`;
    el.style.height = `${r * 2}px`;
  }, []);

  // Ctrl+ホイールなど、ポインタが動かなくてもサイズ変更をプレビューに反映する
  useEffect(() => {
    updateCursorEl(brushSize);
  }, [brushSize, updateCursorEl]);

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

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      pendingImgRef.current = img;
      undoStackRef.current = [];
      setUndoCount(0);
      setMaskEmpty(true);
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

  /** 現在のマスクを undo スタックへ積む。snapshot を渡すと getImageData を省略できる。 */
  const pushUndo = useCallback((snapshot?: ImageData) => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    if (!mask || !ctx) return;
    const stack = undoStackRef.current;
    stack.push(snapshot ?? ctx.getImageData(0, 0, mask.width, mask.height));
    let bytes = stack.reduce((n, d) => n + d.data.byteLength, 0);
    while (stack.length > UNDO_LIMIT || (bytes > UNDO_BYTE_BUDGET && stack.length > 1)) {
      const dropped = stack.shift();
      if (!dropped) break;
      bytes -= dropped.data.byteLength;
    }
    setUndoCount(stack.length);
  }, []);

  const undo = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    const prev = undoStackRef.current.pop();
    if (!mask || !ctx || !prev) return;
    ctx.putImageData(prev, 0, 0);
    setUndoCount(undoStackRef.current.length);
    setMaskEmpty(!hasMaskPixels(prev.data));
    redrawOverlay();
  }, [redrawOverlay]);

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

  const strokeTo = useCallback(
    (point: { x: number; y: number }, isStart: boolean) => {
      const maskCtx = maskCanvasRef.current?.getContext('2d');
      const overlayCtx = overlayCanvasRef.current?.getContext('2d');
      if (!maskCtx || !overlayCtx) return;
      const last = isStart ? null : drawingRef.current.last;
      const erase = mode === 'erase';
      // マスク本体と表示用オーバーレイへ同じセグメントを描く（全面再合成を避ける）
      drawSegment(maskCtx, '#fff', erase, brushSize, point, last);
      drawSegment(overlayCtx, OVERLAY_COLOR, erase, brushSize, point, last);
      drawingRef.current.last = point;
    },
    [brushSize, mode],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      // 描画中の2本目のポインタ（マルチタッチ）は無視する
      if (e.button !== 0 || drawingRef.current.active) return;
      const overlay = e.currentTarget;
      const rect = overlay.getBoundingClientRect();
      overlay.setPointerCapture(e.pointerId);
      pushUndo();
      drawingRef.current = { active: true, pointerId: e.pointerId, last: null };
      strokeTo(screenToImage(rect, overlay.width, overlay.height, e.clientX, e.clientY), true);
    },
    [pushUndo, strokeTo],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const overlay = e.currentTarget;
      const rect = overlay.getBoundingClientRect();
      hoverRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        scale: rect.width > 0 && overlay.width > 0 ? rect.width / overlay.width : 1,
        visible: true,
      };
      updateCursorEl(brushSize);
      const d = drawingRef.current;
      if (!d.active || e.pointerId !== d.pointerId) return;
      strokeTo(screenToImage(rect, overlay.width, overlay.height, e.clientX, e.clientY), false);
    },
    [brushSize, strokeTo, updateCursorEl],
  );

  const endStroke = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const d = drawingRef.current;
      if (!d.active || e.pointerId !== d.pointerId) return;
      drawingRef.current = { active: false, pointerId: -1, last: null };
      if (mode === 'paint') {
        setMaskEmpty(false);
      } else {
        // 消しゴムで全部消えた可能性があるのでストローク終了時のみ走査する
        const mask = maskCanvasRef.current;
        const ctx = mask?.getContext('2d');
        if (mask && ctx) {
          setMaskEmpty(!hasMaskPixels(ctx.getImageData(0, 0, mask.width, mask.height).data));
        }
      }
    },
    [mode],
  );

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
            onPointerLeave={() => {
              hoverRef.current.visible = false;
              updateCursorEl(brushSize);
            }}
          >
            <canvas ref={baseCanvasRef} className="block max-w-full" />
            <canvas
              ref={overlayCanvasRef}
              data-testid="mask-overlay"
              className="absolute inset-0 h-full w-full touch-none opacity-50"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
            />
            <div
              ref={cursorElRef}
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
