import type { ReactNode } from 'react';
import type { ToolMeta } from '../tools/types';

/** ツールページの共通ヘッダ + コンテンツ領域（シェル内に表示される）。 */
export function ToolPage({ meta, children }: { meta: ToolMeta; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      {/* エディタタブ風のヘッダ */}
      <div className="sticky top-0 z-10 border-b border-slate-300 bg-slate-100 dark:border-black/40 dark:bg-[#252526]">
        <div className="flex items-center gap-2 px-4 py-2">
          <span aria-hidden>{meta.icon ?? '🧩'}</span>
          <h1 className="text-sm font-semibold">{meta.title}</h1>
          <p className="hidden truncate text-xs text-slate-500 sm:block dark:text-slate-400">
            — {meta.description}
          </p>
        </div>
      </div>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-4">{children}</div>
    </div>
  );
}
