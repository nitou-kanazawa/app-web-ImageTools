import { BRUSH_MAX, BRUSH_MIN } from '../lib/brush';

interface BrushModeToggleProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
}

/** ブラシモードの切り替えボタン群（ブラシ/消しゴム、消す/戻す など）。 */
export function BrushModeToggle<T extends string>({
  value,
  onChange,
  options,
}: BrushModeToggleProps<T>) {
  return (
    <div className="flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-950">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface BrushSizeControlProps {
  value: number;
  onChange: (value: number) => void;
}

/** ブラシサイズのスライダー + 数値表示。 */
export function BrushSizeControl({ value, onChange }: BrushSizeControlProps) {
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="brush-size" className="text-sm text-zinc-600 dark:text-zinc-400">
        ブラシサイズ
      </label>
      <input
        id="brush-size"
        type="range"
        min={BRUSH_MIN}
        max={BRUSH_MAX}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32 accent-zinc-700 dark:accent-zinc-300"
      />
      <span
        data-testid="brush-size-value"
        className="w-10 text-right text-sm tabular-nums text-zinc-600 dark:text-zinc-400"
      >
        {value}
      </span>
    </div>
  );
}
