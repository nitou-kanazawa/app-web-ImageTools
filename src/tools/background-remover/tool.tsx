import { useCallback, useEffect, useRef, useState } from 'react';
import type { ToolMeta } from '../types';
import { drawSegment, strokeDirtyRect } from '../../lib/brush';
import { downloadCanvasPng, exportFileName } from '../../lib/download';
import { loadImageFile } from '../../lib/loadImageFile';
import { useBrushEditor } from '../../lib/useBrushEditor';
import { useMaskUndo } from '../../lib/useMaskUndo';
import { BrushModeToggle, BrushSizeControl } from '../../components/BrushControls';
import { ImageDropZone } from '../../components/ImageDropZone';
import { useStatusItems } from '../../lib/statusBar';
import { statusFromProgressEvent, type AutoStatus } from '../../lib/mlStatus';
import { BG_MODELS, alphaToWhiteMask, isFullyOpaque } from './logic';

export const meta: ToolMeta = {
  slug: 'background-remover',
  title: '背景除去',
  description:
    '画像の背景を自動（AI モデル）または手動ブラシで除去して透過 PNG を出力します。すべてブラウザ内で処理されます。',
  tags: ['image', 'ai'],
  icon: 'scissors',
};

type BrushMode = 'erase' | 'restore';

// 透過部分を示すチェッカーボード背景（ライト/ダーク両対応）
const CHECKER_CLASS =
  'bg-[length:16px_16px] bg-[conic-gradient(#e4e4e7_0_25%,#fafafa_0_50%,#e4e4e7_0_75%,#fafafa_0)] dark:bg-[conic-gradient(#3f3f46_0_25%,#18181b_0_50%,#3f3f46_0_75%,#18181b_0)]';

export default function BackgroundRemover() {
  const [image, setImage] = useState<{ name: string; width: number; height: number } | null>(null);
  const [mode, setMode] = useState<BrushMode>('erase');
  const [modelIndex, setModelIndex] = useState(0);
  const [autoStatus, setAutoStatus] = useState<AutoStatus>({ phase: 'idle', message: '' });

  // 表示用（DOM）: 合成結果
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  // オフスクリーン: 元画像 / 「残す部分」マスク（白 + アルファ）
  const originalCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingImgRef = useRef<HTMLImageElement | null>(null);

  const { undoCount, pushUndo, popUndo, resetHistory } = useMaskUndo(maskCanvasRef);

  const busy = autoStatus.phase === 'loading' || autoStatus.phase === 'running';

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

  const brush = useBrushEditor({
    enabled: !busy,
    onStrokeStart: () => pushUndo(),
    onStroke: (point, last) => {
      const mask = maskCanvasRef.current;
      const maskCtx = mask?.getContext('2d');
      if (!mask || !maskCtx) return;
      // 消す = マスクから除去（destination-out）、戻す = マスクへ白を描く
      drawSegment(maskCtx, '#fff', mode === 'erase', brush.brushSize, point, last);
      const rect = strokeDirtyRect(point, last, brush.brushSize, mask.width, mask.height);
      if (rect) composite(rect);
    },
  });

  const loadFile = useCallback(
    (file: File) => {
      loadImageFile(file, (img) => {
        pendingImgRef.current = img;
        resetHistory();
        setAutoStatus({ phase: 'idle', message: '' });
        setImage({ name: file.name, width: img.naturalWidth, height: img.naturalHeight });
      });
    },
    [resetHistory],
  );

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

  const undo = useCallback(() => {
    if (popUndo()) composite();
  }, [popUndo, composite]);

  /** マスクを全面白（すべて残す）へ戻す。 */
  const resetMask = useCallback(() => {
    const mask = maskCanvasRef.current;
    const ctx = mask?.getContext('2d');
    if (!mask || !ctx) return;
    const snapshot = ctx.getImageData(0, 0, mask.width, mask.height);
    if (isFullyOpaque(snapshot.data)) return; // 既に全部残っているなら何もしない
    pushUndo(snapshot);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, mask.width, mask.height);
    composite();
  }, [pushUndo, composite]);

  useStatusItems(
    image
      ? [
          { key: 'size', text: `${image.width}×${image.height}px`, title: '画像サイズ' },
          { key: 'brush', text: `ブラシ ${brush.brushSize}px`, title: 'Ctrl+ホイールで変更' },
          { key: 'mode', text: mode === 'erase' ? '消す' : '戻す' },
          ...(autoStatus.phase !== 'idle'
            ? [{ key: 'auto', text: autoStatus.message, title: '自動背景除去の状態' }]
            : []),
        ]
      : [],
  );

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
      // 推論中に画像が差し替えられていたら結果を破棄する
      if (maskCanvasRef.current !== mask || originalCanvasRef.current !== original) {
        setAutoStatus({ phase: 'idle', message: '' });
        return;
      }
      pushUndo();
      const maskData = maskCtx.createImageData(mask.width, mask.height);
      maskData.data.set(alphaToWhiteMask(alpha));
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

  return (
    <div className="space-y-4">
      <input
        type="file"
        accept="image/*"
        aria-label="対象画像"
        id="bg-image-input"
        className="sr-only"
        disabled={busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) loadFile(file);
          e.target.value = '';
        }}
      />

      {!image ? (
        <ImageDropZone inputId="bg-image-input" onFile={loadFile} />
      ) : (
        <>
          {/* 自動除去 */}
          <div className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="bg-model" className="text-sm text-zinc-600 dark:text-zinc-400">
                モデル
              </label>
              <select
                id="bg-model"
                value={modelIndex}
                onChange={(e) => setModelIndex(Number(e.target.value))}
                disabled={busy}
                className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
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
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {busy ? '処理中...' : '自動で背景を除去'}
              </button>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                初回はモデルのダウンロードがあります（ブラウザ内で処理・画像は送信されません。処理中は画面が固まる場合があります）
              </span>
            </div>
            {autoStatus.phase !== 'idle' && (
              <div data-testid="auto-status" data-phase={autoStatus.phase} className="space-y-1">
                <p
                  className={`text-sm ${
                    autoStatus.phase === 'error'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {autoStatus.message}
                </p>
                {typeof autoStatus.progress === 'number' && (
                  <div className="h-1.5 w-full overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded bg-zinc-700 transition-[width] dark:bg-zinc-200"
                      style={{ width: `${autoStatus.progress}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 手動ブラシ */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <BrushModeToggle
              value={mode}
              onChange={setMode}
              options={[
                { value: 'erase', label: '消す' },
                { value: 'restore', label: '戻す' },
              ]}
            />
            <BrushSizeControl value={brush.brushSize} onChange={brush.setBrushSize} />
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={undo}
                disabled={undoCount === 0 || busy}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                元に戻す
              </button>
              <button
                type="button"
                onClick={resetMask}
                disabled={busy}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                リセット
              </button>
            </div>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            「消す」でドラッグした部分が透過になります。<kbd>Ctrl</kbd>
            +ホイールでブラシサイズを変更。
          </p>

          {/* キャンバス */}
          <div
            ref={brush.wrapRef}
            data-testid="bg-canvas-area"
            className={`relative inline-block max-w-full cursor-crosshair overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 ${CHECKER_CLASS}`}
            onPointerLeave={brush.onWrapPointerLeave}
          >
            <canvas
              ref={displayCanvasRef}
              data-testid="bg-display"
              className="block max-w-full touch-none"
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
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              透過 PNG（{image.width}×{image.height}）
            </span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadResult}
                disabled={busy}
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                透過 PNG を保存
              </button>
              <label
                htmlFor="bg-image-input"
                className={`rounded-md border border-zinc-300 px-4 py-1.5 text-sm text-zinc-700 dark:border-zinc-700 dark:text-zinc-300 ${
                  busy
                    ? 'cursor-not-allowed opacity-40'
                    : 'cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800'
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
