import type { ComponentType } from 'react';
import type { RegisteredTool, ToolMeta } from './types';

/**
 * ツールの自動登録。
 *
 * `src/tools/<name>/tool.tsx` を置くだけで、ここに自動で登録される。
 * 各 `tool.tsx` は次の2つを export する必要がある:
 *   - `export const meta: ToolMeta`
 *   - `export default <React コンポーネント>`
 *
 * 新しいツールを追加するときに、このファイルを編集する必要はない。
 */
const modules = import.meta.glob<{
  default: ComponentType;
  meta: ToolMeta;
}>('./*/tool.tsx', { eager: true });

export const tools: RegisteredTool[] = Object.entries(modules)
  .map(([path, mod]) => {
    if (!mod.meta || !mod.default) {
      throw new Error(
        `ツール "${path}" は \`meta\` と default export（コンポーネント）の両方を export してください。`,
      );
    }
    return { meta: mod.meta, Component: mod.default };
  })
  .sort((a, b) => a.meta.title.localeCompare(b.meta.title, 'ja'));

export function getToolBySlug(slug: string): RegisteredTool | undefined {
  return tools.find((t) => t.meta.slug === slug);
}
