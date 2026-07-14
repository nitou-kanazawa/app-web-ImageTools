import { useCallback, useEffect, useRef, useState } from 'react';
import { BRUSH_DEFAULT, nextBrushSize, screenToImage } from './brush';

export interface BrushEditorOptions {
  /** false の間はストロークを受け付けない（自動処理中など）。 */
  enabled?: boolean;
  /** ストローク開始時（undo スナップショットを積むタイミング）。 */
  onStrokeStart?: () => void;
  /** セグメント描画。last が null なら開始点のドット。座標は画像ピクセル。 */
  onStroke: (point: { x: number; y: number }, last: { x: number; y: number } | null) => void;
  /** ストローク終了時（マスクの状態確認など）。 */
  onStrokeEnd?: () => void;
}

/**
 * ブラシ系ツール共通のインタラクションを提供する共有フック。
 * - ブラシサイズ state と Ctrl+ホイールによる変更（ブラウザズーム抑止）
 * - ポインタイベント（マルチタッチの2本目は無視、pointerId 追跡）
 * - ブラシカーソルのプレビュー（再レンダーを避けるため DOM を直接更新）
 *
 * 実際の描画は onStroke で各ツールが行う。
 */
export function useBrushEditor(options: BrushEditorOptions) {
  const [brushSize, setBrushSize] = useState(BRUSH_DEFAULT);
  // ハンドラを安定させつつ最新の options / brushSize を参照するための ref
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;

  const cursorElRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<{ x: number; y: number; scale: number; visible: boolean }>({
    x: 0,
    y: 0,
    scale: 1,
    visible: false,
  });
  const drawingRef = useRef<{
    active: boolean;
    pointerId: number;
    last: { x: number; y: number } | null;
  }>({ active: false, pointerId: -1, last: null });

  // Ctrl+ホイールのリスナーを付けるラッパー要素（画像ロード後にマウントされるため state で追跡）
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);

  const updateCursorEl = useCallback(() => {
    const el = cursorElRef.current;
    const h = hoverRef.current;
    if (!el) return;
    if (!h.visible) {
      el.style.display = 'none';
      return;
    }
    const r = (brushSizeRef.current / 2) * h.scale;
    el.style.display = 'block';
    el.style.left = `${h.x - r}px`;
    el.style.top = `${h.y - r}px`;
    el.style.width = `${r * 2}px`;
    el.style.height = `${r * 2}px`;
  }, []);

  // Ctrl+ホイールなど、ポインタが動かなくてもサイズ変更をプレビューに反映する
  useEffect(() => {
    updateCursorEl();
  }, [brushSize, updateCursorEl]);

  // Ctrl+ホイールでブラシサイズ変更（ブラウザズームを抑止するため passive: false で登録）
  useEffect(() => {
    if (!wrapEl) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setBrushSize((s) => nextBrushSize(s, e.deltaY));
    };
    wrapEl.addEventListener('wheel', onWheel, { passive: false });
    return () => wrapEl.removeEventListener('wheel', onWheel);
  }, [wrapEl]);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const opts = optionsRef.current;
    // 描画中の2本目のポインタ（マルチタッチ）は無視する
    if (opts.enabled === false || e.button !== 0 || drawingRef.current.active) return;
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    canvas.setPointerCapture(e.pointerId);
    opts.onStrokeStart?.();
    drawingRef.current = { active: true, pointerId: e.pointerId, last: null };
    const point = screenToImage(rect, canvas.width, canvas.height, e.clientX, e.clientY);
    opts.onStroke(point, null);
    drawingRef.current.last = point;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      hoverRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        scale: rect.width > 0 && canvas.width > 0 ? rect.width / canvas.width : 1,
        visible: true,
      };
      updateCursorEl();
      const d = drawingRef.current;
      if (!d.active || e.pointerId !== d.pointerId) return;
      const point = screenToImage(rect, canvas.width, canvas.height, e.clientX, e.clientY);
      optionsRef.current.onStroke(point, d.last);
      drawingRef.current.last = point;
    },
    [updateCursorEl],
  );

  const endStroke = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = drawingRef.current;
    if (!d.active || e.pointerId !== d.pointerId) return;
    drawingRef.current = { active: false, pointerId: -1, last: null };
    optionsRef.current.onStrokeEnd?.();
  }, []);

  const onWrapPointerLeave = useCallback(() => {
    hoverRef.current.visible = false;
    updateCursorEl();
  }, [updateCursorEl]);

  return {
    brushSize,
    setBrushSize,
    /** キャンバスのラッパー div へ渡す ref コールバック。 */
    wrapRef: setWrapEl,
    /** カーソルプレビュー用 div へ渡す ref。 */
    cursorElRef,
    /** 描画対象キャンバスへ spread するイベントハンドラ。 */
    pointerHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endStroke,
      onPointerCancel: endStroke,
    },
    onWrapPointerLeave,
  };
}
