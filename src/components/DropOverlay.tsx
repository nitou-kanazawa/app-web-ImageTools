import { Icon } from './icons';

/**
 * ドラッグ中に表示する差し替えオーバーレイ。
 * pointer-events を持たない（drop は親要素が受け取る）。
 */
export function DropOverlay({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden={!active}
      className={`pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-lg border-2 border-dashed border-zinc-500 bg-zinc-100/90 transition-opacity duration-150 dark:border-zinc-400 dark:bg-zinc-950/90 ${
        active ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="flex items-center gap-3 text-zinc-700 dark:text-zinc-300">
        <Icon name="upload" size={20} />
        <span className="text-sm font-medium">ドロップして画像を読み込み</span>
      </div>
    </div>
  );
}
