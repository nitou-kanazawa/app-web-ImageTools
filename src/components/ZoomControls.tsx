interface ZoomControlsProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onZoom100: () => void;
}

/** ズーム操作のコンパクトなコントロール群（倍率クリックで等倍）。 */
export function ZoomControls({ zoom, onZoomIn, onZoomOut, onFit, onZoom100 }: ZoomControlsProps) {
  const button =
    'rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800';
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="縮小" onClick={onZoomOut} className={button}>
        −
      </button>
      <button
        type="button"
        onClick={onZoom100}
        title="クリックで等倍（ショートカット: 1）"
        data-testid="zoom-value"
        className={`${button} w-14 text-center tabular-nums`}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" aria-label="拡大" onClick={onZoomIn} className={button}>
        ＋
      </button>
      <button
        type="button"
        onClick={onFit}
        title="全体を表示（ショートカット: 0）"
        className={button}
      >
        フィット
      </button>
    </div>
  );
}
