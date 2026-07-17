import { Icon } from './icons';

interface ImageDropZoneProps {
  /** 対応する hidden な file input の id。 */
  inputId: string;
}

/**
 * 画像選択のドロップゾーン（クリックで file input を開く）。
 * ドロップ自体は親の useImageFileTarget が受け取るため、ここでは処理しない
 * （二重処理と、親のドラッグ状態カウンタの取りこぼしを防ぐ）。
 */
export function ImageDropZone({ inputId }: ImageDropZoneProps) {
  return (
    <label
      htmlFor={inputId}
      className="flex h-52 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-zinc-400 bg-white text-zinc-500 transition-colors hover:border-zinc-600 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-200"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full border border-zinc-300 dark:border-zinc-700">
        <Icon name="upload" size={20} />
      </span>
      <span className="text-sm">クリックして画像を選択（ドラッグ&ドロップも可）</span>
    </label>
  );
}
