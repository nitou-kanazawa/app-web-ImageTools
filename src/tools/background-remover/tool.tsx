import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolMeta } from '../types';
import {
  BRUSH_DEFAULT,
  BRUSH_MAX,
  BRUSH_MIN,
  drawSegment,
  nextBrushSize,
  screenToImage,
  strokeDirtyRect,
} from '../../lib/brush';
import { downloadCanvasPng, exportFileName } from '../../lib/download';
import { BG_MODELS, statusFromProgressEvent, type AutoStatus } from './logic';

export const meta: ToolMeta = {
  slug: 'background-remover',
  title: '背景除去',
  description:
    '画像の背景を自動（AI モデル）または手動ブラシで除去して透過 PNG を出力します。すべてブラウザ内で処理されます。',
  tags: ['image', 'ai'],
};

type BrushMode = 'erase' | 'restore';

const UNDO_LIMIT = 30;
// undo スナップショットの合計バイト数上限。巨大画像でタブがメモリ不足にならないようにする。
const UNDO_BYTE_BUDGET = 256 * 1024 * 1024;

// 透過部分を示すチェッカーボード背景（ライト/ダーク両対応）
const CHECKER_CLASS =
  'bg-[length:16px_16px] bg-[conic-gradient(#e2e8f0_0_25%,#f8fafc_0_50%,#e2e8f0_0_75%,#f8fafc_0)] dark:bg-[conic-gradient(#334155_0_25%,#1e293b_0_50%,#334155_0_75%,#1e293b_0)]';

export default function BackgroundRemover() {
  const [image, setImage] = useState<{ name: string; width: number; height: number } | null>(null);
  const [brushSize, setBrushSize] = useState(BRUSH_DEFAULT);
  const [mode, setMode] = useState<BrushMode>('erase');
  const [modelIndex, setModelIndex] = useState(0);
  const [autoStatus, setAutoStatus] = useState<AutoStatus>({ phase: 'idle', message: '' });
  const [undoCount, setUndoCount] = useState(0);

  // 表示用（DOM）: 合成結果
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  // オフスクリーン: 元画像 / 「残す部分」マスク（白 + アルファ）
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const drawingRef = useRef<{
    active: boolean;
    pointerId: number;
    last: { x: number; y: number } | null;
  }>({ active: false, pointerId: -1, last: null });
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const pendingImgRef = useRef<HTMLImageElement | null>(null);

  // ブラシカーソルプレビュー（pointermove ごとの再レンダーを避けるため DOM を直接更新）
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

  useEffect(() => {
    updateCursorEl(brushSize);
  }, [brushSize, updateCursorEl]);

  /** 元画像 × マスク → 表示キャンバスへ合成する。rect を渡すとその範囲だけ更新する。 */
  const composite = useCallback((rect?: { x: number; y: number; w: number; h: number }) => {
    const display = displayCanvasRef.current;
    const original = originalCanvasRef.current;
    const mask = maskCanvasRef.current;
    const ctx = display?.getContext('2d');
    if (!display || !original || !mask || !ctx) return;
    const r = rect ?? { x: 0, y: 0, w: display.width, h: display.height };
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.clearRect(r.x, r.y, r.w, r.h);
    ctx.drawImage(original, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
    ctx.restore();
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
      setAutoStatus({ phase: 'idle', message: '' });
      setImage({ name: file.name, width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, []);

  // 画像 state が反映（canvas がマウント）されてからキャンバス群を初期化する
  useEffect(() => {
    const img = pendingImgRef.current;
    const display = displayCanvasRef.current;
    if (!image || !img || !display) return;
    pendingImgRef.current = null;
    const { width: w, height: h } = image;

    const original = document.createElement('canvas');
    original.width = w;
    original.height = h;
    original.getContext('2d')?.drawImage(img, 0, 0);
    originalCanvasRef.current = original;

    // マスクは「全部残す」（全面白）で開始
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const maskCtx = mask.getContext('2d');
    if (maskCtx) {
      maskCtx.fillStyle = '#fff';
      maskCtx.fillRect(0, 0, w, h);
    }
    maskCanvasRef.current = mask;

    display.width = w;
    display.height = h;
    composite();
  }, [image, composite]);

  /** 現在のマスクを undo スタックへ積む。 */
  const pushUndo = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    if (!mask || !ctx) return;
    const stack = undoStackRef.current;
    stack.push(ctx.getImageData(0, 0, mask.width, mask.height));
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
    composite();
  }, [composite]);

  /** マスクを全面白（すべて残す）へ戻す。 */
  const resetMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    if (!mask || !ctx) return;
    pushUndo();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, mask.width, mask.height);
    composite();
  }, [pushUndo, composite]);

  const strokeTo = useCallback(
    (point: { x: number; y: number }, isStart: boolean) => {
      const mask = maskCanvasRef.current;
      const maskCtx = mask?.getContext('2d');
      if (!mask || !maskCtx) return;
      const last = isStart ? null : drawingRef.current.last;
      // 消す = マスクから除去（destination-out）、戻す = マスクへ白を描く
      drawSegment(maskCtx, '#fff', mode === 'erase', brushSize, point, last);
      drawingRef.current.last = point;
      const rect = strokeDirtyRect(point, last, brushSize, mask.width, mask.height);
      if (rect) composite(rect);
    },
    [brushSize, mode, composite],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 || drawingRef.current.active) return;
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      canvas.setPointerCapture(e.pointerId);
      pushUndo();
      drawingRef.current = { active: true, pointerId: e.pointerId, last: null };
      strokeTo(screenToImage(rect, canvas.width, canvas.height, e.clientX, e.clientY), true);
    },
    [pushUndo, strokeTo],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      hoverRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        scale: rect.width > 0 && canvas.width > 0 ? rect.width / canvas.width : 1,
        visible: true,
      };
      updateCursorEl(brushSize);
      const d = drawingRef.current;
      if (!d.active || e.pointerId !== d.pointerId) return;
      strokeTo(screenToImage(rect, canvas.width, canvas.height, e.clientX, e.clientY), false);
    },
    [brushSize, strokeTo, updateCursorEl],
  );

  const endStroke = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    drawingRef.current = { active: false, pointerId: -1, last: null };
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

  const busy = autoStatus.phase === 'loading' || autoStatus.phase === 'running';

  const runAutoRemove = useCallback(async () => {
    const original = originalCanvasRef.current;
    const mask = maskCanvasRef.current;
    const maskCtx = mask?.getContext('2d');
    if (!original || !mask || !maskCtx || busy) return;
    const model = BG_MODELS[modelIndex];
    setAutoStatus({ phase: 'loading', message: 'AI モデルを準備中...' });
    try {
      const { removeBackgroundAlpha } = await import('./inference');
      const alpha = await removeBackgroundAlpha(original, model, (ev) => {
        const status = statusFromProgressEvent(ev as { status?: string });
        if (status) setAutoStatus(status);
      });
      setAutoStatus({ phase: 'running', message: '結果を反映中...' });
      pushUndo();
      const maskData = maskCtx.createImageData(mask.width, mask.height);
      for (let i = 0; i < alpha.length; i++) {
        maskData.data[i * 4] = 255;
        maskData.data[i * 4 + 1] = 255;
        maskData.data[i * 4 + 2] = 255;
        maskData.data[i * 4 + 3] = alpha[i];
      }
      maskCtx.putImageData(maskData, 0, 0);
      composite();
      setAutoStatus({ phase: 'done', message: '完了。ブラシで微調整できます。' });
    } catch (err) {
      setAutoStatus({
        phase: 'error',
        message: `失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }, [busy, modelIndex, pushUndo, composite]);

  const downloadResult = useCallback(() => {
    const display = displayCanvasRef.current;
    if (!display || !image) return;
    downloadCanvasPng(display, exportFileName(image.name, 'nobg'));
  }, [image]);

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
        id="bg-image-input"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadFile(file);
          e.target.value = '';
        }}
      />

      {!image ? (
        <label
          htmlFor="bg-image-input"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) loadFile(file);
          }}
          className="flex h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-white text-slate-500 transition-colors hover:border-blue-400 hover:text-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
        >
          <span className="text-3xl">✂️</span>
          <span className="text-sm font-medium">
            クリックして画像を選択（ドラッグ&ドロップも可）
          </span>
        </label>
      ) : (
        <>
          {/* 自動除去 */}
          <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="bg-model" className="text-sm text-slate-600 dark:text-slate-400">
                モデル
              </label>
              <select
                id="bg-model"
                value={modelIndex}
                onChange={(e) => setModelIndex(Number(e.target.value))}
                disabled={busy}
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800"
              >
                {BG_MODELS.map((m, i) => (
                  <option key={m.id} value={i}>
                    {m.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={runAutoRemove}
                disabled={busy}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
              >
                {busy ? '処理中...' : '自動で背景を除去'}
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                初回はモデルのダウンロードがあります（ブラウザ内で処理・画像は送信されません）
              </span>
            </div>
            {autoStatus.phase !== 'idle' && (
              <div data-testid="auto-status" data-phase={autoStatus.phase} className="space-y-1">
                <p
                  className={`text-sm ${
                    autoStatus.phase === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {autoStatus.message}
                </p>
                {typeof autoStatus.progress === 'number' && (
                  <div className="h-1.5 w-full overflow-hidden rounded bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded bg-blue-600 transition-[width]"
                      style={{ width: `${autoStatus.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 手動ブラシ */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              {modeButton('erase', '消す')}
              {modeButton('restore', '戻す')}
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
                onClick={resetMask}
                className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                リセット
              </button>
            </div>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            「消す」でドラッグした部分が透過になります。<kbd>Ctrl</kbd>
            +ホイールでブラシサイズを変更。
          </p>

          {/* キャンバス */}
          <div
            ref={canvasWrapRef}
            data-testid="bg-canvas-area"
            className={`relative inline-block max-w-full cursor-crosshair overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800 ${CHECKER_CLASS}`}
            onPointerLeave={() => {
              hoverRef.current.visible = false;
              updateCursorEl(brushSize);
            }}
          >
            <canvas
              ref={displayCanvasRef}
              data-testid="bg-display"
              className="block max-w-full touch-none"
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
            <span className="text-xs text-slate-500 dark:text-slate-400">
              透過 PNG（{image.width}×{image.height}）
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadResult}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                透過 PNG を保存
              </button>
              <label
                htmlFor="bg-image-input"
                className="cursor-pointer rounded-md border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
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
