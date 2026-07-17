import { BRUSH_MAX, BRUSH_MIN } from '../lib/brush';
import { ToggleGroup } from './ToggleGroup';

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
    <ToggleGroup value={value} onChange={onChange} options={options} ariaLabel="ブラシモード" />
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
