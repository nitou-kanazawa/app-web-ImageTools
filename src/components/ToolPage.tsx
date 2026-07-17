import type { ReactNode } from 'react';
import type { ToolMeta } from '../tools/types';
import { Icon } from './icons';

/** ツールページの共通ヘッダ + コンテンツ領域（シェル内に表示される）。 */
export function ToolPage({ meta, children }: { meta: ToolMeta; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      {/* エディタタブ風のヘッダ */}
      <div className="sticky top-0 z-10 border-b border-zinc-300 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2.5 px-4 py-2">
          <Icon
            name={meta.icon ?? 'box'}
            size={15}
            className="shrink-0 text-zinc-500 dark:text-zinc-400"
          />
          <h1 className="text-sm font-semibold tracking-wide">{meta.title}</h1>
          <p className="hidden truncate text-xs text-zinc-500 sm:block dark:text-zinc-500">
            — {meta.description}
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-5">{children}</div>
    </div>
  );
}
