import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { clampPan, clampZoom, fitZoom, wheelZoomFactor, zoomAt, type Pan } from './viewport';

/** 入力欄などにフォーカスがある間はショートカットを無効にする。 */
function matchesTarget(target: EventTarget | null, selector: string): boolean {
  return target instanceof HTMLElement && target.closest(selector) !== null;
}

const TYPING_SELECTOR = 'input, textarea, select, [contenteditable]';
// Space はフォーカス中のボタン等の「押す」操作を奪わないよう、対象を広めに除外する
const SPACE_EXEMPT_SELECTOR = `${TYPING_SELECTOR}, button, a`;

/**
 * キャンバスのズーム / パン操作を提供する共有フック。
 * - ホイール: カーソル位置基準のズーム（Ctrl+ホイールはブラシサイズ用に素通しする）
 * - 中ボタンドラッグ / Space+ドラッグ: パン
 * - キー 0: フィット / キー 1: 等倍（入力中は無効）
 * - 画像サイズが変わったら自動でフィット
 *
 * 描画側はビューポート内のコンテンツ要素に contentStyle（translate + scale）を当てる。
 * ポインタ座標→画像座標の変換は transform 後の getBoundingClientRect が返す
 * 見た目上の矩形で行えるため、既存のブラシ処理はそのまま動く。
 */
export function useCanvasViewport(content: { width: number; height: number } | null) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Pan>({ x: 0, y: 0 });
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const panDragRef = useRef<{ pointerId: number; last: Pan } | null>(null);

  const contentRef = useRef(content);
  contentRef.current = content;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;

  /** ズームとパンをまとめて更新する（パンはクランプ）。 */
  const apply = useCallback((nextZoom: number, nextPan: Pan) => {
    const c = contentRef.current;
    const vp = viewportRef.current;
    if (!c || !vp) return;
    const z = clampZoom(nextZoom);
    setZoom(z);
    setPan(clampPan(nextPan, c.width * z, c.height * z, vp.clientWidth, vp.clientHeight));
  }, []);

  /** 画像全体を表示する。 */
  const fit = useCallback(() => {
    const c = contentRef.current;
    const vp = viewportRef.current;
    if (!c || !vp) return;
    const z = fitZoom(c.width, c.height, vp.clientWidth, vp.clientHeight);
    apply(z, { x: 0, y: 0 });
  }, [apply]);

  /** ビューポート中心を基準に倍率を変更する。 */
  const zoomBy = useCallback(
    (factor: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const center = { x: vp.clientWidth / 2, y: vp.clientHeight / 2 };
      const next = zoomAt(zoomRef.current, panRef.current, center, factor);
      apply(next.zoom, next.pan);
    },
    [apply],
  );

  /** 等倍（100%）表示にする（ビューポート中心基準）。 */
  const zoom100 = useCallback(() => {
    zoomBy(1 / zoomRef.current);
  }, [zoomBy]);

  // 画像が変わったらフィットする
  useEffect(() => {
    if (content) fit();
    // content の実体（サイズ）が変わったときだけで良い
  }, [content?.width, content?.height, fit]); // eslint-disable-line react-hooks/exhaustive-deps

  // ホイールズーム（ブラウザのページズーム/スクロールを抑止するため passive: false）
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // Ctrl+ホイールはブラシサイズ側が処理する
      e.preventDefault();
      const rect = vp.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      const next = zoomAt(zoomRef.current, panRef.current, point, wheelZoomFactor(e.deltaY));
      apply(next.zoom, next.pan);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [apply, content !== null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Space でパンモード、0 でフィット、1 で等倍
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        if (matchesTarget(e.target, SPACE_EXEMPT_SELECTOR)) return;
        e.preventDefault(); // ページスクロールを抑止
        setSpaceHeld(true);
      } else if (e.key === '0' || e.key === '1') {
        if (matchesTarget(e.target, TYPING_SELECTOR)) return;
        if (e.key === '0') fit();
        else zoom100();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceHeld(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }, [fit, zoom100]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      // 中ボタン、または Space+左ボタンでパン開始
      const panButton = e.button === 1 || (e.button === 0 && spaceHeld);
      if (!panButton) return;
      e.preventDefault(); // 中クリックのオートスクロールを抑止
      e.currentTarget.setPointerCapture(e.pointerId);
      panDragRef.current = { pointerId: e.pointerId, last: { x: e.clientX, y: e.clientY } };
      setPanning(true);
    },
    [spaceHeld],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = panDragRef.current;
      if (!drag || e.pointerId !== drag.pointerId) return;
      const dx = e.clientX - drag.last.x;
      const dy = e.clientY - drag.last.y;
      drag.last = { x: e.clientX, y: e.clientY };
      apply(zoomRef.current, { x: panRef.current.x + dx, y: panRef.current.y + dy });
    },
    [apply],
  );

  const endPan = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (panDragRef.current?.pointerId !== e.pointerId) return;
    panDragRef.current = null;
    setPanning(false);
  }, []);

  const contentStyle: CSSProperties = {
    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
    transformOrigin: '0 0',
    width: content?.width,
    height: content?.height,
  };

  return {
    viewportRef,
    zoom,
    spaceHeld,
    panning,
    fit,
    zoom100,
    zoomIn: () => zoomBy(1.25),
    zoomOut: () => zoomBy(1 / 1.25),
    contentStyle,
    viewportHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPan,
      onPointerCancel: endPan,
    },
  };
}
