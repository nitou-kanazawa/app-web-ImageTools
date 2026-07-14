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
    <div className="flex gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.value
              ? 'bg-blue-600 text-white'
              : 'bg-white text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
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
      <label htmlFor="brush-size" className="text-sm text-slate-600 dark:text-slate-400">
        ブラシサイズ
      </label>
      <input
        id="brush-size"
        type="range"
        min={BRUSH_MIN}
        max={BRUSH_MAX}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-32 accent-blue-600"
      />
      <span
        data-testid="brush-size-value"
        className="w-10 text-right text-sm tabular-nums text-slate-600 dark:text-slate-400"
      >
        {value}
      </span>
    </div>
  );
}
